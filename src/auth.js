/**
 * Auth Page JavaScript
 * Handles login and registration forms
 */
import { authService } from './services/AuthService.js';
import './style.css';

class AuthPage {
    constructor() {
        // Redirect if already logged in
        if (authService.redirectIfLoggedIn('/dashboard.html')) {
            return;
        }

        this.loginForm = document.getElementById('loginForm');
        this.registerForm = document.getElementById('registerForm');
        this.loginFormEl = document.getElementById('loginFormEl');
        this.registerFormEl = document.getElementById('registerFormEl');
        this.loginError = document.getElementById('loginError');
        this.registerError = document.getElementById('registerError');

        this.init();
    }

    init() {
        // Toggle between login and register
        document.getElementById('showRegister')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showForm('register');
        });

        document.getElementById('showLogin')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showForm('login');
        });

        // Login form submit
        this.loginFormEl?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleLogin();
        });

        // Register form submit
        this.registerFormEl?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleRegister();
        });

        console.log('🔐 Auth page initialized');
    }

    showForm(form) {
        if (form === 'register') {
            this.loginForm?.classList.add('auth-form--hidden');
            this.registerForm?.classList.remove('auth-form--hidden');
        } else {
            this.registerForm?.classList.add('auth-form--hidden');
            this.loginForm?.classList.remove('auth-form--hidden');
        }
        this.clearErrors();
    }

    clearErrors() {
        if (this.loginError) this.loginError.textContent = '';
        if (this.registerError) this.registerError.textContent = '';
    }

    showError(element, message) {
        if (element) {
            element.textContent = message;
            element.classList.add('form-error--visible');
        }
    }

    setLoading(buttonId, loading) {
        const btn = document.getElementById(buttonId);
        if (btn) {
            btn.disabled = loading;
            btn.textContent = loading ? 'Please wait...' : (buttonId === 'loginBtn' ? 'Sign In' : 'Create Account');
        }
    }

    async handleLogin() {
        this.clearErrors();
        this.setLoading('loginBtn', true);

        const email = document.getElementById('loginEmail')?.value;
        const password = document.getElementById('loginPassword')?.value;

        if (!email || !password) {
            this.showError(this.loginError, 'Please fill in all fields');
            this.setLoading('loginBtn', false);
            return;
        }

        try {
            await authService.login(email, password);
            window.location.href = '/dashboard.html';
        } catch (error) {
            this.showError(this.loginError, error.message);
            this.setLoading('loginBtn', false);
        }
    }

    async handleRegister() {
        this.clearErrors();
        this.setLoading('registerBtn', true);

        const name = document.getElementById('registerName')?.value;
        const email = document.getElementById('registerEmail')?.value;
        const password = document.getElementById('registerPassword')?.value;

        if (!email || !password) {
            this.showError(this.registerError, 'Please fill in all required fields');
            this.setLoading('registerBtn', false);
            return;
        }

        try {
            await authService.register(email, password, name);
            window.location.href = '/dashboard.html';
        } catch (error) {
            this.showError(this.registerError, error.message);
            this.setLoading('registerBtn', false);
        }
    }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new AuthPage());
} else {
    new AuthPage();
}

export default AuthPage;
