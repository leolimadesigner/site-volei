import { firebaseConfig } from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    signInAnonymously, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    collection, 
    onSnapshot, 
    deleteDoc, 
    addDoc, 
    updateDoc,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// 1. Suas novas credenciais do Passo 4

// 2. Inicialização
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// 3. Definição centralizada de caminhos (Evita caminhos redundantes)
// Manteremos a estrutura de 'artifacts' para compatibilidade, 
// mas centralizada aqui para facilitar mudanças futuras.
const BASE_PATH = ['artifacts', 'time-certo-prod', 'public', 'data'];

export const playersRef = collection(db, ...BASE_PATH, 'players');
export const teamsRef = collection(db, ...BASE_PATH, 'teams');
export const matchHistoryRef = collection(db, ...BASE_PATH, 'matchHistory');
export const settingsRef = doc(db, ...BASE_PATH, 'settings', 'global');

// 4. Exportação de funções e instâncias
export { 
    auth, 
    db, 
    signInWithEmailAndPassword, 
    signInAnonymously, 
    signOut, 
    onAuthStateChanged,
    doc, 
    setDoc, 
    collection, 
    onSnapshot, 
    deleteDoc, 
    addDoc, 
    updateDoc,
    query,
    orderBy,
    storage,
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject
};