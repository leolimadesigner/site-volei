import { auth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from './firebase.js';
import { state } from './state.js';

/**
 * Realiza o login real no Firebase.
 * Substitui a verificação manual de "admin/12345".
 */
export const loginAdmin = async (email, password) => {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        // O Firebase gerencia o estado da sessão automaticamente
        return { success: true, user: userCredential.user };
    } catch (error) {
        console.error("Erro na autenticação:", error.code);
        let message = "Erro ao entrar.";
        
        if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
            message = "E-mail ou senha incorretos.";
        } else if (error.code === 'auth/invalid-email') {
            message = "Formato de e-mail inválido.";
        }
        
        return { success: false, message };
    }
};

/**
 * Encerra a sessão do usuário.
 */
export const logoutAdmin = async () => {
    try {
        await signOut(auth);
        return { success: true };
    } catch (error) {
        return { success: false, message: "Erro ao sair." };
    }
};

/**
 * Observador de estado de autenticação.
 */
export const initAuthObserver = (callback) => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // Como só você tem conta de e-mail registrada no painel no momento,
            // qualquer login bem-sucedido concede acesso de Admin.
            state.isAuthenticated = true;
            state.user = user;
        } else {
            state.isAuthenticated = false;
            state.user = null;
        }
        
        if (callback) callback(state.isAuthenticated);
    });
};