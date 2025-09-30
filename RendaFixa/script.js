// script.js (VERSÃO COM LÓGICA DE JUROS MENSAIS CORRIGIDA)

// --- Variáveis Globais e Referências de Elementos ---
let todosOsAtivos = [];
const pdfUpload = document.getElementById('pdf-upload');
const reportContainer = document.getElementById('report-container');
const filtroEmissor = document.getElementById('filtro-emissor');
const btnRecalcular = document.getElementById('recalcular-btn');
const insightsContainer = document.getElementById('insights-container');
const tableContainer = document.getElementById('table-container');
const rendimentosMensaisContainer = document.getElementById('rendimentos-mensais-container');
const projecaoSelicInput = document.getElementById('projecao-selic');
const projecaoIgpmInput = document.getElementById('projecao-igpm');
const indexadoresChartCtx = document.getElementById('indexadores-chart').getContext('2d');
let indexadoresChart = null;
const contactBtn = document.getElementById('contact-btn');
const contactModal = document.getElementById('contact-modal');
const closeButton = document.querySelector('.close-button');
const contactForm = document.getElementById('contact-form');
const formStatus = document.getElementById('form-status');
const submitFormBtn = document.getElementById('submit-form-btn');


contactBtn.addEventListener('click', () => {
    contactModal.classList.add('show');
});

// Fechar o modal ao clicar no 'X'
closeButton.addEventListener('click', () => {
    contactModal.classList.remove('show');
});

// Fechar o modal ao clicar fora da área do conteúdo
window.addEventListener('click', (event) => {
    if (event.target == contactModal) {
        contactModal.classList.remove('show');
    }
});


// --- LÓGICA PARA ENVIO DO FORMULÁRIO PARA O SHEETDB ---
// Adicione este bloco de código no final do arquivo

contactForm.addEventListener('submit', async (event) => {
    event.preventDefault(); // Impede o recarregamento da página

    // Feedback visual para o usuário
    submitFormBtn.disabled = true;
    submitFormBtn.textContent = 'Enviando...';
    formStatus.textContent = '';

    // 1. Coletar dados do formulário
    const nome = document.getElementById('nome').value;
    const telefone = document.getElementById('telefone').value;

    // 2. Calcular métricas da carteira
    const quantidadeAtivos = todosOsAtivos.length;
    const totalLiquido = todosOsAtivos.reduce((sum, ativo) => sum + ativo.valorLiquido, 0);

     const listaDeAtivosFormatada = todosOsAtivos.map(ativo => 
        `- Produto: ${ativo.produto} | Venc: ${ativo.dataVencimento} | Taxa: ${ativo.taxa} | Valor Líq.: ${ativo.valorLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
    ).join('\n'); // O '\n' cria uma nova linha para cada ativo na célula da planilha

    // 3. Montar o objeto de dados para envio
    const dataToSend = {
        Nome: nome,
        Telefone: telefone,
        QuantidadeAtivos: quantidadeAtivos,
        TotalLiquido: totalLiquido.toFixed(2), // Envia como texto com 2 casas decimais
        Ativos: listaDeAtivosFormatada
    };

    // 4. Enviar para a API do SheetDB
    try {
        const response = await fetch('https://sheetdb.io/api/v1/x18aah8in10lt', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            // O SheetDB espera os dados dentro de um objeto { "data": [...] }
            body: JSON.stringify({
                data: [dataToSend] 
            })
        });

        if (response.ok) {
            formStatus.textContent = 'Dados enviados com sucesso! Agradecemos o contato.';
            formStatus.style.color = 'green';
            contactForm.reset(); // Limpa o formulário
            setTimeout(() => { // Fecha o modal após 3 segundos
                contactModal.classList.remove('show');
            }, 3000);
        } else {
            throw new Error('Falha no envio dos dados.');
        }

    } catch (error) {
        console.error('Erro ao enviar formulário:', error);
        formStatus.textContent = 'Ocorreu um erro. Por favor, tente novamente.';
        formStatus.style.color = 'red';
    } finally {
        // Reativa o botão independentemente do resultado
        submitFormBtn.disabled = false;
        submitFormBtn.textContent = 'Enviar';
    }
});



// Contextos dos Gráficos
const vencimentosChartCtx = document.getElementById('vencimentos-chart').getContext('2d');
const bancosChartCtx = document.getElementById('bancos-chart').getContext('2d');
const fluxoCaixaChartCtx = document.getElementById('fluxo-caixa-chart').getContext('2d');
const projecaoChartCtx = document.getElementById('projecao-patrimonio-chart').getContext('2d');

// Instâncias dos Gráficos
let vencimentosChart, bancosChart, fluxoCaixaChart, projecaoChart = null;
// --- Adicione esta nova função para categorizar os ativos ---
function categorizarPorIndexador(taxa) {
    const taxaUpper = taxa.toUpperCase();
    if (taxaUpper.includes('CDI')) return 'Pós-fixado (CDI)';
    if (taxaUpper.includes('IPCA') || taxaUpper.includes('IPC-A')) return 'Híbrido (Inflação)';
    if (taxaUpper.includes('IGP-M') || taxaUpper.includes('IGPM')) return 'Híbrido (Inflação)';
    if (taxaUpper.includes('LFT') || taxaUpper.includes('SELIC')) return 'Pós-fixado (Selic)';
    // Se não for nenhum dos acima e tiver '%' no nome, é pré-fixado.
    if (taxaUpper.includes('%')) return 'Pré-fixado';
    return 'Outro'; // Categoria para casos não identificados
}

// --- Funções Auxiliares ---
function gerarChaveDeAgrupamento(nomeDoProduto) {
    let chave = nomeDoProduto.toUpperCase();
    const stopWords = ['S/A', 'S.A.', 'LTDA', 'JUROS SEMESTRAIS', 'DI', 'CDB', 'CDE', 'LCI', 'LCA', 'CRI', 'CRA'];
    chave = chave.replace(/-/g, ' ');
    stopWords.forEach(word => {
        chave = chave.replace(new RegExp(`\\b${word}\\b`, 'g'), '');
    });
    chave = chave.replace(/\s+\d+[A-Z]\s?S?\b/g, '');
    chave = chave.replace(/[A-Z]{3}\/\d{4}/g, '');
    return chave.replace(/\s+/g, ' ').trim();
}

const formatCurrency = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });


// --- Lógica Principal (Eventos) ---
pdfUpload.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') {
        lerPDF(file);
    } else {
        alert("Por favor, selecione um arquivo PDF.");
    }
});

filtroEmissor.addEventListener('change', aplicarFiltros);
btnRecalcular.addEventListener('click', aplicarFiltros);


// --- Funções de Processamento de Dados ---
async function lerPDF(file) {
    const reader = new FileReader();
    reader.onload = async function() {
        const typedarray = new Uint8Array(this.result);
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js`;
        const pdfDoc = await pdfjsLib.getDocument(typedarray).promise;
        let fullText = '';
        for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const textContent = await page.getTextContent();
            fullText += textContent.items.map(item => item.str).join(' ');
        }
        processarTextoDoPDF(fullText);
    };
    reader.readAsArrayBuffer(file);
}

function processarTextoDoPDF(text) {
    const regex = /(CDB|CDE|LCI|LCA|CRI|CRA)\s(.*?)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(.*?)\s+\d+\s*\d*\s+R\$\s+([\d.,]+)\s+R\$\s+([\d.,]+)\s+R\$\s+([\d.,]+)/g;
    const ativos = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
        const tipoAtivo = match[1];
        const fullProductName = match[2];
        const chaveAgrupamento = gerarChaveDeAgrupamento(`${tipoAtivo} ${fullProductName}`);
        ativos.push({
            tipo: tipoAtivo,
            banco: chaveAgrupamento,
            produto: fullProductName.trim(),
            dataAplicacao: match[3],
            dataVencimento: match[5],
            taxa: match[6].trim(),
            valorAplicado: parseFloat(match[7].replace(/\./g, '').replace(',', '.')),
            valorLiquido: parseFloat(match[9].replace(/\./g, '').replace(',', '.'))
        });
    }

    if (ativos.length > 0) {
        reportContainer.style.display = 'block';
        todosOsAtivos = ativos;
        popularFiltros(todosOsAtivos);
        aplicarFiltros();
    } else {
        alert("Nenhum ativo de Renda Fixa (CDB, LCI, LCA, etc.) foi encontrado no formato esperado.");
    }
}

function popularFiltros(ativos) {
    filtroEmissor.innerHTML = '';
    const allOption = document.createElement('option');
    allOption.value = 'todos';
    allOption.textContent = 'Todos os Emissores';
    filtroEmissor.appendChild(allOption);
    const emissores = [...new Set(ativos.map(ativo => ativo.banco))];
    emissores.sort().forEach(emissor => {
        const option = document.createElement('option');
        option.value = emissor;
        option.textContent = emissor;
        filtroEmissor.appendChild(option);
    });
}

function aplicarFiltros() {
    const valorFiltro = filtroEmissor.value;
    let ativosFiltrados = todosOsAtivos;
    if (valorFiltro !== 'todos') {
        ativosFiltrados = todosOsAtivos.filter(ativo => ativo.banco === valorFiltro);
    }
    criarRelatorio(ativosFiltrados);
}

function criarRelatorio(ativos) {
    desenharGraficoVencimentos(ativos);
    desenharGraficoBancos(ativos);
    criarTabelaDetalhada(ativos);
    criarGraficoProjecao(ativos);
    criarGraficoFluxoCaixa(ativos);
    gerarInsights(ativos);
    gerarPrevisaoRendimentos(ativos);
    desenharGraficoIndexadores(ativos); // <-- ADICIONE AQUI
}

// --- Funções de Renderização (Desenho na Tela) ---

function gerarPrevisaoRendimentos(ativos) {
    const ativosComJurosMensais = ativos.filter(ativo =>
        ativo.produto.toUpperCase().includes('JUROS MENSAIS') ||
        ativo.produto.toUpperCase().includes('JURO MENSAL')
    );

    if (ativosComJurosMensais.length === 0) {
        rendimentosMensaisContainer.innerHTML = '<p>Nenhum ativo com pagamento de juros mensais encontrado na seleção atual.</p>';
        return;
    }

    let totalRendimentoMensalLiquido = 0;
    let html = '<ul>';

    const hoje = new Date();
    ativosComJurosMensais.forEach(ativo => {
        const dataAplicacao = new Date(ativo.dataAplicacao.split('/').reverse().join('-'));
        const diffTime = hoje - dataAplicacao;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let aliquotaIR = 0;
        if (diffDays <= 180) aliquotaIR = 0.225;
        else if (diffDays <= 360) aliquotaIR = 0.20;
        else if (diffDays <= 720) aliquotaIR = 0.175;
        else aliquotaIR = 0.15;

        const taxaStr = ativo.taxa.toUpperCase();
        let taxaAnual = 0;
        const taxaPre = parseFloat(taxaStr.replace('%', '').replace(',', '.'));
        if (!isNaN(taxaPre)) taxaAnual = taxaPre / 100;

        const rendimentoBrutoMensal = (ativo.valorAplicado * taxaAnual) / 12;
        const rendimentoLiquidoMensal = rendimentoBrutoMensal * (1 - aliquotaIR);
        totalRendimentoMensalLiquido += rendimentoLiquidoMensal;

        html += `<li><strong>${ativo.produto}:</strong> ${formatCurrency(rendimentoLiquidoMensal)} <span style="font-size: 0.8em; color: #606770;">(IR: ${aliquotaIR * 100}%)</span></li>`;
    });

    html += '</ul>';
    html += `<hr><p><strong>Total Mensal Líquido Estimado: ${formatCurrency(totalRendimentoMensalLiquido)}</strong></p>`;

    rendimentosMensaisContainer.innerHTML = html;
}

function criarTabelaDetalhada(ativos) {
    let tableHTML = '<table><thead><tr><th>Emissor</th><th>Produto</th><th>Vencimento</th><th>Taxa</th><th>Valor Aplicado</th><th>Valor Líquido (Atual)</th></tr></thead><tbody>';
    for (const ativo of ativos) {
        tableHTML += `<tr><td>${ativo.banco}</td><td>${ativo.produto}</td><td>${ativo.dataVencimento}</td><td>${ativo.taxa}</td><td>${formatCurrency(ativo.valorAplicado)}</td><td>${formatCurrency(ativo.valorLiquido)}</td></tr>`;
    }
    tableHTML += '</tbody></table>';
    tableContainer.innerHTML = tableHTML;
}

function gerarInsights(ativos) {
    insightsContainer.innerHTML = '';
    if (ativos.length === 0) return;
    let insightsHTML = '<ul>';
    const totalValor = ativos.reduce((sum, ativo) => sum + ativo.valorLiquido, 0);
    const bancosData = {};
    ativos.forEach(ativo => {
        bancosData[ativo.banco] = (bancosData[ativo.banco] || 0) + ativo.valorLiquido;
    });
    if (Object.keys(bancosData).length > 0) {
        const [maiorEmissor, valorMaiorEmissor] = Object.entries(bancosData).reduce((a, b) => a[1] > b[1] ? a : b);
        const percentualConcentracao = (valorMaiorEmissor / totalValor) * 100;
        if (percentualConcentracao > 50 && Object.keys(bancosData).length > 1) {
            insightsHTML += `<li><span style="color: #dc3545; font-weight: bold;">Atenção:</span> ${percentualConcentracao.toFixed(0)}% da carteira analisada está concentrada no emissor <strong>${maiorEmissor}</strong>.</li>`;
        }
    }

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const proximoAtivo = ativos
        .map(a => ({ ...a, dataVencObj: new Date(a.dataVencimento.split('/').reverse().join('-')) }))
        .filter(a => a.dataVencObj >= hoje)
        .sort((a, b) => a.dataVencObj - b.dataVencObj)[0];

    if (proximoAtivo) {
        insightsHTML += `<li>Seu próximo vencimento é em <strong>${proximoAtivo.dataVencimento}</strong> do ativo <strong>${proximoAtivo.produto}</strong>.</li>`;
    }
    insightsHTML += `<li>A análise considera um total de <strong>${ativos.length}</strong> ativos, somando <strong>${formatCurrency(totalValor)}</strong> (valor líquido atual).</li>`;
    insightsHTML += '</ul>';
    insightsContainer.innerHTML = insightsHTML;
}

function desenharGraficoVencimentos(ativos) {
    const projecaoCDI = parseFloat(document.getElementById('projecao-cdi').value) / 100;
    const projecaoIPCA = parseFloat(document.getElementById('projecao-ipca').value) / 100;
    const vencimentosData = {};

    ativos.forEach(ativo => {
        const valorFinal = calcularValorFuturo(ativo, projecaoCDI, projecaoIPCA);
        vencimentosData[ativo.dataVencimento] = (vencimentosData[ativo.dataVencimento] || 0) + valorFinal;
    });

    const labels = Object.keys(vencimentosData).sort((a, b) => new Date(a.split('/').reverse().join('-')) - new Date(b.split('/').reverse().join('-')));
    const data = labels.map(label => vencimentosData[label]);

    if (vencimentosChart) vencimentosChart.destroy();
    vencimentosChart = new Chart(vencimentosChartCtx, { type: 'bar', data: { labels: labels, datasets: [{ label: 'Valor Final no Vencimento (R$)', data: data, backgroundColor: '#6f42c1' }] }, options: { scales: { y: { beginAtZero: true } } } });
}

function desenharGraficoBancos(ativos) {
    const bancosData = {};
    ativos.forEach(ativo => {
        bancosData[ativo.banco] = (bancosData[ativo.banco] || 0) + ativo.valorLiquido;
    });
    const labels = Object.keys(bancosData);
    const data = labels.map(label => bancosData[label]);

    if (bancosChart) bancosChart.destroy();
    bancosChart = new Chart(bancosChartCtx, { type: 'doughnut', data: { labels: labels, datasets: [{ label: 'Distribuição por Emissor', data: data, backgroundColor: ['#0d6efd', '#dc3545', '#ffc107', '#198754', '#6f42c1', '#fd7e14'] }] } });
}

function criarGraficoFluxoCaixa(ativos) {
    const projecaoCDI = parseFloat(document.getElementById('projecao-cdi').value) / 100;
    const projecaoIPCA = parseFloat(document.getElementById('projecao-ipca').value) / 100;
    const fluxoPorAno = {};

    ativos.forEach(ativo => {
        const anoVencimento = ativo.dataVencimento.split('/')[2];
        const valorFinal = calcularValorFuturo(ativo, projecaoCDI, projecaoIPCA);
        fluxoPorAno[anoVencimento] = (fluxoPorAno[anoVencimento] || 0) + valorFinal;
    });

    const labels = Object.keys(fluxoPorAno).sort();
    const data = labels.map(ano => fluxoPorAno[ano]);

    if (fluxoCaixaChart) fluxoCaixaChart.destroy();
    fluxoCaixaChart = new Chart(fluxoCaixaChartCtx, { type: 'bar', data: { labels: labels, datasets: [{ label: 'Valor Final a Vencer no Ano (R$)', data: data, backgroundColor: '#fd7e14' }] }, options: { indexAxis: 'y', scales: { x: { beginAtZero: true } } } });
}


// --- Funções do Motor de Cálculo (para Projeção) ---
function criarGraficoProjecao(ativos) {
    const projecaoCDI = parseFloat(document.getElementById('projecao-cdi').value) / 100;
    const projecaoIPCA = parseFloat(document.getElementById('projecao-ipca').value) / 100;

    const ativosComProjecao = ativos.map(ativo => ({
        ...ativo,
        valorFuturo: calcularValorFuturo(ativo, projecaoCDI, projecaoIPCA)
    }));

    ativosComProjecao.sort((a, b) => new Date(a.dataVencimento.split('/').reverse().join('-')) - new Date(b.dataVencimento.split('/').reverse().join('-')));

    let patrimonioAcumulado = ativos.reduce((sum, ativo) => sum + ativo.valorLiquido, 0);
    const labelsLinhaDoTempo = ['Hoje'];
    const dadosLinhaDoTempo = [patrimonioAcumulado];

    const vencimentosAgrupados = {};
    ativosComProjecao.forEach(ativo => {
        const dataVenc = ativo.dataVencimento;
        if (!vencimentosAgrupados[dataVenc]) {
            vencimentosAgrupados[dataVenc] = { valorFuturoTotal: 0, valorLiquidoTotal: 0 };
        }
        vencimentosAgrupados[dataVenc].valorFuturoTotal += ativo.valorFuturo;
        vencimentosAgrupados[dataVenc].valorLiquidoTotal += ativo.valorLiquido;
    });

    const datasOrdenadas = Object.keys(vencimentosAgrupados).sort((a, b) => new Date(a.split('/').reverse().join('-')) - new Date(b.split('/').reverse().join('-')));

    datasOrdenadas.forEach(data => {
        labelsLinhaDoTempo.push(data);
        const vencimento = vencimentosAgrupados[data];
        patrimonioAcumulado += (vencimento.valorFuturoTotal - vencimento.valorLiquidoTotal);
        dadosLinhaDoTempo.push(patrimonioAcumulado);
    });

    desenharGraficoLinhaDoTempo(labelsLinhaDoTempo, dadosLinhaDoTempo);
}


// AQUI ESTÁ A FUNÇÃO CORRIGIDA
function calcularValorFuturo(ativo, projecaoCDI, projecaoIPCA) {
    const projecaoSelic = parseFloat(projecaoSelicInput.value) / 100;
    const projecaoIGPM = parseFloat(projecaoIgpmInput.value) / 100;
    const nomeProduto = ativo.produto.toUpperCase();
    const taxaStr = ativo.taxa.toUpperCase();

    // --- LÓGICA CORRIGIDA PARA JUROS MENSAIS ---
    if (nomeProduto.includes('JUROS MENSAIS') || nomeProduto.includes('JURO MENSAL')) {
        // Calcula o valor total que o ativo terá gerado no vencimento.
        const dataAplicacao = new Date(ativo.dataAplicacao.split('/').reverse().join('-'));
        const dataVenc = new Date(ativo.dataVencimento.split('/').reverse().join('-'));

        // 1. Calcula a duração total do investimento em dias e anos
        const diffTimeTotal = dataVenc - dataAplicacao;
        const diffDaysTotal = Math.ceil(diffTimeTotal / (1000 * 60 * 60 * 24));
        const diffAnosTotal = diffTimeTotal / (1000 * 60 * 60 * 24 * 365.25);

        // 2. Extrai a taxa anual do ativo
        const taxaPre = parseFloat(taxaStr.replace('%', '').replace('+', '').replace(',', '.'));
        const taxaAnual = !isNaN(taxaPre) ? taxaPre / 100 : 0;

        // 3. Calcula o total de juros brutos durante toda a vida do ativo
        const jurosBrutosTotais = ativo.valorAplicado * taxaAnual * diffAnosTotal;

        // 4. Determina a alíquota de IR com base na duração total (será a menor possível)
        let aliquotaIR = 0.15; // Assume a menor alíquota para prazos longos
        if (diffDaysTotal <= 180) aliquotaIR = 0.225;
        else if (diffDaysTotal <= 360) aliquotaIR = 0.20;
        else if (diffDaysTotal <= 720) aliquotaIR = 0.175;

        // 5. Calcula o total de juros líquidos
        const jurosLiquidosTotais = jurosBrutosTotais * (1 - aliquotaIR);

        // 6. O valor futuro é o principal + todos os juros líquidos recebidos.
        return ativo.valorAplicado + jurosLiquidosTotais;
    }

    // --- Lógica para os outros ativos (continua a mesma) ---
    const hoje = new Date();
    const dataVenc = new Date(ativo.dataVencimento.split('/').reverse().join('-'));
    const diffTime = dataVenc - hoje;

    if (diffTime <= 0) {
        return ativo.valorLiquido;
    }

    const diffAnos = diffTime / (1000 * 60 * 60 * 24 * 365.25);
    const valorPresente = ativo.valorLiquido;
    let taxaAnual = 0;

    if (taxaStr.includes('CDI')) {
        const percentualCDI = parseFloat(taxaStr.replace('%', '').replace('DO', '').replace('CDI', '').replace(',', '.')) / 100;
        taxaAnual = percentualCDI * projecaoCDI;

    } else if (taxaStr.includes('IPCA') || taxaStr.includes('IPC-A')) {
        const matchJuros = taxaStr.match(/(\d+[,.]\d+)|(\d+)/);
        if (matchJuros) {
            const jurosReais = parseFloat(matchJuros[0].replace(',', '.')) / 100;
            taxaAnual = (1 + projecaoIPCA) * (1 + jurosReais) - 1;
        } else {
            return valorPresente;
        }

    } else if (taxaStr.includes('LFT') || taxaStr.includes('SELIC')) {
        const matchJuros = taxaStr.match(/(\d+[,.]\d+)|(\d+)/);
        let jurosAdicionais = 0;
        if (matchJuros) {
            jurosAdicionais = parseFloat(matchJuros[0].replace(',', '.')) / 100;
        }
        if (taxaStr.includes('-')) {
            taxaAnual = projecaoSelic - jurosAdicionais;
        } else {
            taxaAnual = projecaoSelic + jurosAdicionais;
        }

    } else if (taxaStr.includes('IGP-M') || taxaStr.includes('IGPM')) {
        const matchJuros = taxaStr.match(/(\d+[,.]\d+)|(\d+)/);
        if (matchJuros) {
            const jurosReais = parseFloat(matchJuros[0].replace(',', '.')) / 100;
            taxaAnual = (1 + projecaoIGPM) * (1 + jurosReais) - 1;
        } else {
            taxaAnual = projecaoIGPM;
        }

    } else { // Ativos Pré-Fixados
        const taxaPre = parseFloat(taxaStr.replace('%', '').replace(',', '.'));
        if (!isNaN(taxaPre)) {
            taxaAnual = taxaPre / 100;
        } else {
            return valorPresente;
        }
    }
    return valorPresente * Math.pow((1 + taxaAnual), diffAnos);
}

function desenharGraficoLinhaDoTempo(labels, data) {
    if (projecaoChart) projecaoChart.destroy();
    projecaoChart = new Chart(projecaoChartCtx, { type: 'line', data: { labels: labels, datasets: [{ label: 'Patrimônio Projetado (R$)', data: data, borderColor: '#198754', backgroundColor: 'rgba(25, 135, 84, 0.1)', fill: true, tension: 0.1 }] }, options: { scales: { y: { beginAtZero: false } } } });
}
function desenharGraficoIndexadores(ativos) {
    const indexadoresData = {};
    ativos.forEach(ativo => {
        const categoria = categorizarPorIndexador(ativo.taxa);
        indexadoresData[categoria] = (indexadoresData[categoria] || 0) + ativo.valorLiquido;
    });

    const labels = Object.keys(indexadoresData);
    const data = Object.values(indexadoresData);

    if (indexadoresChart) {
        indexadoresChart.destroy();
    }
    indexadoresChart = new Chart(indexadoresChartCtx, {
        type: 'pie', // O tipo 'pie' (pizza) funciona bem aqui também
        data: {
            labels: labels,
            datasets: [{
                label: 'Distribuição por Indexador',
                data: data,
                backgroundColor: ['#0d6efd', '#ffc107', '#198754', '#dc3545', '#6f42c1']
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                }
            }
        }
    });
}