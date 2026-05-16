import { state } from '../state.js';
import { db, collection, addDoc, doc, setDoc, query, where, onSnapshot, getDoc, updateDoc, getDocs, deleteDoc } from '../firebase.js';
import { showToast, openConfirmModal } from '../ui.js';

let unsubscribeCharges = null;
let currentPixKey = '';
let currentPaymentMode = 'free';

export const setPaymentAdminTab = (tab) => {
    // Esconde todas as tabs
    ['config', 'status'].forEach(t => {
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

    // Load global settings to know the mode and pix key
    let monthlyDay = 10;
    try {
        const settingsDoc = await getDoc(doc(db, 'groups', state.currentGroupId, 'paymentSettings', 'global'));
        if (settingsDoc.exists()) {
            const data = settingsDoc.data();
            currentPaymentMode = data.mode || 'free';
            currentPixKey = data.pixKey || '';
            monthlyDay = data.monthlyDay || 10;
            
            if (isAdmin) {
            const modeRadio = document.querySelector(`input[name="paymentMode"][value="${currentPaymentMode}"]`);
            if (modeRadio) modeRadio.checked = true;
            
            const ms = document.getElementById('monthlySettings');
            const ds = document.getElementById('dailySettings');
            if (currentPaymentMode === 'monthly') {
                if (ms) { ms.classList.remove('hidden'); ms.classList.add('flex'); }
                if (ds) { ds.classList.add('hidden'); ds.classList.remove('flex'); }
            } else if (currentPaymentMode === 'daily') {
                if (ms) { ms.classList.add('hidden'); ms.classList.remove('flex'); }
                if (ds) { ds.classList.remove('hidden'); ds.classList.add('flex'); }
            } else {
                if (ms) { ms.classList.add('hidden'); ms.classList.remove('flex'); }
                if (ds) { ds.classList.add('hidden'); ds.classList.remove('flex'); }
            }
            
            if (data.monthlyValue) document.getElementById('payMonthlyValue').value = data.monthlyValue;
            if (data.monthlyDay) document.getElementById('payMonthlyDay').value = data.monthlyDay;
            if (data.pixKey) document.getElementById('adminPixKey').value = data.pixKey;

            // Listener pros radios de mode
            document.querySelectorAll('input[name="paymentMode"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    const msElem = document.getElementById('monthlySettings');
                    const dsElem = document.getElementById('dailySettings');
                    if (e.target.value === 'monthly') {
                        if (msElem) { msElem.classList.remove('hidden'); msElem.classList.add('flex'); }
                        if (dsElem) { dsElem.classList.add('hidden'); dsElem.classList.remove('flex'); }
                    } else if (e.target.value === 'daily') {
                        if (msElem) { msElem.classList.add('hidden'); msElem.classList.remove('flex'); }
                        if (dsElem) { dsElem.classList.remove('hidden'); dsElem.classList.add('flex'); }
                    } else {
                        if (msElem) { msElem.classList.add('hidden'); msElem.classList.remove('flex'); }
                        if (dsElem) { dsElem.classList.add('hidden'); dsElem.classList.remove('flex'); }
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
        }
    } catch (err) {
        console.error("Erro ao carregar paymentSettings:", err);
    }

    const adminTable = document.getElementById('adminPaymentsTable');
    const userList = document.getElementById('userPendingChargesList');

    if (currentPaymentMode === 'monthly') {
        // MODO MENSALISTA
        renderMonthlyView(isAdmin, monthlyDay, adminTable, userList);
    } else if (currentPaymentMode === 'daily') {
        // MODO DIARIA
        renderDailyView(isAdmin, adminTable, userList);
    } else {
        // FREE MODE
        if (adminTable) adminTable.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-400">Modo Gratuito Ativo. Nenhuma cobrança.</td></tr>';
        if (userList) userList.innerHTML = '<div class="text-center text-slate-400 py-8 text-sm italic">O grupo está no modo gratuito. 🎉</div>';
    }
};

const renderMonthlyView = (isAdmin, monthlyDay, adminTable, userList) => {
    const now = new Date();
    
    if (isAdmin && adminTable) {
        adminTable.innerHTML = '';
        // Setup table headers for monthly
        const thead = adminTable.closest('table').querySelector('thead tr');
        thead.innerHTML = `
            <th class="px-4 py-3">Jogador</th>
            <th class="px-4 py-3 text-center">Vencimento Atual</th>
            <th class="px-4 py-3 text-center">Status</th>
            <th class="px-4 py-3 text-right">Ação</th>
        `;

        state.players.forEach(p => {
            let nextDue = getNextDueDate(p.paidUntil, monthlyDay);
            let isOverdue = now > nextDue;
            
            const statusColor = isOverdue ? 'text-red-500' : 'text-green-500';
            const statusText = isOverdue ? 'Atrasado' : 'Em dia';
            
            adminTable.innerHTML += `
                <tr>
                    <td class="px-4 py-3 font-bold text-white">${p.name}</td>
                    <td class="px-4 py-3 text-center text-slate-300">${nextDue.toLocaleDateString()}</td>
                    <td class="px-4 py-3 text-center font-bold ${statusColor}">${statusText}</td>
                    <td class="px-4 py-3 text-right">
                        <button onclick="addMonthlyPayment('${p.id}', '${p.name.replace(/'/g, "\\'")}', -1)" class="bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded text-xs font-bold transition-colors mr-1">-1 Mês</button>
                        <button onclick="addMonthlyPayment('${p.id}', '${p.name.replace(/'/g, "\\'")}', 1)" class="bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-xs font-bold transition-colors">+1 Mês</button>
                    </td>
                </tr>
            `;
        });
    }

    if (userList) {
        userList.innerHTML = '';
        const myPlayer = state.players.find(p => p.email === state.user.email);
        
        if (myPlayer) {
            let nextDue = getNextDueDate(myPlayer.paidUntil, monthlyDay);
            let isOverdue = now > nextDue;
            
            const statusColor = isOverdue ? 'text-red-400' : 'text-green-400';
            const statusText = isOverdue ? 'Atrasado' : 'Em dia';

            userList.innerHTML = `
                <div class="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col items-center text-center gap-4">
                    <div>
                        <h4 class="text-white font-bold text-lg mb-1">Status da Mensalidade</h4>
                        <p class="text-sm text-slate-400">Seu vencimento é no dia <span class="font-bold text-white">${nextDue.toLocaleDateString()}</span></p>
                        <p class="text-lg font-black ${statusColor} mt-2 uppercase">${statusText}</p>
                    </div>
                </div>
            `;
            
            renderPixKeyInfo(userList, isOverdue ? "Faça o pagamento para ficar em dia." : "Pague antecipado se desejar.");
        } else {
            userList.innerHTML = `<div class="text-center text-slate-400 py-8 text-sm italic">Jogador não encontrado no grupo.</div>`;
        }
    }
};

const getNextDueDate = (paidUntilMillis, monthlyDay) => {
    if (paidUntilMillis) {
        return new Date(paidUntilMillis);
    } else {
        // Se não tem, o primeiro vencimento é o próximo 'monthlyDay' a partir de hoje
        const today = new Date();
        let nextDue = new Date(today.getFullYear(), today.getMonth(), monthlyDay);
        if (today > nextDue) {
            nextDue.setMonth(nextDue.getMonth() + 1);
        }
        return nextDue;
    }
};

window.addMonthlyPayment = async (playerId, playerName = '', direction = 1) => {
    if (!state.currentGroupId) return;
    
    const actionText = direction > 0 ? "Adicionar" : "Remover";
    const dirText = direction > 0 ? "+1 Mês" : "-1 Mês";
    
    openConfirmModal(`Confirmar ${dirText}`, `${actionText} 1 mês de pagamento para o jogador ${playerName}?`, async () => {
        // Obter monthlyDay da config
        const settingsDoc = await getDoc(doc(db, 'groups', state.currentGroupId, 'paymentSettings', 'global'));
        let monthlyDay = 10;
        if (settingsDoc.exists()) {
            monthlyDay = settingsDoc.data().monthlyDay || 10;
        }

        const playerRef = doc(db, 'groups', state.currentGroupId, 'players', playerId);
        const playerDoc = await getDoc(playerRef);
        if (!playerDoc.exists()) return;
        
        const pData = playerDoc.data();
        let nextDue = getNextDueDate(pData.paidUntil, monthlyDay);
        
        // Adiciona ou remove 1 mês
        nextDue.setMonth(nextDue.getMonth() + direction);
        
        try {
            await updateDoc(playerRef, {
                paidUntil: nextDue.getTime()
            });
            showToast("Pagamento de 1 mês registrado com sucesso!", "success");
            // Atualiza UI local
            const pIndex = state.players.findIndex(p => p.id === playerId);
            if (pIndex !== -1) {
                state.players[pIndex].paidUntil = nextDue.getTime();
            }
            renderPaymentsView();
        } catch (e) {
            console.error(e);
            showToast("Erro ao atualizar pagamento.", "error");
        }
    });
};


const renderDailyView = (isAdmin, adminTable, userList) => {
    let chargesQuery;
    
    if (isAdmin) {
        chargesQuery = collection(db, 'groups', state.currentGroupId, 'charges');
    } else {
        chargesQuery = query(collection(db, 'groups', state.currentGroupId, 'charges'), where('playerEmail', '==', state.user.email));
    }
    
    if (adminTable) {
        const thead = adminTable.closest('table').querySelector('thead tr');
        thead.innerHTML = `
            <th class="px-4 py-3">Jogador</th>
            <th class="px-4 py-3">Descrição</th>
            <th class="px-4 py-3">Valor</th>
            <th class="px-4 py-3 text-center">Status</th>
            <th class="px-4 py-3 text-right">Ações</th>
        `;
    }

    unsubscribeCharges = onSnapshot(chargesQuery, (snapshot) => {
        const charges = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        
        if (adminTable) adminTable.innerHTML = '';
        if (userList) userList.innerHTML = '';
        
        let hasPendingForUser = false;

        charges.forEach(charge => {
            // Renderiza na tabela do admin
            if (adminTable) {
                const statusColor = charge.status === 'paid' ? 'text-green-500' : 'text-yellow-500';
                const statusText = charge.status === 'paid' ? 'Pago' : 'Pendente';
                
                adminTable.innerHTML += `
                    <tr>
                        <td class="px-4 py-3 font-bold text-white">${charge.playerName}</td>
                        <td class="px-4 py-3 text-slate-300">${charge.description}</td>
                        <td class="px-4 py-3 text-white">R$ ${charge.value.toFixed(2)}</td>
                        <td class="px-4 py-3 text-center font-bold ${statusColor}">${statusText}</td>
                        <td class="px-4 py-3 text-right">
                            <div class="flex justify-end gap-2">
                                ${charge.status !== 'paid' ? `<button onclick="markChargeAsPaid('${charge.id}', '${(charge.playerName || 'Jogador').replace(/'/g, "\\'")}')" class="bg-green-600 hover:bg-green-500 text-white px-2 py-1 rounded text-xs font-bold transition-colors">Pago</button>` : `<span class="text-slate-500 text-xs">-</span>`}
                                <button onclick="deleteCharge('${charge.id}', '${(charge.playerName || 'Jogador').replace(/'/g, "\\'")}')" class="bg-red-600 hover:bg-red-500 text-white p-1 rounded transition-colors" title="Excluir Cobrança">
                                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }

            // Renderiza no painel do usuário se for dele e estiver pendente
            if (userList && charge.playerEmail === state.user.email && charge.status !== 'paid') {
                hasPendingForUser = true;
                userList.innerHTML += `
                    <div class="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col justify-between items-start gap-2">
                        <div>
                            <h4 class="text-white font-bold">${charge.description}</h4>
                            <p class="text-sm text-slate-400">Data: ${new Date(charge.createdAt).toLocaleDateString()}</p>
                            <p class="text-lg font-black text-green-400 mt-1">R$ ${charge.value.toFixed(2)}</p>
                        </div>
                    </div>
                `;
            }
        });

        if (!hasPendingForUser && userList) {
            userList.innerHTML = `<div class="text-center text-slate-400 py-8 text-sm italic">Nenhuma cobrança pendente. Você está em dia! 🎉</div>`;
        } else if (hasPendingForUser && userList) {
            renderPixKeyInfo(userList, "Faça o pagamento da sua cobrança copiando a chave Pix abaixo e envie o comprovante.");
        }
        
        if (typeof lucide !== 'undefined') lucide.createIcons();
    });
};

const renderPixKeyInfo = (container, message) => {
    if (currentPixKey) {
        container.innerHTML += `
            <div class="mt-4 bg-slate-950 p-4 rounded-xl border border-slate-700 w-full text-center">
                <p class="text-xs text-slate-400 mb-2">${message}</p>
                <div class="flex items-center justify-center gap-2 bg-slate-900 p-2 rounded-lg border border-slate-700">
                    <span class="text-white font-mono text-sm break-all" id="userPixKeyDisplay">${currentPixKey}</span>
                    <button onclick="copyAdminPixString()" class="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded transition-colors" title="Copiar PIX">
                        <i data-lucide="copy" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
};

window.copyAdminPixString = () => {
    if (!currentPixKey) return;
    navigator.clipboard.writeText(currentPixKey);
    showToast("Chave PIX copiada!", "success");
};

window.markChargeAsPaid = async (chargeId, playerName = '') => {
    openConfirmModal("Confirmar Pagamento", `Marcar a cobrança de ${playerName} como paga?`, async () => {
        try {
            const chargeRef = doc(db, 'groups', state.currentGroupId, 'charges', chargeId);
            await updateDoc(chargeRef, {
                status: 'paid',
                paidAt: Date.now()
            });
            showToast("Cobrança marcada como paga!", "success");
        } catch (e) {
            console.error(e);
            showToast("Erro ao atualizar cobrança.", "error");
        }
    });
};

window.deleteCharge = async (chargeId, playerName = '') => {
    openConfirmModal("Excluir Cobrança", `Tem certeza que deseja excluir a cobrança de ${playerName}? Esta ação não pode ser desfeita.`, async () => {
        try {
            const chargeRef = doc(db, 'groups', state.currentGroupId, 'charges', chargeId);
            await deleteDoc(chargeRef);
            showToast("Cobrança excluída com sucesso!", "success");
        } catch (e) {
            console.error(e);
            showToast("Erro ao excluir cobrança.", "error");
        }
    });
};

window.showPaymentSaveBtn = () => {
    const btn = document.getElementById('btnSaveConfig');
    if (btn) btn.classList.remove('hidden');
};

export const savePaymentSettings = async () => {
    if (!state.currentGroupId) return;

    const mode = document.querySelector('input[name="paymentMode"]:checked')?.value || 'free';
    const monthlyValue = parseFloat(document.getElementById('payMonthlyValue').value) || 0;
    const monthlyDay = parseInt(document.getElementById('payMonthlyDay').value) || 1;
    const pixKey = document.getElementById('adminPixKey').value.trim();

    const payload = { mode, monthlyValue, monthlyDay, pixKey };

    try {
        await setDoc(doc(db, 'groups', state.currentGroupId, 'paymentSettings', 'global'), payload, { merge: true });
        showToast("Configurações de pagamento salvas!", "success");
        
        const btn = document.getElementById('btnSaveConfig');
        if (btn) btn.classList.add('hidden');

        currentPaymentMode = mode;
        currentPixKey = pixKey;
        renderPaymentsView();
    } catch (e) {
        console.error(e);
        showToast("Erro ao salvar no Firestore.", "error");
    }
};

export const generateDailyCharges = async () => {
    await savePaymentSettings();

    const desc = document.getElementById('diariaDesc').value.trim();
    const val = parseFloat(document.getElementById('diariaValue').value);
    const type = document.getElementById('diariaType').value;
    
    if (!desc) return showToast("Digite uma descrição para a cobrança.", "error");
    if (!val || val <= 0) return showToast("Digite um valor válido.", "error");

    const checkboxes = document.querySelectorAll('.diaria-player-cb:checked');
    if (checkboxes.length === 0) return showToast("Selecione ao menos um jogador.", "error");

    const players = Array.from(checkboxes).map(cb => JSON.parse(cb.value));
    
    let valuePerPlayer = val;
    if (type === 'split') {
        valuePerPlayer = val / players.length;
    }

    if (valuePerPlayer <= 0) {
        return showToast("O valor mínimo por jogador deve ser maior que 0.", "error");
    }

    showToast(`Gerando ${players.length} cobranças...`, "info");
    
    const chargesRef = collection(db, 'groups', state.currentGroupId, 'charges');
    
    try {
        const promises = players.map(async p => {
            const q = query(chargesRef, where('playerId', '==', p.id));
            const snapshot = await getDocs(q);
            const deletePromises = [];
            snapshot.docs.forEach(d => {
                if (d.data().status === 'paid') {
                    deletePromises.push(deleteDoc(d.ref));
                }
            });
            await Promise.all(deletePromises);

            return addDoc(chargesRef, {
                playerId: p.id,
                playerName: p.name,
                playerEmail: p.email || "",
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
