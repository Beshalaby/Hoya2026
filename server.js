import express from 'express';
import cors from 'cors';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS
app.use(cors());

// Proxy endpoint for HLS streams
app.get('/proxy', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('Missing "url"');

    try {
        const decodedUrl = decodeURIComponent(url);
        const isManifest = decodedUrl.includes('.m3u8') || decodedUrl.includes('.m3u');

        const response = await axios({
            method: 'get',
            url: decodedUrl,
            responseType: isManifest ? 'text' : 'stream',
            validateStatus: () => true
        });

        if (response.headers['content-type']) {
            res.set('Content-Type', response.headers['content-type']);
        }
        res.set('Access-Control-Allow-Origin', '*');

        if (isManifest) {
            const baseUrl = decodedUrl.substring(0, decodedUrl.lastIndexOf('/') + 1);
            let manifest = response.data;
            if (typeof manifest === 'string') {
                const lines = manifest.split('\n');
                const rewritten = lines.map(line => {
                    const l = line.trim();
                    if (!l || l.startsWith('#') || l.startsWith('http')) return line;
                    return baseUrl + l;
                }).join('\n');
                res.send(rewritten);
            } else {
                res.send(manifest);
            }
        } else {
            response.data.pipe(res);
        }
    } catch (error) {
        console.error(`Proxy Error:`, error.message);
        res.status(500).send('Proxy Error');
    }
});

// Serve static files from Vite build
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// Handle SPAs / Multi-page entry points
app.get('*', (req, res, next) => {
    // If it's not a file (verified by static already) and not the proxy
    if (!req.path.startsWith('/proxy')) {
        res.sendFile(path.join(distPath, 'index.html'));
    } else {
        next();
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Unified Server running on port ${PORT}`);
    console.log(`📡 Serving static files from: ${distPath}`);
});
