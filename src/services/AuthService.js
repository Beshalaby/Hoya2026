/**
 * AuthService - Local authentication with hashed passwords
 * Uses Web Crypto API for secure password hashing
 * Stores users and sessions in localStorage
 * 
 * NOTE: This is NOT production-secure (client-side only).
 * For production, use a proper backend auth system.
 */

class AuthService {
    constructor() {
        this.USERS_KEY = 'trafiq_users';
        this.SESSION_KEY = 'trafiq_session';
        this.SESSION_EXPIRY_HOURS = 24;
    }

    /**
     * Hash password using SHA-256
     */
    async hashPassword(password, salt = null) {
        // Generate or use existing salt
        if (!salt) {
            const saltArray = new Uint8Array(16);
            crypto.getRandomValues(saltArray);
            salt = Array.from(saltArray).map(b => b.toString(16).padStart(2, '0')).join('');
        }

        // Combine password and salt
        const combined = password + salt;
        const encoder = new TextEncoder();
        const data = encoder.encode(combined);

        // Hash with SHA-256
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        return { hash, salt };
    }

    /**
     * Get all users from localStorage
     */
    getUsers() {
        try {
            return JSON.parse(localStorage.getItem(this.USERS_KEY) || '{}');
        } catch {
            return {};
        }
    }

    /**
     * Save users to localStorage
     */
    saveUsers(users) {
        localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
    }

    /**
     * Register a new user
     */
    async register(email, password, name = '') {
        email = email.toLowerCase().trim();

        // Validate email format
        if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            throw new Error('Invalid email format');
        }

        // Validate name (prevent XSS)
        if (name && /[<>&"']/.test(name)) {
            throw new Error('Name contains invalid characters');
        }

        // Validate password strength
        if (password.length < 6) {
            throw new Error('Password must be at least 6 characters');
        }

        const users = this.getUsers();

        // Check if user already exists
        if (users[email]) {
            throw new Error('An account with this email already exists');
        }

        // Hash the password
        const { hash, salt } = await this.hashPassword(password);

        // Create user
        const user = {
            email,
            name: name || email.split('@')[0],
            passwordHash: hash,
            salt,
            createdAt: new Date().toISOString(),
            settings: {}
        };

        users[email] = user;
        this.saveUsers(users);

        // Auto-login after registration
        await this.createSession(user);

        console.log(`✅ User registered: ${email}`);
        return this.getPublicUser(user);
    }

    /**
     * Login user
     */
    async login(email, password) {
        email = email.toLowerCase().trim();
        const users = this.getUsers();
        const user = users[email];

        if (!user) {
            throw new Error('No account found with this email');
        }

        // Verify password
        const { hash } = await this.hashPassword(password, user.salt);
        if (hash !== user.passwordHash) {
            throw new Error('Incorrect password');
        }

        // Create session
        await this.createSession(user);

        console.log(`✅ User logged in: ${email}`);
        return this.getPublicUser(user);
    }

    /**
     * Create a session for the user
     */
    async createSession(user) {
        // Generate session token
        const tokenArray = new Uint8Array(32);
        crypto.getRandomValues(tokenArray);
        const token = Array.from(tokenArray).map(b => b.toString(16).padStart(2, '0')).join('');

        const session = {
            email: user.email,
            token,
            expiresAt: new Date(Date.now() + this.SESSION_EXPIRY_HOURS * 60 * 60 * 1000).toISOString()
        };

        localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
        return session;
    }

    /**
     * Get current session
     */
    getSession() {
        try {
            const session = JSON.parse(localStorage.getItem(this.SESSION_KEY));
            if (!session) return null;

            // Check if expired
            if (new Date(session.expiresAt) < new Date()) {
                this.logout();
                return null;
            }

            return session;
        } catch {
            return null;
        }
    }

    /**
     * Get current logged in user
     */
    getCurrentUser() {
        const session = this.getSession();
        if (!session) return null;

        const users = this.getUsers();
        const user = users[session.email];
        if (!user) {
            this.logout();
            return null;
        }

        return this.getPublicUser(user);
    }

    /**
     * Check if user is logged in
     */
    isLoggedIn() {
        return this.getCurrentUser() !== null;
    }

    /**
     * Logout user
     */
    logout() {
        localStorage.removeItem(this.SESSION_KEY);
        console.log('👋 User logged out');
    }

    /**
     * Update user profile
     */
    async updateProfile(updates) {
        const session = this.getSession();
        if (!session) throw new Error('Not logged in');

        const users = this.getUsers();
        const user = users[session.email];
        if (!user) throw new Error('User not found');

        // Update allowed fields
        if (updates.name) user.name = updates.name;
        if (updates.settings) user.settings = { ...user.settings, ...updates.settings };

        users[session.email] = user;
        this.saveUsers(users);

        return this.getPublicUser(user);
    }

    /**
     * Change password
     */
    async changePassword(currentPassword, newPassword) {
        const session = this.getSession();
        if (!session) throw new Error('Not logged in');

        const users = this.getUsers();
        const user = users[session.email];
        if (!user) throw new Error('User not found');

        // Verify current password
        const { hash: currentHash } = await this.hashPassword(currentPassword, user.salt);
        if (currentHash !== user.passwordHash) {
            throw new Error('Current password is incorrect');
        }

        // Validate new password
        if (newPassword.length < 6) {
            throw new Error('New password must be at least 6 characters');
        }

        // Hash new password
        const { hash, salt } = await this.hashPassword(newPassword);
        user.passwordHash = hash;
        user.salt = salt;

        users[session.email] = user;
        this.saveUsers(users);

        console.log('✅ Password changed');
        return true;
    }

    /**
     * Delete account
     */
    async deleteAccount(password) {
        const session = this.getSession();
        if (!session) throw new Error('Not logged in');

        const users = this.getUsers();
        const user = users[session.email];
        if (!user) throw new Error('User not found');

        // Verify password
        const { hash } = await this.hashPassword(password, user.salt);
        if (hash !== user.passwordHash) {
            throw new Error('Password is incorrect');
        }

        // Delete user
        delete users[session.email];
        this.saveUsers(users);
        this.logout();

        console.log('🗑️ Account deleted');
        return true;
    }

    /**
     * Get public user object (without sensitive data)
     */
    getPublicUser(user) {
        return {
            email: user.email,
            name: user.name,
            createdAt: user.createdAt,
            settings: user.settings || {}
        };
    }

    /**
     * Require authentication - redirect to login if not logged in
     */
    requireAuth(redirectTo = '/login.html') {
        if (!this.isLoggedIn()) {
            window.location.href = redirectTo;
            return false;
        }
        return true;
    }

    /**
     * Redirect if already logged in
     */
    redirectIfLoggedIn(redirectTo = '/dashboard.html') {
        if (this.isLoggedIn()) {
            window.location.href = redirectTo;
            return true;
        }
        return false;
    }
}

// Create singleton instance
export const authService = new AuthService();
export default AuthService;
