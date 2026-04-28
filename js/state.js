/**
 * Estado Global da Aplicação (Single Source of Truth)
 * Centraliza todas as variáveis voláteis que a interface precisa para se renderizar.
 */
export const state = {
    // Gerador robusto de ID de sessão
    localSessionId: (() => {
        try {
            let s = sessionStorage.getItem('tc_sid');
            if (!s) {
                s = Math.random().toString(36).substring(2, 15);
                sessionStorage.setItem('tc_sid', s);
            }
            return s;
        } catch (e) {
            return "temp-" + Math.random().toString(36).substring(2, 15);
        }
    })(),

    // ---------------------------------------------------
    // 1. DADOS DO BANCO (Agora referentes ao GRUPO ATUAL)
    // ---------------------------------------------------
    players: [],            // Jogadores do grupo selecionado
    drawnTeams: [],         // Times sorteados do grupo selecionado
    matchHistory: [],       // Histórico de partidas do grupo selecionado
    eloEnabled: false,      // Configuração de placar aberto do grupo selecionado
    isPlacarLocked: false,  // Controle de bloqueio da quadra do grupo selecionado

    // ---------------------------------------------------
    // 2. ESTADO DE AUTENTICAÇÃO E SEGURANÇA
    // ---------------------------------------------------
    isAuthenticated: false, // Define se o utilizador tem sessão iniciada
    user: null,             // Objeto base de autenticação do Firebase (uid, email)
    userProfile: null,      // Dados extras do utilizador vindos do banco (nome)
    isMaster: false,        // Flag para o Admin Geral do Sistema (Pode ver tudo)

    // ---------------------------------------------------
    // 3. CONTEXTO MULTI-GRUPOS (NOVO!)
    // ---------------------------------------------------
    userGroups: [],         // Lista de todos os rachas que o utilizador participa ou administra
    currentGroupId: null,   // ID do Racha que está aberto na tela no momento
    currentGroupName: '',   // Nome do Racha que está aberto
    currentUserRole: null,  // Permissão no racha atual ('admin', 'player', ou 'guest')
    unsubscribeGroup: null, // Guarda as funções que escutam o banco para podermos desligá-las ao trocar de grupo
    unsubscribeGroupsList: null, // NOVO: Para desligar a escuta da lista de grupos

    // ---------------------------------------------------
    // 4. ESTADO DA INTERFACE E NAVEGAÇÃO
    // ---------------------------------------------------
    isFirstLoad: true,      // Flag para selecionar todos os jogadores na primeira vez que a lista carrega
    historyCurrentPage: 0,  // Controle de paginação/dias na aba de histórico
    
    // ---------------------------------------------------
    // 5. ESTADO DO PLACAR DA PARTIDA ATUAL (E DE OUTROS GRUPOS EM BACKGROUND)
    // ---------------------------------------------------
    groupMatchStates: {},   // NOVO: Dicionário para guardar o estado do placar de cada grupo
    pendingWinCheck: false, // Flag para checar vitória após carregamento dos times
    score1: 0,              
    score2: 0,              
    currentTeam1: '',       
    currentTeam2: '',       

    // ---------------------------------------------------
    // 6. ESTADO DE INTERAÇÃO DO UTILIZADOR
    // ---------------------------------------------------
    selectedPlayerIds: new Set(), 
    confirmActionCallback: null,  
    
    moveData: { 
        sourceTeamId: null, 
        playerId: null 
    },

    // ---------------------------------------------------
    // 7. CONFIGURAÇÕES DO PLACAR E TEMPORIZADOR LOCAL
    // ---------------------------------------------------
    matchConfig: (() => {
        try {
            const saved = localStorage.getItem('tc_matchConfig');
            if (saved) return JSON.parse(saved);
        } catch(e) {}
        return {
            sportMode: 'volei',
            useTime: false, timeMinutes: 10,
            usePoints1: true, points1: 21,
            usePoints2: true, points2: 8,
            twoPointsDiff: true
        };
    })(),
    matchTimer: {
        isRunning: false,
        secondsLeft: 0,
        intervalId: null
    }
};