let chartEstrategia = null;
let chartSubclasses = null;
let currentPortfolio = {};
let totalPatrimonio = 0;

// 1. Mapeamento Inteligente
const mapToSeven = (subclasseXp, ativo) => {
    const s = subclasseXp.toLowerCase();
    const a = ativo.toUpperCase();
    
    const categoriasBase = ["Renda Variavel Brasil", "Renda Fixa Brasil", "Multimercado", "Renda Variavel Global", "Renda Fixa Global", "Alternativo", "Caixa"];
    if (categoriasBase.some(c => c.toLowerCase() === s)) {
        return categoriasBase.find(c => c.toLowerCase() === s);
    }

    if (a.includes("IVVB11") || a.includes("NASD11") || a.includes("WRLD11") || a.includes("BNDX11")) return "Renda Variavel Global";
    if (s.includes("ações") || s.includes("variável brasil") || s.includes("renda variável")) return "Renda Variavel Brasil";
    // "Prefixada" contém "fixa", o que ajuda no mapeamento automático
    if (s.includes("pós-fixado") || s.includes("inflação") || s.includes("fixa") || s.includes("prefixada")) return "Renda Fixa Brasil";
    if (s.includes("multimercado")) return "Multimercado";
    if (s.includes("alternativo") || s.includes("fii") || s.includes("imobiliário")) return "Alternativo";
    return "Caixa"; 
};

const norm = (txt) => txt ? txt.toString().replace(/\s+/g, ' ').trim() : "";

async function processarPlanilha() {
    const file = document.getElementById('excelFile').files[0];
    if (!file) return alert("Selecione o arquivo Excel da XP.");

    const glossary = await loadGlossaryExcel().catch(() => ({}));
    const reader = new FileReader();

    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
        analisarCarteira(matrix, glossary);
    };
    reader.readAsArrayBuffer(file);
}

async function loadGlossaryExcel() {
    const file = document.getElementById('glossaryFile').files[0];
    if (!file) return {};
    
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet);
            
            const dict = {};
            json.forEach(row => {
                const ativo = norm(row["Ativos"] || row["ATIVOS"] || row["Ativo"]);
                const classe = row["Classe"] || row["CLASSE"];
                if (ativo) {
                    dict[ativo] = {
                        cat: classe ? classe.toString().trim() : "",
                        sub: row["Subclasse"] || "Outros"
                    };
                }
            });
            resolve(dict);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function analisarCarteira(matrix, glossary) {
    const estrategiaMap = { "Renda Variavel Brasil": 0, "Renda Fixa Brasil": 0, "Multimercado": 0, "Renda Variavel Global": 0, "Renda Fixa Global": 0, "Alternativo": 0, "Caixa": 0 };
    const subclassesMap = {};
    const detalheMap = {};
    
    totalPatrimonio = 0;
    let currentXpCategory = "Caixa";
    let colPosicaoIdx = -1;

    const ignorarCategorias = ["Proventos", "Aluguel", "Custódia remunerada", "Garantias"];

    matrix.forEach(row => {
        if(!row || row.length === 0) return;
        
        // 1. Detectar Categoria (procura em qualquer célula, geralmente na primeira)
        const catCell = row.find(c => c && c.toString().includes("|"));
        if (catCell) {
            currentXpCategory = catCell.toString().split("|")[1].trim();
            // NÃO damos return aqui, pois a mesma linha pode conter os títulos das colunas
        }

        const rowStr = row.map(c => norm(c));

        // 2. Localizar coluna de Valor (Posição / Financeiro / Valor aplicado)
        const foundValueIdx = rowStr.findIndex(c => 
            ["Posição", "Valor líquido", "Financeiro", "Valor aplicado"].includes(c)
        );

        if (foundValueIdx !== -1) {
            colPosicaoIdx = foundValueIdx;
            return; // Linha de cabeçalho identificada, passamos para a próxima (que é dado)
        }

        // 3. Ignorar seções desnecessárias
        if (ignorarCategorias.some(cat => currentXpCategory.includes(cat))) return;

        // 4. Processar Ativo
        if (colPosicaoIdx !== -1) {
            const nomeAtivo = norm(row[0]);
            const valor = cleanV(row[colPosicaoIdx]);

            // Filtrar palavras que são cabeçalhos ou ruído
            const headerKeywords = ["Ativo", "Aplicação", "Papel", "Produto", "Fundo", "Data cota"];
            
            if (nomeAtivo && !headerKeywords.includes(nomeAtivo) && !nomeAtivo.includes("|") && valor > 0.01) {
                const gData = glossary[nomeAtivo];
                const topico = (gData && gData.cat) ? gData.cat : mapToSeven(currentXpCategory, nomeAtivo);
                const sub = (gData && gData.sub !== "Outros") ? gData.sub : currentXpCategory;

                estrategiaMap[topico] = (estrategiaMap[topico] || 0) + valor;
                subclassesMap[sub] = (subclassesMap[sub] || 0) + valor;

                if (!detalheMap[topico]) detalheMap[topico] = { total: 0, assets: [] };
                detalheMap[topico].total += valor;
                detalheMap[topico].assets.push({ nome: nomeAtivo, valor: valor });

                totalPatrimonio += valor;
            }
        }
    });

    // Saldo em Conta / Projetado
    const saldoRow = matrix.find(r => r && r[0] && r[0].toString().includes("Saldo projetado"));
    if (saldoRow) {
        const saldoVal = cleanV(saldoRow[11] || saldoRow[10] || saldoRow[2]);
        if (saldoVal > 0) {
            estrategiaMap["Caixa"] += saldoVal;
            totalPatrimonio += saldoVal;
        }
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
    chartEstrategia = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels.map((l, i) => `${l} (${data[i]}%)`),
            datasets: [{
                data: data,
                backgroundColor: ['#FF0000', '#0000FF', '#008000', '#FFFF00', '#FFA500', '#800080', '#00FFFF'],
                borderWidth: 0
            }]
        },
        options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

function renderSubclassChart(subclasses) {
    const ctx = document.getElementById('chartSubclasses').getContext('2d');
    if (chartSubclasses) chartSubclasses.destroy();
    chartSubclasses = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(subclasses),
            datasets: [{ label: 'Volume R$', data: Object.values(subclasses), backgroundColor: '#1b4043' }]
        },
        options: { indexAxis: 'y', maintainAspectRatio: false }
    });
}

function renderRebalanceTable(estrategia, aporteTotal, totalFuturo) {
    const body = document.getElementById('rebalanceBody');
    const summary = document.getElementById('aporteSummary');
    body.innerHTML = "";
    
    Object.keys(estrategia).forEach(cat => {
        const targetInput = document.querySelector(`.target-input[data-cat="${cat}"]`);
        if (!targetInput) return;
        const targetPerc = parseFloat(targetInput.value) || 0;
        const valorAtual = estrategia[cat] || 0;
        const atualPerc = (valorAtual / (totalPatrimonio || 1)) * 100;
        const valorIdealComAporte = (targetPerc / 100) * totalFuturo;
        const diff = valorIdealComAporte - valorAtual;

        let htmlAcao = "";
        if (diff > 0.01) {
            htmlAcao = aporteTotal > 0 ? `<span class="badge badge-aporte">APORTE</span>` : `<span class="badge badge-ajuste">AJUSTE</span>`;
            htmlAcao += ` <span class="action-text">Alocar <strong>R$ ${diff.toLocaleString('pt-BR')}</strong></span>`;
        } else if (diff < -0.01) {
            htmlAcao = `<span class="badge badge-venda">EXCEDENTE</span> <span class="action-text">Reduzir <strong>R$ ${Math.abs(diff).toLocaleString('pt-BR')}</strong></span>`;
        } else { htmlAcao = "✓ OK"; }

        body.innerHTML += `<tr><td><strong>${cat}</strong></td><td>${atualPerc.toFixed(1)}%</td><td>${targetPerc}%</td><td>${htmlAcao}</td></tr>`;
    });
}

function renderAssetAccordion(detalhe) {
    const container = document.getElementById('accordionAtivos');
    container.innerHTML = "<h3>Detalhamento por Ativo</h3>";
    const sortedCats = Object.keys(detalhe).sort((a, b) => detalhe[b].total - detalhe[a].total);
    sortedCats.forEach(cat => {
        container.innerHTML += `<div class="acc-item"><div class="acc-header" onclick="toggleAcc(this)"><span>${cat}</span><span style="color:#c5a059">R$ ${detalhe[cat].total.toLocaleString('pt-BR')}</span></div><div class="acc-content"><table class="data-table">${detalhe[cat].assets.map(a => `<tr><td>${a.nome}</td><td style="text-align:right">R$ ${a.valor.toLocaleString('pt-BR')}</td></tr>`).join('')}</table></div></div>`;
    });
}

function cleanV(v) {
    if (v === undefined || v === null) return 0;
    if (typeof v === 'number') return v;
    let s = v.toString().replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
    return parseFloat(s) || 0;
}

function toggleAcc(el) {
    const content = el.nextElementSibling;
    content.style.display = content.style.display === 'block' ? 'none' : 'block';
}

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