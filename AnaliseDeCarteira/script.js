let chartEstrategia = null;
let chartSubclasses = null;
let chartSimulacao = null;
let currentPortfolio = {}; // Guardará a foto da carteira para a simulação
let totalPatrimonio = 0;
let chartSimEstrategia = null;
let chartSimSubclasses = null;
let globalDetalheMap = {}; // Guardará os ativos atuais
let globalSubclassesMap = {};


// 1. Mapeamento Inteligente com 8 Categorias
const mapToSeven = (subclasseXp, ativo) => {
    const s = subclasseXp.toLowerCase();
    const a = ativo.toUpperCase();
    
    if (s.includes("fii") || s.includes("imobiliário") || s.includes("listados")) {
        return "Fundos Imobiliários";
    }

    const categoriasBase = ["Renda Variavel Brasil", "Renda Fixa Brasil", "Multimercado", "Renda Variavel Global", "Renda Fixa Global", "Alternativo", "Caixa"];
    if (categoriasBase.some(c => c.toLowerCase() === s)) {
        return categoriasBase.find(c => c.toLowerCase() === s);
    }

    if (a.includes("IVVB11") || a.includes("NASD11") || a.includes("WRLD11") || a.includes("BNDX11")) return "Renda Variavel Global";
    if (s.includes("ações") || s.includes("variável brasil") || s.includes("renda variável")) return "Renda Variavel Brasil";
    if (s.includes("pós-fixado") || s.includes("inflação") || s.includes("fixa") || s.includes("renda fixa") || s.includes("prefixada")) return "Renda Fixa Brasil";
    if (s.includes("multimercado")) return "Multimercado";
    if (s.includes("alternativo")) return "Alternativo";
    return "Caixa"; 
};

const norm = (txt) => txt ? txt.toString().replace(/\s+/g, ' ').trim() : "";

async function processarPlanilha() {
    const file = document.getElementById('excelFile').files[0];
    if (!file) return alert("Selecione o arquivo Excel da XP.");

    const glossary = await  loadGlossaryFromDrive().catch(() => ({}));
    const reader = new FileReader();

    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
        analisarCarteira(matrix, glossary);
    };
    reader.readAsArrayBuffer(file);
}

async function loadGlossaryFromDrive() {
    // COLE AQUI O LINK CSV DA SUA PLANILHA (Publicada na Web)
    const urlDrive = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQwj0rEui2phiCxHiXMKh6mR-X2q0VkUQMUgWBNslaYnYuQs3rEfuyuiebd8drxq9n1ZzC_dVnQXVAe/pub?output=csv";

    try {
        const response = await fetch(urlDrive);
        const data = await response.arrayBuffer();
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
                    subclasse: row["Subclasse"] || row["SUBCLASSE"] || "Outros"
                };
            }
        });
        console.log("Glossário online carregado com sucesso!");
        return dict;
    } catch (error) {
        console.error("Erro ao carregar glossário online:", error);
        alert("Não foi possível carregar o glossário online. Verifique o link ou a conexão.");
        return {};
    }
}

function analisarCarteira(matrix, glossary) {
    const estrategiaMap = { 
        "Renda Variavel Brasil": 0, "Renda Fixa Brasil": 0, "Multimercado": 0, 
        "Renda Variavel Global": 0, "Renda Fixa Global": 0, "Alternativo": 0, 
        "Fundos Imobiliários": 0, "Caixa": 0 
    };
    const subclassesMap = {};
    const detalheMap = {};
    totalPatrimonio = 0;
    let currentXpCategory = "Caixa";
    let colPosicaoIdx = -1;

    matrix.forEach(row => {
        if(!row || row.length === 0) return;
        const rowStr = row.map(c => norm(c));

        const tituloSeccao = row.find(c => c && c.toString().includes("|"));
        if (tituloSeccao) {
            currentXpCategory = tituloSeccao.toString().split("|")[1].trim();
        }

        const headValor = ["Posição", "Posição a mercado", "Valor líquido", "Financeiro", "Valor aplicado", "Provisionado"];
        let foundValor = -1;
        for (let v of headValor) {
            let idx = rowStr.indexOf(v);
            if (idx !== -1) { foundValor = idx; break; }
        }

        if (foundValor !== -1) {
            colPosicaoIdx = foundValor;
            return;
        }

        const lowCat = currentXpCategory.toLowerCase();
        if (lowCat.includes("proventos") || lowCat.includes("custódia") || lowCat.includes("distribuições")) return;

        if (colPosicaoIdx !== -1) {
            const nomeAtivo = norm(row[0]);
            const valor = cleanV(row[colPosicaoIdx]);
            const noise = ["Ativo", "Aplicação", "Papel", "Produto", "Fundo", "Data cota", "Total", "Subtotal"];
            
            if (nomeAtivo && valor > 0.01 && !noise.includes(nomeAtivo) && !nomeAtivo.includes("|")) {
                const gData = glossary[nomeAtivo];
                const topico = (gData && typeof gData === 'object') ? gData.cat : mapToSeven(currentXpCategory, nomeAtivo);
                const subclasseNome = (gData && typeof gData === 'object' && gData.subclasse) ? gData.subclasse : currentXpCategory;

                estrategiaMap[topico] += valor;
                totalPatrimonio += valor;
                subclassesMap[subclasseNome] = (subclassesMap[subclasseNome] || 0) + valor;

                if (!detalheMap[topico]) detalheMap[topico] = { total: 0, assets: [] };
                detalheMap[topico].total += valor;
                detalheMap[topico].assets.push({ 
                nome: nomeAtivo, 
                valor: valor, 
                sub: (gData && typeof gData === 'object' && gData.subclasse) ? gData.subclasse : currentXpCategory 
});
            }
        }
    });

    // Captura de Saldo Projetado
    const headerRow = matrix.find(r => r && r.some(c => norm(c) === "Saldo projetado"));
    if (headerRow) {
        const colSaldoIdx = headerRow.findIndex(c => norm(c) === "Saldo projetado");
        const valorRow = matrix[matrix.indexOf(headerRow) + 1];
        if (valorRow) {
            const saldoVal = cleanV(valorRow[colSaldoIdx]);
            estrategiaMap["Caixa"] += saldoVal;
            totalPatrimonio += saldoVal;
        }
    }

    // SALVA A CARTEIRA ATUAL PARA A SIMULAÇÃO
    currentPortfolio = { ...estrategiaMap };
    
    renderDashboard(estrategiaMap, subclassesMap, detalheMap);
}

function renderDashboard(estrategia, subclasses, detalhe) {
    const valorAporte = parseFloat(document.getElementById('valorAporte').value) || 0;
    const totalFuturo = totalPatrimonio + valorAporte;
    document.getElementById('txtTotal').innerText = `R$ ${totalPatrimonio.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;

    const labels1 = Object.keys(estrategia).filter(k => estrategia[k] > 0);
    const data1 = labels1.map(k => ((estrategia[k] / (totalPatrimonio || 1)) * 100).toFixed(1));
    
    renderEstrategiaChart(labels1, data1);
    renderSubclassChart(subclasses);
    renderRebalanceTable(estrategia, valorAporte, totalFuturo);
    renderAssetAccordion(detalhe);
    
    // ATIVA A SIMULAÇÃO INTERATIVA
    renderInteractiveSimulation(estrategia);
}

function renderEstrategiaChart(labels, data) {
    const ctx1 = document.getElementById('chartEstrategia').getContext('2d');
    if (chartEstrategia) chartEstrategia.destroy();
    chartEstrategia = new Chart(ctx1, {
        type: 'doughnut',
        data: {
            labels: labels.map((l, i) => `${l} (${data[i]}%)`),
            datasets: [{
                data: data,
                backgroundColor: ['#FF0000', '#0000FF', '#008000', '#FFFF00', '#FFA500', '#800080', '#00FFFF', '#FF00FF'],
                borderWidth: 0
            }]
        },
        options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

function renderSubclassChart(subclasses) {
    const ctx = document.getElementById('chartSubclasses').getContext('2d');
    if (chartSubclasses) chartSubclasses.destroy();

    // Criamos os labels já com a porcentagem calculada
    const labelsComPerc = Object.keys(subclasses).map(k => {
        const perc = ((subclasses[k] / totalPatrimonio) * 100).toFixed(1);
        return `${k} (${perc}%)`;
    });

    chartSubclasses = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labelsComPerc, // Usamos os novos labels aqui
            datasets: [{ 
                label: 'Volume R$', 
                data: Object.values(subclasses), 
                backgroundColor: '#1b4043' 
            }]
        },
        options: { 
            indexAxis: 'y', 
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (ctx) => `R$ ${ctx.parsed.x.toLocaleString('pt-BR')}`
                    }
                }
            }
        }
    });
}
function renderRebalanceTable(estrategia, aporteTotal, totalFuturo) {
    const body = document.getElementById('rebalanceBody');
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

// AJUSTE: Atualize a função renderAssetAccordion para incluir o botão de lixeira
function renderAssetAccordion(detalhe) {
    globalDetalheMap = detalhe; // Salva para uso global
    const container = document.getElementById('accordionAtivos');
    container.innerHTML = "<h3>Detalhamento por Ativo</h3>";
    
    const sortedCats = Object.keys(detalhe).sort((a, b) => detalhe[b].total - detalhe[a].total);
    
    sortedCats.forEach(cat => {
        if (detalhe[cat].total <= 0) return;
        
        let assetsHtml = detalhe[cat].assets.map((a, index) => `
            <tr>
                <td>${a.nome}</td>
                <td style="text-align:right">
                    R$ ${a.valor.toLocaleString('pt-BR')}
                    <button class="btn-delete" onclick="excluirAtivo('${cat}', ${index})">×</button>
                </td>
            </tr>
        `).join('');

        container.innerHTML += `
            <div class="acc-item">
                <div class="acc-header" onclick="toggleAcc(this)">
                    <span>${cat}</span>
                    <span style="color:#c5a059">R$ ${detalhe[cat].total.toLocaleString('pt-BR')}</span>
                </div>
                <div class="acc-content">
                    <table class="data-table">${assetsHtml}</table>
                </div>
            </div>`;
    });
}
function renderInteractiveSimulation(estrategia) {
    const container = document.getElementById('simSliderContainer');
    if (!container) return;
    container.innerHTML = "";
    
    // Criar um slider para cada uma das 8 categorias
    Object.keys(estrategia).forEach(cat => {
        const div = document.createElement('div');
        div.className = 'sim-slider-row';
        div.innerHTML = `
            <label>${cat} <span class="val-display" id="val-${cat}">R$ 0</span></label>
            <input type="range" class="modern-slider sim-range" 
                   data-cat="${cat}" min="0" max="5000000" step="5000" value="0" 
                   oninput="updateSimulation()">
        `;
        container.appendChild(div);
    });
    updateSimulation();
}

function updateSimulation() {
    const sliders = document.querySelectorAll('.sim-range');
    let aporteSimTotal = 0;
    const novosValores = {};
    const labels = [];
    const baseData = [];
    const simData = [];

    sliders.forEach(slider => {
        const cat = slider.dataset.cat;
        const aporte = parseFloat(slider.value) || 0;
        
        // Atualizar display de texto do slider
        document.getElementById(`val-${cat}`).innerText = `+ R$ ${aporte.toLocaleString('pt-BR')}`;
        
        const valorOriginal = currentPortfolio[cat] || 0;
        const valorFinal = valorOriginal + aporte;
        
        labels.push(cat);
        baseData.push(valorOriginal);
        simData.push(valorFinal);
        aporteSimTotal += aporte;
    });

    const totalSimulado = totalPatrimonio + aporteSimTotal;
    document.getElementById('txtAporteSimulado').innerText = `R$ ${aporteSimTotal.toLocaleString('pt-BR')}`;
    document.getElementById('txtTotalSimulado').innerText = `R$ ${totalSimulado.toLocaleString('pt-BR')}`;

    renderSimComparisonCharts(labels, baseData, simData);
}

function renderSimComparisonCharts(labels, original, simulado) {
    // 1. Gráfico de Barras Vertical (Estratégia)
    const ctx1 = document.getElementById('chartSimEstrategia').getContext('2d');
    if (chartSimEstrategia) chartSimEstrategia.destroy();
    
    chartSimEstrategia = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Atual', data: original, backgroundColor: '#d1d8db' },
                { label: 'Simulado', data: simulado, backgroundColor: '#10b981' }
            ]
        },
        options: {
            maintainAspectRatio: false,
            plugins: { title: { display: true, text: 'Comparativo de Alocação (R$)' } },
            scales: { y: { beginAtZero: true } }
        }
    });

    // 2. Gráfico de Linha (Evolução das Subclasses/Indexadores)
    const ctx2 = document.getElementById('chartSimSubclasses').getContext('2d');
    if (chartSimSubclasses) chartSimSubclasses.destroy();
    
    // Para simplificar a evolução, mostramos o delta de crescimento por categoria
    chartSimSubclasses = new Chart(ctx2, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Curva de Concentração Simulada',
                data: simulado,
                borderColor: '#c5a059',
                backgroundColor: 'rgba(197, 160, 89, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            maintainAspectRatio: false,
            plugins: { title: { display: true, text: 'Curva de Exposição Pós-Aporte' } }
        }
    });
}

// AUXILIARES
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

// Função para Adicionar Manualmente
function adicionarAtivoManual() {
    const nome = document.getElementById('manNome').value;
    const classe = document.getElementById('manClasse').value;
    const sub = document.getElementById('manSub').value || "Manual";
    const valor = parseFloat(document.getElementById('manValor').value) || 0;

    if (!nome || valor <= 0) return alert("Preencha o nome e o valor corretamente.");

    // Adiciona ao mapa de detalhes
    if (!globalDetalheMap[classe]) globalDetalheMap[classe] = { total: 0, assets: [] };
    globalDetalheMap[classe].total += valor;
    globalDetalheMap[classe].assets.push({ nome: nome, valor: valor, sub: sub });

    // Atualiza subclasses
    globalSubclassesMap[sub] = (globalSubclassesMap[sub] || 0) + valor;

    // Recalcula o total geral e atualiza os mapas de estratégia
    recalcularTudoERenderizar();
    
    // Limpa e fecha modal
    document.getElementById('manNome').value = "";
    document.getElementById('manValor').value = "";
    document.getElementById('modalAtivo').style.display = 'none';
}

function excluirAtivo(classe, index) {
    if (!confirm("Deseja realmente excluir este ativo?")) return;

    // Remove do detalhe global
    globalDetalheMap[classe].assets.splice(index, 1);
    
    // Recalcula o total da categoria
    globalDetalheMap[classe].total = globalDetalheMap[classe].assets.reduce((sum, a) => sum + a.valor, 0);

    // Se a categoria ficou vazia, podemos zerar o total dela
    if (globalDetalheMap[classe].assets.length === 0) {
        globalDetalheMap[classe].total = 0;
    }

    recalcularTudoERenderizar();
}

// Função de Recálculo Total (Reconstrói estratégia e subclasses do zero)
function recalcularTudoERenderizar() {
    const novaEstrategia = { 
        "Renda Variavel Brasil": 0, "Renda Fixa Brasil": 0, "Multimercado": 0, 
        "Renda Variavel Global": 0, "Renda Fixa Global": 0, "Alternativo": 0, 
        "Fundos Imobiliários": 0, "Caixa": 0 
    };
    
    const novoSubclassesMap = {};
    totalPatrimonio = 0;

    // Varre todas as categorias e ativos restantes para reconstruir os mapas
    Object.keys(globalDetalheMap).forEach(cat => {
        const categoria = globalDetalheMap[cat];
        novaEstrategia[cat] = categoria.total;
        totalPatrimonio += categoria.total;

        categoria.assets.forEach(ativo => {
            const subNome = ativo.sub || "Outros";
            novoSubclassesMap[subNome] = (novoSubclassesMap[subNome] || 0) + ativo.valor;
        });
    });

    // Sincroniza as variáveis globais de simulação
    currentPortfolio = { ...novaEstrategia };
    globalSubclassesMap = novoSubclassesMap; // Atualiza o mapa global que o gráfico usa

    // Renderiza o Dashboard com os novos dados limpos
    renderDashboard(novaEstrategia, novoSubclassesMap, globalDetalheMap);
}