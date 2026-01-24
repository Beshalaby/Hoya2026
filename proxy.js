import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// MobileNet/Coco-SSD needs 'Access-Control-Allow-Origin' to read pixels from video
const app = express();
const PORT = 3001;

// Enable CORS for all routes
app.use(cors());

// Proxy endpoint for HLS streams and segments
app.get('/proxy', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).send('Missing "url" query parameter');
    }

    try {
        const decodedUrl = decodeURIComponent(url);

        // Check if M3U8 manifest (needs rewriting)
        const isManifest = decodedUrl.includes('.m3u8') || decodedUrl.includes('.m3u');

        // Fetch the target resource
        const response = await axios({
            method: 'get',
            url: decodedUrl,
            responseType: isManifest ? 'text' : 'stream', // Text for manifest, stream for segments
            validateStatus: () => true
        });

        // Forward headers
        if (response.headers['content-type']) {
            res.set('Content-Type', response.headers['content-type']);
        }

        // Explicitly set Access-Control-Allow-Origin
        res.set('Access-Control-Allow-Origin', '*');

        if (isManifest) {
            // Rewrite relative paths to absolute
            const baseUrl = decodedUrl.substring(0, decodedUrl.lastIndexOf('/') + 1);
            let manifest = response.data;

            if (typeof manifest === 'string') {
                // Split lines and rewrite non-comment, non-absolute lines
                const lines = manifest.split('\n');
                const rewritten = lines.map(line => {
                    const l = line.trim();
                    if (!l) return line;
                    if (l.startsWith('#')) return line; // Comment/Tag
                    if (l.startsWith('http')) return line; // Already absolute

                    // It's a relative path -> make absolute
                    return baseUrl + l;
                }).join('\n');

                res.send(rewritten);
            } else {
                // Fallback if axios returned object? Should be string for 'text'
                res.send(manifest);
            }
        } else {
            // Pipe binary data (segments, images usually)
            response.data.pipe(res);
        }

    } catch (error) {
        console.error(`Proxy Error for ${url}:`, error.message);
        res.status(500).send('Proxy Error');
    }
});

app.listen(PORT, () => {
    console.log(`📡 CORS Proxy running on http://localhost:${PORT}`);
    console.log(`   Usage: http://localhost:${PORT}/proxy?url=TARGET_URL`);
});
