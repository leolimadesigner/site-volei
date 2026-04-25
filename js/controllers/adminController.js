import { state } from '../state.js';
import { db, doc, addDoc, updateDoc, deleteDoc, playersRef, settingsRef, matchHistoryRef, storage, ref, uploadBytes, getDownloadURL, deleteObject } from '../firebase.js';
import { showToast, openConfirmModal, renderSorteioTable } from '../ui.js';

// ============================================================================
// CONFIGURAÇÕES GLOBAIS
// ============================================================================

/**
 * Ativa ou desativa a permissão para visitantes usarem o placar
 */
export const toggleEloSystem = async (enabled) => {
    if (!state.isAuthenticated) { 
        showToast("Apenas administradores podem alterar isso.", "error"); 
        return; 
    }
    
    try {
        await updateDoc(settingsRef, { eloEnabled: enabled });
        showToast(enabled ? "Placar Público Ativado!" : "Placar Público Desativado!", "info");
    } catch (error) {
        console.error(error);
        showToast("Erro ao alterar configuração.", "error");
    }
};

/**
 * Limpa todo o histórico de partidas do banco de dados
 */
export const clearMatchHistory = () => {
    openConfirmModal("Limpar Histórico", "Deseja realmente apagar todo o histórico de partidas?", async () => {
        try {
            // Mapeia todas as partidas e cria uma requisição de delete para cada uma
            const deletePromises = state.matchHistory.map(m => deleteDoc(doc(matchHistoryRef, m.id)));
            await Promise.all(deletePromises);
            showToast("Histórico de partidas limpo!", "info");
        } catch (e) { 
            console.error(e); 
            showToast("Erro ao limpar histórico", "error"); 
        }
    });
};

// ============================================================================
// SELEÇÃO DE JOGADORES (Sorteio)
// ============================================================================

export const togglePlayerSelection = (id, isChecked) => { 
    if (isChecked) {
        state.selectedPlayerIds.add(id);
    } else {
        state.selectedPlayerIds.delete(id);
    }
};

export const toggleAllPlayers = (isChecked) => { 
    if (isChecked) {
        state.players.forEach(p => state.selectedPlayerIds.add(p.id));
    } else {
        state.selectedPlayerIds.clear();
    }
    renderSorteioTable(); 
};

export const selectOnlyPlayersInTeams = () => {
    state.selectedPlayerIds.clear();
    state.drawnTeams.forEach(team => {
        team.players.forEach(p => state.selectedPlayerIds.add(p.id));
    });
    renderSorteioTable();
    showToast("Atletas em times selecionados!", "info");
};

// ============================================================================
// GERENCIAMENTO DE ATLETAS (CRUD)
// ============================================================================

export const savePlayer = async () => {
    const name = document.getElementById('playerName').value.trim();
    const id = document.getElementById('editId').value;
    
    if(!name) {
        return showToast("Preencha o nome do atleta!", "error");
    }
    
    const btn = document.getElementById('btnSave'); 
    btn.disabled = true; 
    btn.innerText = "SALVANDO...";
    
    try {
        // Conforme a melhoria solicitada: Pega o valor exato do input, e não apenas faz incremento
        const elo = Math.max(0, parseInt(document.getElementById('statBonus').value) || 150);
        
        const playerData = { 
            name, 
            categoria: parseInt(document.getElementById('statCategoria').value), 
            partidas: parseInt(document.getElementById('statJogos').value), 
            vitorias: parseInt(document.getElementById('statVit').value), 
            eloRating: elo, 
            icon: document.getElementById('playerIcon').value, 
            photo: document.getElementById('photoData').value,
            updatedAt: Date.now()
        };
        
        if (id) {
            await updateDoc(doc(playersRef, id), playerData);
            showToast("Atleta atualizado!"); 
        } else {
            // Inicializa a streak como 0 para novos jogadores
            playerData.streak = 0;
            await addDoc(playersRef, playerData);
            showToast("Atleta cadastrado!"); 
        }
        
        // Dispara a função global de limpar o formulário
        if (window.resetForm) window.resetForm();
        
    } catch(e) { 
        console.error(e);
        showToast("Erro ao salvar atleta", "error"); 
    } finally { 
        btn.disabled = false; 
        btn.innerHTML = "<i data-lucide='save' class='w-4 h-4'></i> SALVAR"; 
        if (typeof lucide !== 'undefined') lucide.createIcons(); 
    }
};

export const deletePlayer = (id) => {
    openConfirmModal("Excluir Atleta", "Tem a certeza que deseja remover este atleta da base?", async () => { 
        try {
            await deleteDoc(doc(playersRef, id)); 
            showToast("Atleta removido."); 
        } catch(e) {
            console.error(e);
            showToast("Erro ao excluir", "error");
        }
    });
};

// ============================================================================
// UPLOAD DE FOTOS (FIREBASE STORAGE)
// ============================================================================

window.handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Bloqueia o botão de salvar para o usuário não clicar antes da foto carregar
    const btnSave = document.getElementById('btnSave');
    if (btnSave) {
        btnSave.disabled = true;
        btnSave.innerText = "CARREGANDO FOTO...";
    }
    
    showToast("A fazer upload da foto...", "info");

    try {
        // 1. Cria um nome único para o ficheiro (ex: jogadores/123456789_xpto.jpg)
        const fileExtension = file.name.split('.').pop();
        const fileName = `jogadores/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExtension}`;
        
        // 2. Prepara o espaço no Firebase Storage
        const storageRef = ref(storage, fileName);

        // 3. Envia o ficheiro para o Firebase
        const snapshot = await uploadBytes(storageRef, file);
        
        // 4. Pede ao Firebase o Link (URL) público dessa imagem
        const downloadURL = await getDownloadURL(snapshot.ref);

        // 5. Mostra a bolinha com a foto na tela para o utilizador
        document.getElementById('photoPreview').src = downloadURL;
        document.getElementById('photoPreview').classList.remove('hidden');
        document.getElementById('photoPlaceholder').classList.add('hidden');
        document.getElementById('btnRemovePhoto').classList.remove('hidden');
        
        // 6. GUARDA O LINK NO CAMPO ESCONDIDO (É isto que vai para o Firestore ao salvar)
        document.getElementById('photoData').value = downloadURL; 
        
        showToast("Foto pronta!");
    } catch (error) {
        console.error("Erro no upload:", error);
        showToast("Erro ao fazer upload da imagem", "error");
    } finally {
        // Libera o botão de salvar novamente
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.innerHTML = "<i data-lucide='save' class='w-4 h-4'></i> SALVAR";
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }
};

// Função auxiliar para remover a foto caso o usuário clique em "Remover Foto"
window.removePhoto = () => {
    document.getElementById('photoPreview').src = '';
    document.getElementById('photoPreview').classList.add('hidden');
    document.getElementById('photoPlaceholder').classList.remove('hidden');
    document.getElementById('photoData').value = ''; // Limpa o link
    document.getElementById('btnRemovePhoto').classList.add('hidden');
    document.getElementById('playerPhoto').value = ''; // Reseta o input file
};