import { defineConfig } from 'vite'

export default defineConfig({
    server: {
        host: true,
        allowedHosts: ['.ngrok-free.app', '.ngrok.io', '.loca.lt', 'localhost']
    }
})
