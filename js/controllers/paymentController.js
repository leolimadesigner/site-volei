import { state } from '../state.js';
import { db, collection, addDoc, doc, setDoc, query, where, onSnapshot, functions, httpsCallable } from '../firebase.js';
import { showToast } from '../ui.js';

let unsubscribeCharges = null;

export const setPaymentAdminTab = (tab) => {
    // Esconde todas as tabs
    ['config', 'diaria', 'status'].forEach(t => {
        const el = document.getElementById(`pay-admin-${t}`);
        const btn = document.getElementById(`tab-pay-${t}`);
        if(el) el.classList.add('hidden');
        if(btn) {
            btn.classList.remove('bg-blue-600', 'text-white');
            btn.classList.add('bg-slate-700', 'text-slate-300');
        }
    });

    // Mostra a tab selecionada
    const el = document.getElementById(`pay-admin-${tab}`);
    const btn = document.getElementById(`tab-pay-${tab}`);
    if(el) el.classList.remove('hidden');
    if(btn) {
        btn.classList.remove('bg-slate-700', 'text-slate-300');
        btn.classList.add('bg-blue-600', 'text-white');
    }
};

export const renderPaymentsView = async () => {
    if (!state.currentGroupId) return;

    // Remove listener antigo
    if (unsubscribeCharges) unsubscribeCharges();

    const isAdmin = state.currentUserRole === 'admin' || state.isMaster;
    let chargesQuery;
    
    if (isAdmin) {
        chargesQuery = collection(db, 'groups', state.currentGroupId, 'charges');
    } else {
        chargesQuery = query(collection(db, 'groups', state.currentGroupId, 'charges'), where('playerEmail', '==', state.user.email));
    }
    
    unsubscribeCharges = onSnapshot(chargesQuery, (snapshot) => {
        const charges = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Separa as cobranças para o admin ver TODAS e para o usuário ver as SUAS
        const adminTable = document.getElementById('adminPaymentsTable');
        const userList = document.getElementById('userPendingChargesList');
        
        if (adminTable) adminTable.innerHTML = '';
        if (userList) userList.innerHTML = '';
        
        let hasPendingForUser = false;

        charges.forEach(charge => {
            // Renderiza na tabela do admin
            if (adminTable) {
                const statusColor = charge.status === 'paid' ? 'text-green-500' : (charge.status === 'overdue' ? 'text-red-500' : 'text-yellow-500');
                const statusText = charge.status === 'paid' ? 'Pago' : (charge.status === 'overdue' ? 'Atrasado' : 'Pendente');
                
                adminTable.innerHTML += `
                    <tr>
                        <td class="px-4 py-3 font-bold text-white">${charge.playerName}</td>
                        <td class="px-4 py-3 text-slate-300">${charge.description}</td>
                        <td class="px-4 py-3 text-white">R$ ${charge.value.toFixed(2)}</td>
                        <td class="px-4 py-3 font-bold ${statusColor}">${statusText}</td>
                        <td class="px-4 py-3 text-right text-slate-400">${new Date(charge.createdAt).toLocaleDateString()}</td>
                    </tr>
                `;
            }

            // Renderiza no painel do usuário se for dele e estiver pendente ou atrasada
            if (userList && charge.playerEmail === state.user.email && charge.status !== 'paid') {
                hasPendingForUser = true;
                userList.innerHTML += `
                    <div class="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <h4 class="text-white font-bold">${charge.description}</h4>
                            <p class="text-sm text-slate-400">Vencimento: ${new Date(charge.dueDate || charge.createdAt).toLocaleDateString()}</p>
                            <p class="text-lg font-black text-green-400 mt-1">R$ ${charge.value.toFixed(2)}</p>
                        </div>
                        <button onclick="generatePixForCharge('${charge.id}')" class="w-full sm:w-auto bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-6 rounded-lg transition-colors flex items-center justify-center gap-2">
                            <i data-lucide="qr-code" class="w-4 h-4"></i> PAGAR PIX
                        </button>
                    </div>
                `;
            }
        });

        if (!hasPendingForUser && userList) {
            userList.innerHTML = `<div class="text-center text-slate-400 py-8 text-sm italic">Nenhuma cobrança pendente. Você está em dia! 🎉</div>`;
        }
        
        if (typeof lucide !== 'undefined') lucide.createIcons();
    });

    // Se for admin, carrega as configs e a lista de jogadores
    if (state.currentUserRole === 'admin' || state.isMaster) {
        // Carrega config
        const { getDoc, doc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
        const settingsDoc = await getDoc(doc(db, 'groups', state.currentGroupId, 'paymentSettings', 'global'));
        if (settingsDoc.exists()) {
            const data = settingsDoc.data();
            const modeRadio = document.querySelector(`input[name="paymentMode"][value="${data.mode}"]`);
            if (modeRadio) modeRadio.checked = true;
            
            if (data.mode === 'monthly') {
                document.getElementById('monthlySettings').classList.remove('hidden');
                document.getElementById('monthlySettings').classList.add('flex');
            } else {
                document.getElementById('monthlySettings').classList.add('hidden');
                document.getElementById('monthlySettings').classList.remove('flex');
            }
            
            if (data.monthlyValue) document.getElementById('payMonthlyValue').value = data.monthlyValue;
            if (data.monthlyDay) document.getElementById('payMonthlyDay').value = data.monthlyDay;
            
            if (data.receiverId) {
                const rs = document.getElementById('receiverStatus');
                rs.innerHTML = `Recebedor configurado e ativo. <br><span class="text-xs opacity-70">ID Pagar.me: ${data.receiverId}</span>`;
                rs.classList.remove('hidden');
            }
        }

        // Listener pros radios de mode
        document.querySelectorAll('input[name="paymentMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const ms = document.getElementById('monthlySettings');
                if (e.target.value === 'monthly') {
                    ms.classList.remove('hidden');
                    ms.classList.add('flex');
                } else {
                    ms.classList.add('hidden');
                    ms.classList.remove('flex');
                }
            });
        });

        // Carrega a lista de jogadores para a tela de diária
        const list = document.getElementById('diariaPlayersList');
        if (list) {
            list.innerHTML = '';
            state.players.forEach(p => {
                list.innerHTML += `
                    <label class="flex items-center gap-3 p-2 hover:bg-slate-800 rounded-lg cursor-pointer">
                        <input type="checkbox" class="diaria-player-cb w-4 h-4 text-blue-600 bg-slate-950 border-slate-700 rounded" value='${JSON.stringify({id: p.id, name: p.name, email: p.email})}'>
                        <span class="text-sm font-bold text-white">${p.name} <span class="text-xs text-slate-500 font-normal">(${p.email || 'Sem e-mail'})</span></span>
                    </label>
                `;
            });
        }
    }
};

export const savePaymentSettings = async () => {
    if (!state.currentGroupId) return;

    const mode = document.querySelector('input[name="paymentMode"]:checked')?.value || 'free';
    const monthlyValue = parseFloat(document.getElementById('payMonthlyValue').value) || 0;
    const monthlyDay = parseInt(document.getElementById('payMonthlyDay').value) || 1;

    // Coleta dados bancários
    const recDocStr = document.getElementById('recDoc').value.trim();
    const recName = document.getElementById('recName').value.trim();
    const recBank = document.getElementById('recBank').value.trim();
    const recAgency = document.getElementById('recAgency').value.trim();
    const recAccount = document.getElementById('recAccount').value.trim();
    const recType = document.getElementById('recType').value;

    const payload = { mode, monthlyValue, monthlyDay };
    
    // Se preencheu dados do banco, chama a function para criar/atualizar o recebedor no Pagar.me
    if (recDocStr && recName && recBank && recAgency && recAccount) {
        showToast("Criando recebedor no Pagar.me...", "info");
        try {
            const createReceiver = httpsCallable(functions, 'createPagarmeReceiver');
            const res = await createReceiver({
                groupId: state.currentGroupId,
                document: recDocStr,
                name: recName,
                bank: recBank,
                agency: recAgency,
                account: recAccount,
                type: recType
            });
            
            if (res.data.success) {
                payload.receiverId = res.data.recipientId;
                showToast("Recebedor Pagar.me gerado!", "success");
            } else {
                throw new Error(res.data.error || 'Erro desconhecido no Pagar.me');
            }
        } catch (e) {
            console.error(e);
            return showToast("Erro no Pagar.me: " + e.message, "error");
        }
    }

    try {
        await setDoc(doc(db, 'groups', state.currentGroupId, 'paymentSettings', 'global'), payload, { merge: true });
        showToast("Configurações de pagamento salvas!", "success");
    } catch (e) {
        console.error(e);
        showToast("Erro ao salvar no Firestore.", "error");
    }
};

export const generateDailyCharges = async () => {
    const desc = document.getElementById('diariaDesc').value.trim();
    const val = parseFloat(document.getElementById('diariaValue').value);
    const type = document.getElementById('diariaType').value;
    
    if (!desc) return showToast("Digite uma descrição para a cobrança.", "error");
    if (!val || val <= 0) return showToast("Digite um valor válido.", "error");

    const checkboxes = document.querySelectorAll('.diaria-player-cb:checked');
    if (checkboxes.length === 0) return showToast("Selecione ao menos um jogador.", "error");

    const players = Array.from(checkboxes).map(cb => JSON.parse(cb.value));
    
    // Se não tiverem email, não podemos vincular o pagamento à conta facilmente, mas vamos seguir.
    // O ideal é que todos tenham e-mail.
    
    let valuePerPlayer = val;
    if (type === 'split') {
        valuePerPlayer = val / players.length;
    }

    if (valuePerPlayer < 1) {
        return showToast("O valor mínimo por jogador no Pagar.me é de R$ 1,00.", "error");
    }

    showToast(`Gerando ${players.length} cobranças...`, "info");
    
    const chargesRef = collection(db, 'groups', state.currentGroupId, 'charges');
    
    try {
        const promises = players.map(p => {
            return addDoc(chargesRef, {
                playerId: p.id,
                playerName: p.name,
                playerEmail: p.email,
                description: desc,
                value: valuePerPlayer,
                status: 'pending',
                dueDate: Date.now() + (24 * 60 * 60 * 1000), // Vence em 24h
                createdAt: Date.now()
            });
        });
        
        await Promise.all(promises);
        
        showToast("Cobranças enviadas com sucesso!", "success");
        document.getElementById('diariaDesc').value = '';
        document.getElementById('diariaValue').value = '';
        document.querySelectorAll('.diaria-player-cb').forEach(cb => cb.checked = false);
        setPaymentAdminTab('status');
    } catch (e) {
        console.error(e);
        showToast("Erro ao criar cobranças.", "error");
    }
};

export const generatePixForCharge = async (chargeId) => {
    showToast("Gerando Pix, aguarde...", "info");
    try {
        const createPix = httpsCallable(functions, 'createPixCharge');
        const res = await createPix({
            groupId: state.currentGroupId,
            chargeId: chargeId
        });
        
        if (res.data.success) {
            document.getElementById('pixQrCodeImage').src = res.data.qr_code_url;
            document.getElementById('pixCopyString').value = res.data.qr_code;
            
            const pixValueDesc = document.getElementById('pixValueDesc');
            pixValueDesc.innerText = `Escaneie o QR Code ou copie o código abaixo para pagar a cobrança via Pix.`;
            
            document.getElementById('pixModal').classList.remove('hidden');
            document.getElementById('pixModal').classList.add('flex');
        } else {
            throw new Error(res.data.error || "Falha ao gerar o Pix no Pagar.me");
        }
    } catch (e) {
        console.error(e);
        showToast("Erro ao gerar Pix: " + e.message, "error");
    }
};

export const copyPixString = () => {
    const input = document.getElementById('pixCopyString');
    input.select();
    input.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(input.value);
    showToast("Código Copia e Cola copiado!", "success");
};
