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
let chartClassesRV = null;
let chartRVGlobal = null;
let chartRFGlobal = null;
let chartSetorGlobalRV = null;
let chartSetorGlobalRF = null;

// Carrega o pacote de Mapas do Google
google.charts.load('current', {
    'packages': ['geochart']
});

let cotacaoDolarGlobal = 5.00; // Valor padrão de segurança

// Função que roda invisível quando o site abre para pegar o Dólar de agora
async function initApp() {
    try {
        const res = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
        const data = await res.json();
        cotacaoDolarGlobal = parseFloat(data.USDBRL.bid);
    } catch (e) {
        console.warn("API de Dólar falhou. Usando R$ 5,00 como base.");
    }
}
initApp();

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
        if (urlFIIs && urlFIIs !== "") { // <-- Trava de segurança corrigida e simplificada!
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

        // 3. CARREGA A ABA DE RENDA VARIÁVEL (AÇÕES)
        const urlRV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQwj0rEui2phiCxHiXMKh6mR-X2q0VkUQMUgWBNslaYnYuQs3rEfuyuiebd8drxq9n1ZzC_dVnQXVAe/pub?gid=1207477292&single=true&output=csv";
        
        if (urlRV && urlRV !== "") {
            const resRV = await fetch(urlRV, { cache: 'no-store' });
            const textRV = await resRV.text();
            const wbRV = XLSX.read(textRV, { type: 'string' });
            const matrixRV = XLSX.utils.sheet_to_json(wbRV.Sheets[wbRV.SheetNames[0]], { header: 1 });

            for (let i = 1; i < matrixRV.length; i++) { 
                const row = matrixRV[i];
                if (!row || row.length === 0) continue;
                
                const ativo = norm(row[0]); // Coluna 1 = Nome
                if (ativo) {
                    if (!dict[ativo]) {
                        dict[ativo] = { cat: "Renda Variavel Brasil", subclasse: "Ibov", extras: {} };
                    }
                    if (!dict[ativo].extras) dict[ativo].extras = {};
                    
                    dict[ativo].extras.classeRV = row[1] || "Não Classificado"; // Coluna 2 = Classe/Estratégia
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
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }, 
                tooltip: {
                    callbacks: {
                        label: (ctx) => `R$ ${ctx.parsed.y.toLocaleString('pt-BR')}` // Mudei parsed.x para parsed.y
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
// Função para mostrar/esconder os campos específicos no Modal
function verificarCamposExtras() {
    const classe = document.getElementById('manClasse').value;
    const divFII = document.getElementById('camposExtraFII');
    const divRV = document.getElementById('camposExtraRV'); // Pega a nova div
    const divGlobal = document.getElementById('camposExtraGlobal'); // Nova div global
    
    // Primeiro, esconde tudo para garantir que não fiquem duas caixinhas abertas
    divFII.style.display = 'none';
    divRV.style.display = 'none';
    divGlobal.style.display = 'none';

    // Depois, mostra apenas a caixinha correta
    if (classe === "Fundos Imobiliários") {
        divFII.style.display = 'flex';
    } else if (classe === "Renda Variavel Brasil") {
        divRV.style.display = 'flex';
    } else if (classe === "Renda Variavel Global" || classe === "Renda Fixa Global") {
        divGlobal.style.display = 'flex';
    }
}

// Melhoria na hora de fechar o modal para limpar todos os campos
function fecharModal() {
    document.getElementById('modalAtivo').style.display = 'none';
    
    // Limpa todos os inputs
    document.getElementById('manNome').value = '';
    document.getElementById('manValor').value = '';
    document.getElementById('manFiiClasse').value = '';
    document.getElementById('manFiiGestora').value = '';
    document.getElementById('manFiiIndexador').value = '';
    document.getElementById('manRvClasse').value = ''; // Limpa o novo input de RV
    document.getElementById('manGlobalSetor').value = ''; 
    document.getElementById('manGlobalLocal').value = '';
}

function adicionarAtivoManual() {
    const nome = document.getElementById('manNome').value;
    const classe = document.getElementById('manClasse').value;
    const sub = document.getElementById('manSub').value; 
    let valorInput = parseFloat(document.getElementById('manValor').value);
    
    // Permite que o valor seja zero!
    if (isNaN(valorInput)) valorInput = 0; 

    if (!nome || !sub) return alert("Preencha todos os campos obrigatórios!");

    let extrasAtivo = {};
    let valorFinalReais = valorInput;

    // Se for global, transforma o US$ digitado em R$ para os cálculos gerais
    if (classe === "Renda Variavel Global" || classe === "Renda Fixa Global") {
        valorFinalReais = valorInput * cotacaoDolarGlobal;
        extrasAtivo = {
            setor: document.getElementById('manGlobalSetor').value || "Não Classificado",
            localizacao: document.getElementById('manGlobalLocal').value || "Não Classificado"
        };
    } else if (classe === "Fundos Imobiliários") {
        extrasAtivo = {
            classeFii: document.getElementById('manFiiClasse').value || "-",
            gestora: document.getElementById('manFiiGestora').value || "-",
            indexador: document.getElementById('manFiiIndexador').value || "-"
        };
    } else if (classe === "Renda Variavel Brasil") {
        extrasAtivo = {
            classeRV: document.getElementById('manRvClasse').value || "Não Classificado"
        };
    }

    if (!globalDetalheMap[classe]) globalDetalheMap[classe] = { total: 0, assets: [] };
    globalDetalheMap[classe].total += valorFinalReais;
    
    globalDetalheMap[classe].assets.push({ nome: nome, valor: valorFinalReais, sub: sub, extras: extrasAtivo });
    
    recalcularTudoERenderizar();
    fecharModal(); 
}

// 3. Lê o Excel Offshore e injeta no Sistema (Agora aceitando zeros)
// 3. Lê o Excel Offshore e injeta no Sistema (Versão Blindada)
async function importarPlanilhaOffshore(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Tenta atualizar a cotação antes de processar
    await initApp(); 

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });

            let contagem = 0;

            // Começa a ler da Linha 2 (índice 1), pulando os cabeçalhos
            for (let i = 1; i < matrix.length; i++) {
                const row = matrix[i];
                if (!row || row.length === 0) continue;

                const nomeAtivo = row[0];
                const codigo = row[1];
                
                // SEGURANÇA 1: Se a linha não tiver Nome nem Código, ela é vazia e deve ser pulada
                if (!nomeAtivo && !codigo) continue;

                const setor = row[2] || "Não Classificado";
                const paisLocal = row[3] || "Não Classificado";
                const classePlanilha = row[4] || "Renda Variavel Global"; 
                
                // SEGURANÇA 2: Se o valor estiver vazio, em branco ou for texto, transforma em ZERO (0)
                let rawValor = row[5];
                let valorDolar = 0; 
                
                if (rawValor !== undefined && rawValor !== null && rawValor !== "") {
                    if (typeof rawValor === 'string') {
                        valorDolar = parseFloat(rawValor.replace(',', '.'));
                    } else {
                        valorDolar = parseFloat(rawValor);
                    }
                }
                if (isNaN(valorDolar)) valorDolar = 0;

                const nomeFinal = codigo ? codigo.toString().toUpperCase() : nomeAtivo.toString();
                const regiaoMapeada = traduzirPaisParaRegiao(paisLocal);
                
                // Multiplica o ZERO (ou o valor real) pela cotação
                const valorEmReais = valorDolar * cotacaoDolarGlobal;

                if (!globalDetalheMap[classePlanilha]) {
                    globalDetalheMap[classePlanilha] = { total: 0, assets: [] };
                }

                globalDetalheMap[classePlanilha].total += valorEmReais;
                globalDetalheMap[classePlanilha].assets.push({
                    nome: nomeFinal,
                    valor: valorEmReais, // Fica guardado em Reais (R$ 0.00) nos cálculos
                    sub: "Dólar",
                    extras: { setor: setor, localizacao: regiaoMapeada }
                });
                contagem++;
            }

            // Exibe as mensagens corretas
            if (contagem > 0) {
                recalcularTudoERenderizar();
                alert(`Sucesso! ${contagem} ativos importados.\nCotação US$ usada: R$ ${cotacaoDolarGlobal.toFixed(3)}`);
            } else {
                alert("Aviso: A planilha foi lida, mas não encontramos nenhum ativo escrito da linha 2 em diante. Lembre-se de colocar ao menos o Nome ou Código!");
            }
        } catch (err) {
            console.error(err);
            alert("Erro interno ao ler a planilha. Verifique se ela não está corrompida.");
        } finally {
            event.target.value = ''; // Limpa o botão para permitir subir a mesma planilha de novo
        }
    };
    reader.readAsArrayBuffer(file);
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
        "Fundos Imobiliários": renderizarAbaFII,
        "Renda Variavel Brasil": renderizarAbaRV,
        "Renda Variavel Global": renderizarAbaGlobal, // <-- Adicionado
        "Renda Fixa Global": renderizarAbaGlobal      // <-- Adicionado
        // Futuramente você pode adicionar: "Renda Fixa Brasil": renderizarAbaRFjjbj
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

// Função Auxiliar Modificada (Agora suporta mudança para US$)
function htmlTabelaBase(titulo, total, thsHTML, trsHTML, topExtraHTML = "", moeda = "R$") {
    let totalFormatado = "";
    
    // Se a aba for global, converte o total em Reais de volta para Dólar na visualização!
    if (moeda === "US$") {
        const totalDolar = total / cotacaoDolarGlobal;
        totalFormatado = `US$ ${totalDolar.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    } else {
        totalFormatado = `R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    }

    return `
        <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 15px; margin-bottom: 15px;">
                <h3 style="margin: 0; border: none; padding: 0;">${titulo}</h3>
                <div style="text-align: right;">
                    <span style="font-size: 0.8rem; color: var(--text-muted);">Total na Classe</span><br>
                    <strong style="color: var(--gold); font-size: 1.2rem;">${totalFormatado}</strong>
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

    const labelsRaw = Object.keys(dadosGestoras);
    const dataRaw = Object.values(dadosGestoras);

    // 1. Calcula o total somando todos os valores
    const totalGestoras = dataRaw.reduce((acc, val) => acc + val, 0);

    // 2. Cria os labels já com a porcentagem calculada ao lado do nome
    const labelsComPerc = labelsRaw.map((nome, index) => {
        const perc = ((dataRaw[index] / totalGestoras) * 100).toFixed(1);
        return `${nome} (${perc}%)`;
    });

    chartGestorasFII = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: labelsComPerc, // Usando os novos labels textuais
            datasets: [{
                data: dataRaw,
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
// --- CONSTRUTOR ESPECÍFICO DE RENDA VARIÁVEL ---
function renderizarAbaRV(cat, dadosCat, tabEl) {
    const assets = dadosCat.assets.sort((a, b) => b.valor - a.valor);
    
    // 1. Somar valores por "Classe de RV"
    const resumoClassesRV = {};
    assets.forEach(a => {
        const classe = (a.extras && a.extras.classeRV && a.extras.classeRV !== "-") ? a.extras.classeRV : "Não Classificado";
        resumoClassesRV[classe] = (resumoClassesRV[classe] || 0) + a.valor;
    });

    // 2. Montar o Container do Gráfico (Maior e centralizado)
    const graficoRVHtml = `
        <div style="display: flex; justify-content: center; margin-bottom: 25px;">
            <div class="fii-gestora-chart-container card" style="width: 100%; max-width: 600px;">
                <h4 style="margin: 0 0 10px 0; text-align: center; color: var(--text-muted); font-size: 0.85rem; text-transform: uppercase;">Exposição por Estratégia / Setor</h4>
                <div style="position: relative; height: 260px; width: 100%;">
                    <canvas id="chartRV"></canvas>
                </div>
            </div>
        </div>
    `;

    // 3. Montar as Linhas da Tabela com o Botão de Edição
    let rowsHtml = assets.map((a, index) => {
        const percCat = ((a.valor / dadosCat.total) * 100).toFixed(1);
        const classeRV = a.extras?.classeRV || 'Não Classificado';

        return `
            <tr>
                <td><strong>${a.nome}</strong></td>
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="badge" style="background: rgba(139, 92, 246, 0.1); color: #8b5cf6; border: 1px solid rgba(139, 92, 246, 0.3);">${classeRV}</span>
                        <button onclick="editarClasseRV('${cat}', ${index})" style="background: transparent; border: none; cursor: pointer; font-size: 0.9rem; color: var(--text-muted); padding: 0;" title="Alterar Classe">✏️</button>
                    </div>
                </td>
                <td style="text-align: right; color: var(--success); font-weight: bold;">R$ ${a.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td style="text-align: right; color: var(--text-muted);">${percCat}%</td>
                <td style="text-align: right;"><button class="btn-delete" onclick="excluirAtivo('${cat}', ${index})" title="Remover Ativo">×</button></td>
            </tr>
        `;
    }).join('');

    const cabecalhoEspecial = `<th>Ativo</th><th>Estratégia / Classe</th><th style="text-align: right;">Valor (R$)</th><th style="text-align: right;">Peso</th><th style="text-align: right;">Ação</th>`;
    
    // Injeta o HTML na aba
    tabEl.innerHTML = htmlTabelaBase(cat, dadosCat.total, cabecalhoEspecial, rowsHtml, graficoRVHtml);

    // 4. Desenha o gráfico
    renderChartRV(resumoClassesRV);
}

// --- FUNÇÃO DO GRÁFICO DE RV ---
function renderChartRV(dadosClasses) {
    const ctx = document.getElementById('chartRV');
    if (!ctx) return;

    if (chartClassesRV) chartClassesRV.destroy();

    const labelsRaw = Object.keys(dadosClasses);
    const dataRaw = Object.values(dadosClasses);
    const totalRV = dataRaw.reduce((acc, val) => acc + val, 0);

    const labelsComPerc = labelsRaw.map((nome, index) => {
        const perc = ((dataRaw[index] / totalRV) * 100).toFixed(1);
        return `${nome} (${perc}%)`;
    });

    chartClassesRV = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: labelsComPerc,
            datasets: [{
                data: dataRaw,
                backgroundColor: [
                    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', 
                    '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'
                ],
                borderColor: '#1f2937',
                borderWidth: 2
            }]
        },
        options: {
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    position: 'bottom', // Move a legenda para baixo, criando colunas automaticamente
                    labels: { color: '#94a3b8', boxWidth: 12, font: { size: 10 }, padding: 15 }
                }
            }
        }
    });
}
// --- FUNÇÃO PARA EDITAR CLASSE DE RV MANUALMENTE ---
function editarClasseRV(cat, index) {
    const ativo = globalDetalheMap[cat].assets[index];
    const classeAtual = ativo.extras?.classeRV || 'Não Classificado';
    const novaClasse = prompt(`Defina a nova Estratégia/Setor para o ativo ${ativo.nome}:`, classeAtual);
    
    // Se o usuário digitou algo e não cancelou
    if (novaClasse !== null && novaClasse.trim() !== "") {
        if (!ativo.extras) ativo.extras = {};
        ativo.extras.classeRV = novaClasse.trim();
        
        // Recalcula o projeto para atualizar tabelas e gráficos em tempo real
        recalcularTudoERenderizar();
    }
}

// ==========================================
// MÓDULO: ATIVOS GLOBAIS (RV e RF com Mapa Múndi)
// ==========================================

function renderizarAbaGlobal(cat, dadosCat, tabEl) {
    const assets = dadosCat.assets.sort((a, b) => b.valor - a.valor);
    
    const resumoLocais = {};
    const resumoSetores = {};
    
    assets.forEach(a => {
        const local = (a.extras && a.extras.localizacao && a.extras.localizacao !== "-") ? a.extras.localizacao : "Não Classificado";
        const setor = (a.extras && a.extras.setor && a.extras.setor !== "-") ? a.extras.setor : "Não Classificado";
        
        // Passa para os gráficos já convertido em Dólar!
        resumoLocais[local] = (resumoLocais[local] || 0) + (a.valor / cotacaoDolarGlobal);
        resumoSetores[setor] = (resumoSetores[setor] || 0) + (a.valor / cotacaoDolarGlobal);
    });

    const isRV = cat === "Renda Variavel Global";
    const chartSetorId = isRV ? "chartSetorRV" : "chartSetorRF";
    const chartGeoId = isRV ? "chartGeoRV" : "chartGeoRF";
    const corTema = isRV ? "#f59e0b" : "#0ea5e9";

    // Aplicando overflow: hidden para o mapa não vazar!
    // Painel Duplo Ampliado (Sem cortes, com mais altura)
    const graficosDuplosHtml = `
        <div class="fii-top-panels" style="align-items: stretch;">
            <div class="fii-gestora-chart-container card" style="flex: 1; border-top: 3px solid ${corTema}; min-height: 350px;">
                <h4 style="margin: 0 0 10px 0; text-align: center; color: var(--text-muted); font-size: 0.85rem; text-transform: uppercase;">Exposição por Setor</h4>
                <div style="position: relative; height: 300px; width: 100%;">
                    <canvas id="${chartSetorId}"></canvas>
                </div>
            </div>
            <div class="fii-gestora-chart-container card" style="flex: 1.5; border-top: 3px solid ${corTema}; min-height: 350px; padding: 15px;">
                <h4 style="margin: 0 0 10px 0; text-align: center; color: var(--text-muted); font-size: 0.85rem; text-transform: uppercase;">Distribuição Geográfica</h4>
                <div id="${chartGeoId}" style="width: 100%; height: 300px; display: flex; justify-content: center; align-items: center;"></div>
            </div>
        </div>
    `;
    let rowsHtml = assets.map((a, index) => {
        const percCat = dadosCat.total > 0 ? ((a.valor / dadosCat.total) * 100).toFixed(1) : "0.0";
        const setor = a.extras?.setor || 'Não Classificado';
        const local = a.extras?.localizacao || 'Não Classificado';
        
        // Converte o item da tabela para Dólar
        const valorEmDolar = a.valor / cotacaoDolarGlobal;

        return `
            <tr>
                <td><strong>${a.nome}</strong></td>
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="color: var(--text-muted); font-size: 0.9rem;">${setor}</span>
                        <button onclick="editarCampoGlobal('${cat}', ${index}, 'setor')" style="background: transparent; border: none; cursor: pointer; font-size: 0.9rem; padding: 0;" title="Alterar Setor">✏️</button>
                    </div>
                </td>
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="badge" style="background: rgba(14, 165, 233, 0.1); color: var(--accent-primary); border: 1px solid rgba(14, 165, 233, 0.3);">${local}</span>
                        <button onclick="editarCampoGlobal('${cat}', ${index}, 'localizacao')" style="background: transparent; border: none; cursor: pointer; font-size: 0.9rem; padding: 0;" title="Alterar Localização">✏️</button>
                    </div>
                </td>
                <td style="text-align: right; color: var(--success); font-weight: bold;">US$ ${valorEmDolar.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td style="text-align: right; color: var(--text-muted);">${percCat}%</td>
                <td style="text-align: right;"><button class="btn-delete" onclick="excluirAtivo('${cat}', ${index})" title="Remover Ativo">×</button></td>
            </tr>
        `;
    }).join('');

    const cabecalhoEspecial = `<th>Ativo</th><th>Setor</th><th>Localização</th><th style="text-align: right;">Valor (US$)</th><th style="text-align: right;">Peso</th><th style="text-align: right;">Ação</th>`;
    
    // Passamos "US$" como o 6º parâmetro para forçar o cabeçalho em dólar!
    tabEl.innerHTML = htmlTabelaBase(cat, dadosCat.total, cabecalhoEspecial, rowsHtml, graficosDuplosHtml, "US$");
    
    renderChartSetorGlobal(resumoSetores, chartSetorId);
    renderGeoChartGlobal(resumoLocais, chartGeoId);
}

// Mapa Múndi atualizado para mostrar "US$" ao passar o mouse
function renderGeoChartGlobal(dadosLocais, containerId) {
    if (!google.visualization || !google.visualization.DataTable) {
        setTimeout(() => renderGeoChartGlobal(dadosLocais, containerId), 500);
        return;
    }

    const container = document.getElementById(containerId);
    if (!container) return;

    const regionMap = {
        "América do Norte": { codes: ["021"], index: 1 }, 
        "América Latina": { codes: ["005", "013", "029"], index: 2 }, 
        "Europa": { codes: ["154", "155", "151", "039"], index: 3 },
        "África": { codes: ["015", "014", "011", "018", "017"], index: 4 },
        "Ásia": { codes: ["143", "030", "034", "035", "145"], index: 5 },
        "Oceania": { codes: ["053", "054", "057", "061"], index: 6 }
    };

    var data = new google.visualization.DataTable();
    data.addColumn('string', 'Região');
    data.addColumn('number', 'Alocado'); 

    let temDadosNoMapa = false;
    for (let local in dadosLocais) {
        let config = regionMap[local];
        let valorDolar = dadosLocais[local]; // Já chega em dólar
        
        if (config && valorDolar > 0) {
            config.codes.forEach(code => {
                data.addRow([
                    {v: code, f: local}, 
                    {v: config.index, f: 'US$ ' + valorDolar.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                ]);
            });
            temDadosNoMapa = true;
        }
    }

    if (!temDadosNoMapa) data.addRow(['001', 0]);

    var options = {
        displayMode: 'regions', resolution: 'subcontinents', backgroundColor: 'transparent', datalessRegionColor: '#374151',
        colorAxis: { values: [1, 2, 3, 4, 5, 6], colors: ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#14b8a6'] },
        legend: 'none', tooltip: { textStyle: { color: '#1f2937' }, showColorCode: true }
    };

    
    var chart = new google.visualization.GeoChart(container);
    chart.draw(data, options);
}

// Gráfico de Pizza de Setores
function renderChartSetorGlobal(dadosSetores, canvasId) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (canvasId === "chartSetorRV" && chartSetorGlobalRV) chartSetorGlobalRV.destroy();
    if (canvasId === "chartSetorRF" && chartSetorGlobalRF) chartSetorGlobalRF.destroy();

    const labelsRaw = Object.keys(dadosSetores);
    const dataRaw = Object.values(dadosSetores);
    const total = dataRaw.reduce((acc, val) => acc + val, 0);

    const labelsComPerc = labelsRaw.map((nome, index) => `${nome} (${((dataRaw[index] / total) * 100).toFixed(1)}%)`);

    const newChart = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: labelsComPerc,
            datasets: [{
                data: dataRaw,
                backgroundColor: ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'],
                borderColor: '#1f2937', borderWidth: 2
            }]
        },
        options: {
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 10, font: { size: 9 }, padding: 10 } } }
        }
    });

    if (canvasId === "chartSetorRV") chartSetorGlobalRV = newChart;
    else chartSetorGlobalRF = newChart;
}


function editarCampoGlobal(cat, index, campo) {
    const ativo = globalDetalheMap[cat].assets[index];
    const valorAtual = ativo.extras?.[campo] || 'Não Classificado';
    const isSetor = campo === 'setor';
    
    let optionsHtml = '';
    
    if (isSetor) {
        const setores = ["Agro", "Construção civil", "Diversificado", "Educação", "Eletrica", "Financeiro", "Holding", "Industria", "Locadoras", "Metalurgia", "Mineração", "Papel e Celulose", "Petroleo Gas E Energia", "Sidelurgia", "Tecnologia", "Telecomunicação", "Varejo", "Varejo Turismo"];
        optionsHtml = setores.map(s => `<option value="${s}">${s}</option>`).join('');
    } else {
        const locais = ["América do Norte", "América Latina", "Europa", "África", "Ásia", "Oceania"];
        optionsHtml = locais.map(l => `<option value="${l}">${l}</option>`).join('');
    }

    // Cria um modal dinâmico e elegante na tela
    const dialog = document.createElement('div');
    dialog.className = 'modal-overlay';
    dialog.innerHTML = `
        <div class="modal-content">
            <h3>Editar ${isSetor ? 'Setor' : 'Localização'}</h3>
            <p style="color: var(--text-muted); margin-top: -10px;">Ativo: <strong>${ativo.nome}</strong></p>
            <select id="tempEditSelect" style="background: var(--bg-dark); color: var(--text-main); border: 1px solid var(--border-color); padding: 10px; border-radius: 4px; margin: 15px 0;">
                <option value="Não Classificado">Não Classificado</option>
                ${optionsHtml}
            </select>
            <div class="modal-actions">
                <button class="btn-upload" id="btnSalvarEdit">Salvar</button>
                <button class="btn-upload danger" id="btnCancelarEdit">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    
    // Já deixa a opção atual selecionada no dropdown
    document.getElementById('tempEditSelect').value = valorAtual;

    // Ações dos botões
    document.getElementById('btnSalvarEdit').onclick = () => {
        if (!ativo.extras) ativo.extras = {};
        ativo.extras[campo] = document.getElementById('tempEditSelect').value;
        document.body.removeChild(dialog);
        recalcularTudoERenderizar();
    };
    
    document.getElementById('btnCancelarEdit').onclick = () => document.body.removeChild(dialog);
}

// ==========================================
// MÓDULO: IMPORTAÇÃO OFFSHORE (PLANILHA EXTERNA)
// ==========================================

// 1. Dicionário de Países para as 6 Regiões do Cliente
function traduzirPaisParaRegiao(pais) {
    if (!pais) return "Não Classificado";
    const p = pais.toLowerCase().trim();
    
    const americaNorte = ['eua', 'estados unidos', 'usa', 'united states', 'canadá', 'canada', 'méxico', 'mexico'];
    const europa = ['alemanha', 'inglaterra', 'reino unido', 'uk', 'frança', 'espanha', 'itália', 'suíça', 'europa', 'holanda', 'irlanda'];
    const amLatina = ['brasil', 'argentina', 'chile', 'colômbia', 'peru', 'uruguai', 'américa latina'];
    const asia = ['china', 'japão', 'japan', 'índia', 'india', 'coreia', 'singapura', 'ásia', 'asia', 'taiwan'];
    const oceania = ['austrália', 'australia', 'nova zelândia', 'oceania'];
    const africa = ['áfrica', 'africa', 'áfrica do sul', 'nigeria', 'egito'];

    if (americaNorte.some(x => p.includes(x))) return "América do Norte";
    if (europa.some(x => p.includes(x))) return "Europa";
    if (amLatina.some(x => p.includes(x))) return "América Latina";
    if (asia.some(x => p.includes(x))) return "Ásia";
    if (oceania.some(x => p.includes(x))) return "Oceania";
    if (africa.some(x => p.includes(x))) return "África";

    return "Não Classificado"; 
}

// 2. Busca a Cotação do Dólar em Tempo Real
async function obterCotacaoDolar() {
    try {
        const res = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
        const data = await res.json();
        return parseFloat(data.USDBRL.bid);
    } catch (e) {
        console.warn("API de Dólar falhou, pedindo manual...");
        const manual = prompt("Erro ao buscar dólar online. Digite a cotação de hoje (ex: 5.15):", "5.00");
        return parseFloat(manual.replace(',', '.')) || 5.00;
    }
}

// 3. Lê o Excel Offshore Padrão e injeta no Sistema (Versão Blindada)
async function importarPlanilhaOffshore(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Tenta atualizar a cotação antes de processar
    await initApp(); 

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });

            let contagem = 0;

            // Começa a ler da Linha 2 (índice 1), pulando os cabeçalhos
            for (let i = 1; i < matrix.length; i++) {
                const row = matrix[i];
                if (!row || row.length === 0) continue;

                const nomeAtivo = row[0];
                const codigo = row[1];
                
                // SEGURANÇA 1: Se a linha não tiver Nome nem Código, ela é vazia e deve ser pulada
                if (!nomeAtivo && !codigo) continue;

                const setor = row[2] || "Não Classificado";
                const paisLocal = row[3] || "Não Classificado";
                const classePlanilha = row[4] || "Renda Variavel Global"; 
                
                // SEGURANÇA 2: Se o valor estiver vazio, em branco ou for texto, transforma em ZERO (0)
                let rawValor = row[5];
                let valorDolar = 0; 
                
                if (rawValor !== undefined && rawValor !== null && rawValor !== "") {
                    if (typeof rawValor === 'string') {
                        valorDolar = parseFloat(rawValor.replace(',', '.'));
                    } else {
                        valorDolar = parseFloat(rawValor);
                    }
                }
                if (isNaN(valorDolar)) valorDolar = 0;

                const nomeFinal = codigo ? codigo.toString().toUpperCase() : nomeAtivo.toString();
                const regiaoMapeada = traduzirPaisParaRegiao(paisLocal);
                
                // Multiplica o ZERO (ou o valor real) pela cotação
                const valorEmReais = valorDolar * cotacaoDolarGlobal;

                if (!globalDetalheMap[classePlanilha]) {
                    globalDetalheMap[classePlanilha] = { total: 0, assets: [] };
                }

                globalDetalheMap[classePlanilha].total += valorEmReais;
                globalDetalheMap[classePlanilha].assets.push({
                    nome: nomeFinal,
                    valor: valorEmReais, // Fica guardado em Reais (R$ 0.00) nos cálculos
                    sub: "Dólar",
                    extras: { setor: setor, localizacao: regiaoMapeada }
                });
                contagem++;
            }

            // Exibe as mensagens corretas
            if (contagem > 0) {
                recalcularTudoERenderizar();
                alert(`Sucesso! ${contagem} ativos importados.\nCotação US$ usada: R$ ${cotacaoDolarGlobal.toFixed(3)}`);
            } else {
                alert("Aviso: A planilha foi lida, mas não encontramos nenhum ativo escrito da linha 2 em diante. Lembre-se de colocar ao menos o Nome ou Código!");
            }
        } catch (err) {
            console.error(err);
            alert("Erro interno ao ler a planilha. Verifique se ela não está corrompida.");
        } finally {
            // FECHA O MODAL E LIMPA O INPUT
            document.getElementById('modalImportacao').style.display = 'none'; 
            event.target.value = ''; 
        }
    };
    reader.readAsArrayBuffer(file);
}

// ==========================================
// MÓDULO NOVO: LEITOR DE EXTRATO AVENUE (PDF)
// ==========================================

// 1. Inicializa o motor do PDF.js
const pdfjsLib = window['pdfjs-dist/build/pdf'];
if (pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

async function importarPlanilhaAvenue(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Fecha o modal de seleção imediatamente
    document.getElementById('modalImportacao').style.display = 'none';

    // Bloqueia caso o utilizador suba um Excel aqui por engano
    if (file.type !== "application/pdf") {
        alert("Por favor, selecione o ficheiro PDF do extrato da Avenue (Posição Consolidada).");
        event.target.value = '';
        return;
    }

    // Puxa a cotação em tempo real
    await initApp(); 
    alert(`Iniciando a leitura do extrato Avenue...\nCotação US$ usada: R$ ${cotacaoDolarGlobal.toFixed(3)}`);

    const fileReader = new FileReader();
    fileReader.onload = async function() {
        try {
            const typedarray = new Uint8Array(this.result);
            const pdf = await pdfjsLib.getDocument(typedarray).promise;
            
            let contagem = 0;
            let currentCategory = "Renda Variavel Global"; // Categoria Padrão

            // Percorre todas as páginas do PDF
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                
                // Limpa os textos, removendo espaços vazios inúteis
                const items = textContent.items.map(item => item.str.trim()).filter(str => str.length > 0);

                for (let j = 0; j < items.length; j++) {
                    const strLower = items[j].toLowerCase();
                    
                    // A) RASTREADOR DE CATEGORIA: O robô "lê" o cabeçalho e memoriza onde está
                    if (strLower.includes("renda fixa")) currentCategory = "Renda Fixa Global";
                    if (strLower.includes("ações - global") || strLower.includes("ações global")) currentCategory = "Renda Variavel Global";

                    // B) RASTREADOR DE ATIVO: Identificou um ativo!
                    if (items[j] === "ETF's" || items[j] === "Bonds" || items[j] === "Stocks" || items[j] === "Caixa") {
                        const ativo = items[j+1]; // O código (Ex: SPY, BIL) é sempre a palavra seguinte
                        
                        let volumeDolar = 0;
                        let percCount = 0;
                        let k = j + 2;
                        
                        // C) CAÇADOR DE VOLUME: A Avenue coloca 2 percentagens no fim da linha (VAR e Peso).
                        // O valor do "Volume" é SEMPRE o item exato antes da segunda percentagem.
                        while(k < items.length && percCount < 2) {
                            if (items[k].includes('%')) {
                                percCount++;
                                if (percCount === 2) {
                                    let volStr = items[k-1];
                                    // Limpa o formato americano/brasileiro (ex: 6.368,98 -> 6368.98)
                                    volumeDolar = parseFloat(volStr.replace(/\./g, '').replace(',', '.'));
                                    break;
                                }
                            }
                            k++;
                        }

                        // D) INJETA NA PLATAFORMA
                        if (volumeDolar > 0) {
                            const valorEmReais = volumeDolar * cotacaoDolarGlobal;
                            
                            // Se for Caixa da corretora, manda direto para a classe Caixa
                            let categoriaFinal = currentCategory;
                            if (items[j] === "Caixa") categoriaFinal = "Caixa";

                            if (!globalDetalheMap[categoriaFinal]) {
                                globalDetalheMap[categoriaFinal] = { total: 0, assets: [] };
                            }

                            globalDetalheMap[categoriaFinal].total += valorEmReais;
                            globalDetalheMap[categoriaFinal].assets.push({
                                nome: ativo.toUpperCase(),
                                valor: valorEmReais,
                                sub: "Dólar",
                                // Como a Avenue não dá o setor, padronizamos como EUA e Não Classificado
                                extras: { setor: "Não Classificado", localizacao: "América do Norte" }
                            });
                            contagem++;
                        }
                    }
                }
            }

            // Exibe o resultado final e redesenha a tela
            if (contagem > 0) {
                recalcularTudoERenderizar();
                alert(`Sucesso! ${contagem} ativos do extrato Avenue foram extraídos, categorizados e convertidos para Reais.`);
            } else {
                alert("O PDF foi lido, mas nenhum ativo válido foi encontrado. Verifique se escolheu o documento 'Posição Consolidada'.");
            }

        } catch (err) {
            console.error("Erro na extração do PDF:", err);
            alert("Erro ao processar o PDF. O ficheiro pode estar protegido com palavra-passe ou corrompido.");
        } finally {
            event.target.value = ''; // Limpa o input para permitir subir de novo, se necessário
        }
    };
    fileReader.readAsArrayBuffer(file);
}