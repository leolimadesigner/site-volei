import { firebaseConfig } from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, // Para criar conta
    sendPasswordResetEmail,         // Para recuperar password
    signOut, 
    onAuthStateChanged,
    GoogleAuthProvider,             // Para login com Google
    signInWithPopup                 // Para login com popup
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc,                         // NOVO: Para ler dados de um documento específico
    collection, 
    onSnapshot, 
    deleteDoc, 
    addDoc, 
    updateDoc,
    query,
    orderBy,
    where                           // NOVO: Para filtrar grupos do utilizador
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// 1. Inicialização
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);

// ============================================================================
// 2. REFERÊNCIAS GLOBAIS (Não dependem do grupo selecionado)
// ============================================================================
export const globalGroupsRef = collection(db, 'groups');
export const globalUsersRef = collection(db, 'users');

// ============================================================================
// 3. REFERÊNCIAS DINÂMICAS DO GRUPO
// ============================================================================
// Estas variáveis começam nulas e são preenchidas quando o utilizador escolhe um grupo
export let playersRef = null;
export let teamsRef = null;
export let matchHistoryRef = null;
export let settingsRef = null;

/**
 * Função responsável por apontar o banco de dados para a "pasta" do grupo escolhido.
 * Ao usar esta função, todo o resto do site passará a ler/escrever no grupo correto.
 */
export const setGroupContext = (groupId) => {
    if (!groupId) return;
    const basePath = ['groups', groupId];
    
    playersRef = collection(db, ...basePath, 'players');
    teamsRef = collection(db, ...basePath, 'teams');
    matchHistoryRef = collection(db, ...basePath, 'matchHistory');
    settingsRef = doc(db, ...basePath, 'settings', 'global');
    
    console.log(`Contexto da base de dados alterado para o grupo: ${groupId}`);
};

// 4. Exportação de funções e instâncias
export { 
    auth, 
    db, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut, 
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    doc, 
    setDoc, 
    getDoc,
    collection, 
    onSnapshot, 
    deleteDoc, 
    addDoc, 
    updateDoc,
    query,
    orderBy,
    where,
    storage,
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject,
    functions,
    httpsCallable
};