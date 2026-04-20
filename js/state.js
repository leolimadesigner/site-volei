export const state = {
    players: [], 
    drawnTeams: [], 
    matchHistory: [],
    selectedPlayerIds: new Set(), 
    isFirstLoad: true,
    isAuthenticated: false, 
    currentUser: null, 
    eloEnabled: false, // <-- Flag para permitir/bloquear o Placar Público 
    score1: 0, 
    score2: 0,
    confirmActionCallback: null,
    historyCurrentPage: 0, 
    moveData: { 
        sourceTeamId: null, 
        playerId: null 
    }
};