import { setGlobalOptions } from "firebase-functions";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import axios from "axios";

admin.initializeApp();

// Configuration for Pagar.me
// O usuário deve configurar essa chave secreta no ambiente (ex: firebase functions:secrets:set PAGARME_SECRET_KEY)
// Para testes locais, pode usar um fallback se desejado.
const getPagarmeKey = () => process.env.PAGARME_SECRET_KEY || "sk_test_PLACEHOLDER";
const getPagarmeHeaders = () => ({
    Authorization: `Basic ${Buffer.from(getPagarmeKey() + ":").toString('base64')}`,
    'Content-Type': 'application/json'
});

const PAGARME_API_URL = "https://api.pagar.me/core/v5";

// Default settings for Firebase v2
setGlobalOptions({ maxInstances: 10, region: "southamerica-east1" });

/**
 * Helper para dividir agência e conta (ex: "1234-5" => { number: "1234", check_digit: "5" })
 */
function splitNumberAndDigit(val: string) {
    if (!val) return { number: "", check_digit: "" };
    const parts = val.split('-');
    if (parts.length > 1) {
        return { number: parts[0].trim(), check_digit: parts[1].trim() };
    }
    // Se não tiver dígito, manda vazio (Pagar.me aceita para alguns bancos, mas pode falhar)
    return { number: val.trim(), check_digit: "" };
}

/**
 * Cria ou atualiza um recebedor no Pagar.me para efetuar o Split do grupo.
 */
export const createPagarmeReceiver = onCall(async (request) => {
    const { groupId, document, name, bank, agency, account, type } = request.data;
    
    // Verifica autenticação
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'É necessário estar autenticado.');
    }

    // Verifica permissão (deve ser o master ou admin do grupo)
    const groupRef = admin.firestore().collection('groups').doc(groupId);
    const groupDoc = await groupRef.get();
    if (!groupDoc.exists) {
        throw new HttpsError('not-found', 'Grupo não encontrado.');
    }

    const groupData = groupDoc.data();
    const isMaster = request.auth.token.email === 'renato96.ram@gmail.com';
    const isAdmin = groupData?.adminUids?.includes(request.auth.uid) || groupData?.moderatorEmails?.includes(request.auth.token.email);
    
    if (!isMaster && !isAdmin) {
        throw new HttpsError('permission-denied', 'Apenas administradores podem configurar recebedores.');
    }

    try {
        const agencyData = splitNumberAndDigit(agency);
        const accountData = splitNumberAndDigit(account);

        const payload = {
            name: name,
            email: request.auth.token.email,
            document: document.replace(/\D/g, ''),
            type: type,
            default_bank_account: {
                holder_name: name,
                holder_type: type,
                holder_document: document.replace(/\D/g, ''),
                bank: bank,
                branch_number: agencyData.number,
                branch_check_digit: agencyData.check_digit,
                account_number: accountData.number,
                account_check_digit: accountData.check_digit,
                type: "checking"
            },
            transfer_settings: {
                transfer_enabled: true,
                transfer_interval: "daily",
                transfer_day: 0
            }
        };

        // Faz a requisição para a API do Pagar.me
        logger.info("Criando recebedor Pagar.me", { payload });
        const response = await axios.post(`${PAGARME_API_URL}/recipients`, payload, {
            headers: getPagarmeHeaders()
        });

        const recipientId = response.data.id;

        // Atualiza no Firestore a nível global do grupo para que todos saibam que há um recebedor.
        // No mundo real você poderia salvar em uma subcollection protegida.
        await groupRef.collection('paymentSettings').doc('global').set({
            receiverId: recipientId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return { success: true, recipientId };
    } catch (error: any) {
        logger.error("Erro Pagar.me (Recipient)", error.response?.data || error.message);
        return { success: false, error: error.response?.data?.message || 'Falha ao comunicar com Pagar.me' };
    }
});

/**
 * Cria uma cobrança Pix (Order) no Pagar.me com regras de Split (se configurado).
 */
export const createPixCharge = onCall(async (request) => {
    const { groupId, chargeId } = request.data;
    
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'É necessário estar autenticado.');
    }

    const groupRef = admin.firestore().collection('groups').doc(groupId);
    const chargeRef = groupRef.collection('charges').doc(chargeId);
    
    const [chargeDoc, settingsDoc] = await Promise.all([
        chargeRef.get(),
        groupRef.collection('paymentSettings').doc('global').get()
    ]);

    if (!chargeDoc.exists) throw new HttpsError('not-found', 'Cobrança não encontrada.');
    const chargeData = chargeDoc.data();
    
    // Verifica se a cobrança é do usuário
    const isMaster = request.auth.token.email === 'renato96.ram@gmail.com';
    if (!isMaster && chargeData?.playerEmail !== request.auth.token.email) {
        throw new HttpsError('permission-denied', 'Você não tem permissão para pagar esta cobrança.');
    }

    if (chargeData?.status === 'paid') {
        throw new HttpsError('failed-precondition', 'Cobrança já paga.');
    }

    const settings = settingsDoc.data();
    const amountInCents = Math.round((chargeData?.value || 0) * 100);

    if (amountInCents < 100) {
        throw new HttpsError('invalid-argument', 'Valor mínimo de R$ 1,00.');
    }

    try {
        // Monta o payload do Pix
        const payload: any = {
            customer: {
                name: chargeData?.playerName || 'Cliente Não Identificado',
                email: chargeData?.playerEmail || 'sememail@exemplo.com',
                type: 'individual',
                document: '00000000000' // O Pagar.me pode exigir um documento válido para Pix em prod
            },
            items: [
                {
                    amount: amountInCents,
                    description: chargeData?.description || 'Cobrança Grupo Vôlei',
                    quantity: 1
                }
            ],
            payments: [
                {
                    payment_method: 'pix',
                    pix: {
                        expires_in: 86400, // 24 horas
                        additional_information: [
                            { name: 'Grupo', value: groupId },
                            { name: 'Cobrança', value: chargeId }
                        ]
                    }
                }
            ],
            // Configurar webhook pra avisar que foi pago (você precisa cadastrar essa URL no dashboard do Pagar.me depois)
            // metadata para saber qual doc atualizar no webhook
            metadata: {
                groupId: groupId,
                chargeId: chargeId
            }
        };

        // Aplica Split se existir um Recebedor configurado para o grupo
        if (settings?.receiverId) {
            payload.payments[0].split = [
                {
                    amount: amountInCents,
                    recipient_id: settings.receiverId,
                    type: "flat",
                    options: {
                        charge_processing_fee: true, // O recebedor (admin) paga a taxa do Pagar.me
                        charge_remainder_fee: true,
                        liable: true
                    }
                }
            ];
        }

        logger.info("Criando Order Pagar.me", { payload });
        const response = await axios.post(`${PAGARME_API_URL}/orders`, payload, {
            headers: getPagarmeHeaders()
        });

        // O response traz as informações do Pix gerado
        const pixData = response.data.charges[0].last_transaction;

        // Atualiza a cobrança com o ID do Pagar.me para rastrear depois
        await chargeRef.update({
            pagarmeOrderId: response.data.id,
            pagarmeChargeId: response.data.charges[0].id,
            pixQrCodeUrl: pixData.qr_code_url,
            pixQrCodeString: pixData.qr_code,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return { 
            success: true, 
            qr_code_url: pixData.qr_code_url, 
            qr_code: pixData.qr_code 
        };

    } catch (error: any) {
        logger.error("Erro Pagar.me (Pix Order)", error.response?.data || error.message);
        return { success: false, error: error.response?.data?.message || 'Falha ao comunicar com Pagar.me' };
    }
});

/**
 * Webhook do Pagar.me (opcional/futuro).
 * O Pagar.me chama esta URL quando o status da order muda (ex: "order.paid").
 */
import { onRequest } from "firebase-functions/v2/https";
export const pagarmeWebhook = onRequest(async (req, res) => {
    // Validar assinatura do webhook (recomendado em produção)
    const event = req.body;
    logger.info("Webhook Recebido", { type: event.type, order_id: event.data?.id });

    if (event.type === 'order.paid') {
        const metadata = event.data?.metadata;
        if (metadata?.groupId && metadata?.chargeId) {
            const chargeRef = admin.firestore().collection('groups').doc(metadata.groupId).collection('charges').doc(metadata.chargeId);
            await chargeRef.update({
                status: 'paid',
                paidAt: admin.firestore.FieldValue.serverTimestamp()
            });
            logger.info("Cobrança atualizada para PAID via Webhook", metadata);
        }
    }

    res.status(200).send("OK");
});
