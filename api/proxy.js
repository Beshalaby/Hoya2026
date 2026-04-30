import axios from 'axios';

function isManifestUrl(url) {
    return /\.m3u8?($|\?)/i.test(url);
}

function rewriteManifest(manifestText, targetUrl) {
    const parsed = new URL(targetUrl);
    const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

    return manifestText
        .split('\n')
        .map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return line;
            if (trimmed.startsWith('#')) return line;
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return line;

            if (trimmed.startsWith('/')) {
                return `${parsed.origin}${trimmed}`;
            }

            return `${baseUrl}${trimmed}`;
        })
        .join('\n');
}

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(204).end();
    }

    const rawUrl = req.query?.url;
    if (!rawUrl || Array.isArray(rawUrl)) {
        return res.status(400).send('Missing "url"');
    }

    let targetUrl = rawUrl;
    try {
        targetUrl = decodeURIComponent(rawUrl);
    } catch {
        // If URL is already decoded, keep the original value.
    }

    try {
        const parsed = new URL(targetUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return res.status(400).send('Invalid URL protocol');
        }
    } catch {
        return res.status(400).send('Invalid URL');
    }

    const isManifest = isManifestUrl(targetUrl);

    try {
        const upstream = await axios({
            method: 'get',
            url: targetUrl,
            responseType: isManifest ? 'text' : 'stream',
            validateStatus: () => true
        });

        if (upstream.headers['content-type']) {
            res.setHeader('Content-Type', upstream.headers['content-type']);
        }
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(upstream.status);

        if (isManifest && typeof upstream.data === 'string') {
            return res.send(rewriteManifest(upstream.data, targetUrl));
        }

        if (isManifest) {
            return res.send(upstream.data);
        }

        upstream.data.on('error', (streamError) => {
            if (!res.headersSent) {
                res.status(500).send('Proxy stream error');
                return;
            }
            res.destroy(streamError);
        });

        upstream.data.pipe(res);
    } catch (error) {
        console.error('Vercel proxy error:', error.message);
        return res.status(500).send('Proxy Error');
    }
}
