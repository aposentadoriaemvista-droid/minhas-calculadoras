// script.js (VERSÃO 16.0: UNIFICAÇÃO MATEMÁTICA FGC x GRÁFICOS)

// --- Variáveis Globais ---
let todosOsAtivos = [];
let nomeClienteGlobal = "Cliente"; 
const LIMITE_FGC = 250000;
const TIPOS_FGC = ['CDB', 'LCI', 'LCA', 'LCD', 'LC', 'RDB']; 

// Elementos DOM
const pdfUpload = document.getElementById('pdf-upload');
const reportContainer = document.getElementById('report-container');
const filtroEmissor = document.getElementById('filtro-emissor');
const btnRecalcular = document.getElementById('recalcular-btn');
const insightsContainer = document.getElementById('insights-container');
const tableContainer = document.getElementById('table-container');
const rendimentosMensaisContainer = document.getElementById('rendimentos-mensais-container');
const listaEmissoresContainer = document.getElementById('lista-emissores-container');
const btnToggleFluxo = document.getElementById('toggle-fluxo-btn');
const btnPrint = document.getElementById('btn-print-pdf');
const btnCopy = document.getElementById('btn-copy-summary');

// Botão para abrir o fluxo mensal
const btnOpenFluxoMensal = document.getElementById('btn-open-fluxo-mensal');

// Modais
const contactModal = document.getElementById('contact-modal');
const modalFluxo = document.getElementById('modal-fluxo');
const closeContact = document.getElementById('close-contact');
const closeFluxo = document.getElementById('close-fluxo');
const contactBtn = document.getElementById('contact-btn');

// Charts Setup
let fluxoCaixaChart = null; let fluxoMensalChart = null; 
let projecaoChart = null; let indexadoresChart = null; let tributacaoChart = null;
let fluxoCaixaChartCtx = null; let fluxoMensalChartCtx = null;
let projecaoChartCtx = null; let indexadoresChartCtx = null; let tributacaoChartCtx = null;

document.addEventListener('DOMContentLoaded', () => {
    const c1 = document.getElementById('fluxo-caixa-chart');
    const c2 = document.getElementById('projecao-patrimonio-chart');
    const c3 = document.getElementById('indexadores-chart');
    const c4 = document.getElementById('tributacao-chart');
    const c5 = document.getElementById('fluxo-mensal-chart');
    
    if(c1) fluxoCaixaChartCtx = c1.getContext('2d');
    if(c2) projecaoChartCtx = c2.getContext('2d');
    if(c3) indexadoresChartCtx = c3.getContext('2d');
    if(c4) tributacaoChartCtx = c4.getContext('2d');
    if(c5) fluxoMensalChartCtx = c5.getContext('2d');
    
    document.querySelectorAll('.auto-calc').forEach(input => {
        input.addEventListener('input', () => { if(todosOsAtivos.length > 0) aplicarFiltros(); });
    });
});

// --- EVENT LISTENERS ---
contactBtn.addEventListener('click', () => contactModal.classList.add('show'));
closeContact.addEventListener('click', () => contactModal.classList.remove('show'));

btnOpenFluxoMensal.addEventListener('click', () => {
    modalFluxo.classList.add('show');
    gerarGraficoFluxoMensal(todosOsAtivos);
});
closeFluxo.addEventListener('click', () => modalFluxo.classList.remove('show'));

window.addEventListener('click', (event) => { 
    if (event.target == contactModal) contactModal.classList.remove('show');
    if (event.target == modalFluxo) modalFluxo.classList.remove('show');
});

pdfUpload.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') lerPDF(file);
    else alert("Por favor, selecione um arquivo PDF.");
});

filtroEmissor.addEventListener('change', aplicarFiltros);
btnRecalcular.addEventListener('click', aplicarFiltros);

btnPrint.addEventListener('click', () => {
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    document.getElementById('data-relatorio').textContent = `Data da Análise: ${dataHoje}`;
    window.print();
});

btnCopy.addEventListener('click', gerarResumoClipboard);

// --- CÁLCULOS FINANCEIROS UNIFICADOS ---

function diffMeses(d1, d2) {
    let months;
    months = (d2.getFullYear() - d1.getFullYear()) * 12;
    months -= d1.getMonth();
    months += d2.getMonth();
    return months <= 0 ? 0 : months;
}

function estimarTaxaAnual(taxaStr) {
    const pCDI = parseFloat(document.getElementById('projecao-cdi').value) || 0;
    const pIPCA = parseFloat(document.getElementById('projecao-ipca').value) || 0;
    const pSelic = parseFloat(document.getElementById('projecao-selic').value) || 0;
    const pIGPM = parseFloat(document.getElementById('projecao-igpm').value) || 0;

    if(!taxaStr) return 0;
    let t = taxaStr.toUpperCase().replace(/\s/g, '').replace(',', '.');
    
    // CDI
    if (t.includes('CDI')) {
        const matchPct = t.match(/(\d+[.,]?\d*)%/);
        if (matchPct) return (pCDI / 100) * (parseFloat(matchPct[1]) / 100);
        const matchSpread = t.match(/\+(\d+[.,]?\d*)/);
        if (matchSpread) return (pCDI / 100) + (parseFloat(matchSpread[1]) / 100);
        return pCDI / 100;
    }
    // IPCA
    if (t.includes('IPCA') || t.includes('IPC-A')) {
        let fixedPart = 0; const match = t.match(/[\+\-](\d+\.?\d*)/); if (match) fixedPart = parseFloat(match[1]);
        return ((pIPCA + fixedPart) / 100);
    }
    // Selic
    if (t.includes('SELIC') || t.includes('LFT')) {
        let fixedPart = 0; const match = t.match(/[\+\-](\d+\.?\d*)/); if (match) fixedPart = parseFloat(match[1]);
        return ((pSelic + fixedPart) / 100);
    }
    // IGPM
    if (t.includes('IGPM') || t.includes('IGP-M')) {
        let fixedPart = 0; const match = t.match(/[\+\-](\d+\.?\d*)/); if (match) fixedPart = parseFloat(match[1]);
        return ((pIGPM + fixedPart) / 100);
    }
    // Pré
    let val = parseFloat(t.replace('%', '')); if (!isNaN(val)) return val / 100;
    return 0; 
}

// Verifica se é ativo de cupom (não reinveste juros)
function isAtivoCupom(ativo) {
    const nome = ativo.produto.toUpperCase();
    return nome.includes("JUROS MENSAIS") || nome.includes("JURO MENSAL") || nome.includes("CUPOM");
}

// FUNÇÃO MESTRA: Calcula quanto o ativo valerá em uma data futura específica
function calcularValorProjetadoEmData(ativo, dataFutura) {
    const hoje = new Date();
    const vencimento = parseDataBR(ativo.dataVencimento);
    
    // Se o ativo já venceu na data futura, o valor investido é 0 (foi resgatado)
    if (!vencimento || vencimento < dataFutura) return 0;

    // Se a data futura é hoje ou passado, retorna valor atual
    if (dataFutura <= hoje) return ativo.valorLiquido;

    // Se é cupom, o principal não cresce (juros saem). Retorna valor atual.
    if (isAtivoCupom(ativo)) {
        return ativo.valorLiquido;
    }

    // Juros Compostos (Bullet)
    const taxaAnual = estimarTaxaAnual(ativo.taxa);
    const taxaMensal = Math.pow(1 + taxaAnual, 1/12) - 1;
    const meses = diffMeses(hoje, dataFutura);
    
    return ativo.valorLiquido * Math.pow(1 + taxaMensal, meses);
}

// Calcula valor final no vencimento (para Fluxo de Caixa)
function calcularValorFinalVencimento(ativo) {
    const vencimento = parseDataBR(ativo.dataVencimento);
    if (!vencimento) return ativo.valorLiquido;
    
    // Usamos a função mestra projetando até a data de vencimento
    // Para cupom, ela já retorna apenas o principal (sem juros acumulados)
    return calcularValorProjetadoEmData(ativo, vencimento);
}


// --- PARSERS E HELPERS ---

function categorizarPorIndexador(ativo) {
    const taxaLimpa = ativo.taxa ? ativo.taxa.toUpperCase().replace(/[\s-]/g, '') : "";
    const produtoLimpo = ativo.produto ? ativo.produto.toUpperCase().replace(/[\s-]/g, '') : "";
    if (taxaLimpa.includes('IPCA') || taxaLimpa.includes('IMAB') || produtoLimpo.includes('NTNB') || produtoLimpo.includes('IPCA')) return 'Híbrido (Inflação)';
    if (taxaLimpa.includes('CDI') || produtoLimpo.includes('LFT') || taxaLimpa.includes('SELIC')) return taxaLimpa.includes('CDI') ? 'Pós-fixado (CDI)' : 'Pós-fixado (Selic)';
    if (taxaLimpa.includes('IGPM')) return 'Híbrido (Inflação)';
    if (taxaLimpa.includes('%') || taxaLimpa.includes('PRE')) return 'Pré-fixado';
    return 'Outro';
}

function formatCurrency(value) { return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function parseDataBR(dataStr) { if (!dataStr) return null; const p = dataStr.split('/'); if (p.length === 3) return new Date(p[2], p[1]-1, p[0]); return null; }
function limparDataXP(str) { if (!str) return ""; return str.replace(/\s/g, ''); }
function limparNumeroXP(str) { if (!str) return 0; let limpo = str.replace(/\./g, '').replace(/\s/g, ''); limpo = limpo.replace(',', '.'); return parseFloat(limpo); }

function extrairBanco(nome) { 
    const nomeUpper = nome.toUpperCase();
    if (nomeUpper.includes("NTN") || nomeUpper.includes("LTN") || nomeUpper.includes("TESOURO")) return "Tesouro Nacional";
    if (nomeUpper.includes("MASTER") || nomeUpper.includes("WILL FINANCEIRA")) return "Banco Master";
    if (nomeUpper.includes("C6")) return "Banco C6"; 
    
    let nomeLimpo = nome
        .replace(/\s*-\s*\d{2}\/\d{2}\/\d{2,4}/g, '') 
        .replace(/\s*-\s*[A-Za-zçÇ]{3}\s*[\/-]\s*\d{2,4}/gi, '') 
        .replace(/\s+-\s+$/, '') 
        .trim();

    if (nomeLimpo.length < 2) return "Outros"; 
    return nomeLimpo; 
}

function normalizarAtivo(ativo) {
    const ativoNormalizado = { ...ativo };
    if (ativoNormalizado.tipo.includes("NTN") || ativoNormalizado.tipo.includes("Tesouro")) ativoNormalizado.banco = 'Tesouro Nacional';
    ativoNormalizado.banco = extrairBanco(ativoNormalizado.banco); 
    return ativoNormalizado;
}

// Regex Parsers
const regexBTG = /(BACEN - BANCO CENTRAL DO BRASIL\s*-\s*RJ)\s+(LFT|LTN|NTNB(?: - P)?)\s+(\d{2}\/\d{2}\/\d{2,4})\s+(\d{2}\/\d{2}\/\d{2,4})[\s\S]*?((?:SELIC|OVER|IPCA)\s*\+\s*[\d,]+\s*%)[\s\S]*?([\d.,]+)\s+(?:[\d.,]+|-)\s+-\s+([\d.,]+)|(BANCO BTG PACTUAL S A)\s+(LCA\s*-\s*.*?)\s+(\d{2}\/\d{2}\/\d{2,4})\s+(\d{2}\/\d{2}\/\d{2,4})[\s\S]*?((?:IPCA|CDI)\s*\+\s*[\d,]+\s*%)[\s\S]*?([\d.,]+)\s+-\s+-\s+([\d.,]+)/g;
// --- REGEX ATUALIZADO (Evita capturar o ano na taxa e inclui Tesouro da Renda Fixa) ---
// script.js

// Adicionei uma verificação de que o ativo deve estar em uma linha que parece 
// com a tabela de Renda Fixa (que tem datas de aplicação e carência próximas)
const regexXP = /(CDB|LCI|LCA|LCD|LC|RDB|CRI|CRA|DEB|LIG|CDCA|LF|NTN\s*-?\s*[BF]|LTN|LFT|NTNB\s*PRINC)([\s\S]{1,100}?)(\d{2}\s*\/\s*\d{2}\s*\/\s*\d{4})\s+(\d{2}\s*\/\s*\d{2}\s*\/\s*\d{4})\s+(\d{2}\s*\/\s*\d{2}\s*\/\s*20\d{2})\s*[\s\S]*?((?:[A-Za-z\s-]+\+)?\s*-?\s*[\d.,\s]+%(?:\s*[A-Za-z]+)?|[\d.,\s]+%[\s\S]*?CDI)[\s\S]*?R\s*\$\s*([\d.,\s]+)[\s\S]*?R\s*\$\s*([\d.,\s]+)[\s\S]*?R\s*\$\s*([\d.,\s]+)/g;

function parseBTGMatch(match) {
    const emissor = match[1]||match[8]; const produto = match[2]||match[9]; const dataVencimento = match[4]||match[11]; const taxa = match[5]||match[12]; const valorLiquidoStr = match[7]||match[14]; const valorLiquido = parseFloat(valorLiquidoStr.replace(/\./g, '').replace(',', '.'));
    return { tipo: produto.split(' ')[0], banco: emissor.trim(), produto: produto.trim(), dataAplicacao: match[3]||match[10], dataVencimento: dataVencimento, taxa: taxa.replace(/\s+/g, ' ').trim(), valorAplicado: valorLiquido, valorLiquido: valorLiquido };
}

function parseXPMatch(match) {
    let tipoAtivo = match[1].trim();
    let nomeBruto = match[2].replace(/\n/g, ' ').trim();
    // No novo Regex: match[3] = Aplicação, match[4] = Carência, match[5] = Vencimento, match[6] = Taxa
    let taxaBruta = match[6].replace(/\s+/g, ' ').trim();
    
    // Limpeza de ano grudado na taxa (ex: 202692,00%)
    taxaBruta = taxaBruta.replace(/^(202\d|203\d)/, '');

    // Filtro rigoroso: Se for Tesouro (NTN/LTN/LFT), SÓ aceita se a taxa for explícita
    const tiposTesouro = ["NTN", "LTN", "LFT", "TESOURO"];
    if (tiposTesouro.some(t => tipoAtivo.toUpperCase().includes(t))) {
        // Se a taxa capturada for apenas um número sem % ou +, ou se for vazia, descarta
        if (!taxaBruta.includes("%") && !taxaBruta.includes("+")) return null;
    }

    // Bloqueio de Proventos e lixo de outras seções
    const nomeUpper = nomeBruto.toUpperCase();
    if (nomeUpper.includes("RENDIMENTO") || nomeUpper.includes("PROVENTOS") || nomeUpper.includes("ÚLTIMA COTAÇÃO")) return null;

    const valorLiquido = limparNumeroXP(match[9]); // O valor líquido agora está no match[9]
    if (valorLiquido < 10) return null;

    return { 
        tipo: tipoAtivo, 
        banco: extrairBanco(nomeBruto), 
        produto: `${tipoAtivo} ${nomeBruto}`, 
        dataAplicacao: limparDataXP(match[3]), 
        dataVencimento: limparDataXP(match[5]), // Usamos o Vencimento real
        taxa: taxaBruta, 
        valorAplicado: limparNumeroXP(match[8]), 
        valorLiquido: valorLiquido 
    };
}
const BIBLIOTECA_DE_PARSERS = [
    { nomeCorretora: 'XP Investimentos', regex: regexXP, funcaoDeExtracao: parseXPMatch },
    { nomeCorretora: 'BTG Pactual', regex: regexBTG, funcaoDeExtracao: parseBTGMatch }
];
// --- LEITURA PDF ---
async function lerPDF(file) {
    const reader = new FileReader(); reader.onload = async function() {
        const typedarray = new Uint8Array(this.result); pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js`;
        try { const pdfDoc = await pdfjsLib.getDocument(typedarray).promise; let fullText = '';
            for (let i = 1; i <= pdfDoc.numPages; i++) { const page = await pdfDoc.getPage(i); const textContent = await page.getTextContent(); fullText += textContent.items.map(item => item.str).join(' '); }
            processarTextoDoPDF(fullText);
        } catch (error) { alert("Erro ao ler PDF."); }
    }; reader.readAsArrayBuffer(file);
}

function processarTextoDoPDF(text) {
    let ativos = [];
    const matchNome = text.match(/Cliente:?\s*([^\n\r]+?)(?:\s+Conta|\s+Perfil|$)/i);
    if (matchNome && matchNome[1]) {
        nomeClienteGlobal = matchNome[1].trim();
        document.getElementById('cliente-nome-tela').textContent = `Cliente: ${nomeClienteGlobal}`;
        document.getElementById('cliente-nome-print').textContent = `Cliente: ${nomeClienteGlobal}`;
        document.title = `Relatório - ${nomeClienteGlobal}`;
    }
    text = text.replace(/Posição Consolidada\s+Data de referência\s*:\s*\d{2}\s*\/\s*\d{2}\s*\/\s*\d{4}/gi, ' ');
    const regexCorte = /P\s*R\s*[ÓO]\s*X\s*I\s*M\s*O\s*S\s*[\s\S]*?V\s*E\s*N\s*C\s*I\s*M\s*E\s*N\s*T\s*O\s*S/i;
    const matchCorte = text.match(regexCorte); if (matchCorte && matchCorte.index) text = text.substring(0, matchCorte.index);
    text = text.replace(/Posição Consolidada/gi, ' '); 
    for (const parser of BIBLIOTECA_DE_PARSERS) { let match; parser.regex.lastIndex = 0; while ((match = parser.regex.exec(text)) !== null) { try { const ativoBruto = parser.funcaoDeExtracao(match); if (!ativoBruto) continue; if (ativoBruto.produto.toUpperCase().includes("PRE DU ")||ativoBruto.produto.toUpperCase().includes("POS DU ")) continue; // Agora:
const ativoComId = normalizarAtivo(ativoBruto);
ativoComId.id = Math.random(); // Atribui ID aos ativos do PDF
ativos.push(ativoComId); } catch (e) {} } }
    if (ativos.length > 0) { reportContainer.style.display = 'block'; todosOsAtivos = ativos; popularFiltros(todosOsAtivos); aplicarFiltros(); } else { alert("Nenhum ativo encontrado."); }
}

// --- DASHBOARD GERAÇÃO ---
function popularFiltros(ativos) { filtroEmissor.innerHTML = ''; const allOption = document.createElement('option'); allOption.value = 'todos'; allOption.textContent = 'Todos os Emissores'; filtroEmissor.appendChild(allOption); const emissores = [...new Set(ativos.map(ativo => ativo.banco))]; emissores.sort().forEach(emissor => { const option = document.createElement('option'); option.value = emissor; option.textContent = emissor; filtroEmissor.appendChild(option); }); }
function aplicarFiltros() { const valorFiltro = filtroEmissor.value; let ativosFiltrados = todosOsAtivos; if (valorFiltro !== 'todos') ativosFiltrados = todosOsAtivos.filter(ativo => ativo.banco === valorFiltro); criarRelatorio(ativosFiltrados); }

function criarRelatorio(ativos) {
    criarTabelaDetalhada(ativos); 
    gerarInsights(ativos); 
    gerarPrevisaoRendimentos(ativos); 
    desenharGraficoIndexadores(ativos); 
    gerarListaEmissores(ativos); 
    criarGraficoFluxoCaixa(ativos); 
    criarGraficoProjecaoPatrimonio(ativos);
    gerarGraficoTributacao(ativos);
}

function gerarGraficoTributacao(ativos) {
    if(!tributacaoChartCtx) return;
    const tiposIsentos = ['LCI', 'LCA', 'CRI', 'CRA', 'LCD', 'LIG']; let totalIsento = 0; let totalTributavel = 0;
    ativos.forEach(at => { const tipoUpper = at.tipo.toUpperCase(); const prodUpper = at.produto.toUpperCase(); let isIsento = false; if (tiposIsentos.some(t => tipoUpper.includes(t))) isIsento = true; if (tipoUpper.includes('DEB') && (prodUpper.includes('INC') || prodUpper.includes('INCENTIVADA'))) isIsento = true; if (isIsento) totalIsento += at.valorLiquido; else totalTributavel += at.valorLiquido; });
    if (tributacaoChart) tributacaoChart.destroy();
    tributacaoChart = new Chart(tributacaoChartCtx, { type: 'bar', data: { labels: ['Carteira'], datasets: [ { label: 'Isentos de IR', data: [totalIsento], backgroundColor: '#198754', barThickness: 40 }, { label: 'Tributáveis', data: [totalTributavel], backgroundColor: '#dc3545', barThickness: 40 } ] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true, display: false }, y: { stacked: true, display: false, grid: { display: false } } }, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: function(context) { const val = context.raw; const total = totalIsento + totalTributavel; const perc = ((val/total)*100).toFixed(1); return `${context.dataset.label}: ${formatCurrency(val)} (${perc}%)`; }}} } } });
}

function gerarResumoClipboard() { const total = todosOsAtivos.reduce((acc, at) => acc + at.valorLiquido, 0); const qtd = todosOsAtivos.length; let text = `📊 *Resumo de Carteira - ${nomeClienteGlobal}*\n💰 Total: ${formatCurrency(total)}\n📄 Ativos: ${qtd}\n\n⚠️ *Avisos de Risco (FGC):*\n`; const porBanco = {}; todosOsAtivos.forEach(at => { if (!porBanco[at.banco]) porBanco[at.banco] = 0; if (TIPOS_FGC.some(t => at.tipo.toUpperCase().includes(t))) porBanco[at.banco] += at.valorLiquido; }); let riscoEncontrado = false; for (const [banco, valor] of Object.entries(porBanco)) { if (valor > LIMITE_FGC * 0.9) { text += `- ${banco}: ${formatCurrency(valor)} (Atenção!)\n`; riscoEncontrado = true; } } if (!riscoEncontrado) text += "Nenhum emissor próximo do teto FGC (R$ 250k).\n"; text += `\n📅 Gerado em: ${new Date().toLocaleDateString()}`; navigator.clipboard.writeText(text).then(() => { alert("Resumo copiado!"); }).catch(err => alert("Erro ao copiar.")); }


function criarTabelaDetalhada(ativos) {
    let tableHTML = '<table><thead><tr><th>Emissor/Produto</th><th>Vencimento</th><th>Taxa</th><th>Valor Bruto</th><th class="no-print">Ações</th></tr></thead><tbody>';
    ativos.forEach(ativo => {
        tableHTML += `<tr>
            <td>${ativo.produto}</td>
            <td>${ativo.dataVencimento}</td>
            <td>${ativo.taxa}</td>
            <td>${formatCurrency(ativo.valorLiquido)}</td>
            <td class="no-print">
                <button onclick="excluirAtivo(${ativo.id})" style="background:none; border:none; color:red; cursor:pointer;">🗑️</button>
            </td>
        </tr>`;
    });
    tableHTML += '</tbody></table>';
    tableContainer.innerHTML = tableHTML;
}



function gerarPrevisaoRendimentos(ativos) { const ativosComJuros = ativos.filter(ativo => isAtivoCupom(ativo)); if (ativosComJuros.length === 0) { rendimentosMensaisContainer.innerHTML = '<p>Nenhum ativo com juros mensais.</p>'; return; } let totalMensal = 0; let html = '<ul>'; ativosComJuros.forEach(ativo => { const taxaAnual = estimarTaxaAnual(ativo.taxa); const rendaMensalBruta = (ativo.valorLiquido * taxaAnual) / 12; const rendaMensalLiq = rendaMensalBruta * 0.85; totalMensal += rendaMensalLiq; html += `<li><strong>${ativo.produto}:</strong> ~${formatCurrency(rendaMensalLiq)}</li>`; }); html += '</ul>'; html += `<hr><p><strong>Total Estimado: ${formatCurrency(totalMensal)}/mês</strong></p>`; rendimentosMensaisContainer.innerHTML = html; }
function gerarInsights(ativos) { if (ativos.length === 0) return; const total = ativos.reduce((acc, at) => acc + at.valorLiquido, 0); const hoje = new Date(); hoje.setHours(0,0,0,0); const proximo = ativos.map(a => ({...a, dt: parseDataBR(a.dataVencimento)})).filter(a => a.dt && a.dt >= hoje).sort((a,b) => a.dt - b.dt)[0]; const porEmissor = {}; ativos.forEach(a => porEmissor[a.banco] = (porEmissor[a.banco] || 0) + a.valorLiquido); const maiorEmissor = Object.keys(porEmissor).reduce((a, b) => porEmissor[a] > porEmissor[b] ? a : b); let html = `<ul><li><strong>Quantidade de Ativos:</strong> ${ativos.length}</li><li><strong>Total Patrimônio:</strong> ${formatCurrency(total)}</li><li><strong>Próximo Vencimento:</strong> ${proximo ? proximo.dataVencimento + " (" + proximo.produto + ")" : "Nenhum"}</li><li><strong>Maior Concentração:</strong> ${maiorEmissor} (${formatCurrency(porEmissor[maiorEmissor])})</li></ul>`; insightsContainer.innerHTML = html; }

// --- LISTA FGC (COM LÓGICA DE GARGALO CUMULATIVO) ---
function gerarListaEmissores(ativos) {
    const porBanco = {}; 
    const taxaSimulacaoAnual = parseFloat(document.getElementById('taxa-simulacao').value) || 12.0; 
    const taxaSimulacaoMensal = Math.pow(1 + (taxaSimulacaoAnual / 100), 1/12) - 1;
    const hoje = new Date();

    // 1. Agrupa ativos por banco
    ativos.forEach(at => { 
        if (!porBanco[at.banco]) porBanco[at.banco] = { total: 0, totalFGC: 0, ativos: [], temAtivoFGC: false }; 
        porBanco[at.banco].total += at.valorLiquido; 
        porBanco[at.banco].ativos.push(at); 
        
        const isFGC = TIPOS_FGC.some(tipo => at.tipo.toUpperCase().includes(tipo)); 
        if (isFGC) { 
            porBanco[at.banco].totalFGC += at.valorLiquido; 
            porBanco[at.banco].temAtivoFGC = true; 
        } 
    });

    let html = '';
    
    // 2. Itera sobre os bancos
    Object.keys(porBanco).sort((a,b) => porBanco[b].totalFGC - porBanco[a].totalFGC).forEach(banco => {
        const dados = porBanco[banco]; 
        const percentualUso = Math.min(100, (dados.totalFGC / LIMITE_FGC) * 100); 
        let corBarra = percentualUso > 100 ? '#dc3545' : (percentualUso > 80 ? '#ffc107' : '#198754');
        let htmlAportes = "";

        if (dados.temAtivoFGC) {
            // A. Coletar TODAS as datas críticas (vencimentos)
            let datasCriticas = [];
            dados.ativos.forEach(a => { 
                if (TIPOS_FGC.some(t => a.tipo.toUpperCase().includes(t))) {
                    const dt = parseDataBR(a.dataVencimento); 
                    if (dt && dt >= hoje) datasCriticas.push(dt);
                }
            });
            
            // B. Ordenar cronologicamente (do mais próximo para o mais distante)
            datasCriticas.sort((a, b) => a - b);

            // Se não houver vencimentos futuros, não gera lista
            if (datasCriticas.length > 0) {
                htmlAportes += `<div style="margin-top: 8px; border-top: 1px dashed #eee; padding-top: 6px;">`; 
                htmlAportes += `<p style="margin: 0 0 4px 0; font-size: 0.8em; font-weight: bold; color: #555;">Potencial de Aporte Hoje (Simulação):</p>`;
                
                // Mapa para guardar o resultado final por ano
                const resultadoPorAno = {};
                const anosEncontrados = new Set();
                
                // Variável de "Teto de Segurança". Começa infinito.
                // Ela só pode diminuir, nunca aumentar.
                let tetoSegurancaAcumulado = 9999999999; 

                // C. Varredura Cronológica (Lógica do Gargalo)
                datasCriticas.forEach(dataCritica => {
                    const ano = dataCritica.getFullYear();
                    anosEncontrados.add(ano);

                    // 1. Projeção na data
                    let saldoProjetadoNaData = 0;
                    dados.ativos.forEach(a => {
                        if (TIPOS_FGC.some(t => a.tipo.toUpperCase().includes(t))) {
                            saldoProjetadoNaData += calcularValorProjetadoEmData(a, dataCritica);
                        }
                    });

                    // 2. Gap Futuro
                    const gapFuturo = Math.max(0, LIMITE_FGC - saldoProjetadoNaData);

                    // 3. Valor Presente (Quanto posso por HOJE considerando APENAS essa data)
                    const mesesAteData = diffMeses(hoje, dataCritica);
                    const aportePermitidoIsolado = gapFuturo / Math.pow(1 + taxaSimulacaoMensal, mesesAteData);

                    // 4. APLICA O GARGALO: O permitido hoje é o menor entre o que já calculamos antes e o atual
                    if (aportePermitidoIsolado < tetoSegurancaAcumulado) {
                        tetoSegurancaAcumulado = aportePermitidoIsolado;
                    }

                    // Grava o teto atual para o ano (sobrescrevendo se houver múltiplas datas no ano, 
                    // pois como está ordenado e o teto só cai, o último valor do ano será o mais seguro/restritivo)
                    resultadoPorAno[ano] = tetoSegurancaAcumulado;
                });

                // D. Renderização
                const anosOrdenados = Array.from(anosEncontrados).sort();
                anosOrdenados.forEach(ano => {
                    const valor = resultadoPorAno[ano];
                    let aporteMsg = "";
                    
                    if (valor <= 100) {
                        aporteMsg = `<span style="color:#dc3545; font-size:0.8em;">${ano}: Teto Atingido</span>`; 
                    } else {
                        aporteMsg = `<span style="color:#198754; font-size:0.8em;">${ano}: +${formatCurrency(valor)}</span>`; 
                    }
                    htmlAportes += `<div style="display:inline-block; margin-right:10px;">${aporteMsg}</div>`;
                });
                
                htmlAportes += `</div>`;
            }
        }
        
        html += `<div class="emissor-item">
            <div class="emissor-header"><span>${banco}</span><span>Total: ${formatCurrency(dados.total)}</span></div>
            <div class="emissor-info"><span>Utilizado FGC: ${formatCurrency(dados.totalFGC)} (${percentualUso.toFixed(1)}%)</span></div>
            <div class="fgc-bar-bg"><div class="fgc-bar-fill" style="width: ${percentualUso}%; background-color: ${corBarra};"></div></div>
            ${htmlAportes}
        </div>`;
    });
    
    listaEmissoresContainer.innerHTML = html;
}

// --- GRÁFICOS UNIFICADOS ---

function criarGraficoFluxoCaixa(ativos) {
    const dadosMap = {}; let minDate = new Date(3000, 0, 1); let maxDate = new Date(2000, 0, 1);
    ativos.forEach(at => { 
        const dt = parseDataBR(at.dataVencimento); if (!dt) return; 
        if (dt < minDate) minDate = dt; if (dt > maxDate) maxDate = dt; 
        let key = dt.getFullYear().toString(); 
        
        // Aqui usamos a função específica para vencimento (trava cupom no principal)
        const valorNoVencimento = calcularValorFinalVencimento(at); 
        dadosMap[key] = (dadosMap[key] || 0) + valorNoVencimento; 
    });
    const labels = []; const data = []; for (let y = minDate.getFullYear(); y <= maxDate.getFullYear(); y++) { labels.push(y.toString()); data.push(dadosMap[y.toString()] || 0); }
    if (fluxoCaixaChart) fluxoCaixaChart.destroy(); fluxoCaixaChart = new Chart(fluxoCaixaChartCtx, { type: 'bar', data: { labels: labels, datasets: [{ label: 'Valor Projetado no Vencimento (R$)', data: data, backgroundColor: '#fd7e14' }] }, options: { scales: { y: { beginAtZero: true } } } });
}

function gerarGraficoFluxoMensal(ativos) {
    if(!fluxoMensalChartCtx) return;
    const dadosMap = {}; let minDate = new Date(3000, 0, 1); let maxDate = new Date(2000, 0, 1);
    ativos.forEach(at => { 
        const dt = parseDataBR(at.dataVencimento); if (!dt) return; 
        if (dt < minDate) minDate = dt; if (dt > maxDate) maxDate = dt; 
        const mes = (dt.getMonth() + 1).toString().padStart(2, '0'); 
        const key = `${mes}/${dt.getFullYear()}`; 
        const valorNoVencimento = calcularValorFinalVencimento(at); 
        dadosMap[key] = (dadosMap[key] || 0) + valorNoVencimento; 
    });
    const labels = []; const data = []; let curr = new Date(minDate.getFullYear(), minDate.getMonth(), 1); while (curr <= maxDate) { const mes = (curr.getMonth() + 1).toString().padStart(2, '0'); const key = `${mes}/${curr.getFullYear()}`; labels.push(key); data.push(dadosMap[key] || 0); curr.setMonth(curr.getMonth() + 1); }
    const container = document.querySelector('.chart-scroll-inner'); if(container) { const newWidth = Math.max(container.parentElement.clientWidth, labels.length * 40); container.style.width = `${newWidth}px`; }
    if (fluxoMensalChart) fluxoMensalChart.destroy(); fluxoMensalChart = new Chart(fluxoMensalChartCtx, { type: 'bar', data: { labels: labels, datasets: [{ label: 'Valor Projetado no Vencimento (R$)', data: data, backgroundColor: '#fd7e14' }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } } });
}

function criarGraficoProjecaoPatrimonio(ativos) {
    const hoje = new Date(); hoje.setDate(1); hoje.setHours(0,0,0,0); 
    let maxDate = hoje; 
    ativos.forEach(at => { const dt = parseDataBR(at.dataVencimento); if (dt && dt > maxDate) maxDate = dt; });
    
    const labels = []; 
    const dataInvestido = []; 
    
    let cursor = new Date(hoje);
    
    // Itera mês a mês até o último vencimento
    while (cursor <= maxDate) { 
        labels.push(`${(cursor.getMonth()+1).toString().padStart(2,'0')}/${cursor.getFullYear()}`); 
        
        let totalMes = 0; 
        
        // Usa a FUNÇÃO MESTRA para calcular o valor de cada ativo nesta data exata (cursor)
        ativos.forEach(ativo => { 
             totalMes += calcularValorProjetadoEmData(ativo, cursor);
        }); 
        
        dataInvestido.push(totalMes); 
        cursor.setMonth(cursor.getMonth() + 1); 
    }

    if (projecaoChart) projecaoChart.destroy(); 
    projecaoChart = new Chart(projecaoChartCtx, { type: 'line', data: { labels: labels, datasets: [{ label: 'PROJEÇÃO DE EXPOSIÇÃO (R$)', data: dataInvestido, borderColor: '#198754', backgroundColor: 'rgba(25, 135, 84, 0.1)', fill: true, pointRadius: 0, borderWidth: 2 }] }, options: { interaction: { intersect: false, mode: 'index' }, scales: { y: { beginAtZero: true } }, plugins: { tooltip: { callbacks: { label: function(context) { return formatCurrency(context.raw); } } } } } });
}

function desenharGraficoIndexadores(ativos) { const dataPoints = {}; ativos.forEach(at => { const idx = categorizarPorIndexador(at); dataPoints[idx] = (dataPoints[idx] || 0) + at.valorLiquido; }); if (indexadoresChart) indexadoresChart.destroy(); indexadoresChart = new Chart(indexadoresChartCtx, { type: 'pie', data: { labels: Object.keys(dataPoints), datasets: [{ data: Object.values(dataPoints), backgroundColor: ['#0d6efd', '#ffc107', '#dc3545', '#198754'] }] } }); }
// --- FUNÇÕES DE MANIPULAÇÃO MANUAL ---

// 1. Função para Adicionar
document.getElementById('btn-add-manual').addEventListener('click', () => {
    const nome = document.getElementById('add-nome').value;
    const vencimento = document.getElementById('add-vencimento').value;
    const taxa = document.getElementById('add-taxa').value;
    const valor = parseFloat(document.getElementById('add-valor').value);

    if (!nome || !vencimento || !taxa || isNaN(valor)) {
        alert("Preencha todos os campos corretamente.");
        return;
    }

    const novoAtivo = {
        id: Date.now(), // ID único para exclusão
        tipo: nome.split(' ')[0].toUpperCase(),
        banco: extrairBanco(nome),
        produto: nome,
        dataAplicacao: new Date().toLocaleDateString('pt-BR'),
        dataVencimento: vencimento,
        taxa: taxa,
        valorAplicado: valor,
        valorLiquido: valor
    };

    todosOsAtivos.push(normalizarAtivo(novoAtivo));
    reportContainer.style.display = 'block'; // Garante que o dashboard apareça
    aplicarFiltros(); // Atualiza tudo
    
    // Limpa os campos
    document.getElementById('add-nome').value = '';
    document.getElementById('add-vencimento').value = '';
    document.getElementById('add-taxa').value = '';
    document.getElementById('add-valor').value = '';
});

// 2. Função para Excluir
function excluirAtivo(id) {
    if (confirm("Deseja realmente remover este ativo da análise?")) {
        todosOsAtivos = todosOsAtivos.filter(a => a.id !== id);
        aplicarFiltros();
    }
}