// ============================================
// SENTINEL COMMAND CENTER - Frontend Logic
// ============================================

const API_BASE = '';  // Same origin
const REFRESH_INTERVAL = 30000; // 30 seconds
let currentTab = 'open';
let selectedAsset = 'ORO';
let priceHistoryData = [];
let previousBalance = null;

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    setInterval(updateClock, 1000);

    setupTabs();
    setupChartFilters();
    fetchFullData();
    setInterval(fetchFullData, REFRESH_INTERVAL);
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
            renderTrades(window._lastTrades || []);
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

// --- FETCH DATA ---
async function fetchFullData() {
    try {
        const response = await fetch(`${API_BASE}/api/full`);
        const data = await response.json();

        updateSentinelStatus(data.sentinel);
        updatePortfolio(data.portfolio);
        updateMarket(data.latestPrices);

        window._lastTrades = data.trades;
        renderTrades(data.trades);

        priceHistoryData = data.priceHistory || [];
        renderChart(priceHistoryData);

        renderReflections(data.reflections);

        updateStatusBar(data);
        document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour12: false });

        // Connection status
        const dot = document.querySelector('.status-dot');
        dot.className = 'status-dot connected';

    } catch (e) {
        console.error('Fetch error:', e);
        const dot = document.querySelector('.status-dot');
        dot.className = 'status-dot disconnected';
    }
}

// --- UPDATE SENTINEL STATUS ---
function updateSentinelStatus(sentinel) {
    if (!sentinel) return;

    document.getElementById('version').textContent = 'v' + (sentinel.version || '7.1');
    document.getElementById('cycleCount').textContent = sentinel.cycle || '-';

    const upSec = sentinel.uptime || 0;
    const hours = Math.floor(upSec / 3600);
    const mins = Math.floor((upSec % 3600) / 60);
    document.getElementById('uptime').textContent = `${hours}h ${mins}m`;
}

// --- UPDATE PORTFOLIO ---
function updatePortfolio(portfolio) {
    if (!portfolio) return;

    const balance = parseFloat(portfolio.balance) || 10000;
    const startBalance = parseFloat(portfolio.start_balance) || 10000;
    const pnl = balance - startBalance;
    const totalTrades = parseInt(portfolio.total_trades) || 0;
    const wins = parseInt(portfolio.wins) || 0;
    const losses = parseInt(portfolio.losses) || 0;
    const winRate = totalTrades > 0 ? ((wins / Math.max(wins + losses, 1)) * 100).toFixed(1) : '0.0';

    // Balance with flash animation
    const balanceEl = document.getElementById('balance');
    if (previousBalance !== null && balance !== previousBalance) {
        balanceEl.classList.remove('flash-up', 'flash-down');
        void balanceEl.offsetWidth; // Trigger reflow
        balanceEl.classList.add(balance > previousBalance ? 'flash-up' : 'flash-down');
    }
    previousBalance = balance;
    balanceEl.textContent = `$${balance.toFixed(2)}`;

    const pnlEl = document.getElementById('pnl');
    pnlEl.textContent = `P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`;
    pnlEl.className = `metric-sub ${pnl >= 0 ? 'positive' : 'negative'}`;

    document.getElementById('winRate').textContent = `${winRate}%`;
    document.getElementById('winLoss').textContent = `${wins}W / ${losses}L`;
    document.getElementById('totalTrades').textContent = totalTrades;
}

// --- UPDATE MARKET ---
function updateMarket(prices) {
    const grid = document.getElementById('marketGrid');
    if (!prices || prices.length === 0) {
        grid.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">Waiting for market data...</div>';
        return;
    }

    const icons = { 'ORO': '🪙', 'BITCOIN': '₿', 'ETHEREUM': 'Ξ' };

    grid.innerHTML = prices.map(p => {
        const isBull = p.trend && (p.trend.includes('ALCISTA'));
        const isBear = p.trend && (p.trend.includes('BAJISTA'));
        const trendClass = isBull ? 'bullish' : isBear ? 'bearish' : 'lateral';
        const trendLabel = p.trend || 'LATERAL';
        const momColor = parseFloat(p.momentum) >= 0 ? 'var(--green)' : 'var(--red)';

        return `
            <div class="market-item">
                <div class="market-name"><span class="asset-icon">${icons[p.symbol] || '📊'}</span>${p.symbol}</div>
                <div class="market-trend ${trendClass}">${trendLabel}</div>
                <div class="market-price">$${parseFloat(p.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div class="market-momentum" style="color:${momColor}">${parseFloat(p.momentum) >= 0 ? '+' : ''}${p.momentum}%</div>
                <div class="market-volatility">σ ${p.volatility}%</div>
            </div>
        `;
    }).join('');
}

// --- RENDER TRADES ---
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
        const time = new Date(t.opened_at).toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour12: false, hour: '2-digit', minute: '2-digit' });

        return `
            <div class="trade-item">
                <span class="trade-direction ${dirClass}">${t.direction}</span>
                <span class="trade-asset">${t.asset}</span>
                <span class="trade-price">$${parseFloat(t.entry_price).toLocaleString()}</span>
                <span class="trade-pnl ${pnlClass}">${pnlText}</span>
            </div>
        `;
    }).join('');
}

// --- RENDER CHART ---
function renderChart(data) {
    const canvas = document.getElementById('priceChart');
    const ctx = canvas.getContext('2d');

    // Set canvas size
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    // Filter for selected asset
    const assetData = data.filter(d => d.symbol === selectedAsset)
        .reverse()
        .slice(-60);

    if (assetData.length < 2) {
        ctx.fillStyle = '#64748b';
        ctx.font = '14px JetBrains Mono';
        ctx.textAlign = 'center';
        ctx.fillText('Collecting data...', canvas.width / 2, canvas.height / 2);
        return;
    }

    const prices = assetData.map(d => parseFloat(d.price));
    const minPrice = Math.min(...prices) * 0.9999;
    const maxPrice = Math.max(...prices) * 1.0001;
    const range = maxPrice - minPrice || 1;

    const padding = { top: 30, right: 60, bottom: 30, left: 20 };
    const chartW = canvas.width - padding.left - padding.right;
    const chartH = canvas.height - padding.top - padding.bottom;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Grid lines
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(canvas.width - padding.right, y);
        ctx.stroke();

        // Price labels
        const priceLabel = (maxPrice - (range / 4) * i).toFixed(2);
        ctx.fillStyle = '#64748b';
        ctx.font = '10px JetBrains Mono';
        ctx.textAlign = 'left';
        ctx.fillText(priceLabel, canvas.width - padding.right + 8, y + 4);
    }

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, padding.top, 0, canvas.height - padding.bottom);
    const lastPrice = prices[prices.length - 1];
    const firstPrice = prices[0];
    const isUp = lastPrice >= firstPrice;

    if (isUp) {
        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.15)');
        gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');
    } else {
        gradient.addColorStop(0, 'rgba(239, 68, 68, 0.15)');
        gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
    }

    // Draw fill
    ctx.beginPath();
    prices.forEach((price, i) => {
        const x = padding.left + (i / (prices.length - 1)) * chartW;
        const y = padding.top + ((maxPrice - price) / range) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.lineTo(padding.left + chartW, padding.top + chartH);
    ctx.lineTo(padding.left, padding.top + chartH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw line
    ctx.beginPath();
    ctx.strokeStyle = isUp ? '#10b981' : '#ef4444';
    ctx.lineWidth = 2;
    ctx.shadowColor = isUp ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)';
    ctx.shadowBlur = 8;

    prices.forEach((price, i) => {
        const x = padding.left + (i / (prices.length - 1)) * chartW;
        const y = padding.top + ((maxPrice - price) / range) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Current price dot
    const lastX = padding.left + chartW;
    const lastY = padding.top + ((maxPrice - lastPrice) / range) * chartH;

    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fillStyle = isUp ? '#10b981' : '#ef4444';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(lastX, lastY, 8, 0, Math.PI * 2);
    ctx.strokeStyle = isUp ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Current price label
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 12px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText(`$${lastPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, lastX - 30, lastY - 15);

    // Asset label
    const assetIcons = { 'ORO': '🪙 GOLD', 'BITCOIN': '₿ BTC', 'ETHEREUM': 'Ξ ETH' };
    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 11px JetBrains Mono';
    ctx.textAlign = 'left';
    ctx.fillText(assetIcons[selectedAsset] || selectedAsset, padding.left + 4, padding.top - 10);

    // Change %
    const changePercent = ((lastPrice - firstPrice) / firstPrice * 100).toFixed(2);
    ctx.fillStyle = isUp ? '#10b981' : '#ef4444';
    ctx.font = '10px JetBrains Mono';
    ctx.fillText(`${isUp ? '+' : ''}${changePercent}%`, padding.left + 100, padding.top - 10);
}

// --- RENDER REFLECTIONS ---
function renderReflections(reflections) {
    const container = document.getElementById('aiContent');

    if (!reflections || reflections.length === 0) {
        return; // Keep the default empty state
    }

    container.innerHTML = reflections.map(r => `
        <div class="ai-reflection-card">
            <div class="ai-date">${new Date(r.created_at).toLocaleString('es-VE', { timeZone: 'America/Caracas' })}</div>
            <div class="ai-analysis">${r.analysis || 'No analysis available'}</div>
            ${r.recommendation ? `<div class="ai-recommendation">💡 ${r.recommendation}</div>` : ''}
        </div>
    `).join('');
}

// --- UPDATE STATUS BAR ---
function updateStatusBar(data) {
    const nf = document.getElementById('nfStatus');
    const db = document.getElementById('dbStatus');
    const ai = document.getElementById('aiStatus');
    const tg = document.getElementById('tgStatus');
    const td = document.getElementById('tdStatus');

    nf.textContent = data.sentinel ? '● ONLINE' : '● OFFLINE';
    nf.className = data.sentinel ? 'status-value' : 'status-value offline';

    db.textContent = data.portfolio ? '● CONNECTED' : '● ERROR';
    db.className = data.portfolio ? 'status-value' : 'status-value offline';

    ai.textContent = '● READY';
    tg.textContent = '● ACTIVE';
    td.textContent = data.latestPrices?.length > 0 ? '● FEEDING' : '● WAITING';
}

// Handle window resize for chart
window.addEventListener('resize', () => {
    if (priceHistoryData.length > 0) {
        renderChart(priceHistoryData);
    }
});
