// Dashboard Financeiro - Grupo Ceam
// Handles both Contas a Pagar and Contas a Receber

let currentContext = 'pagar'; // 'pagar' | 'receber'
let currentStatus = 'all';    // 'all' | 'pago' | 'a_pagar'
let currentCompany = 'all';   // 'all' | 'vale_sapucai' | 'ceam_brasil'
let charts = {};

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function monthName(m) {
    const [year, month] = m.split('/');
    const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return names[parseInt(month) - 1] + '/' + year.slice(2);
}

function destroyChart(canvasId) {
    const existing = Chart.getChart(canvasId);
    if (existing) existing.destroy();
    if (charts[canvasId]) { charts[canvasId] = null; }
}

const PALETTE = [
    '#4f46e5','#10b981','#f59e0b','#ef4444','#0ea5e9',
    '#8b5cf6','#ec4899','#14b8a6','#f97316','#64748b',
    '#a855f7','#22c55e','#eab308','#06b6d4','#6366f1',
];

// ─── Context / Status switching ────────────────────────────────────────────

function setContext(ctx) {
    currentContext = ctx;
    currentStatus = 'all';

    document.getElementById('ctx-pagar').className = 'ctx-btn' + (ctx === 'pagar' ? ' active' : '');
    document.getElementById('ctx-receber').className = 'ctx-btn' + (ctx === 'receber' ? ' active-receber active' : '');

    const statusFilter = document.getElementById('status-filter-pagar');
    statusFilter.style.display = ctx === 'pagar' ? 'flex' : 'none';
    document.querySelectorAll('.status-btn').forEach(b => b.classList.toggle('active', b.dataset.status === 'all'));

    // Update header
    document.getElementById('main-title').textContent = ctx === 'pagar' ? 'Contas a Pagar' : 'Contas a Receber';
    document.getElementById('main-subtitle').textContent = ctx === 'pagar'
        ? 'Gestão de desembolsos e obrigações financeiras · Nov/2025 – Mai/2026'
        : 'Gestão de recebimentos e inadimplência · Nov/2025 – Mai/2026';

    // Update nav labels
    const catText = ctx === 'pagar' ? 'Categorias' : 'Clientes';
    const supText = ctx === 'pagar' ? 'Fornecedores' : 'Ranking';
    document.querySelectorAll('.cat-label-text').forEach(el => el.textContent = catText);
    document.querySelectorAll('.sup-label-text').forEach(el => el.textContent = supText);

    rebuildAll();
}

function setStatus(status) {
    currentStatus = status;
    document.querySelectorAll('#status-filter-pagar .status-btn').forEach(b => b.classList.toggle('active', b.dataset.status === status));
    rebuildAll();
}

function changeCompany(company) {
    currentCompany = company;
    
    // Sync all select dropdowns
    document.querySelectorAll('.filter-company-select').forEach(select => {
        select.value = company;
    });

    // Sync radio inputs in Lançamentos tab
    const radio = document.querySelector(`#filter-company-lancamentos input[value="${company}"]`);
    if (radio) {
        radio.checked = true;
    }

    rebuildAll();
}

// ─── Get filtered data ──────────────────────────────────────────────────────

function getPagarTransactions() {
    let txs = FINANCEIRO_DATA.pagar.transactions;
    if (currentCompany === 'vale_sapucai') {
        txs = txs.filter(t => t.company === 'Vale do Sapucaí');
    } else if (currentCompany === 'ceam_brasil') {
        txs = txs.filter(t => t.company === 'Ceam Brasil');
    }
    
    if (currentStatus === 'pago') return txs.filter(t => t.a_pagar === 0);
    if (currentStatus === 'a_pagar') return txs.filter(t => t.pago === 0);
    return txs;
}

function getReceberTransactions() {
    let txs = FINANCEIRO_DATA.receber.transactions;
    if (currentCompany === 'vale_sapucai') {
        txs = txs.filter(t => t.company === 'Vale do Sapucaí');
    } else if (currentCompany === 'ceam_brasil') {
        txs = txs.filter(t => t.company === 'Ceam Brasil');
    }
    return txs;
}

function getReceberClientes() {
    const txs = getReceberTransactions();
    const clientMap = {};
    txs.forEach(t => {
        if (!clientMap[t.cliente]) {
            clientMap[t.cliente] = { name: t.cliente, valor: 0, baixado: 0, a_receber: 0 };
        }
        clientMap[t.cliente].valor += t.valor;
        clientMap[t.cliente].baixado += t.baixado;
        clientMap[t.cliente].a_receber += t.a_receber;
    });
    return Object.values(clientMap).sort((a, b) => b.valor - a.valor);
}

function getValueField() {
    if (currentStatus === 'pago') return 'pago';
    if (currentStatus === 'a_pagar') return 'a_pagar';
    return 'valor';
}

// ─── KPIs ───────────────────────────────────────────────────────────────────

function buildKPIs() {
    const grid = document.getElementById('kpi-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const activeTab = document.querySelector('.tab-content.active')?.id;
    if (activeTab === 'indicadores') {
        const selVal = document.getElementById('filter-month-ind')?.value;
        const pagarMonths = FINANCEIRO_DATA.pagar.months;
        let targetMonth = null;
        if (selVal && selVal !== 'all') {
            targetMonth = pagarMonths[parseInt(selVal)];
        }

        let totalFaturado = 0;
        let totalRecebido = 0;
        let totalAReceber = 0;
        let top3Soma = 0;

        const recTxs = getReceberTransactions().filter(t => !targetMonth || t.month === targetMonth);
        totalFaturado = recTxs.reduce((s, t) => s + t.valor, 0);
        totalRecebido = recTxs.reduce((s, t) => s + t.baixado, 0);
        totalAReceber = recTxs.reduce((s, t) => s + t.a_receber, 0);
        
        const clientMap = {};
        recTxs.forEach(t => {
            if (!clientMap[t.cliente]) clientMap[t.cliente] = 0;
            clientMap[t.cliente] += t.valor;
        });
        const sortedClients = Object.values(clientMap).sort((a,b) => b-a);
        top3Soma = sortedClients.slice(0, 3).reduce((s, v) => s + v, 0);

        let pagarTxs = FINANCEIRO_DATA.pagar.transactions;
        if (currentCompany === 'vale_sapucai') {
            pagarTxs = pagarTxs.filter(t => t.company === 'Vale do Sapucaí');
        } else if (currentCompany === 'ceam_brasil') {
            pagarTxs = pagarTxs.filter(t => t.company === 'Ceam Brasil');
        }

        if (targetMonth) {
            pagarTxs = pagarTxs.filter(t => t.month_emissao === targetMonth);
        }

        const pagarPago = pagarTxs.reduce((s, t) => s + t.pago, 0);
        const pagarAPagar = pagarTxs.reduce((s, t) => s + t.a_pagar, 0);
        const pagarTotal = pagarPago + pagarAPagar;

        const resultadoOperacional = totalFaturado - pagarTotal;
        const sobraCaixa = totalRecebido - pagarPago;
        const inadimplenciaPct = totalFaturado > 0 ? (totalAReceber / totalFaturado * 100) : 0;
        const concentracaoPct = totalFaturado > 0 ? (top3Soma / totalFaturado * 100) : 0;

        const cards = [
            { icon: 'fas fa-balance-scale', cls: 'icon-primary', label: 'Resultado Operacional', value: fmt(resultadoOperacional) },
            { icon: 'fas fa-hand-holding-usd', cls: sobraCaixa >= 0 ? 'icon-success' : 'icon-danger', label: 'Sobra de Caixa Real', value: fmt(sobraCaixa) },
            { icon: 'fas fa-exclamation-triangle', cls: inadimplenciaPct > 20 ? 'icon-warning' : 'icon-success', label: 'Inadimplência Recebíveis', value: totalFaturado > 0 ? `${inadimplenciaPct.toFixed(1)}%` : 'N/A' },
            { icon: 'fas fa-chart-pie', cls: 'icon-info', label: 'Concentração (Top 3 Clientes)', value: totalFaturado > 0 ? `${concentracaoPct.toFixed(1)}%` : 'N/A' }
        ];

        cards.forEach(c => {
            grid.innerHTML += `
            <div class="stat-card">
                <div class="stat-icon ${c.cls}"><i class="${c.icon}"></i></div>
                <div class="stat-content">
                    <span class="stat-label">${c.label}</span>
                    <h2 class="stat-value">${c.value}</h2>
                </div>
            </div>`;
        });
        return;
    }

    if (currentContext === 'pagar') {
        let txs = getPagarTransactions();
        const months = FINANCEIRO_DATA.pagar.months;
        const activeTab = document.querySelector('.tab-content.active')?.id;

        // Apply month filters based on active tab
        if (activeTab === 'categorias') {
            const selVal = document.getElementById('filter-month-cat')?.value;
            if (selVal && selVal !== 'all') {
                const targetMonth = months[parseInt(selVal)];
                txs = txs.filter(t => t.month_emissao === targetMonth);
            }
        } else if (activeTab === 'fornecedores') {
            const selVal = document.getElementById('filter-month-sup')?.value;
            if (selVal && selVal !== 'all') {
                const targetMonth = months[parseInt(selVal)];
                txs = txs.filter(t => t.month_emissao === targetMonth);
            }
        } else if (activeTab === 'lancamentos') {
            const checkedMonths = [...document.querySelectorAll('#filter-months input:checked')].map(i => i.value);
            txs = txs.filter(t => checkedMonths.includes(t.month_emissao));
        }

        const totalValor  = txs.reduce((s, t) => s + t.valor, 0);
        const totalPago   = txs.reduce((s, t) => s + t.pago, 0);
        const totalAPagar = txs.reduce((s, t) => s + t.a_pagar, 0);
        const count = txs.length;

        const cards = [
            { icon: 'fas fa-money-bill-wave', cls: 'icon-primary', label: 'Total Geral',    value: fmt(totalValor) },
            { icon: 'fas fa-check-circle',    cls: 'icon-success', label: 'Total Pago',     value: fmt(totalPago) },
            { icon: 'fas fa-clock',           cls: 'icon-warning', label: 'Total a Pagar',  value: fmt(totalAPagar) },
            { icon: 'fas fa-receipt',         cls: 'icon-info',    label: 'Documentos',     value: count.toLocaleString('pt-BR') },
        ];

        cards.forEach(c => {
            grid.innerHTML += `
            <div class="stat-card">
                <div class="stat-icon ${c.cls}"><i class="${c.icon}"></i></div>
                <div class="stat-content">
                    <span class="stat-label">${c.label}</span>
                    <h2 class="stat-value">${c.value}</h2>
                </div>
            </div>`;
        });
    } else {
        const txs = getReceberTransactions();
        const totalValor = txs.reduce((s, t) => s + t.valor, 0);
        const totalRecebido = txs.reduce((s, t) => s + t.baixado, 0);
        const totalAReceber = txs.reduce((s, t) => s + t.a_receber, 0);
        const uniqueClientes = [...new Set(txs.map(t => t.cliente))].length;
        
        const cards = [
            { icon: 'fas fa-file-invoice', cls: 'icon-primary', label: 'Total Faturado', value: fmt(totalValor) },
            { icon: 'fas fa-check-circle', cls: 'icon-success', label: 'Total Recebido', value: fmt(totalRecebido) },
            { icon: 'fas fa-hourglass-half', cls: 'icon-warning', label: 'A Receber', value: fmt(totalAReceber) },
            { icon: 'fas fa-users', cls: 'icon-info', label: 'Clientes', value: uniqueClientes.toLocaleString('pt-BR') },
        ];
        cards.forEach(c => {
            grid.innerHTML += `
            <div class="stat-card">
                <div class="stat-icon ${c.cls}"><i class="${c.icon}"></i></div>
                <div class="stat-content">
                    <span class="stat-label">${c.label}</span>
                    <h2 class="stat-value">${c.value}</h2>
                </div>
            </div>`;
        });
    }
}

// ─── Visão Geral ────────────────────────────────────────────────────────────

function buildVisaoGeral() {
    destroyChart('chart-evolution');
    destroyChart('chart-categories-pie');

    if (currentContext === 'pagar') {
        buildPagarEvolution();
        buildPagarPie();
        buildPagarRanking();
        document.getElementById('chart-evolution-title').textContent = 'Evolução Mensal – Pago vs A Pagar';
        document.getElementById('chart-pie-title').textContent = 'Distribuição por Categoria';
        document.getElementById('ranking-title').textContent = 'Top 5 Fornecedores';
        document.getElementById('ranking-panel').style.display = 'flex';
    } else {
        buildReceberEvolution();
        buildReceberPie();
        document.getElementById('chart-evolution-title').textContent = 'Evolução Mensal – Recebido vs A Receber';
        document.getElementById('chart-pie-title').textContent = 'Distribuição por Cliente (Top 10)';
        document.getElementById('ranking-panel').style.display = 'none';
    }
}

function buildPagarEvolution() {
    const months = FINANCEIRO_DATA.pagar.months;
    const labels = months.map(monthName);
    const txs = getPagarTransactions();

    const pagoMonthly   = months.map(m => txs.filter(t => t.month_emissao === m).reduce((s,t) => s+t.pago, 0));
    const apagarMonthly = months.map(m => txs.filter(t => t.month_emissao === m).reduce((s,t) => s+t.a_pagar, 0));

    // When filtered to one status, show a single dataset
    let datasets;
    if (currentStatus === 'pago') {
        datasets = [{ label: 'Pago', data: pagoMonthly, backgroundColor: 'rgba(16,185,129,0.8)', borderRadius: 6 }];
    } else if (currentStatus === 'a_pagar') {
        datasets = [{ label: 'A Pagar', data: apagarMonthly, backgroundColor: 'rgba(239,68,68,0.75)', borderRadius: 6 }];
    } else {
        datasets = [
            { label: 'Pago',    data: pagoMonthly,   backgroundColor: 'rgba(16,185,129,0.8)',  borderRadius: 6, stack: 'stack' },
            { label: 'A Pagar', data: apagarMonthly, backgroundColor: 'rgba(239,68,68,0.75)', borderRadius: 6, stack: 'stack' },
        ];
    }

    const ctx = document.getElementById('chart-evolution').getContext('2d');
    charts['chart-evolution'] = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` } } },
            scales: {
                x: { stacked: currentStatus === 'all', grid: { display: false } },
                y: { stacked: currentStatus === 'all', ticks: { callback: v => 'R$' + (v/1000).toFixed(0) + 'k' } }
            }
        }
    });
}

function buildPagarPie() {
    const txs = getPagarTransactions();
    const vf = getValueField();
    const byCategory = {};
    txs.forEach(t => { byCategory[t.category] = (byCategory[t.category] || 0) + t[vf]; });
    const sorted = Object.entries(byCategory).sort((a,b) => b[1]-a[1]);
    const top8 = sorted.slice(0, 8);
    const other = sorted.slice(8).reduce((s,[,v]) => s+v, 0);
    if (other > 0) top8.push(['Outros', other]);

    const ctx = document.getElementById('chart-categories-pie').getContext('2d');
    charts['chart-categories-pie'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: top8.map(([k]) => k),
            datasets: [{ data: top8.map(([,v]) => v), backgroundColor: PALETTE, borderWidth: 2, borderColor: '#fff' }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: window.innerWidth < 600 ? 'bottom' : 'right', labels: { font: { size: 11 }, boxWidth: 12, padding: 10 } },
                tooltip: { callbacks: { label: c => ` ${c.label}: ${fmt(c.raw)}` } }
            }
        }
    });
}

function buildPagarRanking() {
    const txs = getPagarTransactions();
    const vf = getValueField();
    const bySupplier = {};
    txs.forEach(t => { bySupplier[t.supplier] = (bySupplier[t.supplier] || 0) + t[vf]; });
    const top5 = Object.entries(bySupplier).sort((a,b) => b[1]-a[1]).slice(0, 5);

    const container = document.getElementById('mini-ranking-suppliers');
    container.innerHTML = top5.map(([name, val], i) => `
        <div class="mini-rank-item">
            <div class="mini-rank-info">
                <span class="mini-rank-pos">${i+1}</span>
                <span class="mini-rank-name" title="${name}">${name}</span>
            </div>
            <span class="mini-rank-value">${fmt(val)}</span>
        </div>`).join('');
}

function buildReceberEvolution() {
    const txs = getReceberTransactions();
    const months = [...new Set(txs.map(t => t.month).filter(Boolean))].sort();
    const labels = months.map(monthName);

    const recebidoMonthly = months.map(m => txs.filter(t => t.month === m).reduce((s,t) => s + t.baixado, 0));
    const areceberMonthly = months.map(m => txs.filter(t => t.month === m).reduce((s,t) => s + t.a_receber, 0));

    const ctx = document.getElementById('chart-evolution').getContext('2d');
    charts['chart-evolution'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Recebido', data: recebidoMonthly, backgroundColor: 'rgba(16,185,129,0.8)', borderRadius: 6, stack: 'stack' },
                { label: 'A Receber', data: areceberMonthly, backgroundColor: 'rgba(14,165,233,0.75)', borderRadius: 6, stack: 'stack' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` } } },
            scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: v => 'R$' + (v/1000).toFixed(0) + 'k' } } }
        }
    });
}

function buildReceberPie() {
    const top10 = getReceberClientes().slice(0, 10);
    const ctx = document.getElementById('chart-categories-pie').getContext('2d');
    charts['chart-categories-pie'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: top10.map(c => c.name),
            datasets: [{ data: top10.map(c => c.valor), backgroundColor: PALETTE, borderWidth: 2, borderColor: '#fff' }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: window.innerWidth < 600 ? 'bottom' : 'right', labels: { font: { size: 11 }, boxWidth: 12, padding: 8 } },
                tooltip: { callbacks: { label: c => ` ${c.label}: ${fmt(c.raw)}` } }
            }
        }
    });
}

// ─── Category Tab ────────────────────────────────────────────────────────────

function updateCategoryTab() {
    destroyChart('chart-categories-stacked');

    if (currentContext === 'pagar') {
        updatePagarCategoryTab();
    } else {
        updateReceberClienteTab();
    }
}

function updatePagarCategoryTab() {
    buildKPIs();
    const d = FINANCEIRO_DATA.pagar;
    const months = d.months;
    const selIdx = document.getElementById('filter-month-cat').value;
    const vf = getValueField();

    // Rebuild category data from raw transactions
    const txs = getPagarTransactions();
    const categories = [...new Set(txs.map(t => t.category))].sort();

    let labels, datasets, tableMonths;

    if (selIdx === 'all') {
        tableMonths = months;
        labels = months.map(monthName);
        datasets = categories.map((cat, i) => ({
            label: cat,
            data: months.map(m => txs.filter(t => t.category === cat && t.month_emissao === m).reduce((s,t) => s+t[vf], 0)),
            backgroundColor: PALETTE[i % PALETTE.length],
            borderRadius: 4,
            stack: 'stack',
        }));
    } else {
        const m = months[parseInt(selIdx)];
        tableMonths = [m];
        labels = [monthName(m)];
        datasets = categories.map((cat, i) => ({
            label: cat,
            data: [txs.filter(t => t.category === cat && t.month_emissao === m).reduce((s,t) => s+t[vf], 0)],
            backgroundColor: PALETTE[i % PALETTE.length],
            borderRadius: 4,
            stack: 'stack',
        }));
    }

    const ctx = document.getElementById('chart-categories-stacked').getContext('2d');
    charts['chart-categories-stacked'] = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` } } },
            scales: {
                x: { stacked: true, grid: { display: false } },
                y: { stacked: true, ticks: { callback: v => 'R$' + (v/1000).toFixed(0) + 'k' } }
            }
        }
    });

    // Table
    const header = document.getElementById('table-categories-header');
    header.innerHTML = '<th>Categoria</th>' + tableMonths.map(m => `<th>${monthName(m)}</th>`).join('') + '<th>Total</th><th>Var%</th>';

    const tbody = document.getElementById('table-categories-body');
    const catTotals = categories.map(cat => {
        const monthly = tableMonths.map(m => txs.filter(t => t.category === cat && t.month_emissao === m).reduce((s,t) => s+t[vf], 0));
        const total = monthly.reduce((s,v) => s+v, 0);
        return { name: cat, monthly, total };
    }).filter(c => c.total > 0).sort((a,b) => b.total - a.total);

    // Grand total row
    const grandMonthlyTotals = tableMonths.map(m => txs.filter(t => t.month_emissao === m).reduce((s,t) => s+t[vf], 0));
    const grandTotal = grandMonthlyTotals.reduce((s,v) => s+v, 0);
    const firstGrand = grandMonthlyTotals.find(v => v > 0) || 0;
    const lastGrand = [...grandMonthlyTotals].reverse().find(v => v > 0) || 0;
    const grandVarPct = firstGrand > 0 ? ((lastGrand - firstGrand) / firstGrand * 100) : 0;
    const grandVarCls = grandVarPct > 5 ? 'var-up' : grandVarPct < -5 ? 'var-down' : 'var-neutral';
    const grandVarIcon = grandVarPct > 5 ? '▲' : grandVarPct < -5 ? '▼' : '–';

    const totalRowHtml = `<tr style="font-weight: 800; background-color: #f1f5f9;">
        <td><strong>TOTAL GERAL</strong></td>
        ${grandMonthlyTotals.map(v => `<td><strong>${v > 0 ? fmt(v) : '–'}</strong></td>`).join('')}
        <td><strong>${fmt(grandTotal)}</strong></td>
        <td><span class="variation-tag ${grandVarCls}">${grandVarIcon} ${Math.abs(grandVarPct).toFixed(0)}%</span></td>
    </tr>`;

    tbody.innerHTML = totalRowHtml + catTotals.map(c => {
        const first = c.monthly.find(v => v > 0) || 0;
        const last = [...c.monthly].reverse().find(v => v > 0) || 0;
        const varPct = first > 0 ? ((last - first) / first * 100) : 0;
        const varCls = varPct > 5 ? 'var-up' : varPct < -5 ? 'var-down' : 'var-neutral';
        const varIcon = varPct > 5 ? '▲' : varPct < -5 ? '▼' : '–';
        return `<tr>
            <td><strong>${c.name}</strong></td>
            ${c.monthly.map(v => `<td>${v > 0 ? fmt(v) : '–'}</td>`).join('')}
            <td><strong>${fmt(c.total)}</strong></td>
            <td><span class="variation-tag ${varCls}">${varIcon} ${Math.abs(varPct).toFixed(0)}%</span></td>
        </tr>`;
    }).join('');
}

function updateReceberClienteTab() {
    const d = FINANCEIRO_DATA.receber;
    const months = d.months;
    const selIdx = document.getElementById('filter-month-cat').value;
    const txs = getReceberTransactions();

    let tableMonths;
    if (selIdx === 'all') {
        tableMonths = months;
    } else {
        tableMonths = [months[parseInt(selIdx)]];
    }

    const clientMap = {};
    txs.forEach(t => {
        if (!tableMonths.includes(t.month)) return;
        if (!clientMap[t.cliente]) {
            clientMap[t.cliente] = {
                name: t.cliente,
                monthlyValor: tableMonths.map(() => 0.0),
                monthlyRecebido: tableMonths.map(() => 0.0),
                totalValor: 0.0,
                totalRecebido: 0.0,
                totalAReceber: 0.0
            };
        }
        const mIdx = tableMonths.indexOf(t.month);
        if (mIdx !== -1) {
            clientMap[t.cliente].monthlyValor[mIdx] += t.valor;
            clientMap[t.cliente].monthlyRecebido[mIdx] += t.baixado;
        }
        clientMap[t.cliente].totalValor += t.valor;
        clientMap[t.cliente].totalRecebido += t.baixado;
        clientMap[t.cliente].totalAReceber += t.a_receber;
    });

    const clientData = Object.values(clientMap)
        .filter(c => c.totalValor > 0)
        .sort((a, b) => b.totalValor - a.totalValor);

    document.getElementById('chart-stacked-title').textContent = 'Distribuição por Cliente';
    const top15 = clientData.slice(0, 15);
    const ctx = document.getElementById('chart-categories-stacked').getContext('2d');
    charts['chart-categories-stacked'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: top15.map(c => c.name.length > 25 ? c.name.slice(0,25)+'…' : c.name),
            datasets: [
                { label: 'Recebido', data: top15.map(c => c.totalRecebido), backgroundColor: 'rgba(16,185,129,0.8)', borderRadius: 4, stack: 'stack' },
                { label: 'A Receber', data: top15.map(c => c.totalAReceber), backgroundColor: 'rgba(14,165,233,0.75)', borderRadius: 4, stack: 'stack' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` } } },
            scales: {
                x: { stacked: true, ticks: { font: { size: 10 } } },
                y: { stacked: true, ticks: { callback: v => 'R$' + (v/1000).toFixed(0) + 'k' } }
            }
        }
    });

    // Table Header
    const header = document.getElementById('table-categories-header');
    header.innerHTML = '<th>#</th><th>Cliente</th>' + 
        tableMonths.map(m => `<th>${monthName(m)}</th>`).join('') + 
        '<th>Total Faturado</th><th>Total Recebido</th><th>A Receber</th><th>% Recebido</th>';

    // Grand Totals
    const grandMonthlyValor = tableMonths.map(m => txs.filter(t => t.month === m).reduce((s,t) => s+t.valor, 0));
    const grandMonthlyRecebido = tableMonths.map(m => txs.filter(t => t.month === m).reduce((s,t) => s+t.baixado, 0));
    const grandMonthlyAReceber = tableMonths.map(m => txs.filter(t => t.month === m).reduce((s,t) => s+t.a_receber, 0));

    const grandTotalValor = grandMonthlyValor.reduce((s, v) => s + v, 0);
    const grandTotalRecebido = grandMonthlyRecebido.reduce((s, v) => s + v, 0);
    const grandTotalAReceber = grandMonthlyAReceber.reduce((s, v) => s + v, 0);
    const grandPct = grandTotalValor > 0 ? (grandTotalRecebido / grandTotalValor * 100) : 0;

    const totalRowHtml = `<tr style="font-weight: 800; background-color: #f1f5f9;">
        <td></td>
        <td><strong>TOTAL GERAL</strong></td>
        ${grandMonthlyValor.map(v => `<td><strong>${v > 0 ? fmt(v) : '–'}</strong></td>`).join('')}
        <td><strong>${fmt(grandTotalValor)}</strong></td>
        <td><strong>${fmt(grandTotalRecebido)}</strong></td>
        <td><strong style="color:${grandTotalAReceber > 0 ? '#0284c7' : 'inherit'}">${fmt(grandTotalAReceber)}</strong></td>
        <td>
            <strong>${grandPct.toFixed(1)}%</strong>
            <div class="percent-bar"><div class="percent-fill" style="width:${grandPct}%;background:var(--success)"></div></div>
        </td>
    </tr>`;

    // Table Body
    const tbody = document.getElementById('table-categories-body');
    tbody.innerHTML = totalRowHtml + clientData.map((c, i) => {
        const pct = c.totalValor > 0 ? (c.totalRecebido / c.totalValor * 100) : 0;
        return `<tr>
            <td>${i+1}</td>
            <td>${c.name}</td>
            ${c.monthlyValor.map(v => `<td>${v > 0 ? fmt(v) : '–'}</td>`).join('')}
            <td><strong>${fmt(c.totalValor)}</strong></td>
            <td>${fmt(c.totalRecebido)}</td>
            <td><strong style="color:${c.totalAReceber > 0 ? '#0284c7' : 'inherit'}">${fmt(c.totalAReceber)}</strong></td>
            <td>
                ${pct.toFixed(1)}%
                <div class="percent-bar"><div class="percent-fill" style="width:${pct}%;background:var(--success)"></div></div>
            </td>
        </tr>`;
    }).join('');
}

// ─── Supplier / Ranking Tab ─────────────────────────────────────────────────

function updateSupplierTab() {
    if (currentContext === 'pagar') {
        updatePagarSupplierTab();
    } else {
        updateReceberRankingTab();
    }
}

function updatePagarSupplierTab() {
    buildKPIs();
    const d = FINANCEIRO_DATA.pagar;
    const months = d.months;
    const selIdx = document.getElementById('filter-month-sup').value;
    const vf = getValueField();
    const txs = getPagarTransactions();

    let tableMonths;
    if (selIdx === 'all') {
        tableMonths = months;
    } else {
        tableMonths = [months[parseInt(selIdx)]];
    }

    // Build supplier totals
    const suppMap = {};
    txs.forEach(t => {
        if (!tableMonths.includes(t.month_emissao)) return;
        if (!suppMap[t.supplier]) suppMap[t.supplier] = { monthly: {} };
        suppMap[t.supplier].monthly[t.month_emissao] = (suppMap[t.supplier].monthly[t.month_emissao] || 0) + t[vf];
    });

    const suppliers = Object.entries(suppMap).map(([name, v]) => ({
        name,
        monthly: tableMonths.map(m => v.monthly[m] || 0),
        total: tableMonths.reduce((s,m) => s + (v.monthly[m] || 0), 0),
    })).filter(s => s.total > 0).sort((a,b) => b.total - a.total);

    const header = document.getElementById('table-suppliers-header');
    header.innerHTML = '<th>#</th><th>Fornecedor</th>' + tableMonths.map(m => `<th>${monthName(m)}</th>`).join('') + '<th>Total</th>';

    const tbody = document.getElementById('table-suppliers-body');

    // Grand total row
    const grandMonthlyTotals = tableMonths.map(m => txs.filter(t => t.month_emissao === m).reduce((s,t) => s+t[vf], 0));
    const grandTotal = grandMonthlyTotals.reduce((s,v) => s+v, 0);

    const totalRowHtml = `<tr style="font-weight: 800; background-color: #f1f5f9;">
        <td></td>
        <td><strong>TOTAL GERAL</strong></td>
        ${grandMonthlyTotals.map(v => `<td><strong>${v > 0 ? fmt(v) : '–'}</strong></td>`).join('')}
        <td><strong>${fmt(grandTotal)}</strong></td>
    </tr>`;

    tbody.innerHTML = totalRowHtml + suppliers.map((s, i) => `<tr>
        <td><span class="rank-badge">${i+1}</span></td>
        <td>${s.name}</td>
        ${s.monthly.map(v => `<td>${v > 0 ? fmt(v) : '–'}</td>`).join('')}
        <td><strong>${fmt(s.total)}</strong></td>
    </tr>`).join('');
}

function updateReceberRankingTab() {
    const d = FINANCEIRO_DATA.receber;
    const months = d.months;
    const selIdx = document.getElementById('filter-month-sup').value;
    const txs = getReceberTransactions();

    let tableMonths;
    if (selIdx === 'all') {
        tableMonths = months;
    } else {
        tableMonths = [months[parseInt(selIdx)]];
    }

    const clientMap = {};
    txs.forEach(t => {
        if (!tableMonths.includes(t.month)) return;
        if (!clientMap[t.cliente]) {
            clientMap[t.cliente] = {
                name: t.cliente,
                monthlyValor: tableMonths.map(() => 0.0),
                monthlyRecebido: tableMonths.map(() => 0.0),
                totalValor: 0.0,
                totalRecebido: 0.0,
                totalAReceber: 0.0
            };
        }
        const mIdx = tableMonths.indexOf(t.month);
        if (mIdx !== -1) {
            clientMap[t.cliente].monthlyValor[mIdx] += t.valor;
            clientMap[t.cliente].monthlyRecebido[mIdx] += t.baixado;
        }
        clientMap[t.cliente].totalValor += t.valor;
        clientMap[t.cliente].totalRecebido += t.baixado;
        clientMap[t.cliente].totalAReceber += t.a_receber;
    });

    const clientData = Object.values(clientMap)
        .filter(c => c.totalValor > 0)
        .sort((a, b) => b.totalValor - a.totalValor);

    const header = document.getElementById('table-suppliers-header');
    header.innerHTML = '<th>#</th><th>Cliente</th>' + 
        tableMonths.map(m => `<th>${monthName(m)}</th>`).join('') + 
        '<th>Total Faturado</th><th>Total Recebido</th><th>A Receber</th>';

    const grandMonthlyValor = tableMonths.map(m => txs.filter(t => t.month === m).reduce((s,t) => s+t.valor, 0));
    const grandMonthlyRecebido = tableMonths.map(m => txs.filter(t => t.month === m).reduce((s,t) => s+t.baixado, 0));
    const grandMonthlyAReceber = tableMonths.map(m => txs.filter(t => t.month === m).reduce((s,t) => s+t.a_receber, 0));

    const grandTotalValor = grandMonthlyValor.reduce((s, v) => s + v, 0);
    const grandTotalRecebido = grandMonthlyRecebido.reduce((s, v) => s + v, 0);
    const grandTotalAReceber = grandMonthlyAReceber.reduce((s, v) => s + v, 0);

    const totalRowHtml = `<tr style="font-weight: 800; background-color: #f1f5f9;">
        <td></td>
        <td><strong>TOTAL GERAL</strong></td>
        ${grandMonthlyValor.map(v => `<td><strong>${v > 0 ? fmt(v) : '–'}</strong></td>`).join('')}
        <td><strong>${fmt(grandTotalValor)}</strong></td>
        <td><strong>${fmt(grandTotalRecebido)}</strong></td>
        <td><strong style="color:${grandTotalAReceber > 0 ? '#0284c7' : 'inherit'}">${fmt(grandTotalAReceber)}</strong></td>
    </tr>`;

    const tbody = document.getElementById('table-suppliers-body');
    tbody.innerHTML = totalRowHtml + clientData.map((c, i) => `<tr>
        <td><span class="rank-badge">${i+1}</span></td>
        <td>${c.name}</td>
        ${c.monthlyValor.map(v => `<td>${v > 0 ? fmt(v) : '–'}</td>`).join('')}
        <td><strong>${fmt(c.totalValor)}</strong></td>
        <td>${fmt(c.totalRecebido)}</td>
        <td><strong style="color:${c.totalAReceber > 0 ? '#0284c7' : 'inherit'}">${fmt(c.totalAReceber)}</strong></td>
    </tr>`).join('');
}

// ─── Lançamentos Tab ─────────────────────────────────────────────────────────

function initDetailFilters() {
    if (currentContext === 'pagar') {
        initPagarDetailFilters();
    } else {
        initReceberDetailFilters();
    }
}

function initPagarDetailFilters() {
    const d = FINANCEIRO_DATA.pagar;
    const txs = getPagarTransactions();
    const months = d.months;
    const categories = [...new Set(txs.map(t => t.category))].sort();
    const suppliers = [...new Set(txs.map(t => t.supplier))].sort((a,b) => a.localeCompare(b));

    document.getElementById('filter-months').innerHTML = months.map(m => `
        <label class="checkbox-item">
            <input type="checkbox" value="${m}" checked onchange="updateDetailTab()">
            <span>${monthName(m)}</span>
        </label>`).join('');

    document.getElementById('filter-categories').innerHTML = categories.map(c => `
        <label class="checkbox-item">
            <input type="checkbox" value="${c}" checked onchange="updateDetailTab()">
            <span>${c}</span>
        </label>`).join('');

    document.getElementById('filter-suppliers').innerHTML = suppliers.map(s => `
        <label class="checkbox-item supplier-item">
            <input type="checkbox" value="${s}" checked onchange="updateDetailTab()">
            <span class="sup-name">${s}</span>
        </label>`).join('');

    document.getElementById('filter-cat-label').textContent = 'Categorias';
    document.getElementById('filter-sup-label').textContent = 'Fornecedores';
    document.getElementById('filter-box-cats').style.display = '';
    document.getElementById('filter-box-sups').style.display = '';

    const header = document.getElementById('detail-table-header');
    header.innerHTML = '<th>Emissão</th><th>Vencimento</th><th>Fornecedor</th><th>Categoria</th><th>Valor</th><th>Pago</th><th>A Pagar</th><th>Status</th>';

    updateDetailTab();
}

function initReceberDetailFilters() {
    const txs = getReceberTransactions();
    const clientes = [...new Set(txs.map(t => t.cliente))].sort((a,b) => a.localeCompare(b));

    document.getElementById('filter-months').innerHTML = `
        <label class="checkbox-item">
            <input type="checkbox" value="2026/05" checked onchange="updateDetailTab()">
            <span>Mai/26</span>
        </label>`;

    document.getElementById('filter-categories').innerHTML = '';
    document.getElementById('filter-box-cats').style.display = 'none';

    document.getElementById('filter-suppliers').innerHTML = clientes.map(c => `
        <label class="checkbox-item supplier-item">
            <input type="checkbox" value="${c}" checked onchange="updateDetailTab()">
            <span class="sup-name">${c}</span>
        </label>`).join('');

    document.getElementById('filter-cat-label').textContent = '';
    document.getElementById('filter-sup-label').textContent = 'Clientes';
    document.getElementById('filter-box-cats').style.display = 'none';
    document.getElementById('filter-box-sups').style.display = '';

    const header = document.getElementById('detail-table-header');
    header.innerHTML = '<th>Emissão</th><th>Vencimento</th><th>Cliente</th><th>Valor</th><th>Recebido</th><th>A Receber</th><th>Status</th>';

    updateDetailTab();
}

function updateDetailTab() {
    if (currentContext === 'pagar') {
        updatePagarDetailTab();
    } else {
        updateReceberDetailTab();
    }
}

function updatePagarDetailTab() {
    buildKPIs();
    const selMonths = [...document.querySelectorAll('#filter-months input:checked')].map(i => i.value);
    const selCats = [...document.querySelectorAll('#filter-categories input:checked')].map(i => i.value);
    const selSups = [...document.querySelectorAll('#filter-suppliers input:checked')].map(i => i.value);

    const txs = getPagarTransactions().filter(t =>
        selMonths.includes(t.month_emissao) &&
        selCats.includes(t.category) &&
        selSups.includes(t.supplier)
    );

    txs.sort((a,b) => {
        const da = a.emissao.split('/').reverse().join('');
        const db = b.emissao.split('/').reverse().join('');
        return db.localeCompare(da);
    });

    const statusMap = { 'Pago': 'badge-pago', 'A Pagar': 'badge-a-pagar', 'Pago Parcial': 'badge-parcial' };

    const tbody = document.getElementById('table-detail-body');
    tbody.innerHTML = txs.map(t => `<tr>
        <td>${t.emissao}</td>
        <td>${t.vencimento}</td>
        <td title="${t.supplier}">${t.supplier.length > 30 ? t.supplier.slice(0,30)+'…' : t.supplier}</td>
        <td>${t.category}</td>
        <td>${fmt(t.valor)}</td>
        <td>${t.pago > 0 ? fmt(t.pago) : '–'}</td>
        <td>${t.a_pagar > 0 ? `<strong style="color:#dc2626">${fmt(t.a_pagar)}</strong>` : '–'}</td>
        <td><span class="badge ${statusMap[t.status] || ''}">${t.status}</span></td>
    </tr>`).join('');

    const totalValor = txs.reduce((s,t) => s+t.valor, 0);
    const totalPago = txs.reduce((s,t) => s+t.pago, 0);
    const totalAPagar = txs.reduce((s,t) => s+t.a_pagar, 0);

    document.getElementById('table-detail-foot').innerHTML = `<tr style="background:#f8fafc;font-weight:700;">
        <td colspan="4">Total (${txs.length} registros)</td>
        <td>${fmt(totalValor)}</td>
        <td>${fmt(totalPago)}</td>
        <td style="color:#dc2626">${fmt(totalAPagar)}</td>
        <td></td>
    </tr>`;
}

function updateReceberDetailTab() {
    const selClientes = [...document.querySelectorAll('#filter-suppliers input:checked')].map(i => i.value);

    const txs = getReceberTransactions().filter(t => selClientes.includes(t.cliente));

    txs.sort((a,b) => {
        const da = a.emissao.split('/').reverse().join('');
        const db = b.emissao.split('/').reverse().join('');
        return db.localeCompare(da);
    });

    const tbody = document.getElementById('table-detail-body');
    tbody.innerHTML = txs.map(t => `<tr>
        <td>${t.emissao}</td>
        <td>${t.vencimento}</td>
        <td title="${t.cliente}">${t.cliente.length > 35 ? t.cliente.slice(0,35)+'…' : t.cliente}</td>
        <td>${fmt(t.valor)}</td>
        <td>${t.baixado > 0 ? fmt(t.baixado) : '–'}</td>
        <td>${t.a_receber > 0 ? `<strong style="color:#0284c7">${fmt(t.a_receber)}</strong>` : '–'}</td>
        <td><span class="badge ${t.status === 'Recebido' ? 'badge-recebido' : 'badge-a-receber'}">${t.status}</span></td>
    </tr>`).join('');

    const totalValor = txs.reduce((s,t) => s+t.valor, 0);
    const totalRecebido = txs.reduce((s,t) => s+t.baixado, 0);
    const totalAReceber = txs.reduce((s,t) => s+t.a_receber, 0);

    document.getElementById('table-detail-foot').innerHTML = `<tr style="background:#f8fafc;font-weight:700;">
        <td colspan="3">Total (${txs.length} registros)</td>
        <td>${fmt(totalValor)}</td>
        <td>${fmt(totalRecebido)}</td>
        <td style="color:#0284c7">${fmt(totalAReceber)}</td>
        <td></td>
    </tr>`;
}

// ─── Filter helpers ──────────────────────────────────────────────────────────

function toggleAllCheckboxes(containerId, checked) {
    document.querySelectorAll(`#${containerId} input[type="checkbox"]`).forEach(cb => { cb.checked = checked; });
    updateDetailTab();
}

function filterSupplierList() {
    const query = document.getElementById('search-supplier').value.toLowerCase();
    document.querySelectorAll('#filter-suppliers .supplier-item').forEach(el => {
        const name = el.querySelector('.sup-name').textContent.toLowerCase();
        el.style.display = name.includes(query) ? '' : 'none';
    });
}

// ─── Tab navigation ──────────────────────────────────────────────────────────

function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.querySelectorAll(`[data-tab="${tabId}"]`).forEach(l => l.classList.add('active'));

    if (tabId === 'lancamentos') {
        initDetailFilters();
    } else if (tabId === 'categorias') {
        updateCategoryTab();
    } else if (tabId === 'fornecedores') {
        updateSupplierTab();
    } else if (tabId === 'visao-geral') {
        buildKPIs();
    } else if (tabId === 'indicadores') {
        buildIndicadores();
    }
}

function initTabs() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            showTab(link.dataset.tab);
        });
    });
}

// ─── Month filter selects ─────────────────────────────────────────────────────

function rebuildMonthFilters() {
    const pagarMonths = FINANCEIRO_DATA.pagar.months;
    const contextMonths = currentContext === 'pagar' ? FINANCEIRO_DATA.pagar.months : FINANCEIRO_DATA.receber.months;

    ['filter-month-cat', 'filter-month-sup'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = '<option value="all">Todos os Meses</option>';
        contextMonths.forEach((m, i) => {
            sel.innerHTML += `<option value="${i}">${monthName(m)}</option>`;
        });
    });

    const selInd = document.getElementById('filter-month-ind');
    if (selInd) {
        selInd.innerHTML = '<option value="all">Todos os Meses</option>';
        pagarMonths.forEach((m, i) => {
            selInd.innerHTML += `<option value="${i}">${monthName(m)}</option>`;
        });
    }
}

function getCategoryGroup(catName) {
    if (catName.startsWith("Folha:")) return "Pessoal";
    if (catName === "Serviços Médicos") return "Serviços Médicos";
    if (["Utilidades (Luz/Água)", "Utilidades (Comunicação)", "TI e Tecnologia", "Insumos Médicos", "Suprimentos Administrativos"].includes(catName)) {
        return "Operacionais";
    }
    if (["Encargos e Impostos", "Taxas Bancárias"].includes(catName)) {
        return "Tributos e Taxas";
    }
    return "Outros";
}

function buildIndicadores() {
    // 1. Destruir gráficos anteriores se existirem
    destroyChart('chart-cost-structure');
    destroyChart('chart-receber-pagar-balance');

    // 2. Garantir KPIs atualizados na barra superior
    buildKPIs();

    const selVal = document.getElementById('filter-month-ind')?.value;
    const pagarMonths = FINANCEIRO_DATA.pagar.months;
    let targetMonth = null;
    if (selVal && selVal !== 'all') {
        targetMonth = pagarMonths[parseInt(selVal)];
    }

    // 3. Cálculos de Receber e Pagar para o período selecionado
    let totalFaturado = 0;
    let totalRecebido = 0;
    let totalAReceber = 0;
    let top3Soma = 0;

    const recTxs = getReceberTransactions().filter(t => !targetMonth || t.month === targetMonth);
    totalFaturado = recTxs.reduce((s, t) => s + t.valor, 0);
    totalRecebido = recTxs.reduce((s, t) => s + t.baixado, 0);
    totalAReceber = recTxs.reduce((s, t) => s + t.a_receber, 0);
    
    const clientMap = {};
    recTxs.forEach(t => {
        if (!clientMap[t.cliente]) clientMap[t.cliente] = 0;
        clientMap[t.cliente] += t.valor;
    });
    const sortedClients = Object.values(clientMap).sort((a,b) => b-a);
    top3Soma = sortedClients.slice(0, 3).reduce((s, v) => s + v, 0);

    let pagarTxs = FINANCEIRO_DATA.pagar.transactions;
    if (currentCompany === 'vale_sapucai') {
        pagarTxs = pagarTxs.filter(t => t.company === 'Vale do Sapucaí');
    } else if (currentCompany === 'ceam_brasil') {
        pagarTxs = pagarTxs.filter(t => t.company === 'Ceam Brasil');
    }
    if (targetMonth) {
        pagarTxs = pagarTxs.filter(t => t.month_emissao === targetMonth);
    }
    const pagarPago = pagarTxs.reduce((s, t) => s + t.pago, 0);
    const pagarAPagar = pagarTxs.reduce((s, t) => s + t.a_pagar, 0);
    const pagarTotal = pagarPago + pagarAPagar;

    const resultadoOperacional = totalFaturado - pagarTotal;
    const sobraCaixa = totalRecebido - pagarPago;
    const exposicaoPendente = totalAReceber - pagarAPagar;

    const margemOperacional = totalFaturado > 0 ? (resultadoOperacional / totalFaturado * 100) : 0;
    const conversaoCaixa = totalFaturado > 0 ? (totalRecebido / totalFaturado * 100) : 0;
    const coberturaPendente = pagarAPagar > 0 ? (totalAReceber / pagarAPagar) : 0;
    const inadimplenciaPct = totalFaturado > 0 ? (totalAReceber / totalFaturado * 100) : 0;
    const concentracaoPct = totalFaturado > 0 ? (top3Soma / totalFaturado * 100) : 0;

    // 4. Injetar Tabela Comparativa Consolidada
    const tbody = document.getElementById('table-consolidated-body');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td><strong>Resultado Operacional (Faturamento vs. Despesas)</strong></td>
                <td>${fmt(totalFaturado)}</td>
                <td>${fmt(pagarTotal)}</td>
                <td class="${resultadoOperacional >= 0 ? 'text-success' : 'text-danger'}"><strong>${fmt(resultadoOperacional)}</strong></td>
                <td><span class="variation-tag ${resultadoOperacional >= 0 ? 'var-down' : 'var-up'}">${resultadoOperacional >= 0 ? '▲' : '▼'} ${Math.abs(margemOperacional).toFixed(1)}% Margem</span></td>
            </tr>
            <tr>
                <td><strong>Fluxo de Caixa Líquido (Recebido vs. Pago)</strong></td>
                <td>${fmt(totalRecebido)}</td>
                <td>${fmt(pagarPago)}</td>
                <td class="${sobraCaixa >= 0 ? 'text-success' : 'text-danger'}"><strong>${fmt(sobraCaixa)}</strong></td>
                <td><span class="variation-tag ${sobraCaixa >= 0 ? 'var-down' : 'var-up'}">${sobraCaixa >= 0 ? '▲' : '▼'} ${conversaoCaixa.toFixed(1)}% Conv.</span></td>
            </tr>
            <tr>
                <td><strong>Saldos Pendentes (A Receber vs. A Pagar)</strong></td>
                <td>${fmt(totalAReceber)}</td>
                <td>${fmt(pagarAPagar)}</td>
                <td class="${exposicaoPendente >= 0 ? 'text-info' : 'text-warning'}"><strong>${fmt(exposicaoPendente)}</strong></td>
                <td><span class="variation-tag var-neutral">${coberturaPendente.toFixed(1)}x Cobertura</span></td>
            </tr>
        `;
    }

    // Update titles based on month
    const titleText = targetMonth ? monthName(targetMonth) : 'Consolidado';
    const containers = document.querySelectorAll('#indicadores .chart-title');
    if (containers.length >= 2) {
        containers[1].textContent = `Balanço Pagar vs Receber (${titleText})`;
        containers[2].textContent = `Balanço Mensal Detalhado (${titleText})`;
    }

    // 5. Gerar Insights Financeiros Automáticos
    const insightsContainer = document.getElementById('insights-container');
    if (insightsContainer) {
        insightsContainer.innerHTML = '';

        if (totalFaturado > 0) {
            // Insight 1: Inadimplência
            if (inadimplenciaPct > 20) {
                insightsContainer.innerHTML += `
                    <div class="insight-card warning">
                        <div class="insight-icon"><i class="fas fa-exclamation-triangle"></i></div>
                        <div class="insight-content">
                            <h4>Alerta de Inadimplência Elevada (${inadimplenciaPct.toFixed(1)}%)</h4>
                            <p>Há <strong>${fmt(totalAReceber)}</strong> pendentes de recebimento em ${titleText}. Isso impacta o fluxo de caixa. Atenção especial ao convênio <strong>NOTRE</strong>.</p>
                        </div>
                    </div>
                `;
            } else {
                insightsContainer.innerHTML += `
                    <div class="insight-card success">
                        <div class="insight-icon"><i class="fas fa-check-circle"></i></div>
                        <div class="insight-content">
                            <h4>Inadimplência sob Controle</h4>
                            <p>O índice de inadimplência está saudável em <strong>${inadimplenciaPct.toFixed(1)}%</strong>, indicando uma boa eficiência de cobrança.</p>
                        </div>
                    </div>
                `;
            }

            // Insight 2: Concentração de Receita
            if (concentracaoPct > 50) {
                insightsContainer.innerHTML += `
                    <div class="insight-card warning">
                        <div class="insight-icon"><i class="fas fa-chart-pie"></i></div>
                        <div class="insight-content">
                            <h4>Alta Concentração de Faturamento (${concentracaoPct.toFixed(1)}%)</h4>
                            <p>Os 3 maiores parceiros comerciais (FUSEX, NOTRE e INST D) concentram mais de dois terços da receita da clínica. Recomenda-se diversificar contratos.</p>
                        </div>
                    </div>
                `;
            } else {
                insightsContainer.innerHTML += `
                    <div class="insight-card info">
                        <div class="insight-icon"><i class="fas fa-info-circle"></i></div>
                        <div class="insight-content">
                            <h4>Faturamento Diversificado</h4>
                            <p>A receita está bem distribuída entre os diversos clientes da clínica.</p>
                        </div>
                    </div>
                `;
            }
        } else {
            insightsContainer.innerHTML += `
                <div class="insight-card info">
                    <div class="insight-icon"><i class="fas fa-info-circle"></i></div>
                    <div class="insight-content">
                        <h4>Faturamento não registrado</h4>
                        <p>Não há dados de contas a receber (Faturamento) registrados para ${titleText}. Exibindo apenas análises de despesas.</p>
                    </div>
                </div>
            `;
        }

        // Insight 3: Fluxo de Caixa Realizado
        if (sobraCaixa > 0) {
            insightsContainer.innerHTML += `
                <div class="insight-card success">
                    <div class="insight-icon"><i class="fas fa-wallet"></i></div>
                    <div class="insight-content">
                        <h4>Fluxo de Caixa Realizado Positivo (+ ${fmt(sobraCaixa)})</h4>
                        <p>A arrecadação líquida efetiva do período superou os pagamentos operacionais realizados, gerando caixa.</p>
                    </div>
                </div>
            `;
        } else {
            insightsContainer.innerHTML += `
                <div class="insight-card danger">
                    <div class="insight-icon"><i class="fas fa-times-circle"></i></div>
                    <div class="insight-content">
                        <h4>Déficit de Caixa Operacional no período</h4>
                        <p>Os pagamentos realizados excederam os recebimentos liquidados em ${titleText}. É necessário monitorar o caixa.</p>
                    </div>
                </div>
            `;
        }

        // Insight 4: Cobertura Geral (Somente se faturamento/recebíveis > 0 e despesas pendentes > 0)
        if (totalAReceber > 0 && pagarAPagar > 0) {
            if (totalAReceber > pagarAPagar) {
                insightsContainer.innerHTML += `
                    <div class="insight-card info">
                        <div class="insight-icon"><i class="fas fa-shield-alt"></i></div>
                        <div class="insight-content">
                            <h4>Segurança Financeira (${coberturaPendente.toFixed(1)}x)</h4>
                            <p>Os saldos a receber pendentes (${fmt(totalAReceber)}) cobrem as obrigações em aberto (${fmt(pagarAPagar)}) em <strong>${coberturaPendente.toFixed(1)} vezes</strong>.</p>
                        </div>
                    </div>
                `;
            } else {
                insightsContainer.innerHTML += `
                    <div class="insight-card danger">
                        <div class="insight-icon"><i class="fas fa-exclamation-circle"></i></div>
                        <div class="insight-content">
                            <h4>Obrigações Excedem Recebíveis</h4>
                            <p>Os compromissos financeiros a pagar pendentes superam as receitas a receber de curto prazo previstas.</p>
                        </div>
                    </div>
                `;
            }
        }
    }

    // 6. Criar Gráfico 1: Estrutura de Custos (Rosca)
    buildCostStructureChart(targetMonth);

    // 7. Criar Gráfico 2: Balanço de Caixa (Barras Agrupadas)
    buildComparisonChart(totalFaturado, totalRecebido, totalAReceber, pagarTotal, pagarPago, pagarAPagar);
}

function buildCostStructureChart(targetMonth) {
    const groupTotals = { "Pessoal": 0, "Serviços Médicos": 0, "Operacionais": 0, "Tributos e Taxas": 0, "Outros": 0 };
    
    let pagarTxs = FINANCEIRO_DATA.pagar.transactions;
    if (currentCompany === 'vale_sapucai') {
        pagarTxs = pagarTxs.filter(t => t.company === 'Vale do Sapucaí');
    } else if (currentCompany === 'ceam_brasil') {
        pagarTxs = pagarTxs.filter(t => t.company === 'Ceam Brasil');
    }
    
    if (targetMonth) {
        pagarTxs = pagarTxs.filter(t => t.month_emissao === targetMonth);
    }
    
    pagarTxs.forEach(t => {
        const grp = getCategoryGroup(t.category);
        groupTotals[grp] = (groupTotals[grp] || 0) + t.valor;
    });

    const labels = Object.keys(groupTotals);
    const data = Object.values(groupTotals);
    const colors = ['#4f46e5', '#10b981', '#0ea5e9', '#f59e0b', '#64748b'];

    const ctx = document.getElementById('chart-cost-structure').getContext('2d');
    charts['chart-cost-structure'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: window.innerWidth < 600 ? 'bottom' : 'right',
                    labels: { font: { size: 11 }, boxWidth: 12, padding: 8 }
                },
                tooltip: {
                    callbacks: {
                        label: c => ` ${c.label}: ${fmt(c.raw)}`
                    }
                }
            }
        }
    });
}

function buildComparisonChart(receberTot, receberRec, receberPen, pagarTot, pagarPag, pagarPen) {
    const ctx = document.getElementById('chart-receber-pagar-balance').getContext('2d');
    charts['chart-receber-pagar-balance'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Total Planejado', 'Efetivado (Liquidez)', 'Pendente (Exposição)'],
            datasets: [
                {
                    label: 'Contas a Receber (Receitas)',
                    data: [receberTot, receberRec, receberPen],
                    backgroundColor: 'rgba(16, 185, 129, 0.8)',
                    borderRadius: 6
                },
                {
                    label: 'Contas a Pagar (Despesas)',
                    data: [pagarTot, pagarPag, pagarPen],
                    backgroundColor: 'rgba(79, 70, 229, 0.8)',
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` } }
            },
            scales: {
                x: { grid: { display: false } },
                y: { ticks: { callback: v => 'R$' + (v/1000).toFixed(0) + 'k' } }
            }
        }
    });
}

// ─── Full rebuild ─────────────────────────────────────────────────────────────

function rebuildAll() {
    rebuildMonthFilters();
    buildKPIs();
    buildVisaoGeral();

    // Refresh whichever tab is active
    const activeTab = document.querySelector('.tab-content.active')?.id;
    if (activeTab === 'categorias') updateCategoryTab();
    else if (activeTab === 'fornecedores') updateSupplierTab();
    else if (activeTab === 'lancamentos') initDetailFilters();
    else if (activeTab === 'indicadores') buildIndicadores();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    if (typeof FINANCEIRO_DATA === 'undefined') {
        document.body.innerHTML = '<div style="padding:2rem;color:red;font-family:sans-serif">Erro: data_financeiro.js não carregado.</div>';
        return;
    }
    initTabs();
    rebuildAll();
});
