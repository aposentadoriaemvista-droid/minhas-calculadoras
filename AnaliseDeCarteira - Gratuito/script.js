let chartEstrategia = null;
let chartSubclasses = null;
let chartSimulacao = null;
let currentPortfolio = {}; // Guardará a foto da carteira para a simulação
let totalPatrimonio = 0;
let chartSimEstrategia = null;
let chartSimSubclasses = null;
let globalDetalheMap = {}; // Guardará os ativos atuais
let globalSubclassesMap = {};

const SHEETDB_API_URL = 'https://sheetdb.io/api/v1/j299fgurdwf8d';

let acessoLiberado = false; // Variável de controle

// 1. Cronômetro de 30 segundos
window.addEventListener('load', () => {
    // 30000 milissegundos = 30 segundos. 
    // Dica: Mude para 5000 (5 seg) enquanto estiver testando, depois volte para 30000.
    setTimeout(() => {
        if (!acessoLiberado) {
            document.getElementById('modalEmailOverlay').style.display = 'flex';
        }
    }, 30000); 
});

// 2. Função acionada ao clicar em "Continuar Acesso"
async function verificarEmail() {
    const emailInput = document.getElementById('userEmailInput').value.trim().toLowerCase();
    const statusMsg = document.getElementById('emailStatusMsg');
    const btn = document.getElementById('btnSubmitEmail');

    // Validação básica se digitou algo que parece um e-mail
    if (!emailInput || !emailInput.includes('@') || !emailInput.includes('.')) {
        statusMsg.style.color = '#ef4444'; // Vermelho
        statusMsg.innerText = "Por favor, insira um e-mail válido.";
        return;
    }

    // Muda visual para mostrar que está carregando
    statusMsg.style.color = '#c5a059'; // Dourado
    statusMsg.innerText = "Verificando banco de dados...";
    btn.disabled = true;
    btn.innerText = "Aguarde...";

    try {
        // Passo A: Verifica no SheetDB se o email existe (Fazendo um GET com busca)
        const respostaBusca = await fetch(`${SHEETDB_API_URL}/search?email=${emailInput}`);
        const dados = await respostaBusca.json();

        // Se o array voltar com tamanho maior que 0, significa que achou o e-mail
        if (dados.length > 0) {
            statusMsg.style.color = '#ef4444'; // Vermelho
            statusMsg.innerHTML = "Limite gratuito atingido para este e-mail.<br>Fale com seu consultor na XP.";
            btn.style.display = 'none'; // Esconde o botão para a pessoa não tentar de novo
            document.getElementById('userEmailInput').disabled = true;
        } else {
            // Passo B: E-mail não existe. Vamos salvar na planilha (Fazendo um POST)
            statusMsg.innerText = "E-mail confirmado. Liberando sistema...";

            await fetch(SHEETDB_API_URL, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    data: [
                        {
                            'email': emailInput,
                            'data_acesso': new Date().toLocaleString('pt-BR')
                        }
                    ]
                })
            });

            // Passo C: Desbloqueia a tela
            acessoLiberado = true;
            document.getElementById('modalEmailOverlay').style.display = 'none';
        }
    } catch (erro) {
        console.error("Erro na integração:", erro);
        statusMsg.style.color = '#ef4444';
        statusMsg.innerText = "Erro de conexão. Tente novamente.";
        btn.disabled = false;
        btn.innerText = "Continuar Acesso";
    }
}

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

                estrategiaMap[topico] += valor;
                totalPatrimonio += valor;
                subclassesMap[subNome] = (subclassesMap[subNome] || 0) + valor;

                if (!detalheMap[topico]) detalheMap[topico] = { total: 0, assets: [] };
                detalheMap[topico].total += valor;
                detalheMap[topico].assets.push({ nome: nomeAtivo, valor: valor, sub: subNome });
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
    '#c5a059', // Dourado
    '#00d4ff', // Ciano
    '#10b981', // Esmeralda
    '#8b5cf6', // Roxo
    '#f43f5e', // Rosa/Vermelho
    '#fbbf24', // Âmbar
    '#3b82f6', // Azul
    '#94a3b8'  // Cinza
],
                borderWidth: 0
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
                backgroundColor: ['#FF0000', '#0000FF', '#008000', '#FFFF00', '#FFA500', '#800080', '#00FFFF', '#FF00FF'],
                borderWidth: 0
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

// Função para Adicionar Manualmente
function adicionarAtivoManual() {
    const nome = document.getElementById('manNome').value;
    const classe = document.getElementById('manClasse').value;
    const sub = document.getElementById('manSub').value; // UPDATE 2: Agora pega do select
    const valor = parseFloat(document.getElementById('manValor').value) || 0;

    if (!nome || !sub || valor <= 0) return alert("Preencha todos os campos!");

    if (!globalDetalheMap[classe]) globalDetalheMap[classe] = { total: 0, assets: [] };
    globalDetalheMap[classe].total += valor;
    globalDetalheMap[classe].assets.push({ nome: nome, valor: valor, sub: sub });
    recalcularTudoERenderizar();
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

    const projeto = {
        detalhe: globalDetalheMap,
        subclasses: globalSubclassesMap,
        targets: targets,
        total: totalPatrimonio,
        portfolioBase: currentPortfolio, // Salva a base para a simulação
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
            
            // Sincroniza variáveis globais ANTES de renderizar
            globalDetalheMap = projeto.detalhe || {};
            globalSubclassesMap = projeto.subclasses || {};
            totalPatrimonio = projeto.total || 0;
            currentPortfolio = { ...projeto.portfolioBase } || {};

            // Atualiza Sidebar
            if (projeto.targets) {
                Object.keys(projeto.targets).forEach(cat => {
                    const input = document.querySelector(`.target-input[data-cat="${cat}"]`);
                    if (input) input.value = projeto.targets[cat];
                });
            }

            // Renderiza tudo (o renderDashboard chamará o renderInteractiveSimulation)
            recalcularTudoERenderizar();
            
            alert("Carteira carregada!");
            event.target.value = ''; 
        } catch (err) {
            console.error("Erro na importação:", err);
            alert("Erro ao ler o arquivo.");
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