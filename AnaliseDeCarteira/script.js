let chartEstrategia = null;
let chartClasses = null;
let currentPortfolio = {};
let totalPatrimonio = 0;

// 1. Mapeamento Inteligente (Ajustado)
const mapToSeven = (subclasse, ativo) => {
    const s = subclasse.toLowerCase();
    const a = ativo.toUpperCase();
    
    if (a.includes("IVVB11") || a.includes("NASD11") || a.includes("WRLD11") || a.includes("BNDX11")) return "Renda Variavel Global";
    if (s.includes("ações") || s.includes("variável brasil")) return "Renda Variavel Brasil";
    if (s.includes("pós-fixado") || s.includes("inflação") || s.includes("fixa")) return "Renda Fixa Brasil";
    if (s.includes("multimercado")) return "Multimercado";
    if (s.includes("alternativo") || s.includes("fii")) return "Alternativo";
    if (s.includes("caixa") || s.includes("disponível")) return "Caixa";
    
    return "Caixa"; 
};

const norm = (txt) => txt ? txt.toString().replace(/\s+/g, ' ').trim() : "";

async function processarPlanilha() {
    const file = document.getElementById('excelFile').files[0];
    if (!file) return alert("Selecione o arquivo Excel.");

    const glossary = await loadGlossary().catch(() => ({}));
    const reader = new FileReader();

    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
        analisarCarteira(matrix, glossary);
    };
    reader.readAsArrayBuffer(file);
}

function analisarCarteira(matrix, glossary) {
    const estrategiaMap = { "Renda Variavel Brasil": 0, "Renda Fixa Brasil": 0, "Multimercado": 0, "Renda Variavel Global": 0, "Renda Fixa Global": 0, "Alternativo": 0, "Caixa": 0 };
    const classesMap = {};
    const detalheMap = {};
    
    totalPatrimonio = 0;
    let currentXpCategory = "Caixa";

    // Capturar Número da Conta
    matrix.forEach(row => {
        if(!row) return;
        row.forEach(cell => {
            if (cell && cell.toString().includes("Conta:")) {
                const match = cell.toString().match(/Conta:\s?(\d+)/);
                if (match) document.getElementById('clientName').innerText = match[1];
            }
        });
    });

    matrix.forEach(row => {
        if (!row || !row[0]) return;
        const rawName = row[0].toString();
        const cellA = norm(rawName);

        if (cellA.includes("|")) {
            currentXpCategory = cellA.split("|")[1].trim();
            return;
        }

        if (cellA === "Ativo" || cellA.includes("Posição") || cellA === "") return;

        let valor = (currentXpCategory === "Ações") ? cleanV(row[11]) : cleanV(row[5]);

        if (valor > 1) {
            // LÓGICA DE DECISÃO COM LOGS
            let topico = glossary[cellA];
            if (topico) {
                console.log(`%c[GLOSSÁRIO] ${cellA} -> ${topico}`, "color: #10b981; font-weight: bold;");
            } else {
                topico = mapToSeven(currentXpCategory, cellA);
                console.log(`[SISTEMA] ${cellA} (Subclasse: ${currentXpCategory}) -> ${topico}`);
            }
            
            estrategiaMap[topico] = (estrategiaMap[topico] || 0) + valor;
            classesMap[currentXpCategory] = (classesMap[currentXpCategory] || 0) + valor;

            if (!detalheMap[topico]) detalheMap[topico] = { total: 0, assets: [] };
            detalheMap[topico].total += valor;
            detalheMap[topico].assets.push({ nome: cellA, valor: valor });

            totalPatrimonio += valor;
        }
    });

    // Saldo em Conta
    const saldoRow = matrix.find(r => r && r[0] && r[0].toString().includes("Saldo Projetado"));
    if (saldoRow) {
        const saldoVal = cleanV(saldoRow[11] || saldoRow[10]);
        estrategiaMap["Caixa"] += saldoVal;
        classesMap["Saldo em Conta"] = (classesMap["Saldo em Conta"] || 0) + saldoVal;
        
        if (!detalheMap["Caixa"]) detalheMap["Caixa"] = { total: 0, assets: [] };
        detalheMap["Caixa"].total += saldoVal;
        detalheMap["Caixa"].assets.push({ nome: "Saldo Disponível", valor: saldoVal });
        totalPatrimonio += saldoVal;
    }

    renderDashboard(estrategiaMap, classesMap, detalheMap);
}

function renderDashboard(estrategia, classes, detalhe) {
    document.getElementById('txtTotal').innerText = `R$ ${totalPatrimonio.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;

    const labels1 = Object.keys(estrategia).filter(k => estrategia[k] > 0);
    const data1 = labels1.map(k => ((estrategia[k] / totalPatrimonio) * 100).toFixed(1));
    chartEstrategia = updateChartUI('chartEstrategia', chartEstrategia, labels1, data1);

    const labels2 = Object.keys(classes);
    const data2 = labels2.map(k => ((classes[k] / totalPatrimonio) * 100).toFixed(1));
    chartClasses = updateChartUI('chartClasses', chartClasses, labels2, data2);

    renderRebalanceTable(estrategia);
    renderAssetAccordion(detalhe);
}

function renderRebalanceTable(dataMap) {
    const body = document.getElementById('rebalanceBody');
    body.innerHTML = "";
    
    Object.keys(dataMap).forEach(cat => {
        const targetInput = document.querySelector(`.target-input[data-cat="${cat}"]`);
        if (!targetInput) return;

        const targetPerc = parseFloat(targetInput.value) || 0;
        const valorAtual = dataMap[cat] || 0;
        const atualPerc = (valorAtual / totalPatrimonio) * 100;
        
        const diff = ((targetPerc / 100) * totalPatrimonio) - valorAtual;

        if (targetPerc > 0 || valorAtual > 0) {
            body.innerHTML += `
                <tr>
                    <td><strong>${cat}</strong></td>
                    <td>${atualPerc.toFixed(1)}%</td>
                    <td>${targetPerc}%</td>
                    <td class="${diff >= 0 ? 'buy' : 'sell'}">
                        ${diff >= 0 ? '▲ Aportar' : '▼ Retirar'} R$ ${Math.abs(diff).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                    </td>
                </tr>`;
        }
    });
}

function renderAssetAccordion(detalhe) {
    const container = document.getElementById('accordionAtivos');
    container.innerHTML = "<h3 style='margin-bottom:15px'>Detalhamento por Ativo</h3>";
    
    const sortedCats = Object.keys(detalhe).sort((a, b) => detalhe[b].total - detalhe[a].total);

    sortedCats.forEach(cat => {
        container.innerHTML += `
            <div class="acc-item">
                <div class="acc-header" onclick="toggleAcc(this)">
                    <span>${cat}</span>
                    <span style="color:#c5a059">R$ ${detalhe[cat].total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                </div>
                <div class="acc-content">
                    <table class="data-table">
                        ${detalhe[cat].assets.map(a => `
                            <tr>
                                <td>${a.nome}</td>
                                <td style="text-align:right; font-weight:bold">R$ ${a.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                            </tr>
                        `).join('')}
                    </table>
                </div>
            </div>`;
    });
}

function cleanV(v) {
    if (v === undefined || v === null) return 0;
    if (typeof v === 'number') return v;
    return parseFloat(v.toString().replace('R$', '').replace(/\./g, '').replace(',', '.').trim()) || 0;
}

function updateChartUI(canvasId, instance, labels, data) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    if (instance) instance.destroy();
    return new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels.map((l, i) => `${l} (${data[i]}%)`),
            datasets: [{
                data: data,
                backgroundColor: ['#1b4043', '#2a5d61', '#3d7a7e', '#52979b', '#6bb5b9', '#8fc9cc', '#aed9db'],
                borderWidth: 0
            }]
        },
        options: {
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } }
        }
    });
}

function toggleAcc(el) {
    const content = el.nextElementSibling;
    content.style.display = content.style.display === 'block' ? 'none' : 'block';
}

async function loadGlossary() {
    const file = document.getElementById('glossaryFile').files[0];
    if (!file) return {};
    const text = await file.text();
    const dict = {};
    text.split('\n').forEach(l => {
        if (!l.trim() || l.startsWith('=') || l.startsWith('#')) return;
        const p = l.split(';');
        if(p.length === 2) {
            const ativoGlossario = norm(p[0]);
            dict[ativoGlossario] = p[1].trim();
        }
    });
    return dict;
}
// Detectar quando o Excel é carregado
document.getElementById('excelFile').addEventListener('change', function() {
    if (this.files.length > 0) {
        const label = document.querySelector('label[for="excelFile"]');
        label.classList.add('loaded');
        label.innerText = "Relatório Carregado";
    }
});

// Detectar quando o Glossário é carregado
document.getElementById('glossaryFile').addEventListener('change', function() {
    if (this.files.length > 0) {
        const label = document.querySelector('label[for="glossaryFile"]');
        label.classList.add('loaded');
        label.innerText = "Glossário Carregado";
    }
});