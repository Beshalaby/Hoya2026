import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                dashboard: resolve(__dirname, 'dashboard.html'),
                login: resolve(__dirname, 'login.html'),
                settings: resolve(__dirname, 'settings.html'),
                analytics: resolve(__dirname, 'analytics.html'),
            },
        },
    },
    server: {
        host: true,
        allowedHosts: ['.ngrok-free.app', '.ngrok.io', '.loca.lt', 'localhost']
    }
})
