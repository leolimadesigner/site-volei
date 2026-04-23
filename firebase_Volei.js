import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, collection, onSnapshot, deleteDoc, addDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Credenciais do Banco Original (app-volei-34f53)
const firebaseConfig = {
    apiKey: "AIzaSyCWjwuRy4BVliXYUog-_qy6I8vWEPJBbHk",
    authDomain: "app-volei-34f53.firebaseapp.com",
    projectId: "app-volei-34f53",
    storageBucket: "app-volei-34f53.firebasestorage.app",
    messagingSenderId: "290138844370",
    appId: "1:290138844370:web:19a4c9b36fc8297668d10b"
};

// AppId Original
export const appId = 'app-volei-34f53';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const playersRef = collection(db, 'artifacts', appId, 'public', 'data', 'players');
export const teamsRef = collection(db, 'artifacts', appId, 'public', 'data', 'teams');
export const matchHistoryRef = collection(db, 'artifacts', appId, 'public', 'data', 'matchHistory');
export const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');

export { signInAnonymously, onAuthStateChanged, doc, setDoc, collection, onSnapshot, deleteDoc, addDoc, updateDoc };