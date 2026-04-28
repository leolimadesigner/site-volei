import { state } from '../state.js';
import { calculateEloMatch, calculatePlayerFinalEloChange } from '../services/rankingService.js';
import { db, doc, updateDoc, addDoc, playersRef, matchHistoryRef, settingsRef, setDoc } from '../firebase.js';
import { showToast, closeVictoryModalOnly, updateLiveEloPreview, getTeamName, openConfirmModal } from '../ui.js';

// ============================================================================
// CONFIGURAÇÕES DA PARTIDA SÃO GLOBAIS AGORA (state.matchConfig)
// ============================================================================

// ============================================================================
// LÓGICA DE PLACAR
// ============================================================================

/**
 * Atualiza o placar local e sincroniza com a nuvem
 */
export const updateScore = (team, change) => {
    if (state.isPlacarLocked) return; // <-- BLOQUEIA CLIQUES FANTASMA
    // 1. Atualiza a pontuação APENAS no dispositivo local!
    if (team === 1) {
        state.score1 = Math.max(0, state.score1 + change);
        document.getElementById('score1').innerText = state.score1;
    } else {
        state.score2 = Math.max(0, state.score2 + change);
        document.getElementById('score2').innerText = state.score2;
    }
    
    if (typeof updateLiveEloPreview === 'function') updateLiveEloPreview();
    checkWinCondition();
    
    // 2. Salva no cache do grupo IMEDIATAMENTE para não perder ao trocar de aba
    if (state.currentGroupId && state.groupMatchStates[state.currentGroupId]) {
        state.groupMatchStates[state.currentGroupId].score1 = state.score1;
        state.groupMatchStates[state.currentGroupId].score2 = state.score2;
    }
};

/**
 * Zera o placar local e na nuvem
 */
export const resetScore = () => {
    if (state.isPlacarLocked) {
        showToast("Ação bloqueada: Existe uma partida em andamento em outro dispositivo.", "info");
        return;
    }

    openConfirmModal("Zerar Placar", "Deseja realmente zerar a pontuação e liberar a quadra para outros usuários?", async () => {
        // 1. Reseta o estado local
        state.score1 = 0;
        state.score2 = 0;
        state.currentTeam1 = '';
        state.currentTeam2 = '';

        // 3. Atualiza na UI
        const s1 = document.getElementById('score1'); if(s1) s1.innerText = '0';
        const s2 = document.getElementById('score2'); if(s2) s2.innerText = '0';
        
        // 4. Salva no cache do grupo imediatamente
        if (state.currentGroupId && state.groupMatchStates[state.currentGroupId]) {
            state.groupMatchStates[state.currentGroupId].score1 = 0;
            state.groupMatchStates[state.currentGroupId].score2 = 0;
        }
        
        // 5. Zera e sincroniza os times
        const t1 = document.getElementById('team1Select'); if (t1) t1.value = '';
        const t2 = document.getElementById('team2Select'); if (t2) t2.value = '';
        
        state.currentTeam1 = '';
        state.currentTeam2 = '';
        
        resetTimer();
        syncTeamsToCloud();

        // 3. Libera a quadra no Firebase (Sincronização)
        try {
            // Usamos setDoc com merge para garantir que os campos de bloqueio sejam resetados
            await setDoc(settingsRef, { 
                matchInProgress: false, 
                matchOwner: null,
                team1: '',
                team2: '',
                score1: 0,
                score2: 0
            }, { merge: true });
            
            showToast("Placar reiniciado e quadra liberada.", "info");
        } catch (e) {
            console.error("Erro ao liberar quadra no reset:", e);
            showToast("Erro ao sincronizar liberação.", "error");
        }

        // 4. Atualiza o preview (que deve sumir, já que não há times)
        if (typeof updateLiveEloPreview === 'function') updateLiveEloPreview();
    });
};

/**
 * Sincroniza a seleção de times no placar com a nuvem 
 * e aciona o preview de Elo.
 */
export const syncTeamsToCloud = async () => {
    if (state.isPlacarLocked) return; // <-- IMPEDE TROCAR TIMES DURANTE JOGO ALHEIO

    const select1 = document.getElementById('team1Select');
    const select2 = document.getElementById('team2Select');
    
    const t1 = select1?.value || '';
    const t2 = select2?.value || '';
    
    state.currentTeam1 = t1;
    state.currentTeam2 = t2;
    
    // Salva no cache do grupo imediatamente para não perder
    if (state.currentGroupId && state.groupMatchStates[state.currentGroupId]) {
        state.groupMatchStates[state.currentGroupId].currentTeam1 = t1;
        state.groupMatchStates[state.currentGroupId].currentTeam2 = t2;
    }
    
    const isMatchActive = t1 !== '' || t2 !== '';
    
    try {
        // USAMOS setDoc com merge: true para garantir que o documento 'global' existe
        await setDoc(settingsRef, { 
            matchInProgress: isMatchActive,
            matchOwner: isMatchActive ? state.localSessionId : null
        }, { merge: true });
        
        console.log("Sinal de ocupado enviado:", isMatchActive);
    } catch (e) {
        console.error("Erro ao bloquear a quadra:", e);
    }
    
    if (typeof updateLiveEloPreview === 'function') updateLiveEloPreview();
};

// ============================================================================
// TEMPORIZADOR LOCAL
// ============================================================================

export const updateTimerDisplay = () => {
    const container = document.getElementById('timerContainer');
    const display = document.getElementById('timerDisplay');
    const playPauseIcon = document.getElementById('iconTimerPlayPause');
    
    if (!container || !display) return;
    
    if (state.matchConfig.useTime) {
        container.classList.remove('hidden');
        container.classList.add('flex');
    } else {
        container.classList.add('hidden');
        container.classList.remove('flex');
        return;
    }
    
    const minutes = Math.floor(state.matchTimer.secondsLeft / 60);
    const seconds = state.matchTimer.secondsLeft % 60;
    display.innerText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    if (playPauseIcon) {
        if (state.matchTimer.isRunning) {
            playPauseIcon.setAttribute('data-lucide', 'pause');
        } else {
            playPauseIcon.setAttribute('data-lucide', 'play');
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
};

window.updateTimerDisplay = updateTimerDisplay;

export const toggleTimer = () => {
    if (state.isPlacarLocked) return;
    
    if (state.matchTimer.isRunning) {
        // Pausar
        clearInterval(state.matchTimer.intervalId);
        state.matchTimer.intervalId = null;
        state.matchTimer.isRunning = false;
        updateTimerDisplay();
    } else {
        // Iniciar
        const select1 = document.getElementById('team1Select');
        const select2 = document.getElementById('team2Select');
        
        if (!select1?.value || !select2?.value || select1.value === select2.value) {
            showToast("Selecione dois times válidos antes de iniciar o tempo.", "warning");
            return;
        }

        if (state.matchTimer.secondsLeft === 0) {
            state.matchTimer.secondsLeft = state.matchConfig.timeMinutes * 60;
        }
        
        // Captura as referências deste grupo específico para que o timer continue
        // funcionando independentemente de trocas de grupo
        const timerScope = state.matchTimer;
        const groupIdScope = state.currentGroupId;
        const groupNameScope = state.currentGroupName;
        
        timerScope.isRunning = true;
        timerScope.intervalId = setInterval(() => {
            timerScope.secondsLeft--;
            
            // Só atualiza o relógio na tela se estivermos olhando para este grupo
            if (state.currentGroupId === groupIdScope) {
                updateTimerDisplay();
            }
            
            if (timerScope.secondsLeft <= 0) {
                clearInterval(timerScope.intervalId);
                timerScope.intervalId = null;
                timerScope.isRunning = false;
                
                if (typeof window.playBeepSound === 'function') {
                    window.playBeepSound();
                }
                
                // Se ainda estivermos no mesmo grupo, lança a vitória na tela
                if (state.currentGroupId === groupIdScope) {
                    checkWinCondition(true);
                } else {
                    // Se estivermos em outro grupo, avisa e marca para checar depois
                    showToast(`🚨 O tempo esgotou na partida do grupo ${groupNameScope}!`, "warning");
                    const savedState = state.groupMatchStates[groupIdScope];
                    if (savedState) savedState.needsWinCheck = true;
                }
            }
        }, 1000);
        
        updateTimerDisplay();
        
        // Bloqueia o placar na nuvem se não estiver bloqueado
        if (!state.isPlacarLocked) {
            syncTeamsToCloud();
        }
    }
};

export const resetTimer = () => {
    if (state.matchTimer.intervalId) {
        clearInterval(state.matchTimer.intervalId);
        state.matchTimer.intervalId = null;
    }
    state.matchTimer.isRunning = false;
    state.matchTimer.secondsLeft = state.matchConfig.timeMinutes * 60;
    updateTimerDisplay();
};

// Quando carregar a página ou re-configurar, atualiza a tela do timer
setTimeout(resetTimer, 500);

// ============================================================================
// LÓGICA DE VITÓRIA E ENCERRAMENTO
// ============================================================================

/**
 * Verifica se alguma das condições de vitória foi atingida
 * @param {boolean} isTimeOut Indica se a chamada foi disparada pelo fim do timer
 */
export const checkWinCondition = (isTimeOut = false) => {
    const c = state.matchConfig;
    
    // Condição 1 (Principal)
    let isWin1 = false;
    if (c.usePoints1) {
        const reachedLimit = state.score1 >= c.points1 || state.score2 >= c.points1;
        if (c.twoPointsDiff) {
            isWin1 = reachedLimit && Math.abs(state.score1 - state.score2) >= 2;
        } else {
            isWin1 = reachedLimit;
        }
    }
    
    // Condição 2 (Secundária/Capote)
    let isCapoteWin = false;
    if (c.usePoints2) {
        isCapoteWin = (state.score1 >= c.points2 && state.score2 === 0) || 
                 (state.score2 >= c.points2 && state.score1 === 0);
    }
    
    // Fim por Tempo
    const isWinTime = c.useTime && isTimeOut;
    
    if (isWin1 || isCapoteWin || isWinTime) {
        // Pausa o timer
        if (state.matchTimer.intervalId) {
            clearInterval(state.matchTimer.intervalId);
            state.matchTimer.intervalId = null;
            state.matchTimer.isRunning = false;
            updateTimerDisplay();
        }

        const isTie = state.score1 === state.score2;
        let winnerName = "";
        
        const select1 = document.getElementById('team1Select');
        const select2 = document.getElementById('team2Select');
        
        if (isTie) {
            winnerName = "PARTIDA EMPATADA";
            document.getElementById('victoryTitle').innerText = "Tempo Esgotado!";
            document.getElementById('victoryIcon').setAttribute('data-lucide', 'clock');
            document.getElementById('victoryTeamName').classList.replace('text-yellow-400', 'text-slate-300');
        } else {
            winnerName = state.score1 > state.score2 
                ? (select1?.value && select1.selectedIndex > 0 ? select1.options[select1.selectedIndex].text : "TIME 1 (AZUL)") 
                : (select2?.value && select2.selectedIndex > 0 ? select2.options[select2.selectedIndex].text : "TIME 2 (VERMELHO)");
            document.getElementById('victoryTitle').innerText = "Fim de Jogo!";
            document.getElementById('victoryIcon').setAttribute('data-lucide', 'trophy');
            document.getElementById('victoryTeamName').classList.replace('text-slate-300', 'text-yellow-400');
        }
            
        document.getElementById('victoryTeamName').innerText = winnerName;
        
        const btnSaveResult = document.getElementById('btnSaveResult');
        const warning = document.getElementById('victoryTeamWarning');
        const eloInfoDiv = document.getElementById('victoryEloInfo');

        const isAdmin = state.currentUserRole === 'admin' || state.isMaster;

        // Validações de segurança para o Placar Público
        if (!select1?.value || !select2?.value || select1.value === select2.value) { 
            btnSaveResult.classList.add('hidden'); 
            warning.classList.remove('hidden'); 
            warning.innerText = "Selecione duas equipes válidas e diferentes.";
            if(eloInfoDiv) eloInfoDiv.classList.add('hidden');
        } else if (!isAdmin && !state.eloEnabled) {
            btnSaveResult.classList.add('hidden'); 
            warning.classList.remove('hidden'); 
            warning.innerText = "O Placar Público está fechado. Apenas o administrador pode salvar os resultados.";
            if(eloInfoDiv) eloInfoDiv.classList.add('hidden');
        } else { 
            btnSaveResult.classList.remove('hidden'); 
            warning.classList.add('hidden'); 
            
            // Busca a prévia do Elo (Essa função continua no ui.js, pois mexe com o DOM)
            if (typeof updateLiveEloPreview === 'function') updateLiveEloPreview();
        }
        
        document.getElementById('victoryModal').classList.remove('hidden'); 
        document.getElementById('victoryModal').classList.add('flex');
        
        if (isCapoteWin) showToast("🔥 VITÓRIA POR CAPOTE! 🔥", "success");
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
};

/**
 * Aplica o resultado matemático no banco de dados e salva o histórico
 */
export const saveAndCloseVictoryModal = async () => {
    if (state.isPlacarLocked) {
        showToast("Ação bloqueada: Existe uma partida em andamento em outro dispositivo.", "info");
        return;
    }

    // 1. Recupera os dados da partida diretamente da UI
    const previewData = updateLiveEloPreview();

    if (!previewData) {
        showToast("Selecione dois times válidos no placar!", "error");
        return;
    }

    // Trava de segurança: impede salvamento duplo
    if (state.score1 === 0 && state.score2 === 0) {
        showToast("Esta partida já foi encerrada.", "warning");
        return;
    }

    const { changeT1, changeT2, team1, team2, isTeam1Winner } = previewData;
    const btnSave = document.getElementById('btnSaveResult');
    btnSave.innerText = "SALVANDO...";
    btnSave.disabled = true;

    try {
        const updatePromises = [];
        const processedPlayerIds = new Set();
        const isTie = previewData.isTie;

        const processTeam = (team, change, isWinActual, isTieActual) => {
            team.players.forEach(p => {
                if (processedPlayerIds.has(p.id)) return; 
                processedPlayerIds.add(p.id);

                const dbPlayer = state.players.find(x => x.id === p.id);
                if (dbPlayer) {
                    const partidas = (dbPlayer.partidas || 0) + 1;
                    const vitorias = (dbPlayer.vitorias || 0) + ((isWinActual && !isTieActual) ? 1 : 0);
                    const currentStreak = dbPlayer.streak || 0;
                    
                    const newStreak = isTieActual ? 0 : (isWinActual ? (currentStreak >= 0 ? currentStreak + 1 : 1) : (currentStreak <= 0 ? currentStreak - 1 : -1));
                    
                    const finalChange = isTieActual ? 0 : calculatePlayerFinalEloChange(change, isWinActual, currentStreak);
                    const newElo = Math.max(0, (dbPlayer.eloRating ?? 150) + finalChange);
                    
                    updatePromises.push(updateDoc(doc(playersRef, p.id), {
                        eloRating: newElo, partidas, vitorias, streak: newStreak, updatedAt: Date.now()
                    }));
                }
            });
        };

        processTeam(team1, changeT1, isTeam1Winner, isTie);
        processTeam(team2, changeT2, !isTeam1Winner, isTie);

        // Salva Histórico
        updatePromises.push(addDoc(matchHistoryRef, {
            timestamp: Date.now(),
            dateString: new Date().toLocaleDateString('pt-BR'),
            team1: { name: getTeamName(team1), score: state.score1, players: team1.players.map(p => p.name) },
            team2: { name: getTeamName(team2), score: state.score2, players: team2.players.map(p => p.name) },
            winner: isTie ? 0 : (isTeam1Winner ? 1 : 2),
            eloGain: isTie ? 0 : (isTeam1Winner ? changeT1 : changeT2)
        }));

        await Promise.all(updatePromises);
        showToast(`Ranking Atualizado! +${isTeam1Winner ? changeT1 : changeT2} Elo.`, "success");

        // 2. DISPARA O RESET COMPLETO (Limpa placar e desmarca times)
        await closeVictoryModalOnly();
        
    } catch (error) {
        console.error(error);
        showToast("Erro ao salvar resultado.", "error");
    } finally {
        btnSave.innerText = "SALVAR RANKING";
        btnSave.disabled = false;
    }
};