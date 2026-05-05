// Dashboard Financeiro Logic
let mainLineChart, categoryPieChart, stackedBarChart;

document.addEventListener('DOMContentLoaded', () => {
    if (typeof FINANCEIRO_DATA === 'undefined') {
        console.error("Dados financeiros não carregados!");
        return;
    }

    initFilters();
    initKPIs();
    initVisaoGeral();
    updateCategoryTab();
    updateSupplierTab();
    if (typeof updateDetailTab === 'function') updateDetailTab();
    initTabs();
});

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function getMonthName(m) {
    const [year, month] = m.split('/');
    const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return names[parseInt(month)-1] + '/' + year.slice(2);
}

function initFilters() {
    const data = FINANCEIRO_DATA;
    const catSelect = document.getElementById('filter-month-cat');
    const supSelect = document.getElementById('filter-month-sup');
    
    // Checkbox containers for Lançamentos
    const advMonths = document.getElementById('filter-months');
    const advCats = document.getElementById('filter-categories');
    const advSups = document.getElementById('filter-suppliers');

    data.months.forEach((m, idx) => {
        const opt = `<option value="${idx}">${getMonthName(m)}</option>`;
        if (catSelect) catSelect.innerHTML += opt;
        if (supSelect) supSelect.innerHTML += opt;
        
        if (advMonths) {
            advMonths.innerHTML += `
                <label class="checkbox-item">
                    <input type="checkbox" value="${m}" checked onchange="updateDetailTab()">
                    <span>${getMonthName(m)}</span>
                </label>`;
        }
    });

    if (advCats && data.categories) {
        data.categories.forEach(cat => {
            advCats.innerHTML += `
                <label class="checkbox-item">
                    <input type="checkbox" value="${cat.name}" checked onchange="updateDetailTab()">
                    <span>${cat.name}</span>
                </label>`;
        });
    }
    
    if (advSups && data.suppliers) {
        const sortedSups = [...data.suppliers].sort((a, b) => a.name.localeCompare(b.name));
        sortedSups.forEach(sup => {
            advSups.innerHTML += `
                <label class="checkbox-item supplier-item">
                    <input type="checkbox" value="${sup.name}" checked onchange="updateDetailTab()">
                    <span class="sup-name">${sup.name}</span>
                </label>`;
        });
    }
}

function initKPIs() {
    const data = FINANCEIRO_DATA;
    document.getElementById('kpi-total').textContent = formatCurrency(data.total_period);
    const avg = data.total_period / data.months.length;
    document.getElementById('kpi-avg').textContent = formatCurrency(avg);
    document.getElementById('kpi-count').textContent = data.count.toLocaleString('pt-BR');
}

function initVisaoGeral() {
    const data = FINANCEIRO_DATA;
    const monthsNames = data.months.map(getMonthName);

    // 1. Comportamento Chart (Line)
    const evolutionCtx = document.getElementById('chart-evolution').getContext('2d');
    mainLineChart = new Chart(evolutionCtx, {
        type: 'line',
        data: {
            labels: monthsNames,
            datasets: [{
                label: 'Total Pago',
                data: data.monthly_behaviour,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 6,
                pointBackgroundColor: '#6366f1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { borderDash: [5, 5] }, ticks: { callback: v => formatCurrency(v).split(',')[0] } },
                x: { grid: { display: false } }
            }
        }
    });

    // 2. Categories Pie Chart
    const categoriesCtx = document.getElementById('chart-categories-pie').getContext('2d');
    const catColors = ['#4f46e5', '#10b981', '#f59e0b', '#0ea5e9', '#f43f5e', '#8b5cf6', '#94a3b8', '#fb923c', '#2dd4bf', '#a78bfa'];
    
    categoryPieChart = new Chart(categoriesCtx, {
        type: 'doughnut',
        data: {
            labels: data.categories.slice(0, 10).map(c => c.name),
            datasets: [{
                data: data.categories.slice(0, 10).map(c => c.total),
                backgroundColor: catColors,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    display: window.innerWidth > 768,
                    position: 'right',
                    labels: { usePointStyle: true, padding: 15, font: { size: 11 } }
                }
            }
        }
    });

    // Mini Ranking Suppliers (Top 5)
    const miniRanking = document.getElementById('mini-ranking-suppliers');
    miniRanking.innerHTML = '';
    data.suppliers.slice(0, 5).forEach((sup, idx) => {
        const item = document.createElement('div');
        item.className = 'mini-rank-item';
        item.innerHTML = `
            <div class="mini-rank-info">
                <div class="mini-rank-pos">${idx + 1}</div>
                <span class="mini-rank-name">${sup.name}</span>
            </div>
            <span class="mini-rank-value">${formatCurrency(sup.total)}</span>
        `;
        miniRanking.appendChild(item);
    });
}

function updateCategoryTab() {
    const data = FINANCEIRO_DATA;
    const filter = document.getElementById('filter-month-cat').value;
    const body = document.getElementById('table-categories-body');
    const header = document.getElementById('table-categories-header');
    
    // Header
    header.innerHTML = '<th>Categoria</th>';
    data.months.forEach(m => header.innerHTML += `<th>${getMonthName(m)}</th>`);
    header.innerHTML += '<th>Total</th><th>Variação %</th>';

    body.innerHTML = '';
    
    data.categories.forEach(cat => {
        let row = `<tr><td><strong>${cat.name}</strong></td>`;
        cat.monthly.forEach((val, idx) => {
            const isSelected = filter === 'all' || parseInt(filter) === idx;
            row += `<td style="${isSelected ? 'background: #f8fafc; font-weight: 600;' : 'opacity: 0.5'}">${formatCurrency(val)}</td>`;
        });
        
        row += `<td>${formatCurrency(cat.total)}</td>`;
        
        // Variation (last vs previous month)
        const last = cat.monthly[cat.monthly.length - 1];
        const prev = cat.monthly[cat.monthly.length - 2] || 0;
        let varHtml = '<span class="variation-tag var-neutral">-</span>';
        if (prev > 0) {
            const diff = ((last - prev) / prev) * 100;
            const cls = diff > 0 ? 'var-up' : (diff < 0 ? 'var-down' : 'var-neutral');
            const icon = diff > 0 ? 'fa-arrow-up' : (diff < 0 ? 'fa-arrow-down' : '');
            varHtml = `<span class="variation-tag ${cls}"><i class="fas ${icon}"></i> ${Math.abs(diff).toFixed(1)}%</span>`;
        }
        
        row += `<td>${varHtml}</td></tr>`;
        body.innerHTML += row;
    });

    // Update Stacked Chart
    if (stackedBarChart) stackedBarChart.destroy();
    const ctx = document.getElementById('chart-categories-stacked').getContext('2d');
    const catColors = ['#4f46e5', '#10b981', '#f59e0b', '#0ea5e9', '#f43f5e', '#8b5cf6', '#94a3b8'];
    
    const displayData = filter === 'all' ? data.months.map(getMonthName) : [getMonthName(data.months[parseInt(filter)])];
    const datasets = data.categories.slice(0, 7).map((cat, idx) => ({
        label: cat.name,
        data: filter === 'all' ? cat.monthly : [cat.monthly[parseInt(filter)]],
        backgroundColor: catColors[idx]
    }));

    stackedBarChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: displayData, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { x: { stacked: true }, y: { stacked: true } }
        }
    });
}

function updateSupplierTab() {
    const data = FINANCEIRO_DATA;
    const filter = document.getElementById('filter-month-sup').value;
    const body = document.getElementById('table-suppliers-body');
    const header = document.getElementById('table-suppliers-header');
    
    // Header
    header.innerHTML = '<th>Rank</th><th>Fornecedor</th>';
    data.months.forEach(m => header.innerHTML += `<th>${getMonthName(m)}</th>`);
    header.innerHTML += '<th>Total</th><th>Variação %</th>';

    body.innerHTML = '';
    
    // Total Row
    let rowTotal = `<tr style="background-color: #f1f5f9; font-weight: bold; position: sticky; top: 40px; z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
        <td>-</td><td><strong>TOTAL GERAL</strong></td>`;
    
    data.months.forEach((m, mIdx) => {
        const isSelected = filter === 'all' || parseInt(filter) === mIdx;
        rowTotal += `<td style="${isSelected ? 'background: #e2e8f0;' : 'opacity: 0.8'}">${formatCurrency(data.monthly_behaviour[mIdx])}</td>`;
    });
    
    rowTotal += `<td>${formatCurrency(data.total_period)}</td>`;
    
    // Variation of the Total
    const lastM = data.monthly_behaviour[data.monthly_behaviour.length - 1];
    const prevM = data.monthly_behaviour[data.monthly_behaviour.length - 2] || 0;
    let varTotalHtml = '<span class="variation-tag var-neutral">-</span>';
    if (prevM > 0) {
        const diff = ((lastM - prevM) / prevM) * 100;
        const cls = diff > 0 ? 'var-up' : (diff < 0 ? 'var-down' : 'var-neutral');
        varTotalHtml = `<span class="variation-tag ${cls}">${diff > 0 ? '+' : ''}${diff.toFixed(1)}%</span>`;
    }
    rowTotal += `<td>${varTotalHtml}</td></tr>`;
    
    body.innerHTML += rowTotal;
    
    // Determine which suppliers to show
    let suppliersToShow = data.suppliers;
    if (filter !== 'all') {
        const mIdx = parseInt(filter);
        suppliersToShow = suppliersToShow.filter(s => s.monthly[mIdx] > 0)
                                         .sort((a, b) => b.monthly[mIdx] - a.monthly[mIdx]);
    }

    // All suppliers
    suppliersToShow.forEach((sup, idx) => {
        let row = `<tr><td><div class="rank-badge">${idx + 1}</div></td><td><strong>${sup.name}</strong></td>`;
        
        sup.monthly.forEach((val, mIdx) => {
            const isSelected = filter === 'all' || parseInt(filter) === mIdx;
            row += `<td style="${isSelected ? 'background: #f8fafc; font-weight: 600;' : 'opacity: 0.5'}">${formatCurrency(val)}</td>`;
        });
        
        row += `<td>${formatCurrency(sup.total)}</td>`;
        
        // Variation
        let varHtml = '<span class="variation-tag var-neutral">-</span>';
        if (filter === 'all') {
            const last = sup.monthly[sup.monthly.length - 1];
            const prev = sup.monthly[sup.monthly.length - 2] || 0;
            if (prev > 0) {
                const diff = ((last - prev) / prev) * 100;
                const cls = diff > 0 ? 'var-up' : (diff < 0 ? 'var-down' : 'var-neutral');
                varHtml = `<span class="variation-tag ${cls}">${diff > 0 ? '+' : ''}${diff.toFixed(1)}%</span>`;
            } else if (last > 0 && prev === 0) {
                varHtml = `<span class="variation-tag var-up">Novo</span>`;
            }
        } else {
            const mIdx = parseInt(filter);
            if (mIdx > 0) {
                const curr = sup.monthly[mIdx];
                const prev = sup.monthly[mIdx - 1];
                if (prev > 0) {
                    const diff = ((curr - prev) / prev) * 100;
                    const cls = diff > 0 ? 'var-up' : (diff < 0 ? 'var-down' : 'var-neutral');
                    varHtml = `<span class="variation-tag ${cls}">${diff > 0 ? '+' : ''}${diff.toFixed(1)}%</span>`;
                } else if (curr > 0 && prev === 0) {
                    varHtml = `<span class="variation-tag var-up">Novo</span>`;
                }
            }
        }
        
        row += `<td>${varHtml}</td></tr>`;
        body.innerHTML += row;
    });
}

function initTabs() {
    const links = document.querySelectorAll('.nav-link');
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = link.getAttribute('data-tab');
            showTab(tabId);
        });
    });
}

function showTab(tabId) {
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
}

function updateDetailTab() {
    const data = FINANCEIRO_DATA;
    if (!data.raw_transactions) return;
    
    const monthBoxes = Array.from(document.querySelectorAll('#filter-months input:checked')).map(cb => cb.value);
    const catBoxes = Array.from(document.querySelectorAll('#filter-categories input:checked')).map(cb => cb.value);
    const supBoxes = Array.from(document.querySelectorAll('#filter-suppliers input:checked')).map(cb => cb.value);
    
    const selectedMonths = new Set(monthBoxes);
    const selectedCats = new Set(catBoxes);
    const selectedSups = new Set(supBoxes);

    const body = document.getElementById('table-detail-body');
    const foot = document.getElementById('table-detail-foot');

    if (!body || !foot) return;

    body.innerHTML = '';
    let total = 0;

    const filtered = data.raw_transactions.filter(t => {
        return selectedMonths.has(t.month) && selectedCats.has(t.category) && selectedSups.has(t.supplier);
    });

    filtered.forEach(t => {
        total += t.value;
        const row = `<tr>
            <td>${t.date}</td>
            <td><strong>${t.supplier}</strong></td>
            <td><span class="category-tag">${t.category}</span></td>
            <td>${formatCurrency(t.value)}</td>
            <td>${t.method}</td>
        </tr>`;
        body.innerHTML += row;
    });

    foot.innerHTML = `<tr>
        <td colspan="3" style="text-align:right"><strong>Total:</strong></td>
        <td colspan="2"><strong>${formatCurrency(total)}</strong></td>
    </tr>`;
}

function toggleAllCheckboxes(containerId, state) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        if (cb.closest('label').style.display !== 'none') {
            cb.checked = state;
        }
    });
    updateDetailTab();
}

function filterSupplierList() {
    const search = document.getElementById('search-supplier').value.toLowerCase();
    const items = document.querySelectorAll('#filter-suppliers .supplier-item');
    items.forEach(item => {
        const text = item.querySelector('.sup-name').innerText.toLowerCase();
        if (text.includes(search)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}
