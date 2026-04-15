import { state } from './state.js';
import { db, appId, teamsRef, doc, addDoc, updateDoc, deleteDoc } from './firebase.js';
import { showToast, openConfirmModal } from './ui.js';

// --- Algoritmos de Balanceamento --- //

export function balanceStrongInside(playersList, playersPerTeam) {
    const numberOfTeams = Math.floor(playersList.length / playersPerTeam);
    if (numberOfTeams === 0) return { teams: [], waitlist: [...playersList] };

    // Adiciona uma semente aleatória para garantir variabilidade entre jogadores do mesmo nível
    let shuffledPlayers = [...playersList].map(p => ({...p, _rand: Math.random()}));
    
    let sortedPlayers = shuffledPlayers.sort((a, b) => {
        const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
        if (catDiff !== 0) return catDiff;
        return a._rand - b._rand; // Desempate aleatório para o mesmo nível
    });
    
    const activePlayersCount = numberOfTeams * playersPerTeam;
    const activePlayers = sortedPlayers.slice(0, activePlayersCount);
    const waitlist = sortedPlayers.slice(activePlayersCount).map(p => ({ ...p, waitlistRounds: 0 }));
    
    const teams = Array.from({ length: numberOfTeams }, () => []);
    let direction = 1, currentTeamIndex = 0;
    
    for (const player of activePlayers) {
        teams[currentTeamIndex].push({ ...player, waitlistRounds: 0 });
        currentTeamIndex += direction;
        
        if (currentTeamIndex >= numberOfTeams) {
            direction = -1;
            currentTeamIndex = numberOfTeams - 1;
        } else if (currentTeamIndex < 0) {
            direction = 1;
            currentTeamIndex = 0;
        }
    }
    return { teams, waitlist };
}

export function balanceStrongOutside(playersList, playersPerTeam) {
    const numberOfTeams = Math.floor(playersList.length / playersPerTeam);
    const waitlistSize = playersList.length % playersPerTeam;
    if (numberOfTeams === 0) return { teams: [], waitlist: [...playersList] };

    let shuffledPlayers = [...playersList].map(p => ({...p, _rand: Math.random()}));
    
    let sortedPlayers = shuffledPlayers.sort((a, b) => {
        const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
        if (catDiff !== 0) return catDiff;
        return a._rand - b._rand;
    });

    const teams = Array.from({ length: numberOfTeams }, () => []);
    const waitlist = [];
    
    const buckets = [...teams];
    if (waitlistSize > 0) buckets.push(waitlist);
    
    const capacities = buckets.map((_, i) => i < numberOfTeams ? playersPerTeam : waitlistSize);
    const draftOrder = [];
    const currentCaps = new Array(buckets.length).fill(0);
    let dir = 1, cur = 0;
    
    while (draftOrder.length < playersList.length) {
        if (currentCaps[cur] < capacities[cur]) { draftOrder.push(cur); currentCaps[cur]++; }
        const next = cur + dir;
        if (next >= buckets.length || next < 0) { dir *= -1; } else { cur = next; }
    }
    
    sortedPlayers.forEach((player, index) => { 
        const bucketIndex = draftOrder[index]; 
        buckets[bucketIndex].push({ ...player, waitlistRounds: 0 }); 
    });

    // Pós-balanceamento da espera
    if (waitlist.length > 0 && teams.length >= 2) {
        let attempts = 0;
        while (attempts < 5) {
            let weakestTeam = teams[0], strongestTeam = teams[0], minSum = Infinity, maxSum = -Infinity;

            teams.forEach(t => {
                const sum = t.reduce((acc, p) => acc + (parseInt(p.categoria) || 1), 0);
                if (sum < minSum) { minSum = sum; weakestTeam = t; }
                if (sum > maxSum) { maxSum = sum; strongestTeam = t; }
            });

            if (maxSum - minSum <= 0) break; 

            let weakestPlayer = weakestTeam[0], minRating = Infinity;
            weakestTeam.forEach(p => {
                const r = parseInt(p.categoria) || 1;
                if (r < minRating) { minRating = r; weakestPlayer = p; }
            });

            let maxWaitlistRating = -Infinity;
            waitlist.forEach(p => {
                const r = parseInt(p.categoria) || 1;
                if (r > maxWaitlistRating) { maxWaitlistRating = r; }
            });

            const weakestPlayerRating = parseInt(weakestPlayer.categoria) || 1;
            const candidates = waitlist.filter(p => {
                const r = parseInt(p.categoria) || 1;
                return r > weakestPlayerRating && r !== maxWaitlistRating;
            });

            if (candidates.length > 0) {
                // Seleção puramente aleatória dentre os válidos
                const swapIn = candidates[Math.floor(Math.random() * candidates.length)];
                weakestTeam.splice(weakestTeam.indexOf(weakestPlayer), 1);
                waitlist.splice(waitlist.indexOf(swapIn), 1);
                weakestTeam.push(swapIn);
                waitlist.push(weakestPlayer);
            } else { break; }
            attempts++;
        }
    }
    return { teams, waitlist };
}

export function preventDoubleCabeças(result, mandatoryIds) {
    let teams = result.teams.map(t => [...t]);
    let waitlist = [...result.waitlist];
    
    for (let i = 0; i < teams.length; i++) {
        let team = teams[i];
        let cabecas = team.filter(p => parseInt(p.categoria) === 5);
        
        while (cabecas.length > 1) {
            let toMoveIndex = cabecas.findIndex(p => !mandatoryIds.has(p.id));
            let toMove = toMoveIndex !== -1 ? cabecas.splice(toMoveIndex, 1)[0] : cabecas.pop();
            let swapped = false;
            
            let teamWithZeroIndex = teams.findIndex(t => t.filter(p => parseInt(p.categoria) === 5).length === 0);
            if (teamWithZeroIndex !== -1) {
                let otherTeam = teams[teamWithZeroIndex];
                // Sorteio aleatório entre cabeças de chave disponíveis
                let nonCabecas = otherTeam.filter(p => parseInt(p.categoria) !== 5)
                    .map(p => ({...p, _rand: Math.random()}))
                    .sort((a, b) => {
                        const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
                        if (catDiff !== 0) return catDiff;
                        return a._rand - b._rand;
                    });

                if (nonCabecas.length > 0) {
                    let swapTarget = nonCabecas[0];
                    team.splice(team.indexOf(toMove), 1, swapTarget);
                    otherTeam.splice(otherTeam.indexOf(swapTarget), 1, toMove);
                    swapped = true;
                }
            }
            
            if (!swapped && waitlist.length > 0) {
                let nonCabecasWait = waitlist.filter(p => parseInt(p.categoria) !== 5)
                    .map(p => ({...p, _rand: Math.random()}))
                    .sort((a, b) => {
                        const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
                        if (catDiff !== 0) return catDiff;
                        return a._rand - b._rand;
                    });
                    
                if (nonCabecasWait.length > 0) {
                    let swapTarget = nonCabecasWait[0];
                    team.splice(team.indexOf(toMove), 1, swapTarget);
                    waitlist.splice(waitlist.indexOf(swapTarget), 1, toMove);
                    swapped = true;
                }
            }
            if (!swapped) break; 
        }
    }
    return { teams, waitlist };
}

// --- Funções de Controlo de Equipas --- //

export const drawTeams = async (size) => {
    const activePlayers = state.players.filter(p => state.selectedPlayerIds.has(p.id));
    if (activePlayers.length === 0) { showToast("Selecione os atletas para o jogo!", "error"); return; }

    const numTeamsToDraw = Math.floor(activePlayers.length / size);
    if (numTeamsToDraw === 0) { showToast(`Selecione pelo menos ${size} jogadores para o sorteio!`, "error"); return; }

    const strategy = document.getElementById('draftStrategy').value;
    let result = strategy === 'FORA' ? balanceStrongOutside(activePlayers, size) : balanceStrongInside(activePlayers, size);
    result = preventDoubleCabeças(result, new Set());

    openConfirmModal("Sorteio Geral", "Todas as equipes atuais serão desfeitas e os contadores zerados.", async () => {
        try {
            const deletePromises = state.drawnTeams.map(t => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', t.id)));
            await Promise.all(deletePromises);
            
            for (let i = 0; i < result.teams.length; i++) {
                let sortedTeam = result.teams[i].sort((a, b) => {
                    const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
                    if (catDiff !== 0) return catDiff;
                    return (b.pontos || 0) - (a.pontos || 0);
                });
                await addDoc(teamsRef, { label: (i + 1).toString(), players: sortedTeam });
            }
            
            if (result.waitlist.length > 0) {
                let sortedWaitlist = result.waitlist.sort((a, b) => {
                    const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
                    if (catDiff !== 0) return catDiff;
                    return (b.pontos || 0) - (a.pontos || 0);
                });
                await addDoc(teamsRef, { label: 'DE FORA', isWaitlist: true, players: sortedWaitlist });
                showToast(`Sorteio concluído! ${result.waitlist.length} atleta(s) na espera.`);
            } else { 
                showToast("Equipes perfeitamente equilibradas geradas!"); 
            }
        } catch(e) { showToast("Erro ao realizar Sorteio Geral", "error"); }
    });
};

export const redrawTeamWithWaitlist = async (teamId) => {
    openConfirmModal("Sorteio de Substituições", "Deseja substituir este time considerando as prioridades da lista de espera?", async () => {
        const targetTeamDoc = state.drawnTeams.find(t => t.id === teamId);
        if (!targetTeamDoc) return;

        const waitlistTeamDoc = state.drawnTeams.find(t => t.isWaitlist);
        const otherTeams = state.drawnTeams.filter(t => t.id !== teamId && !t.isWaitlist);
        
        let targetSum = 0;
        if (otherTeams.length > 0) {
            const totalOtherSum = otherTeams.reduce((acc, t) => acc + t.players.reduce((sum, p) => sum + (parseInt(p.categoria) || 1), 0), 0);
            targetSum = totalOtherSum / otherTeams.length;
        }

        const currentTeamPlayers = targetTeamDoc.players.map(p => ({...p, isFromTeam: true}));
        const waitlistPlayers = waitlistTeamDoc ? waitlistTeamDoc.players.map(p => ({...p, isFromWaitlist: true})) : [];
        
        const allAssignedIds = new Set([
            ...state.drawnTeams.filter(t => !t.isWaitlist).flatMap(t => t.players.map(p => p.id)),
            ...waitlistPlayers.map(p => p.id)
        ]);
        
        const activeSelected = state.players.filter(p => state.selectedPlayerIds.has(p.id));
        const newUnassigned = activeSelected.filter(p => !allAssignedIds.has(p.id)).map(p => ({...p, isNew: true, waitlistRounds: 0})); 
        
        let pool = [...currentTeamPlayers, ...waitlistPlayers, ...newUnassigned];
        const N = currentTeamPlayers.length;

        if (pool.length <= N) {
            showToast("Não há jogadores suficientes na espera para realizar substituições.", "warning");
            return;
        }

        if (targetSum === 0) { 
            targetSum = pool.reduce((acc, p) => acc + (parseInt(p.categoria) || 1), 0) * (N / pool.length);
        }

        let mandatory = pool.filter(p => p.isFromWaitlist && (p.waitlistRounds >= 1));
        
        mandatory.sort((a, b) => {
            if (b.waitlistRounds !== a.waitlistRounds) return b.waitlistRounds - a.waitlistRounds;
            return (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
        });
        
        if (mandatory.length > N) {
            mandatory = mandatory.slice(0, N);
        }

        const baseTeam = mandatory;
        const remainingPool = pool.filter(p => !baseTeam.some(m => m.id === p.id));
        const slotsLeft = N - baseTeam.length;

        let limitedPool = remainingPool;
        
        // Embaralha o pool de candidatos para que a geração de combinações não vicie os primeiros da lista
        for (let i = limitedPool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [limitedPool[i], limitedPool[j]] = [limitedPool[j], limitedPool[i]];
        }

        if (limitedPool.length > 12) {
            limitedPool.sort((a, b) => {
                const aVal = a.isFromWaitlist ? 1 : (a.isNew ? 0 : -1);
                const bVal = b.isFromWaitlist ? 1 : (b.isNew ? 0 : -1);
                if (bVal !== aVal) return bVal - aVal;
                return (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
            });
            limitedPool = limitedPool.slice(0, 12);
        }

        function getCombinations(arr, k) {
            if (k === 0) return [[]];
            if (arr.length === 0) return [];
            const results = [];
            function helper(start, combo) {
                if (combo.length === k) { results.push([...combo]); return; }
                for (let i = start; i < arr.length; i++) {
                    combo.push(arr[i]); helper(i + 1, combo); combo.pop();
                }
            }
            helper(0, []);
            return results;
        }

        const combos = getCombinations(limitedPool, slotsLeft);
        
        let bestCombos = [];
        let minDiff = Infinity;
        let bestSwapCount = -1;

        if (slotsLeft === 0) {
            bestCombos = [baseTeam];
        } else {
            for (const combo of combos) {
                const candidateTeam = [...baseTeam, ...combo];
                const sum = candidateTeam.reduce((acc, p) => acc + (parseInt(p.categoria) || 1), 0);
                const diff = Math.abs(sum - targetSum);
                const waitlistCount = candidateTeam.filter(p => p.isFromWaitlist || p.isNew).length;

                let isBetter = false;
                let isEqual = false;

                if (diff < minDiff) {
                    isBetter = true;
                } else if (diff === minDiff) {
                    if (waitlistCount > bestSwapCount) {
                        isBetter = true;
                    } else if (waitlistCount === bestSwapCount) {
                        isEqual = true; // Achou um empate idêntico na força e na quantidade de trocas
                    }
                }

                if (isBetter) {
                    minDiff = diff;
                    bestSwapCount = waitlistCount;
                    bestCombos = [candidateTeam];
                } else if (isEqual) {
                    bestCombos.push(candidateTeam); // Guarda todas as combinações equivalentes
                }
            }
        }

        // Seleciona aleatoriamente entre os times empatados tecnicamente
        let bestTeam = bestCombos.length > 0 
            ? bestCombos[Math.floor(Math.random() * bestCombos.length)] 
            : baseTeam;

        const newTeamIds = new Set(bestTeam.map(p => p.id));
        
        const newTeam = bestTeam.map(p => {
            const { isFromTeam, isFromWaitlist, isNew, ...rest } = p;
            return { ...rest, waitlistRounds: 0 }; 
        }).sort((a, b) => (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1));

        const newWaitlist = pool.filter(p => !newTeamIds.has(p.id)).map(p => {
            const { isFromTeam, isFromWaitlist, isNew, ...rest } = p;
            let rounds = 0;
            if (isFromWaitlist) {
                rounds = (p.waitlistRounds || 0) + 1; 
            } else if (isFromTeam || isNew) {
                rounds = 0; 
            }
            return { ...rest, waitlistRounds: rounds };
        }).sort((a, b) => {
            if (b.waitlistRounds !== a.waitlistRounds) return (b.waitlistRounds || 0) - (a.waitlistRounds || 0);
            return (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
        });

        try {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', targetTeamDoc.id), { players: newTeam });
            
            if (waitlistTeamDoc) {
                if (newWaitlist.length > 0) {
                    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', waitlistTeamDoc.id), { players: newWaitlist });
                } else {
                    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', waitlistTeamDoc.id));
                }
            } else if (newWaitlist.length > 0) {
                await addDoc(teamsRef, { label: 'DE FORA', isWaitlist: true, players: newWaitlist });
            }
            showToast("Substituição feita! Jogadores selecionados aleatoriamente.", "success");
        } catch(e) { console.error(e); showToast("Erro ao substituir equipe", "error"); }
    });
};

export const createWaitlist = () => {
    openConfirmModal("Sincronizar Presenças", "Isso irá remover os atletas desmarcados dos times e adicionar os novos marcados na lista de espera. Deseja continuar?", async () => {
        try {
            const waitlistTeamDoc = state.drawnTeams.find(t => t.isWaitlist);
            let currentWaitlistPlayers = [];
            const updatePromises = [];
            
            for (const team of state.drawnTeams) {
                if (!team.isWaitlist) {
                    const filteredPlayers = team.players.filter(p => state.selectedPlayerIds.has(p.id));
                    if (filteredPlayers.length !== team.players.length) {
                        if (filteredPlayers.length === 0) {
                            updatePromises.push(deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', team.id)));
                        } else {
                            updatePromises.push(updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', team.id), { players: filteredPlayers }));
                        }
                    }
                } else {
                    currentWaitlistPlayers = team.players.filter(p => state.selectedPlayerIds.has(p.id));
                }
            }
            
            const playersInNormalTeamsIds = new Set(
                state.drawnTeams
                    .filter(t => !t.isWaitlist)
                    .flatMap(t => t.players.filter(p => state.selectedPlayerIds.has(p.id)).map(p => p.id))
            );
            const playersInWaitlistIds = new Set(currentWaitlistPlayers.map(p => p.id));
            
            const activePlayers = state.players.filter(p => state.selectedPlayerIds.has(p.id));
            const newPlayersToAdd = activePlayers.filter(p => !playersInNormalTeamsIds.has(p.id) && !playersInWaitlistIds.has(p.id));
            
            const newPlayersWithRounds = newPlayersToAdd.map(p => ({ ...p, waitlistRounds: 0 }));
            
            const updatedWaitlist = [...currentWaitlistPlayers, ...newPlayersWithRounds].sort((a, b) => {
                const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
                if (catDiff !== 0) return catDiff;
                return (b.pontos || 0) - (a.pontos || 0);
            });
            
            if (waitlistTeamDoc) {
                if (updatedWaitlist.length > 0) {
                    updatePromises.push(updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', waitlistTeamDoc.id), { players: updatedWaitlist }));
                } else {
                    updatePromises.push(deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', waitlistTeamDoc.id)));
                }
            } else if (updatedWaitlist.length > 0) {
                updatePromises.push(addDoc(teamsRef, { label: 'DE FORA', isWaitlist: true, players: updatedWaitlist }));
            }
            
            await Promise.all(updatePromises);
            showToast("Sincronização de presença concluída!", "success");
        } catch (e) { 
            console.error(e);
            showToast("Erro ao atualizar presenças", "error"); 
        }
    });
};

export const clearTeams = () => {
    openConfirmModal("Limpar Todas as Equipes", "Deseja realmente excluir todas as equipes geradas?", async () => {
        try {
            const deletePromises = state.drawnTeams.map(t => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', t.id)));
            await Promise.all(deletePromises);
            showToast("Todas as equipes foram removidas!", "info");
        } catch (e) { showToast("Erro ao limpar equipes", "error"); }
    });
};

export const deleteTeam = (id) => {
    openConfirmModal("Remover Equipe", "Deseja remover esta equipe do sorteio?", async () => {
        try { 
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', id)); 
            showToast("Equipe removida.", "info"); 
        } catch (e) { showToast("Erro ao excluir", "error"); }
    });
};

// --- Funções de Placar --- //

export function checkWinCondition() {
    const isTradicionalWin = (state.score1 >= 21 || state.score2 >= 21) && Math.abs(state.score1 - state.score2) >= 2;
    const isCapoteWin = (state.score1 >= 8 && state.score2 === 0) || (state.score2 >= 8 && state.score1 === 0);
    
    if (isTradicionalWin || isCapoteWin) {
        const select1 = document.getElementById('team1Select'), select2 = document.getElementById('team2Select');
        let winnerName = state.score1 > state.score2 ? (select1.value && select1.selectedIndex > 0 ? select1.options[select1.selectedIndex].text : "TIME 1 (AZUL)") : (select2.value && select2.selectedIndex > 0 ? select2.options[select2.selectedIndex].text : "TIME 2 (VERMELHO)");
        document.getElementById('victoryTeamName').innerText = winnerName;
        
        if (!select1.value || !select2.value || select1.value === select2.value) { 
            document.getElementById('btnSaveResult').classList.add('hidden'); 
            document.getElementById('victoryTeamWarning').classList.remove('hidden'); 
        } else { 
            document.getElementById('btnSaveResult').classList.remove('hidden'); 
            document.getElementById('victoryTeamWarning').classList.add('hidden'); 
        }
        
        document.getElementById('victoryModal').classList.remove('hidden'); 
        document.getElementById('victoryModal').classList.add('flex');
        if (isCapoteWin) showToast("🔥 VITÓRIA POR CAPOTE (8 a 0)! 🔥", "success");
        lucide.createIcons();
    }
}

export const updateScore = (team, change) => {
    if (team === 1) { state.score1 = Math.max(0, state.score1 + change); document.getElementById('score1').innerText = state.score1; }
    else { state.score2 = Math.max(0, state.score2 + change); document.getElementById('score2').innerText = state.score2; }
    checkWinCondition();
};

export const resetScore = () => {
    openConfirmModal("Zerar Placar", "Deseja realmente zerar o placar da partida atual?", () => {
        state.score1 = 0; state.score2 = 0; 
        document.getElementById('score1').innerText = state.score1; 
        document.getElementById('score2').innerText = state.score2;
        document.getElementById('team1Select').value = ''; 
        document.getElementById('team2Select').value = ''; 
        showToast("Placar zerado!", "info");
    });
};

window.drawTeams = drawTeams;
window.redrawTeamWithWaitlist = redrawTeamWithWaitlist;
window.createWaitlist = createWaitlist;
window.clearTeams = clearTeams;
window.deleteTeam = deleteTeam;
window.updateScore = updateScore;
window.resetScore = resetScore;