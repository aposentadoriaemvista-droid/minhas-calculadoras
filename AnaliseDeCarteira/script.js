let chartEstrategia = null;
let chartSubclasses = null;
let currentPortfolio = {};
let totalPatrimonio = 0;

// 1. Mapeamento Inteligente
const mapToSeven = (subclasseXp, ativo) => {
    const s = subclasseXp.toLowerCase();
    const a = ativo.toUpperCase();
    if (a.includes("IVVB11") || a.includes("NASD11") || a.includes("WRLD11") || a.includes("BNDX11")) return "Renda Variavel Global";
    if (s.includes("ações") || s.includes("variável brasil")) return "Renda Variavel Brasil";
    if (s.includes("pós-fixado") || s.includes("inflação") || s.includes("fixa")) return "Renda Fixa Brasil";
    if (s.includes("multimercado")) return "Multimercado";
    if (s.includes("alternativo") || s.includes("fii")) return "Alternativo";
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
    const subclassesMap = {};
    const detalheMap = {};
    
    totalPatrimonio = 0;
    let currentXpCategory = "Caixa";

    // Captura Número da Conta
    matrix.forEach(row => {
        if(!row) return;
        row.forEach(cell => {
            if (cell && cell.toString().includes("Conta:")) {
                const match = cell.toString().match(/Conta:\s?(\d+)/);
                if (match && document.getElementById('clientName')) {
                    document.getElementById('clientName').innerText = match[1];
                }
            }
        });
    });

    matrix.forEach(row => {
        if (!row || !row[0]) return;
        const cellA = norm(row[0]);

        if (cellA.includes("|")) {
            currentXpCategory = cellA.split("|")[1].trim();
            return;
        }

        if (cellA === "Ativo" || cellA.includes("Posição") || cellA === "") return;

        let valor = (currentXpCategory === "Ações") ? cleanV(row[11]) : cleanV(row[5]);

        if (valor > 1) {
            const gData = glossary[cellA];
            const topico = gData ? gData.cat : mapToSeven(currentXpCategory, cellA);
            const sub = gData ? gData.sub : "Outros";

            estrategiaMap[topico] = (estrategiaMap[topico] || 0) + valor;
            subclassesMap[sub] = (subclassesMap[sub] || 0) + valor;

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
        totalPatrimonio += saldoVal;
    }

    renderDashboard(estrategiaMap, subclassesMap, detalheMap);
}

function renderDashboard(estrategia, subclasses, detalhe) {
    const valorAporte = parseFloat(document.getElementById('valorAporte').value) || 0;
    const totalFuturo = totalPatrimonio + valorAporte;

    document.getElementById('txtTotal').innerText = `R$ ${totalPatrimonio.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;

    const labels1 = Object.keys(estrategia).filter(k => estrategia[k] > 0);
    const data1 = labels1.map(k => ((estrategia[k] / totalPatrimonio) * 100).toFixed(1));
    
    renderEstrategiaChart(labels1, data1);
    renderSubclassChart(subclasses);
    renderRebalanceTable(estrategia, valorAporte, totalFuturo);
    renderAssetAccordion(detalhe);
}

function renderEstrategiaChart(labels, data) {
    const ctx = document.getElementById('chartEstrategia').getContext('2d');
    if (chartEstrategia) chartEstrategia.destroy();
    
    // Cores Primárias e vibrantes para facilitar a leitura
    const primaryColors = ['#FF0000', '#0000FF', '#008000', '#FFFF00', '#FFA500', '#800080', '#00FFFF'];

    chartEstrategia = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels.map((l, i) => `${l} (${data[i]}%)`),
            datasets: [{
                data: data,
                backgroundColor: primaryColors,
                borderWidth: 0
            }]
        },
        options: {
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } }
        }
    });
}

function renderSubclassChart(subclasses) {
    const ctx = document.getElementById('chartSubclasses').getContext('2d');
    if (chartSubclasses) chartSubclasses.destroy();

    const labels = Object.keys(subclasses);
    const values = labels.map(l => subclasses[l]);

    chartSubclasses = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Volume R$',
                data: values,
                backgroundColor: '#1b4043'
            }]
        },
        options: {
            indexAxis: 'y',
            maintainAspectRatio: false,
            scales: { x: { beginAtZero: true } }
        }
    });
}

function renderRebalanceTable(estrategia, aporteTotal, totalFuturo) {
    const body = document.getElementById('rebalanceBody');
    const summary = document.getElementById('aporteSummary');
    body.innerHTML = "";
    
    let totalDistribuidoAporte = 0;

    Object.keys(estrategia).forEach(cat => {
        const targetInput = document.querySelector(`.target-input[data-cat="${cat}"]`);
        if (!targetInput) return;

        const targetPerc = parseFloat(targetInput.value) || 0;
        const valorAtual = estrategia[cat] || 0;
        const atualPerc = (valorAtual / totalPatrimonio) * 100;
        
        const valorIdealComAporte = (targetPerc / 100) * totalFuturo;
        const gapTotal = valorIdealComAporte - valorAtual;

        let htmlAcao = "";

        if (gapTotal > 0) {
            // Se falta dinheiro na categoria
            if (aporteTotal > 0) {
                // Se existe aporte, calculamos quanto do aporte vai para aqui
                // (Para simplificar, distribuímos o aporte proporcionalmente ao gap)
                // Aqui você pode ser mais complexo, mas vamos no direto:
                htmlAcao += `<span class="badge badge-aporte">APORTE</span>`;
                htmlAcao += `<span class="action-text">Alocar <strong>R$ ${gapTotal.toLocaleString('pt-BR')}</strong> do capital novo.</span>`;
            } else {
                htmlAcao += `<span class="badge badge-ajuste">REBALANCEAR</span>`;
                htmlAcao += `<span class="action-text">Comprar <strong>R$ ${gapTotal.toLocaleString('pt-BR')}</strong> (Capital interno).</span>`;
            }
        } else if (gapTotal < 0) {
            // Se sobra dinheiro na categoria
            htmlAcao += `<span class="badge badge-venda">EXCEDENTE</span>`;
            htmlAcao += `<span class="action-text">Reduzir/Vender <strong>R$ ${Math.abs(gapTotal).toLocaleString('pt-BR')}</strong>.</span>`;
        } else {
            htmlAcao = "✓ Em conformidade";
        }

        if (targetPerc > 0 || valorAtual > 0) {
            body.innerHTML += `
                <tr>
                    <td><strong>${cat}</strong></td>
                    <td>${atualPerc.toFixed(1)}%</td>
                    <td>${targetPerc}%</td>
                    <td>${htmlAcao}</td>
                </tr>`;
        }
    });

    if (aporteTotal > 0) {
        summary.innerHTML = `<strong>Resumo do Aporte:</strong> Você tem <strong>R$ ${aporteTotal.toLocaleString('pt-BR')}</strong> para distribuir. O plano acima mostra como injetar esse valor para atingir o equilíbrio ideal sem necessariamente precisar vender outros ativos.`;
    } else {
        summary.innerHTML = `<strong>Dica:</strong> Insira um valor em "Simulação de Aporte" para ver como o capital novo pode ajudar a equilibrar a carteira sem gerar vendas.`;
    }
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
                    <span style="color:#c5a059">R$ ${detalhe[cat].total.toLocaleString('pt-BR')}</span>
                </div>
                <div class="acc-content">
                    <table class="data-table">
                        ${detalhe[cat].assets.map(a => `<tr><td>${a.nome}</td><td style="text-align:right">R$ ${a.valor.toLocaleString('pt-BR')}</td></tr>`).join('')}
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
        if(p.length >= 2) {
            dict[norm(p[0])] = {
                cat: p[1].trim(),
                sub: p[2] ? p[2].trim() : "Outros"
            };
        }
    });
    return dict;
}

// Eventos de Sucesso nos botões
document.getElementById('excelFile').addEventListener('change', function() {
    if (this.files.length > 0) {
        document.querySelector('label[for="excelFile"]').classList.add('loaded');
        document.querySelector('label[for="excelFile"]').innerText = "✓ Planilha OK";
    }
});
document.getElementById('glossaryFile').addEventListener('change', function() {
    if (this.files.length > 0) {
        document.querySelector('label[for="glossaryFile"]').classList.add('loaded');
        document.querySelector('label[for="glossaryFile"]').innerText = "✓ Glossário OK";
    }
});