// script.js (VERSÃO FINAL 14.0: POPUP GRÁFICO MENSAL + SCROLL)

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
const btnPrint = document.getElementById('btn-print-pdf');
const btnCopy = document.getElementById('btn-copy-summary');

// Botão para abrir o fluxo mensal (Popup)
const btnOpenFluxoMensal = document.getElementById('btn-open-fluxo-mensal');

// Modais
const contactModal = document.getElementById('contact-modal');
const modalFluxo = document.getElementById('modal-fluxo');
const closeContact = document.getElementById('close-contact');
const closeFluxo = document.getElementById('close-fluxo');
const contactBtn = document.getElementById('contact-btn');

// Charts Setup Seguro
let fluxoCaixaChart = null; let fluxoMensalChart = null; 
let projecaoChart = null; let indexadoresChart = null; let tributacaoChart = null;

let fluxoCaixaChartCtx = null; let fluxoMensalChartCtx = null;
let projecaoChartCtx = null; let indexadoresChartCtx = null; let tributacaoChartCtx = null;

document.addEventListener('DOMContentLoaded', () => {
    const c1 = document.getElementById('fluxo-caixa-chart');
    const c2 = document.getElementById('projecao-patrimonio-chart');
    const c3 = document.getElementById('indexadores-chart');
    const c4 = document.getElementById('tributacao-chart');
    const c5 = document.getElementById('fluxo-mensal-chart'); // Novo Canvas no Modal
    
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

// Modais
contactBtn.addEventListener('click', () => contactModal.classList.add('show'));
closeContact.addEventListener('click', () => contactModal.classList.remove('show'));

// Ação do Botão "Ver Detalhe Mensal"
btnOpenFluxoMensal.addEventListener('click', () => {
    modalFluxo.classList.add('show');
    // Renderiza o gráfico mensal apenas ao abrir, para ajustar tamanho
    gerarGraficoFluxoMensal(todosOsAtivos);
});
closeFluxo.addEventListener('click', () => modalFluxo.classList.remove('show'));

// Fecha modais ao clicar fora
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

// --- FUNÇÕES DE CÁLCULO E PARSE (MANTIDAS DA V13) ---
function estimarTaxaAnual(taxaStr) {
    const pCDI = parseFloat(document.getElementById('projecao-cdi').value) || 0;
    const pIPCA = parseFloat(document.getElementById('projecao-ipca').value) || 0;
    const pSelic = parseFloat(document.getElementById('projecao-selic').value) || 0;
    const pIGPM = parseFloat(document.getElementById('projecao-igpm').value) || 0;
    let t = taxaStr.toUpperCase().replace(/\s/g, '').replace(',', '.');
    if (t.includes('CDI')) {
        const matchPct = t.match(/(\d+[.,]?\d*)%/); if (matchPct) return (pCDI / 100) * (parseFloat(matchPct[1]) / 100);
        const matchSpread = t.match(/\+(\d+[.,]?\d*)/); if (matchSpread) return (pCDI / 100) + (parseFloat(matchSpread[1]) / 100);
        return pCDI / 100;
    }
    if (t.includes('IPCA') || t.includes('IPC-A')) { let fix=0; const m=t.match(/[\+\-](\d+\.?\d*)/); if(m) fix=parseFloat(m[1]); return ((pIPCA+fix)/100); }
    if (t.includes('SELIC') || t.includes('LFT')) { let fix=0; const m=t.match(/[\+\-](\d+\.?\d*)/); if(m) fix=parseFloat(m[1]); return ((pSelic+fix)/100); }
    if (t.includes('IGPM') || t.includes('IGP-M')) { let fix=0; const m=t.match(/[\+\-](\d+\.?\d*)/); if(m) fix=parseFloat(m[1]); return ((pIGPM+fix)/100); }
    let val = parseFloat(t.replace('%', '')); if (!isNaN(val)) return val/100; return 0;
}

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
    let nomeLimpo = nome.replace(/\s*-\s*\d{2}\/\d{2}\/\d{2,4}/g, '').replace(/\s*-\s*[A-Za-zçÇ]{3}\s*[\/-]\s*\d{2,4}/gi, '').replace(/\s+-\s+$/, '').trim();
    if (nomeLimpo.length < 2) return "Outros"; return nomeLimpo; 
}

function normalizarAtivo(ativo) {
    const ativoNormalizado = { ...ativo };
    if (ativoNormalizado.tipo.includes("NTN") || ativoNormalizado.tipo.includes("Tesouro")) ativoNormalizado.banco = 'Tesouro Nacional';
    ativoNormalizado.banco = extrairBanco(ativoNormalizado.banco); 
    return ativoNormalizado;
}

// Regex (Mantidos da V13)
const regexBTG = /(BACEN - BANCO CENTRAL DO BRASIL\s*-\s*RJ)\s+(LFT|LTN|NTNB(?: - P)?)\s+(\d{2}\/\d{2}\/\d{2,4})\s+(\d{2}\/\d{2}\/\d{2,4})[\s\S]*?((?:SELIC|OVER|IPCA)\s*\+\s*[\d,]+\s*%)[\s\S]*?([\d.,]+)\s+(?:[\d.,]+|-)\s+-\s+([\d.,]+)|(BANCO BTG PACTUAL S A)\s+(LCA\s*-\s*.*?)\s+(\d{2}\/\d{2}\/\d{2,4})\s+(\d{2}\/\d{2}\/\d{2,4})[\s\S]*?((?:IPCA|CDI)\s*\+\s*[\d,]+\s*%)[\s\S]*?([\d.,]+)\s+-\s+-\s+([\d.,]+)/g;
const regexXP = /(CDB|LCI|LCA|LCD|LC|RDB|CRI|CRA|DEB|LIG|CDCA|NTN\s*-?\s*B)([\s\S]*?)(\d{2}\s*\/\s*\d{2}\s*\/\s*\d{4})[\s\S]*?(\d{2}\s*\/\s*\d{2}\s*\/\s*\d{4})[\s\S]*?((?:[A-Za-z\s-]+\+)?\s*-?\s*[\d.,\s]+%(?:\s*[A-Za-z]+)?|[\d.,\s]+%[\s\S]*?CDI)[\s\S]*?R\s*\$\s*([\d.,\s]+)[\s\S]*?R\s*\$\s*([\d.,\s]+)[\s\S]*?R\s*\$\s*([\d.,\s]+)/g;

function parseBTGMatch(match) { const emissor = match[1]||match[8]; const produto = match[2]||match[9]; const dataVencimento = match[4]||match[11]; const taxa = match[5]||match[12]; const valorLiquidoStr = match[7]||match[14]; const valorLiquido = parseFloat(valorLiquidoStr.replace(/\./g, '').replace(',', '.')); return { tipo: produto.split(' ')[0], banco: emissor.trim(), produto: produto.trim(), dataAplicacao: match[3]||match[10], dataVencimento: dataVencimento, taxa: taxa.replace(/\s+/g, ' ').trim(), valorAplicado: valorLiquido, valorLiquido: valorLiquido }; }
function parseXPMatch(match) { let tipoAtivo = match[1]; let nomeBruto = match[2].replace(/\n/g, ' ').trim(); let taxaBruta = match[5].replace(/\s+/g, ' ').trim(); if (nomeBruto.includes("T00:00:00")||nomeBruto.length > 150) return null; const matchAno = taxaBruta.match(/^(20\d{2})\s+([\d.,]+.*)/); if (matchAno) taxaBruta = matchAno[2]; taxaBruta = taxaBruta.replace(/(\d)\s+([.,])\s+(\d)/g, '$1$2$3'); nomeBruto = nomeBruto.replace(/Garantia|Posição|Disponível|Vencimento|Título|Preço|Total/g, '').replace(/R\s*\$\s*[\d.,]+/g, '').replace(/-?\s*[A-Z]{3}\/\d{4}/gi, '').trim(); if (tipoAtivo.includes("NTN")) { nomeBruto = nomeBruto.replace(/^-/, '').trim(); if(nomeBruto.length < 5) nomeBruto = "IPCA+"; tipoAtivo = "Tesouro IPCA+ (NTN-B)"; } return { tipo: tipoAtivo, banco: extrairBanco(nomeBruto), produto: `${tipoAtivo} ${nomeBruto}`, dataAplicacao: limparDataXP(match[3]), dataVencimento: limparDataXP(match[4]), taxa: taxaBruta, valorAplicado: limparNumeroXP(match[7]), valorLiquido: limparNumeroXP(match[8]) }; }
const BIBLIOTECA_DE_PARSERS = [ { nomeCorretora: 'BTG Pactual', regex: regexBTG, funcaoDeExtracao: parseBTGMatch }, { nomeCorretora: 'XP Investimentos', regex: regexXP, funcaoDeExtracao: parseXPMatch } ];

async function lerPDF(file) { const reader = new FileReader(); reader.onload = async function() { const typedarray = new Uint8Array(this.result); pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js`; try { const pdfDoc = await pdfjsLib.getDocument(typedarray).promise; let fullText = ''; for (let i = 1; i <= pdfDoc.numPages; i++) { const page = await pdfDoc.getPage(i); const textContent = await page.getTextContent(); fullText += textContent.items.map(item => item.str).join(' '); } processarTextoDoPDF(fullText); } catch (error) { alert("Erro ao ler PDF."); } }; reader.readAsArrayBuffer(file); }
function processarTextoDoPDF(text) { let ativos = []; const matchNome = text.match(/Cliente:?\s*([^\n\r]+?)(?:\s+Conta|\s+Perfil|$)/i); if (matchNome && matchNome[1]) { nomeClienteGlobal = matchNome[1].trim(); document.getElementById('cliente-nome-tela').textContent = `Cliente: ${nomeClienteGlobal}`; document.getElementById('cliente-nome-print').textContent = `Cliente: ${nomeClienteGlobal}`; document.title = `Relatório - ${nomeClienteGlobal}`; } text = text.replace(/Posição Consolidada\s+Data de referência\s*:\s*\d{2}\s*\/\s*\d{2}\s*\/\s*\d{4}/gi, ' '); const regexCorte = /P\s*R\s*[ÓO]\s*X\s*I\s*M\s*O\s*S\s*[\s\S]*?V\s*E\s*N\s*C\s*I\s*M\s*E\s*N\s*T\s*O\s*S/i; const matchCorte = text.match(regexCorte); if (matchCorte && matchCorte.index) text = text.substring(0, matchCorte.index); text = text.replace(/Posição Consolidada/gi, ' '); for (const parser of BIBLIOTECA_DE_PARSERS) { let match; parser.regex.lastIndex = 0; while ((match = parser.regex.exec(text)) !== null) { try { const ativoBruto = parser.funcaoDeExtracao(match); if (!ativoBruto) continue; if (ativoBruto.produto.toUpperCase().includes("PRE DU ")||ativoBruto.produto.toUpperCase().includes("POS DU ")) continue; ativos.push(normalizarAtivo(ativoBruto)); } catch (e) {} } } if (ativos.length > 0) { reportContainer.style.display = 'block'; todosOsAtivos = ativos; popularFiltros(todosOsAtivos); aplicarFiltros(); } else { alert("Nenhum ativo encontrado."); } }

function popularFiltros(ativos) { filtroEmissor.innerHTML = ''; const allOption = document.createElement('option'); allOption.value = 'todos'; allOption.textContent = 'Todos os Emissores'; filtroEmissor.appendChild(allOption); const emissores = [...new Set(ativos.map(ativo => ativo.banco))]; emissores.sort().forEach(emissor => { const option = document.createElement('option'); option.value = emissor; option.textContent = emissor; filtroEmissor.appendChild(option); }); }
function aplicarFiltros() { const valorFiltro = filtroEmissor.value; let ativosFiltrados = todosOsAtivos; if (valorFiltro !== 'todos') ativosFiltrados = todosOsAtivos.filter(ativo => ativo.banco === valorFiltro); criarRelatorio(ativosFiltrados); }

function criarRelatorio(ativos) {
    criarTabelaDetalhada(ativos); gerarInsights(ativos); gerarPrevisaoRendimentos(ativos); desenharGraficoIndexadores(ativos); gerarListaEmissores(ativos); 
    criarGraficoFluxoCaixa(ativos); // Anual
    criarGraficoProjecaoPatrimonio(ativos); gerarGraficoTributacao(ativos);
    // Nota: O gráfico mensal só é gerado quando abre o popup
}

function gerarGraficoTributacao(ativos) {
    if(!tributacaoChartCtx) return;
    const tiposIsentos = ['LCI', 'LCA', 'CRI', 'CRA', 'LCD', 'LIG']; let totalIsento = 0; let totalTributavel = 0;
    ativos.forEach(at => { const tipoUpper = at.tipo.toUpperCase(); const prodUpper = at.produto.toUpperCase(); let isIsento = false; if (tiposIsentos.some(t => tipoUpper.includes(t))) isIsento = true; if (tipoUpper.includes('DEB') && (prodUpper.includes('INC') || prodUpper.includes('INCENTIVADA'))) isIsento = true; if (isIsento) totalIsento += at.valorLiquido; else totalTributavel += at.valorLiquido; });
    if (tributacaoChart) tributacaoChart.destroy();
    tributacaoChart = new Chart(tributacaoChartCtx, { type: 'bar', data: { labels: ['Carteira'], datasets: [ { label: 'Isentos de IR', data: [totalIsento], backgroundColor: '#198754', barThickness: 40 }, { label: 'Tributáveis', data: [totalTributavel], backgroundColor: '#dc3545', barThickness: 40 } ] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true, display: false }, y: { stacked: true, display: false, grid: { display: false } } }, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: function(context) { const val = context.raw; const total = totalIsento + totalTributavel; const perc = ((val/total)*100).toFixed(1); return `${context.dataset.label}: ${formatCurrency(val)} (${perc}%)`; }}} } } });
}

function gerarResumoClipboard() { const total = todosOsAtivos.reduce((acc, at) => acc + at.valorLiquido, 0); const qtd = todosOsAtivos.length; let text = `📊 *Resumo de Carteira - ${nomeClienteGlobal}*\n💰 Total: ${formatCurrency(total)}\n📄 Ativos: ${qtd}\n\n⚠️ *Avisos de Risco (FGC):*\n`; const porBanco = {}; todosOsAtivos.forEach(at => { if (!porBanco[at.banco]) porBanco[at.banco] = 0; if (TIPOS_FGC.some(t => at.tipo.toUpperCase().includes(t))) porBanco[at.banco] += at.valorLiquido; }); let riscoEncontrado = false; for (const [banco, valor] of Object.entries(porBanco)) { if (valor > LIMITE_FGC * 0.9) { text += `- ${banco}: ${formatCurrency(valor)} (Atenção!)\n`; riscoEncontrado = true; } } if (!riscoEncontrado) text += "Nenhum emissor próximo do teto FGC (R$ 250k).\n"; text += `\n📅 Gerado em: ${new Date().toLocaleDateString()}`; navigator.clipboard.writeText(text).then(() => { alert("Resumo copiado!"); }).catch(err => alert("Erro ao copiar.")); }
function criarTabelaDetalhada(ativos) { let tableHTML = '<table><thead><tr><th>Emissor/Produto</th><th>Vencimento</th><th>Taxa</th><th>Valor Bruto (Mercado)</th></tr></thead><tbody>'; ativos.forEach(ativo => { tableHTML += `<tr><td>${ativo.produto}</td><td>${ativo.dataVencimento}</td><td>${ativo.taxa}</td><td>${formatCurrency(ativo.valorLiquido)}</td></tr>`; }); tableHTML += '</tbody></table>'; tableContainer.innerHTML = tableHTML; }
function gerarPrevisaoRendimentos(ativos) { const ativosComJuros = ativos.filter(ativo => ativo.produto.toUpperCase().includes('JUROS MENSAIS')||ativo.produto.toUpperCase().includes('JURO MENSAL')); if (ativosComJuros.length === 0) { rendimentosMensaisContainer.innerHTML = '<p>Nenhum ativo com juros mensais.</p>'; return; } let totalMensal = 0; let html = '<ul>'; ativosComJuros.forEach(ativo => { const taxaAnual = estimarTaxaAnual(ativo.taxa); const rendaMensalBruta = (ativo.valorLiquido * taxaAnual) / 12; const rendaMensalLiq = rendaMensalBruta * 0.85; totalMensal += rendaMensalLiq; html += `<li><strong>${ativo.produto}:</strong> ~${formatCurrency(rendaMensalLiq)}</li>`; }); html += '</ul>'; html += `<hr><p><strong>Total Estimado: ${formatCurrency(totalMensal)}/mês</strong></p>`; rendimentosMensaisContainer.innerHTML = html; }
function gerarInsights(ativos) { if (ativos.length === 0) return; const total = ativos.reduce((acc, at) => acc + at.valorLiquido, 0); const hoje = new Date(); hoje.setHours(0,0,0,0); const proximo = ativos.map(a => ({...a, dt: parseDataBR(a.dataVencimento)})).filter(a => a.dt && a.dt >= hoje).sort((a,b) => a.dt - b.dt)[0]; const porEmissor = {}; ativos.forEach(a => porEmissor[a.banco] = (porEmissor[a.banco] || 0) + a.valorLiquido); const maiorEmissor = Object.keys(porEmissor).reduce((a, b) => porEmissor[a] > porEmissor[b] ? a : b); let html = `<ul><li><strong>Quantidade de Ativos:</strong> ${ativos.length}</li><li><strong>Total Patrimônio:</strong> ${formatCurrency(total)}</li><li><strong>Próximo Vencimento:</strong> ${proximo ? proximo.dataVencimento + " (" + proximo.produto + ")" : "Nenhum"}</li><li><strong>Maior Concentração:</strong> ${maiorEmissor} (${formatCurrency(porEmissor[maiorEmissor])})</li></ul>`; insightsContainer.innerHTML = html; }

function gerarListaEmissores(ativos) {
    const porBanco = {}; const taxaSimulacaoAnual = parseFloat(document.getElementById('taxa-simulacao').value)||12.0; const taxaSimulacaoMensal = Math.pow(1 + (taxaSimulacaoAnual / 100), 1/12) - 1;
    ativos.forEach(at => { if (!porBanco[at.banco]) porBanco[at.banco] = { total: 0, totalFGC: 0, ativos: [], temAtivoFGC: false }; porBanco[at.banco].total += at.valorLiquido; porBanco[at.banco].ativos.push(at); const isFGC = TIPOS_FGC.some(tipo => at.tipo.toUpperCase().includes(tipo)); if (isFGC) { porBanco[at.banco].totalFGC += at.valorLiquido; porBanco[at.banco].temAtivoFGC = true; } });
    let html = ''; const hoje = new Date(); hoje.setHours(0,0,0,0);
    Object.keys(porBanco).sort((a,b) => porBanco[b].totalFGC - porBanco[a].totalFGC).forEach(banco => {
        const dados = porBanco[banco]; const percentualUso = Math.min(100, (dados.totalFGC / LIMITE_FGC) * 100); let corBarra = percentualUso > 100 ? '#dc3545' : (percentualUso > 80 ? '#ffc107' : '#198754');
        let htmlAportes = "";
        if (dados.temAtivoFGC) {
            const anosVencimento = new Set(); dados.ativos.forEach(a => { const dt = parseDataBR(a.dataVencimento); if (dt && dt >= hoje) anosVencimento.add(dt.getFullYear()); });
            const anosOrdenados = Array.from(anosVencimento).sort();
            if (anosOrdenados.length > 0) {
                htmlAportes += `<div style="margin-top: 8px; border-top: 1px dashed #eee; padding-top: 6px;">`; htmlAportes += `<p style="margin: 0 0 4px 0; font-size: 0.8em; font-weight: bold; color: #555;">Potencial de Aporte Hoje (Simulação):</p>`;
                anosOrdenados.forEach(ano => {
                    let dataAlvo = new Date(ano, 0, 1); dados.ativos.forEach(a => { const dt = parseDataBR(a.dataVencimento); if (dt && dt.getFullYear() === ano && dt > dataAlvo) dataAlvo = dt; });
                    let dataCheck = new Date(hoje); dataCheck.setDate(1); let minAporteAllowed = 999999999;
                    while (dataCheck <= dataAlvo) { let saldoProjetado = 0; dados.ativos.forEach(a => { if (TIPOS_FGC.some(t => a.tipo.toUpperCase().includes(t))) { const dtVenc = parseDataBR(a.dataVencimento); if (dtVenc > dataCheck) { const mesesCrescimento = Math.max(0, (dataCheck - hoje) / (1000 * 60 * 60 * 24 * 30)); const taxaMensalAtivo = Math.pow(1 + estimarTaxaAnual(a.taxa), 1/12) - 1; saldoProjetado += a.valorLiquido * Math.pow(1 + taxaMensalAtivo, mesesCrescimento); } } }); const gap = Math.max(0, LIMITE_FGC - saldoProjetado); const mesesTotal = Math.max(0, (dataCheck - hoje) / (1000 * 60 * 60 * 24 * 30)); const aportePossivelHoje = gap / Math.pow(1 + taxaSimulacaoMensal, mesesTotal); if (aportePossivelHoje < minAporteAllowed) minAporteAllowed = aportePossivelHoje; dataCheck.setMonth(dataCheck.getMonth() + 6); }
                    let aporteMsg = ""; if (minAporteAllowed <= 100) aporteMsg = `<span style="color:#dc3545; font-size:0.8em;">${ano}: Teto Atingido</span>`; else aporteMsg = `<span style="color:#198754; font-size:0.8em;">${ano}: +${formatCurrency(minAporteAllowed)}</span>`; htmlAportes += `<div style="display:inline-block; margin-right:10px;">${aporteMsg}</div>`;
                }); htmlAportes += `</div>`;
            }
        }
        html += `<div class="emissor-item"><div class="emissor-header"><span>${banco}</span><span>Total: ${formatCurrency(dados.total)}</span></div><div class="emissor-info"><span>Utilizado FGC: ${formatCurrency(dados.totalFGC)} (${percentualUso.toFixed(1)}%)</span></div><div class="fgc-bar-bg"><div class="fgc-bar-fill" style="width: ${percentualUso}%; background-color: ${corBarra};"></div></div>${htmlAportes}</div>`;
    });
    listaEmissoresContainer.innerHTML = html;
}

// GRÁFICO 1: FLUXO DE CAIXA (ANUAL - NA TELA PRINCIPAL)
function criarGraficoFluxoCaixa(ativos) {
    const dadosMap = {}; let minDate = new Date(3000, 0, 1); let maxDate = new Date(2000, 0, 1);
    ativos.forEach(at => { const dt = parseDataBR(at.dataVencimento); if (!dt) return; if (dt < minDate) minDate = dt; if (dt > maxDate) maxDate = dt; let key = dt.getFullYear().toString(); dadosMap[key] = (dadosMap[key] || 0) + at.valorLiquido; });
    const labels = []; const data = []; for (let y = minDate.getFullYear(); y <= maxDate.getFullYear(); y++) { labels.push(y.toString()); data.push(dadosMap[y.toString()] || 0); }
    if (fluxoCaixaChart) fluxoCaixaChart.destroy(); fluxoCaixaChart = new Chart(fluxoCaixaChartCtx, { type: 'bar', data: { labels: labels, datasets: [{ label: 'Vencimentos por Ano (R$)', data: data, backgroundColor: '#fd7e14' }] }, options: { scales: { y: { beginAtZero: true } } } });
}

// NOVO GRÁFICO: FLUXO MENSAL DETALHADO (NO POPUP)
function gerarGraficoFluxoMensal(ativos) {
    if(!fluxoMensalChartCtx) return;
    const dadosMap = {}; let minDate = new Date(3000, 0, 1); let maxDate = new Date(2000, 0, 1);
    ativos.forEach(at => { const dt = parseDataBR(at.dataVencimento); if (!dt) return; if (dt < minDate) minDate = dt; if (dt > maxDate) maxDate = dt; const mes = (dt.getMonth() + 1).toString().padStart(2, '0'); const key = `${mes}/${dt.getFullYear()}`; dadosMap[key] = (dadosMap[key] || 0) + at.valorLiquido; });
    
    // Gera todos os meses no intervalo
    const labels = []; const data = [];
    let curr = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    while (curr <= maxDate) {
        const mes = (curr.getMonth() + 1).toString().padStart(2, '0');
        const key = `${mes}/${curr.getFullYear()}`;
        labels.push(key);
        data.push(dadosMap[key] || 0);
        curr.setMonth(curr.getMonth() + 1);
    }

    // AJUSTA LARGURA DO CANVAS PARA ROLAGEM
    const container = document.querySelector('.chart-scroll-inner');
    if(container) {
        const newWidth = Math.max(container.parentElement.clientWidth, labels.length * 40); // 40px por barra
        container.style.width = `${newWidth}px`;
    }

    if (fluxoMensalChart) fluxoMensalChart.destroy();
    fluxoMensalChart = new Chart(fluxoMensalChartCtx, {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: 'Vencimentos por Mês (R$)', data: data, backgroundColor: '#fd7e14' }] },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, // Importante para o scroll funcionar
            scales: { y: { beginAtZero: true } } 
        }
    });
}

function criarGraficoProjecaoPatrimonio(ativos) {
    const hoje = new Date(); hoje.setDate(1); hoje.setHours(0,0,0,0); let maxDate = hoje; ativos.forEach(at => { const dt = parseDataBR(at.dataVencimento); if (dt && dt > maxDate) maxDate = dt; });
    const labels = []; const dataInvestido = []; let ativosSimulados = ativos.map(a => { const isCupom = a.produto.toUpperCase().includes("JUROS MENSAIS")||a.produto.toUpperCase().includes("JURO MENSAL")||a.produto.toUpperCase().includes("CUPOM"); return { ...a, vencimentoDt: parseDataBR(a.dataVencimento), valorAtual: a.valorLiquido, taxaMensal: isCupom ? 0 : (Math.pow(1 + estimarTaxaAnual(a.taxa), 1/12) - 1) }; });
    let cursor = new Date(hoje); while (cursor <= maxDate) { labels.push(`${(cursor.getMonth()+1).toString().padStart(2,'0')}/${cursor.getFullYear()}`); let totalMes = 0; ativosSimulados.forEach(ativo => { if (ativo.vencimentoDt > cursor) { ativo.valorAtual = ativo.valorAtual * (1 + ativo.taxaMensal); totalMes += ativo.valorAtual; } }); dataInvestido.push(totalMes); cursor.setMonth(cursor.getMonth() + 1); }
    if (projecaoChart) projecaoChart.destroy(); projecaoChart = new Chart(projecaoChartCtx, { type: 'line', data: { labels: labels, datasets: [{ label: 'PROJEÇÃO DE EXPOSIÇÃO (R$)', data: dataInvestido, borderColor: '#198754', backgroundColor: 'rgba(25, 135, 84, 0.1)', fill: true, pointRadius: 0, borderWidth: 2 }] }, options: { interaction: { intersect: false, mode: 'index' }, scales: { y: { beginAtZero: true } }, plugins: { tooltip: { callbacks: { label: function(context) { return formatCurrency(context.raw); } } } } } });
}
function desenharGraficoIndexadores(ativos) { const dataPoints = {}; ativos.forEach(at => { const idx = categorizarPorIndexador(at); dataPoints[idx] = (dataPoints[idx] || 0) + at.valorLiquido; }); if (indexadoresChart) indexadoresChart.destroy(); indexadoresChart = new Chart(indexadoresChartCtx, { type: 'pie', data: { labels: Object.keys(dataPoints), datasets: [{ data: Object.values(dataPoints), backgroundColor: ['#0d6efd', '#ffc107', '#dc3545', '#198754'] }] } }); }