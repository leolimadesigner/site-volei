import { 
    auth, db, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    sendPasswordResetEmail, 
    signOut, 
    onAuthStateChanged,
    doc,
    setDoc
} from './firebase.js';
import { state } from './state.js';

/**
 * Realiza o login do utilizador.
 */
export const loginUser = async (email, password) => {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return { success: true, user: userCredential.user };
    } catch (error) {
        console.error("Erro na autenticação:", error.code);
        let message = "Erro ao entrar.";
        
        if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
            message = "E-mail ou senha incorretos.";
        } else if (error.code === 'auth/invalid-email') {
            message = "Formato de e-mail inválido.";
        }
        
        return { success: false, message };
    }
};

/**
 * Cadastra um novo utilizador no Firebase Auth e cria o seu perfil na Firestore.
 */
export const registerUser = async (email, password, name) => {
    try {
        // 1. Cria a conta no Firebase Authentication
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 2. Salva o perfil público do utilizador na coleção global 'users'
        await setDoc(doc(db, 'users', user.uid), {
            name: name,
            email: email,
            createdAt: Date.now()
        });

        return { success: true, user: user };
    } catch (error) {
        console.error("Erro no cadastro:", error.code);
        let message = "Erro ao criar conta.";
        
        if (error.code === 'auth/email-already-in-use') {
            message = "Este e-mail já está em uso.";
        } else if (error.code === 'auth/weak-password') {
            message = "A senha deve ter pelo menos 6 caracteres.";
        } else if (error.code === 'auth/invalid-email') {
            message = "Formato de e-mail inválido.";
        }
        
        return { success: false, message };
    }
};

/**
 * Envia um e-mail de recuperação de senha.
 */
export const resetPassword = async (email) => {
    try {
        await sendPasswordResetEmail(auth, email);
        return { success: true };
    } catch (error) {
        console.error("Erro ao recuperar senha:", error.code);
        let message = "Erro ao enviar e-mail de recuperação.";
        if (error.code === 'auth/user-not-found') {
            message = "E-mail não encontrado no sistema.";
        } else if (error.code === 'auth/invalid-email') {
            message = "Formato de e-mail inválido.";
        }
        return { success: false, message };
    }
};

/**
 * Encerra a sessão do utilizador.
 */
export const logoutUser = async () => {
    try {
        await signOut(auth);
        return { success: true };
    } catch (error) {
        return { success: false, message: "Erro ao sair." };
    }
};

/**
 * Observador de estado de autenticação principal.
 */
export const initAuthObserver = (callback) => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            state.isAuthenticated = true;
            state.user = user;
        } else {
            state.isAuthenticated = false;
            state.user = null;
            // Limpa o contexto do grupo ao sair
            state.currentGroupId = null;
            state.currentUserRole = null;
        }
        
        if (callback) callback(state.isAuthenticated, user);
    });
};