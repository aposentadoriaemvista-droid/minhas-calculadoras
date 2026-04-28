let chartEstrategia = null;
let chartSubclasses = null;
let chartSimulacao = null;
let currentPortfolio = {}; // Guardará a foto da carteira para a simulação
let totalPatrimonio = 0;
let chartSimEstrategia = null;
let chartSimSubclasses = null;
let globalDetalheMap = {}; // Guardará os ativos atuais
let globalSubclassesMap = {};
let chartGestorasFII = null;



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
    // URL 1: Aba Geral
    const urlGeral = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQwj0rEui2phiCxHiXMKh6mR-X2q0VkUQMUgWBNslaYnYuQs3rEfuyuiebd8drxq9n1ZzC_dVnQXVAe/pub?output=csv";
    
    // URL 2: Nova Aba de FIIs
    // Lembre-se de colar o seu link com o GID real aqui
    const urlFIIs = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQwj0rEui2phiCxHiXMKh6mR-X2q0VkUQMUgWBNslaYnYuQs3rEfuyuiebd8drxq9n1ZzC_dVnQXVAe/pub?gid=747525089&single=true&output=csv";

    const dict = {};

    try {
        // 1. CARREGA A ABA GERAL (Com correção de acentuação)
        const resGeral = await fetch(urlGeral, { cache: 'no-store' });
        const textGeral = await resGeral.text(); // O navegador resolve o UTF-8 (Acentos) sozinho
        const wbGeral = XLSX.read(textGeral, { type: 'string' });
        const jsonGeral = XLSX.utils.sheet_to_json(wbGeral.Sheets[wbGeral.SheetNames[0]]);
        
        jsonGeral.forEach(row => {
            const ativo = norm(row["Ativos"] || row["ATIVOS"] || row["Ativo"]);
            if (ativo) {
                dict[ativo] = {
                    cat: row["Classe"] || row["CLASSE"] || "",
                    subclasse: row["Subclasse"] || row["SUBCLASSE"] || "Outros",
                    extras: {} 
                };
            }
        });

        // 2. CARREGA A ABA FIIS (Com correção de acentuação)
        if (urlFIIs !== "https://docs.google.com/spreadsheets/d/e/2PACX-1vQwj0rEui2phiCxHiXMKh6mR-X2q0VkUQMUgWBNslaYnYuQs3rEfuyuiebd8drxq9n1ZzC_dVnQXVAe/pub?gid=747525089&single=true&output=csv") {
            const resFIIs = await fetch(urlFIIs, { cache: 'no-store' });
            const textFIIs = await resFIIs.text(); // O navegador resolve o UTF-8 (Acentos) sozinho
            const wbFIIs = XLSX.read(textFIIs, { type: 'string' });
            const matrixFIIs = XLSX.utils.sheet_to_json(wbFIIs.Sheets[wbFIIs.SheetNames[0]], { header: 1 });

            for (let i = 1; i < matrixFIIs.length; i++) { 
                const row = matrixFIIs[i];
                if (!row || row.length === 0) continue;
                
                const ativo = norm(row[0]); 
                if (ativo) {
                    if (!dict[ativo]) {
                        dict[ativo] = { cat: "Fundos Imobiliários", subclasse: "Fundo Imobiliário", extras: {} };
                    }
                    dict[ativo].extras = {
                        classeFii: row[3] || "-", 
                        gestora: row[4] || "-",   
                        indexador: row[5] || "-"  
                    };
                }
            }
        }

        console.log("Glossário online carregado com sucesso (Acentos corrigidos)!");
        return dict;
    } catch (error) {
        console.error("Erro ao carregar glossário online:", error);
        return dict; 
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
        if (tituloSeccao) currentXpCategory = tituloSeccao.toString().split("|")[1].trim();

        const headValor = ["Posição", "Posição a mercado", "Valor líquido", "Financeiro", "Valor aplicado", "Provisionado"];
        let foundValor = -1;
        for (let v of headValor) {
            let idx = rowStr.indexOf(v);
            if (idx !== -1) { foundValor = idx; break; }
        }
        if (foundValor !== -1) { colPosicaoIdx = foundValor; return; }

        if (currentXpCategory.toLowerCase().includes("proventos")) return;

        if (colPosicaoIdx !== -1) {
            const nomeAtivo = norm(row[0]);
            const valor = cleanV(row[colPosicaoIdx]);
            if (nomeAtivo && valor > 0.01 && !nomeAtivo.includes("|") && !["Ativo", "Total"].includes(nomeAtivo)) {
                const gData = glossary[nomeAtivo];
                const topico = (gData && typeof gData === 'object') ? gData.cat : mapToSeven(currentXpCategory, nomeAtivo);
                
                // UPDATE 3: Mapear Global para "Dólar" nas subclasses
              let subRaw = (gData && typeof gData === 'object' && gData.subclasse) ? gData.subclasse : currentXpCategory;
                let subNome = padronizarSubclasse(subRaw, topico); // Usa o nosso novo filtro inteligente!
                
                // NOVO: Captura os extras do glossário se existirem
                let extrasAtivo = (gData && gData.extras) ? gData.extras : {};

                estrategiaMap[topico] += valor;
                totalPatrimonio += valor;
                subclassesMap[subNome] = (subclassesMap[subNome] || 0) + valor;

                if (!detalheMap[topico]) detalheMap[topico] = { total: 0, assets: [] };
                detalheMap[topico].total += valor;
                // NOVO: Salvando o 'extras: extrasAtivo' no objeto do ativo
                detalheMap[topico].assets.push({ nome: nomeAtivo, valor: valor, sub: subNome, extras: extrasAtivo });
            }
        }
    });

    globalDetalheMap = detalheMap;
    globalSubclassesMap = subclassesMap;
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

    // 👇 ADICIONA ESTA LINHA AQUI 👇
    renderizarAbasEspecificas(detalhe);
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
                backgroundColor: [
    '#0ea5e9', /* Azul Ciano */
    '#10b981', /* Verde Esmeralda */
    '#8b5cf6', /* Roxo/Violeta */
    '#f59e0b', /* Dourado/Amarelo */
    '#ef4444', /* Vermelho Suave */
    '#ec4899', /* Rosa */
    '#6366f1', /* Índigo */
    '#14b8a6'  /* Teal/Verde-azulado */
],
borderColor: '#1f2937', // Mesma cor do fundo do cartão para dar efeito de separação
borderWidth: 2
            }]
        },
        options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

function renderSubclassChart(subclasses) {
    const ctx = document.getElementById('chartSubclasses').getContext('2d');
    if (chartSubclasses) chartSubclasses.destroy();

    // 1. Criamos os labels com a porcentagem
    const labelsComPerc = Object.keys(subclasses).map(k => {
        const perc = ((subclasses[k] / totalPatrimonio) * 100).toFixed(1);
        return `${k} (${perc}%)`;
    });

    // 2. Mapa de Cores Elegante para as 8 Subclasses
    const colorMap = {
        "Pós-fixada": "#1b4043",       // Verde Escuro (Tema)
        "Prefixada": "#2a5d61",        // Verde Médio (Tema)
        "Inflação": "#c5a059",         // Dourado (Tema)
        "Fundo Imobiliário": "#10b981",// Verde Sucesso
        "Ibov": "#3b82f6",             // Azul
        "Dólar": "#8fc9cc",            // Azul Claro (Tema)
        "Multimercado": "#8b5cf6",     // Roxo
        "Alternativo": "#ef4444"       // Vermelho
    };

    // 3. Associamos a cor certa a cada barra lida
    const backgroundColors = Object.keys(subclasses).map(k => colorMap[k] || '#d1d8db');

    chartSubclasses = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labelsComPerc, 
            datasets: [{ 
                label: 'Volume R$', 
                data: Object.values(subclasses), 
                backgroundColor: backgroundColors, // Aplica as novas cores
                borderRadius: 6 // Deixa as barras com as pontas arredondadas
            }]
        },
        options: { 
            indexAxis: 'y', 
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }, // Esconde a legenda superior que era redundante
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
    
    // 1. Limpamos o container para não duplicar elementos
    container.innerHTML = "";
    
    // 2. Criamos os sliders com o passo corrigido
    Object.keys(estrategia).forEach(cat => {
        const safeId = cat.replace(/\s+/g,'');
        const valorOriginal = currentPortfolio[cat] || 0;

        const div = document.createElement('div');
        div.className = 'sim-slider-row';
        
        // A MÁGICA ACONTECE AQUI: Mudámos o step="1000" para step="1".
        // Isto permite que o valor inicial "0" seja sempre aceite pelo navegador.
        div.innerHTML = `
            <label>${cat} <span class="val-display" id="txt-val-${safeId}">R$ 0,00</span></label>
            <input type="range" class="modern-slider sim-range" 
                   data-cat="${cat}" 
                   min="${-Math.floor(valorOriginal)}" 
                   max="1000000" 
                   step="1" 
                   value="0"> 
        `;
        container.appendChild(div);
    });

    // 3. Vinculamos o evento e forçamos o valor a zero via JavaScript
    const sliders = document.querySelectorAll('.sim-range');
    sliders.forEach(s => {
        s.value = 0; // Garantia dupla de que começa em zero
        s.addEventListener('input', updateSimulation);
    });

    // 4. Resetamos os textos de resumo para o estado inicial sem simulação
    if(document.getElementById('txtAporteSimulado')) document.getElementById('txtAporteSimulado').innerText = "R$ 0,00";
    if(document.getElementById('txtTotalSimulado')) document.getElementById('txtTotalSimulado').innerText = `R$ ${totalPatrimonio.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;

    // 5. Chamamos a função apenas para renderizar os gráficos iniciais alinhados
    updateSimulation(); 
}

function updateSimulation() {
    let aporteRealEfetivo = 0; 
    const novosValores = {};
    const sliders = document.querySelectorAll('.sim-range');

    sliders.forEach(input => {
        // Garantimos que o valor do slider é lido corretamente como número
        const sliderVal = parseFloat(input.value) || 0;
        const cat = input.dataset.cat;
        const valorOriginal = currentPortfolio[cat] || 0;
        
        // vFinal é o valor que a categoria terá após a simulação
        let vFinal = valorOriginal + sliderVal;
        
        // Proteção para não ter saldo negativo na simulação
        if (vFinal < 0) vFinal = 0;
        
        novosValores[cat] = vFinal;

        // O aporte real é a soma das variações de todos os sliders
        aporteRealEfetivo += (vFinal - valorOriginal);

        // Atualiza a etiqueta individual (ex: + R$ 1.000 ou - R$ 500)
        const safeId = cat.replace(/\s+/g,'');
        const txtLabel = document.getElementById(`txt-val-${safeId}`);
        if (txtLabel) {
            const variacao = vFinal - valorOriginal;
            txtLabel.innerText = (variacao >= 0 ? "+" : "") + ` R$ ${variacao.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
            txtLabel.style.color = variacao > 0 ? "#10b981" : (variacao < 0 ? "#ef4444" : "#64748b");
        }
    });

    const totalSimulado = totalPatrimonio + aporteRealEfetivo;
    
    // Atualiza os campos de resumo no dashboard
    const elAporte = document.getElementById('txtAporteSimulado');
    const elTotal = document.getElementById('txtTotalSimulado');
    
    if (elAporte) elAporte.innerText = `R$ ${aporteRealEfetivo.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    if (elTotal) elTotal.innerText = `R$ ${totalSimulado.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;

    renderSimComparisonCharts(novosValores, totalSimulado);
}
function renderSimComparisonCharts(novosDados, totalSim) {
    // 1. Gráfico de Barras: Comparativo de Classes (Atual vs Simulado)
    const ctxBar = document.getElementById('chartSimEstrategia').getContext('2d');
    if (chartSimEstrategia) chartSimEstrategia.destroy();

    const labels = Object.keys(novosDados);
    
    chartSimEstrategia = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Atual',
                    data: labels.map(l => currentPortfolio[l] || 0),
                    backgroundColor: '#d1d8db' // Cinza
                },
                {
                    label: 'Simulado',
                    data: labels.map(l => novosDados[l]),
                    backgroundColor: '#10b981' // Verde
                }
            ]
        },
        options: {
            maintainAspectRatio: false,
            plugins: { title: { display: true, text: 'Equilíbrio de Classes (R$)' } },
            scales: { y: { beginAtZero: true } }
        }
    });

    // 2. Gráfico de Rosca: Nova Distribuição %
    const ctxPie = document.getElementById('chartSimSubclasses').getContext('2d');
    if (chartSimSubclasses) chartSimSubclasses.destroy();

    const labelsPie = labels.filter(l => novosDados[l] > 0);
    const dataPie = labelsPie.map(l => ((novosDados[l] / totalSim) * 100).toFixed(1));

    chartSimSubclasses = new Chart(ctxPie, {
        type: 'doughnut',
        data: {
            labels: labelsPie.map((l, i) => `${l} (${dataPie[i]}%)`),
            datasets: [{
                data: dataPie,
               backgroundColor: [
    '#0ea5e9', /* Azul Ciano */
    '#10b981', /* Verde Esmeralda */
    '#8b5cf6', /* Roxo/Violeta */
    '#f59e0b', /* Dourado/Amarelo */
    '#ef4444', /* Vermelho Suave */
    '#ec4899', /* Rosa */
    '#6366f1', /* Índigo */
    '#14b8a6'  /* Teal/Verde-azulado */
],
borderColor: '#1f2937', // Mesma cor do fundo do cartão para dar efeito de separação
borderWidth: 2
            }]
        },
        options: {
            maintainAspectRatio: false,
            plugins: { 
                legend: { position: 'right' },
                title: { display: true, text: 'Nova Composição (%)' }
            }
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

// Função para mostrar/esconder os campos específicos de FII no Modal
function verificarCamposExtras() {
    const classe = document.getElementById('manClasse').value;
    const divFII = document.getElementById('camposExtraFII');
    
    if (classe === "Fundos Imobiliários") {
        divFII.style.display = 'flex';
    } else {
        divFII.style.display = 'none';
    }
}

// Melhoria na hora de fechar o modal para limpar os campos
function fecharModal() {
    document.getElementById('modalAtivo').style.display = 'none';
    // Opcional: Limpar os campos para a próxima vez que abrir
    document.getElementById('manNome').value = '';
    document.getElementById('manValor').value = '';
    document.getElementById('manFiiClasse').value = '';
    document.getElementById('manFiiGestora').value = '';
    document.getElementById('manFiiIndexador').value = '';
}

function adicionarAtivoManual() {
    const nome = document.getElementById('manNome').value;
    const classe = document.getElementById('manClasse').value;
    const sub = document.getElementById('manSub').value; 
    const valor = parseFloat(document.getElementById('manValor').value) || 0;

    if (!nome || !sub || valor <= 0) return alert("Preencha todos os campos obrigatórios!");

    // NOVO: Captura os dados extras se a classe for FII
    let extrasAtivo = {};
    if (classe === "Fundos Imobiliários") {
        extrasAtivo = {
            classeFii: document.getElementById('manFiiClasse').value || "-",
            gestora: document.getElementById('manFiiGestora').value || "-",
            indexador: document.getElementById('manFiiIndexador').value || "-"
        };
    }

    if (!globalDetalheMap[classe]) globalDetalheMap[classe] = { total: 0, assets: [] };
    globalDetalheMap[classe].total += valor;
    
    // NOVO: Enviando o extrasAtivo junto com o ativo manual
    globalDetalheMap[classe].assets.push({ nome: nome, valor: valor, sub: sub, extras: extrasAtivo });
    
    recalcularTudoERenderizar();
    fecharModal(); // Usa a nossa nova função que fecha e limpa os campos
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

function recalcularTudoERenderizar() {
    const novaEst = { 
        "Renda Variavel Brasil": 0, "Renda Fixa Brasil": 0, "Multimercado": 0, 
        "Renda Variavel Global": 0, "Renda Fixa Global": 0, "Alternativo": 0, 
        "Fundos Imobiliários": 0, "Caixa": 0 
    };
    const novoSub = {};
    let novoTotal = 0;

    Object.keys(globalDetalheMap).forEach(cat => {
        novaEst[cat] = globalDetalheMap[cat].total;
        novoTotal += globalDetalheMap[cat].total;
        
        globalDetalheMap[cat].assets.forEach(a => {
    let finalSub = padronizarSubclasse(a.sub, cat);
    novoSub[finalSub] = (novoSub[finalSub] || 0) + a.valor;
});
    });

    // Atualiza as referências globais antes de desenhar
    totalPatrimonio = Number(novoTotal.toFixed(2));
    currentPortfolio = { ...novaEst };
    globalSubclassesMap = novoSub;

    renderDashboard(novaEst, novoSub, globalDetalheMap);
}
// --- FUNÇÃO PARA SALVAR A CARTEIRA (EXPORTAR JSON) ---
function exportarProjeto() {
    // Pegamos os alvos (targets) da sidebar
    const targets = {};
    document.querySelectorAll('.target-input').forEach(input => {
        targets[input.dataset.cat] = input.value;
    });

    const specs = {};
    document.querySelectorAll('.client-spec-status').forEach(select => {
        const key = select.dataset.key;
        const noteInput = document.querySelector(`.client-spec-note[data-key="${key}"]`);
        specs[key] = {
            status: select.value,
            note: noteInput ? noteInput.value : ""
        };
    });

    const projeto = {
        detalhe: globalDetalheMap,
        subclasses: globalSubclassesMap,
        targets: targets,
        clientSpecs: specs, // Salvando no JSON
        total: totalPatrimonio,
        portfolioBase: currentPortfolio,
        dataExportacao: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(projeto, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `projeto_carteira_${new Date().toLocaleDateString().replace(/\//g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// --- FUNÇÃO PARA CARREGAR A CARTEIRA (IMPORTAR JSON) ---
function importarProjeto(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            console.log("--- Importando JSON ---");
            const projeto = JSON.parse(e.target.result);
            
            // 1. Sincroniza variáveis globais ANTES de renderizar
            globalDetalheMap = projeto.detalhe || {};
            globalSubclassesMap = projeto.subclasses || {};
            totalPatrimonio = projeto.total || 0;
            currentPortfolio = { ...projeto.portfolioBase } || {};

            // 2. Atualiza os Alvos (Targets) na Sidebar
            if (projeto.targets) {
                Object.keys(projeto.targets).forEach(cat => {
                    const input = document.querySelector(`.target-input[data-cat="${cat}"]`);
                    if (input) input.value = projeto.targets[cat];
                });
            }

            // 3. NOVO: Atualiza o Planejamento do Cliente na Sidebar
            if (projeto.clientSpecs) {
                Object.keys(projeto.clientSpecs).forEach(key => {
                    const statusEl = document.querySelector(`.client-spec-status[data-key="${key}"]`);
                    const noteEl = document.querySelector(`.client-spec-note[data-key="${key}"]`);
                    
                    if (statusEl) statusEl.value = projeto.clientSpecs[key].status;
                    if (noteEl) noteEl.value = projeto.clientSpecs[key].note;
                });
            }

            // 4. Renderiza tudo com os novos dados
            recalcularTudoERenderizar();
            
            alert("Carteira carregada com sucesso!");
            event.target.value = ''; // Limpa o input para permitir novo carregamento
        } catch (err) {
            console.error("Erro na importação:", err);
            alert("Erro ao ler o arquivo. Verifique se é um arquivo JSON válido da ferramenta.");
        }
    };
    reader.readAsText(file);
}
// Filtro Inteligente para as 8 Subclasses Oficiais
function padronizarSubclasse(subRaw, categoriaMain) {
    const s = (subRaw || "").toString().toLowerCase();
    
    // 1. Regras de Fundo Imobiliário
    if (s.includes("fii") || s.includes("imobiliári") || s.includes("imobiliari")) return "Fundo Imobiliário";
    
    // 2. Regras de Renda Fixa / Caixa
    if (s.includes("pós") || s.includes("pos") || s.includes("cdi") || s.includes("selic") || s.includes("di")) return "Pós-fixada";
    if (s.includes("pré") || s.includes("pre") || s.includes("fixado")) return "Prefixada";
    if (s.includes("ipca") || s.includes("inflação") || s.includes("inflacao") || s.includes("ima-b")) return "Inflação";
    
    // 3. Regras de Renda Variável Brasil
    if (s.includes("ibov") || s.includes("açõe") || s.includes("acoe") || s.includes("variável") || s.includes("variavel")) return "Ibov";
    
    // 4. Regras Globais
    if (s.includes("dólar") || s.includes("dolar") || s.includes("global") || s.includes("exterior") || s.includes("s&p") || s.includes("nasdaq")) return "Dólar";
    
    // 5. Regras Multimercado
    if (s.includes("multi")) return "Multimercado";
    
    // 6. Regras Alternativo
    if (s.includes("alternativo") || s.includes("cripto") || s.includes("coe")) return "Alternativo";

    // 7. Fallback (Plano B): Se não achou palavras-chave, usa a Categoria Principal para decidir
    switch (categoriaMain) {
        case "Fundos Imobiliários": return "Fundo Imobiliário";
        case "Renda Fixa Brasil": return "Pós-fixada"; 
        case "Renda Variavel Brasil": return "Ibov";
        case "Renda Variavel Global": 
        case "Renda Fixa Global": return "Dólar";
        case "Multimercado": return "Multimercado";
        case "Alternativo": return "Alternativo";
        case "Caixa": return "Pós-fixada";
        default: return "Pós-fixada"; // Valor seguro padrão
    }
}
// --- FUNÇÃO PARA GERAR O PDF ---
// --- FUNÇÃO PARA GERAR O PDF ---
// --- FUNÇÃO PARA GERAR O PDF ---
function gerarPDF() {
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    
    // 1. Escondemos a barra lateral temporariamente para o conteúdo ir para a posição zero (esquerda)
    sidebar.style.display = 'none';
    
    // 2. Rolamos a página para o topo absoluto para garantir que não há cortes verticais
    window.scrollTo(0, 0);
    
    const opt = {
        margin:       10, 
        filename:     `Relatorio_Estrategico_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { 
            scale: 2, 
            useCORS: true,
            scrollX: 0, // Garante que a foto começa exatamente no pixel 0
            scrollY: 0
        }, 
        jsPDF:        { 
            unit: 'mm', 
            format: 'a3', 
            orientation: 'landscape' 
        }
    };

    alert("Preparando o PDF. Aguarde um momento...");
    
    // 3. Geramos o PDF. O .then() garante que o código dentro dele só roda APÓS o PDF estar pronto
    html2pdf().set(opt).from(mainContent).save().then(() => {
        // 4. Devolvemos a barra lateral à tela como se nada tivesse acontecido!
        sidebar.style.display = 'block';
    });
}
// 0. Configurações Iniciais para o Tema Escuro (Chart.js)
Chart.defaults.color = '#94a3b8'; // Cor do texto das legendas e eixos
Chart.defaults.borderColor = '#374151'; // Cor das linhas de grade do gráfico

// Lógica de alternância de abas
function abrirAba(evento, idAba) {
    // Esconde todos os conteúdos de aba
    const conteudos = document.querySelectorAll('.tab-content');
    conteudos.forEach(conteudo => conteudo.classList.remove('active'));

    // Remove a classe 'active' de todos os botões
    const botoes = document.querySelectorAll('.tab-btn');
    botoes.forEach(botao => botao.classList.remove('active'));

    // Mostra a aba selecionada e marca o botão como ativo
    document.getElementById(idAba).classList.add('active');
    evento.currentTarget.classList.add('active');
}

// --- O MAESTRO DAS ABAS ESPECÍFICAS ---
function renderizarAbasEspecificas(detalhe) {
    const tabMap = {
        "Renda Variavel Brasil": "aba-rv-brasil",
        "Renda Fixa Brasil": "aba-rf-brasil",
        "Multimercado": "aba-multimercado",
        "Renda Variavel Global": "aba-rv-global",
        "Renda Fixa Global": "aba-rf-global",
        "Alternativo": "aba-alternativo",
        "Fundos Imobiliários": "aba-fiis",
        "Caixa": "aba-caixa"
    };

    // 1. Limpa todas as abas
    Object.keys(tabMap).forEach(cat => {
        const tabEl = document.getElementById(tabMap[cat]);
        if(tabEl) {
            tabEl.innerHTML = `<div class="card"><h3>${cat}</h3><p style="color: var(--text-muted); padding: 20px 0;">Nenhum ativo nesta categoria.</p></div>`;
        }
    });

    // 2. Construtores específicos (Mapeamento arquitetural limpo)
    const construtoresDeAba = {
        "Fundos Imobiliários": renderizarAbaFII
        // Futuramente você pode adicionar: "Renda Fixa Brasil": renderizarAbaRF
    };

    // 3. Roteamento de Renderização
    Object.keys(detalhe).forEach(cat => {
        const tabId = tabMap[cat];
        if (!tabId) return;
        
        const tabEl = document.getElementById(tabId);
        const dadosCat = detalhe[cat];
        
        if (dadosCat.total <= 0.01) return; // Pula se estiver zerada

        // Se existir um construtor especial para esta classe, usa ele. Se não, usa o padrão.
        const construirAba = construtoresDeAba[cat] || renderizarAbaPadrao;
        construirAba(cat, dadosCat, tabEl);
    });
}

// --- CONSTRUTOR PADRÃO (Para classes normais) ---
function renderizarAbaPadrao(cat, dadosCat, tabEl) {
    const assets = dadosCat.assets.sort((a, b) => b.valor - a.valor);
    let rowsHtml = assets.map((a, index) => {
        const percCat = ((a.valor / dadosCat.total) * 100).toFixed(1);
        return `
            <tr>
                <td><strong>${a.nome}</strong></td>
                <td><span class="badge" style="background: rgba(14, 165, 233, 0.1); color: var(--accent-primary); border: 1px solid rgba(14, 165, 233, 0.3);">${a.sub}</span></td>
                <td style="text-align: right; color: var(--success); font-weight: bold;">R$ ${a.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td style="text-align: right; color: var(--text-muted);">${percCat}%</td>
                <td style="text-align: right;"><button class="btn-delete" onclick="excluirAtivo('${cat}', ${index})" title="Remover Ativo">×</button></td>
            </tr>
        `;
    }).join('');

    tabEl.innerHTML = htmlTabelaBase(cat, dadosCat.total, `<th>Ativo</th><th>Subclasse</th><th style="text-align: right;">Valor (R$)</th><th style="text-align: right;">Peso na Classe</th><th style="text-align: right;">Ação</th>`, rowsHtml);
}

// --- CONSTRUTOR ESPECÍFICO DE FIIs (Com Mini-Dashboard Duplo) ---
function renderizarAbaFII(cat, dadosCat, tabEl) {
    const assets = dadosCat.assets.sort((a, b) => b.valor - a.valor);
    
    // 1. Lógica do Mini-Dashboard: Somar valores por "Classe" e por "Gestora"
    const resumoClasses = {};
    const resumoGestoras = {};

    assets.forEach(a => {
        const classeFii = (a.extras && a.extras.classeFii && a.extras.classeFii !== "-") ? a.extras.classeFii : "Não Classificado";
        resumoClasses[classeFii] = (resumoClasses[classeFii] || 0) + a.valor;

        const gestora = (a.extras && a.extras.gestora && a.extras.gestora !== "-") ? a.extras.gestora : "Outras";
        resumoGestoras[gestora] = (resumoGestoras[gestora] || 0) + a.valor;
    });

    // 2. Montar o HTML dos Cartões de Resumo (Lado Esquerdo)
    let cardsClassesHtml = `<div class="fii-summary-grid">`;
    Object.keys(resumoClasses).sort((a,b) => resumoClasses[b] - resumoClasses[a]).forEach(c => {
        const val = resumoClasses[c];
        const perc = ((val / dadosCat.total) * 100).toFixed(1);
        cardsClassesHtml += `
            <div class="fii-summary-card">
                <span class="fii-class-label">${c}</span>
                <span class="fii-class-value">R$ ${val.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                <span class="fii-class-perc">${perc}% da classe</span>
            </div>
        `;
    });
    cardsClassesHtml += `</div>`;

    // 3. Montar o Container do Gráfico de Gestoras (Lado Direito)
    const graficoGestoraHtml = `
        <div class="fii-gestora-chart-container card">
            <h4 style="margin: 0 0 10px 0; text-align: center; color: var(--text-muted); font-size: 0.85rem; text-transform: uppercase;">Exposição por Gestora</h4>
            <div style="position: relative; height: 160px; width: 100%;">
                <canvas id="chartGestoras"></canvas>
            </div>
        </div>
    `;

    // Junta os dois num Painel Flexível
    const topoHtml = `
        <div class="fii-top-panels">
            ${cardsClassesHtml}
            ${graficoGestoraHtml}
        </div>
    `;

    // 4. Montar as Linhas da Tabela
    let rowsHtml = assets.map((a, index) => {
        const percCat = ((a.valor / dadosCat.total) * 100).toFixed(1);
        const classe = a.extras?.classeFii || '-';
        const gestora = a.extras?.gestora || '-';
        const indexador = a.extras?.indexador || '-';

        return `
            <tr>
                <td><strong>${a.nome}</strong></td>
                <td><span class="badge" style="background: rgba(14, 165, 233, 0.1); color: var(--accent-primary); border: 1px solid rgba(14, 165, 233, 0.3);">${a.sub}</span></td>
                <td style="color: var(--text-muted); font-size: 0.9rem;">${classe}</td>
                <td style="color: var(--text-muted); font-size: 0.9rem;">${gestora}</td>
                <td style="color: var(--text-muted); font-size: 0.9rem;">${indexador}</td>
                <td style="text-align: right; color: var(--success); font-weight: bold;">R$ ${a.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td style="text-align: right; color: var(--text-muted);">${percCat}%</td>
                <td style="text-align: right;"><button class="btn-delete" onclick="excluirAtivo('${cat}', ${index})" title="Remover Ativo">×</button></td>
            </tr>
        `;
    }).join('');

    const cabecalhoEspecial = `<th>Ativo</th><th>Subclasse</th><th>Classe</th><th>Gestora</th><th>Indexador</th><th style="text-align: right;">Valor (R$)</th><th style="text-align: right;">Peso</th><th style="text-align: right;">Ação</th>`;
    
    // Injeta o HTML na aba
    tabEl.innerHTML = htmlTabelaBase(cat, dadosCat.total, cabecalhoEspecial, rowsHtml, topoHtml);

    // 5. IMPORTANTE: Desenha o gráfico *depois* que o HTML já está na tela
    renderChartGestoras(resumoGestoras);
}

// Função Auxiliar Modificada (Agora aceita um HTML extra para o topo)
function htmlTabelaBase(titulo, total, thsHTML, trsHTML, topExtraHTML = "") {
    return `
        <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 15px; margin-bottom: 15px;">
                <h3 style="margin: 0; border: none; padding: 0;">${titulo}</h3>
                <div style="text-align: right;">
                    <span style="font-size: 0.8rem; color: var(--text-muted);">Total na Classe</span><br>
                    <strong style="color: var(--gold); font-size: 1.2rem;">R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>
                </div>
            </div>
            
            ${topExtraHTML}
            
            <table class="data-table" style="width: 100%; text-align: left;">
                <thead><tr>${thsHTML}</tr></thead>
                <tbody>${trsHTML}</tbody>
            </table>
        </div>
    `;
}
function renderChartGestoras(dadosGestoras) {
    const ctx = document.getElementById('chartGestoras');
    if (!ctx) return;

    if (chartGestorasFII) chartGestorasFII.destroy();

    const labels = Object.keys(dadosGestoras);
    const data = Object.values(dadosGestoras);

    chartGestorasFII = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#0ea5e9', '#10b981', '#8b5cf6', '#f59e0b', 
                    '#ef4444', '#ec4899', '#6366f1', '#14b8a6'
                ],
                borderColor: '#1f2937',
                borderWidth: 2
            }]
        },
        options: {
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    position: 'right',
                    labels: { color: '#94a3b8', boxWidth: 12, font: { size: 10 } }
                }
            }
        }
    });
}