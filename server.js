import express from 'express';
import cors from 'cors';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());

// Proxy for HLS streams
app.get('/proxy', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('Missing "url"');

    try {
        const targetUrl = decodeURIComponent(url);
        const isManifest = targetUrl.includes('.m3u8') || targetUrl.includes('.m3u');

        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: isManifest ? 'text' : 'stream',
            validateStatus: () => true
        });

        if (response.headers['content-type']) {
            res.set('Content-Type', response.headers['content-type']);
        }
        res.set('Access-Control-Allow-Origin', '*');

        if (isManifest) {
            const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
            let manifest = response.data;

            if (typeof manifest === 'string') {
                const rewriteManifest = (text) => {
                    return text.split('\n').map(line => {
                        const l = line.trim();
                        if (!l || l.startsWith('#') || l.startsWith('http')) return line;
                        return baseUrl + l;
                    }).join('\n');
                };
                res.send(rewriteManifest(manifest));
            } else {
                res.send(manifest);
            }
        } else {
            response.data.pipe(res);
        }
    } catch (error) {
        console.error('Proxy error:', error.message);
        res.status(500).send('Proxy Error');
    }
});

const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// SPA Fallback
app.use((req, res, next) => {
    if (req.path.startsWith('/proxy')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
