// ============================================
// SENTINEL COMMAND CENTER v2.0
// 100% Cloud - Supabase Realtime WebSockets
// No server needed - Pure static deployment
// ============================================

const SUPABASE_URL = 'https://udqxvsgdgxgtnhxxxcgv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkcXh2c2dkZ3hndG5oeHh4Y2d2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODcwNTM0NCwiZXhwIjoyMDg0MjgxMzQ0fQ.mUKPJvTeG2MU4Fxfddcbcx2Q7H8EDuXcDtWAbHGvT48';
const SENTINEL_HEALTH = 'https://p01--sentinel-advance--blnvcmgxk6zh.code.run';

// Initialize Supabase client
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentTab = 'open';
let selectedAsset = 'ORO';
let priceHistoryData = [];
let previousBalance = null;
let allTrades = [];

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    setInterval(updateClock, 1000);

    setupTabs();
    setupChartFilters();

    // Initial data load
    loadAllData();

    // Subscribe to real-time changes
    subscribeRealtime();

    // Periodic health check (every 60s, Sentinel health doesn't support realtime)
    fetchSentinelHealth();
    setInterval(fetchSentinelHealth, 60000);
});

// --- CLOCK ---
function updateClock() {
    const now = new Date();
    const time = now.toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour12: false });
    document.getElementById('headerTime').textContent = time;
}

// --- TABS ---
function setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentTab = tab.dataset.tab;
            renderTrades(allTrades);
        });
    });
}

// --- CHART FILTERS ---
function setupChartFilters() {
    document.querySelectorAll('.chart-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedAsset = btn.dataset.asset;
            renderChart(priceHistoryData);
        });
    });
}

// =======================================================
//  SUPABASE REALTIME SUBSCRIPTIONS - Live WebSocket feeds
// =======================================================
function subscribeRealtime() {
    console.log('🔌 Subscribing to Supabase Realtime...');

    // Portfolio changes - instant balance updates
    sb.channel('portfolio-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ghost_portfolio' }, (payload) => {
            console.log('⚡ Portfolio update:', payload.new);
            if (payload.new) updatePortfolio(payload.new);
            setStatusDot('dbStatus', true);
            stampUpdate();
        })
        .subscribe((status) => {
            console.log('Portfolio channel:', status);
            setStatusDot('dbStatus', status === 'SUBSCRIBED');
        });

    // Trade changes - new trades, closed trades
    sb.channel('trades-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ghost_trades' }, async (payload) => {
            console.log('⚡ Trade update:', payload.eventType, payload.new?.asset);
            await loadTrades(); // Reload full trade list
            stampUpdate();
            flashHeader();
        })
        .subscribe();

    // Price changes - market data feeds
    sb.channel('prices-live')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ghost_prices' }, async (payload) => {
            console.log('⚡ Price update:', payload.new?.symbol, payload.new?.price);
            await loadPrices();
            stampUpdate();
        })
        .subscribe();

    // AI Reflection updates
    sb.channel('reflections-live')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ghost_reflections' }, async (payload) => {
            console.log('⚡ New AI Reflection!');
            await loadReflections();
            stampUpdate();
            flashHeader();
        })
        .subscribe();
}

// --- VISUAL FEEDBACK ---
function flashHeader() {
    const header = document.querySelector('.header');
    header.classList.add('flash-alert');
    setTimeout(() => header.classList.remove('flash-alert'), 1500);
}

function stampUpdate() {
    const now = new Date();
    document.getElementById('lastUpdate').textContent = now.toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour12: false });
    const dot = document.querySelector('.status-dot');
    dot.className = 'status-dot connected';
}

function setStatusDot(id, online) {
    const el = document.getElementById(id);
    if (online) {
        el.textContent = '● CONNECTED';
        el.className = 'status-value';
    } else {
        el.textContent = '● OFFLINE';
        el.className = 'status-value offline';
    }
}

// =======================================================
//  DATA LOADING - Initial fetch + refresh helpers
// =======================================================
async function loadAllData() {
    console.log('📥 Loading initial data from Supabase...');
    await Promise.all([
        loadPortfolio(),
        loadTrades(),
        loadPrices(),
        loadReflections()
    ]);
    stampUpdate();
    console.log('✅ Initial data loaded');
}

async function loadPortfolio() {
    try {
        const { data, error } = await sb.from('ghost_portfolio').select('*').order('id', { ascending: false }).limit(1);
        if (error) throw error;
        if (data && data.length > 0) updatePortfolio(data[0]);
        setStatusDot('dbStatus', true);
    } catch (e) {
        console.warn('Portfolio load error:', e.message);
        setStatusDot('dbStatus', false);
    }
}

async function loadTrades() {
    try {
        const { data, error } = await sb.from('ghost_trades')
            .select('id,asset,direction,entry_price,exit_price,pnl,status,size,opened_at,closed_at')
            .order('opened_at', { ascending: false })
            .limit(50);
        if (error) throw error;
        allTrades = data || [];
        renderTrades(allTrades);
    } catch (e) {
        console.warn('Trades load error:', e.message);
    }
}

async function loadPrices() {
    try {
        // Latest prices (1 per symbol)
        const { data: latest, error: e1 } = await sb.from('ghost_prices')
            .select('symbol,price,trend,momentum,volatility,recorded_at')
            .order('recorded_at', { ascending: false })
            .limit(10);
        if (e1) throw e1;

        if (latest && latest.length > 0) {
            const seen = {};
            const unique = latest.filter(p => { if (seen[p.symbol]) return false; seen[p.symbol] = true; return true; });
            updateMarket(unique);
        }

        // History for chart 
        const { data: history, error: e2 } = await sb.from('ghost_prices')
            .select('symbol,price,recorded_at')
            .order('recorded_at', { ascending: false })
            .limit(200);
        if (e2) throw e2;

        priceHistoryData = history || [];
        renderChart(priceHistoryData);
        setStatusDot('tdStatus', true);
    } catch (e) {
        console.warn('Prices load error:', e.message);
        setStatusDot('tdStatus', false);
    }
}

async function loadReflections() {
    try {
        const { data, error } = await sb.from('ghost_reflections')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5);
        if (error) throw error;
        renderReflections(data);
        setStatusDot('aiStatus', true);
    } catch (e) {
        console.warn('Reflections load error:', e.message);
    }
}

// --- SENTINEL HEALTH CHECK ---
async function fetchSentinelHealth() {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(SENTINEL_HEALTH, { signal: controller.signal });
        clearTimeout(timeout);
        const data = await res.json();

        document.getElementById('version').textContent = 'v' + (data.version || '7.2');
        document.getElementById('cycleCount').textContent = data.cycle || '-';

        const upSec = data.uptime || 0;
        document.getElementById('uptime').textContent = `${Math.floor(upSec / 3600)}h ${Math.floor((upSec % 3600) / 60)}m`;

        setStatusDot('nfStatus', true);
        document.getElementById('nfStatus').textContent = '● ONLINE';
        setStatusDot('tgStatus', true);
        document.getElementById('tgStatus').textContent = '● ACTIVE';
        setStatusDot('aiStatus', true);
        document.getElementById('aiStatus').textContent = '● READY';
    } catch (e) {
        // CORS may block — infer from Supabase freshness
        document.getElementById('version').textContent = 'v7.2';
        document.getElementById('nfStatus').textContent = '● CORS BLOCKED';
    }
}

// =======================================================
//  UI RENDERERS
// =======================================================
function updatePortfolio(p) {
    if (!p) return;
    const balance = parseFloat(p.balance) || 10000;
    const startBalance = parseFloat(p.start_balance) || 10000;
    const pnl = balance - startBalance;
    const wins = parseInt(p.wins) || 0;
    const losses = parseInt(p.losses) || 0;
    const totalTrades = parseInt(p.total_trades) || 0;
    const winRate = (wins + losses) > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '0.0';

    const balanceEl = document.getElementById('balance');
    if (previousBalance !== null && balance !== previousBalance) {
        balanceEl.classList.remove('flash-up', 'flash-down');
        void balanceEl.offsetWidth;
        balanceEl.classList.add(balance > previousBalance ? 'flash-up' : 'flash-down');
    }
    previousBalance = balance;
    balanceEl.textContent = `$${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const pnlEl = document.getElementById('pnl');
    pnlEl.textContent = `P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`;
    pnlEl.className = `metric-sub ${pnl >= 0 ? 'positive' : 'negative'}`;

    document.getElementById('winRate').textContent = `${winRate}%`;
    document.getElementById('winLoss').textContent = `${wins}W / ${losses}L`;
    document.getElementById('totalTrades').textContent = totalTrades;
}

function updateMarket(prices) {
    const grid = document.getElementById('marketGrid');
    if (!prices || prices.length === 0) {
        grid.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">Waiting for market data...</div>';
        return;
    }
    const icons = { 'ORO': '🪙', 'BITCOIN': '₿', 'ETHEREUM': 'Ξ' };
    grid.innerHTML = prices.map(p => {
        const trend = p.trend || 'LATERAL';
        const isBull = trend.includes('ALCISTA');
        const isBear = trend.includes('BAJISTA');
        const trendClass = isBull ? 'bullish' : isBear ? 'bearish' : 'lateral';
        const momValue = parseFloat(p.momentum) || 0;
        const momColor = momValue >= 0 ? 'var(--green)' : 'var(--red)';
        return `
            <div class="market-item">
                <div class="market-name"><span class="asset-icon">${icons[p.symbol] || '📊'}</span>${p.symbol}</div>
                <div class="market-trend ${trendClass}">${trend}</div>
                <div class="market-price">$${parseFloat(p.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div class="market-momentum" style="color:${momColor}">${momValue >= 0 ? '+' : ''}${p.momentum}%</div>
                <div class="market-volatility">σ ${p.volatility}%</div>
            </div>
        `;
    }).join('');
}

function renderTrades(trades) {
    const list = document.getElementById('tradesList');
    if (!trades || trades.length === 0) {
        list.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-muted)">No trades yet</div>';
        return;
    }
    const filtered = currentTab === 'open'
        ? trades.filter(t => t.status === 'OPEN')
        : trades.filter(t => t.status === 'CLOSED');

    const openCount = trades.filter(t => t.status === 'OPEN').length;
    document.getElementById('tradesBadge').textContent = openCount;
    document.getElementById('openPositions').textContent = `${openCount} open`;

    if (filtered.length === 0) {
        list.innerHTML = `<div style="padding:30px;text-align:center;color:var(--text-muted)">${currentTab === 'open' ? 'No open positions' : 'No trade history yet'}</div>`;
        return;
    }
    list.innerHTML = filtered.map(t => {
        const pnl = parseFloat(t.pnl) || 0;
        const pnlClass = t.status === 'OPEN' ? 'pending' : (pnl >= 0 ? 'positive' : 'negative');
        const pnlText = t.status === 'OPEN' ? 'ACTIVE' : `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`;
        const dirClass = t.direction === 'LONG' ? 'long' : 'short';
        return `
            <div class="trade-item">
                <span class="trade-direction ${dirClass}">${t.direction}</span>
                <span class="trade-asset">${t.asset}</span>
                <span class="trade-price">$${parseFloat(t.entry_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                <span class="trade-pnl ${pnlClass}">${pnlText}</span>
            </div>
        `;
    }).join('');
}

function renderChart(data) {
    const canvas = document.getElementById('priceChart');
    const ctx = canvas.getContext('2d');
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    const assetData = data.filter(d => d.symbol === selectedAsset).reverse().slice(-60);
    if (assetData.length < 2) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#64748b';
        ctx.font = '14px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Collecting price data...', canvas.width / 2, canvas.height / 2);
        return;
    }

    const prices = assetData.map(d => parseFloat(d.price));
    const minPrice = Math.min(...prices) * 0.9999;
    const maxPrice = Math.max(...prices) * 1.0001;
    const range = maxPrice - minPrice || 1;
    const pad = { top: 30, right: 70, bottom: 30, left: 20 };
    const cW = canvas.width - pad.left - pad.right;
    const cH = canvas.height - pad.top - pad.bottom;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Grid lines
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + (cH / 4) * i;
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(canvas.width - pad.right, y); ctx.stroke();
        ctx.fillStyle = '#64748b';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText((maxPrice - (range / 4) * i).toFixed(2), canvas.width - pad.right + 8, y + 4);
    }

    const lastPrice = prices[prices.length - 1];
    const firstPrice = prices[0];
    const isUp = lastPrice >= firstPrice;
    const lineColor = isUp ? '#10b981' : '#ef4444';

    // Gradient fill
    const grad = ctx.createLinearGradient(0, pad.top, 0, canvas.height - pad.bottom);
    grad.addColorStop(0, isUp ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)');
    grad.addColorStop(1, isUp ? 'rgba(16,185,129,0)' : 'rgba(239,68,68,0)');

    ctx.beginPath();
    prices.forEach((price, i) => {
        const x = pad.left + (i / (prices.length - 1)) * cW;
        const y = pad.top + ((maxPrice - price) / range) * cH;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(pad.left + cW, pad.top + cH);
    ctx.lineTo(pad.left, pad.top + cH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Price line
    ctx.beginPath();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.shadowColor = isUp ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)';
    ctx.shadowBlur = 8;
    prices.forEach((price, i) => {
        const x = pad.left + (i / (prices.length - 1)) * cW;
        const y = pad.top + ((maxPrice - price) / range) * cH;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Current price dot
    const lx = pad.left + cW;
    const ly = pad.top + ((maxPrice - lastPrice) / range) * cH;
    ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI * 2); ctx.fillStyle = lineColor; ctx.fill();
    ctx.beginPath(); ctx.arc(lx, ly, 8, 0, Math.PI * 2);
    ctx.strokeStyle = isUp ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'; ctx.lineWidth = 2; ctx.stroke();

    // Labels
    ctx.fillStyle = '#f1f5f9'; ctx.font = 'bold 12px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText(`$${lastPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, lx - 30, ly - 15);

    const assetNames = { 'ORO': '🪙 GOLD', 'BITCOIN': '₿ BTC', 'ETHEREUM': 'Ξ ETH' };
    ctx.fillStyle = '#00e5ff'; ctx.font = 'bold 11px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
    ctx.fillText(assetNames[selectedAsset] || selectedAsset, pad.left + 4, pad.top - 10);

    const changePct = ((lastPrice - firstPrice) / firstPrice * 100).toFixed(2);
    ctx.fillStyle = isUp ? '#10b981' : '#ef4444'; ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(`${isUp ? '+' : ''}${changePct}%`, pad.left + 100, pad.top - 10);
}

function renderReflections(reflections) {
    const container = document.getElementById('aiContent');
    if (!reflections || reflections.length === 0) return;

    container.innerHTML = reflections.map(r => `
        <div class="ai-reflection-card">
            <div class="ai-date">${new Date(r.created_at).toLocaleString('es-VE', { timeZone: 'America/Caracas' })}</div>
            <div class="ai-analysis">${escapeHtml(r.analysis || 'Processing...')}</div>
            ${r.recommendation ? `<div class="ai-recommendation">💡 ${escapeHtml(r.recommendation)}</div>` : ''}
        </div>
    `).join('');
}

// --- UTILS ---
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.addEventListener('resize', () => {
    if (priceHistoryData.length > 0) renderChart(priceHistoryData);
});
