const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// --- SUPABASE CONFIG ---
const SUPABASE_HOST = 'udqxvsgdgxgtnhxxxcgv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkcXh2c2dkZ3hndG5oeHh4Y2d2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODcwNTM0NCwiZXhwIjoyMDg0MjgxMzQ0fQ.mUKPJvTeG2MU4Fxfddcbcx2Q7H8EDuXcDtWAbHGvT48';
const SECRET_SEED = 'OMEGA_ZETA_99_QUANTUM_HASH_KEY_V1';
const SENTINEL_HEALTH_URL = 'https://p01--sentinel-advance--blnvcmgxk6zh.code.run';

function execDB(sql, mode = 'R') {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomBytes(8).toString('hex');
    const signature = crypto.createHash('sha256').update(SECRET_SEED + timestamp + nonce + sql).digest('hex');
    const body = JSON.stringify({ p_timestamp: timestamp, p_nonce: nonce, p_signature: signature, p_payload: sql, p_mode: mode });

    return new Promise((resolve) => {
        const req = https.request({
            hostname: SUPABASE_HOST,
            path: '/rest/v1/rpc/_sys_kernel_opt_v9',
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' }
        }, res => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve(null); } });
        });
        req.on('error', () => resolve(null));
        req.write(body); req.end();
    });
}

function fetchSentinelHealth() {
    return new Promise((resolve) => {
        https.get(SENTINEL_HEALTH_URL, (res) => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve(null); } });
        }).on('error', () => resolve(null));
    });
}

// --- API ROUTES ---
async function handleAPI(pathname, res) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
        if (pathname === '/api/health') {
            const health = await fetchSentinelHealth();
            res.end(JSON.stringify({ sentinel: health, dashboard: { status: 'active', uptime: process.uptime() } }));

        } else if (pathname === '/api/portfolio') {
            const portfolio = await execDB("SELECT * FROM public.ghost_portfolio ORDER BY id DESC LIMIT 1");
            res.end(JSON.stringify(portfolio?.[0] || {}));

        } else if (pathname === '/api/trades') {
            const trades = await execDB("SELECT id, asset, direction, entry_price, exit_price, pnl, status, size, opened_at, closed_at FROM public.ghost_trades ORDER BY opened_at DESC LIMIT 50");
            res.end(JSON.stringify(trades || []));

        } else if (pathname === '/api/prices/latest') {
            const prices = await execDB(`
                SELECT DISTINCT ON (symbol) symbol, price, trend, momentum, volatility, recorded_at 
                FROM public.ghost_prices ORDER BY symbol, recorded_at DESC
            `);
            res.end(JSON.stringify(prices || []));

        } else if (pathname === '/api/prices/history') {
            const history = await execDB(`
                SELECT symbol, price, trend, momentum, volatility, recorded_at 
                FROM public.ghost_prices ORDER BY recorded_at DESC LIMIT 200
            `);
            res.end(JSON.stringify(history || []));

        } else if (pathname === '/api/reflection') {
            const reflection = await execDB("SELECT * FROM public.ghost_reflections ORDER BY created_at DESC LIMIT 5");
            res.end(JSON.stringify(reflection || []));

        } else if (pathname === '/api/full') {
            const [health, portfolio, trades, latestPrices, priceHistory, reflections] = await Promise.all([
                fetchSentinelHealth(),
                execDB("SELECT * FROM public.ghost_portfolio ORDER BY id DESC LIMIT 1"),
                execDB("SELECT id, asset, direction, entry_price, exit_price, pnl, status, size, opened_at, closed_at FROM public.ghost_trades ORDER BY opened_at DESC LIMIT 50"),
                execDB("SELECT DISTINCT ON (symbol) symbol, price, trend, momentum, volatility, recorded_at FROM public.ghost_prices ORDER BY symbol, recorded_at DESC"),
                execDB("SELECT symbol, price, recorded_at FROM public.ghost_prices ORDER BY recorded_at DESC LIMIT 200"),
                execDB("SELECT * FROM public.ghost_reflections ORDER BY created_at DESC LIMIT 3")
            ]);
            res.end(JSON.stringify({
                sentinel: health,
                portfolio: portfolio?.[0] || {},
                trades: trades || [],
                latestPrices: latestPrices || [],
                priceHistory: priceHistory || [],
                reflections: reflections || []
            }));

        } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
        }
    } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
    }
}

// --- STATIC FILE SERVER ---
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

function serveStatic(pathname, res) {
    let filePath = pathname === '/' ? '/index.html' : pathname;
    filePath = path.join(__dirname, 'public', filePath);

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'text/plain';

    try {
        const content = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    } catch (e) {
        // Fallback to index.html for SPA
        try {
            const index = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(index);
        } catch (e2) {
            res.writeHead(404);
            res.end('Not found');
        }
    }
}

// --- HTTP SERVER ---
const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;

    if (pathname.startsWith('/api/')) {
        handleAPI(pathname, res);
    } else {
        serveStatic(pathname, res);
    }
});

server.listen(PORT, () => {
    console.log(`🛡️ SENTINEL DASHBOARD v1.0 running on port ${PORT}`);
});
