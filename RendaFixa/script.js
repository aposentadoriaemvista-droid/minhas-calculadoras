// script.js (VERSÃO COM CÁLCULO DE FGC CORRIGIDO)

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
    ).join('\n');

    // 3. Montar o objeto de dados para envio
    const dataToSend = {
        Nome: nome,
        Telefone: telefone,
        QuantidadeAtivos: quantidadeAtivos,
        TotalLiquido: totalLiquido.toFixed(2),
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
            body: JSON.stringify({
                data: [dataToSend] 
            })
        });

        if (response.ok) {
            formStatus.textContent = 'Dados enviados com sucesso! Agradecemos o contato.';
            formStatus.style.color = 'green';
            contactForm.reset();
            setTimeout(() => {
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

function categorizarPorIndexador(taxa) {
    const taxaUpper = taxa.toUpperCase();
    if (taxaUpper.includes('CDI')) return 'Pós-fixado (CDI)';
    if (taxaUpper.includes('IPCA') || taxaUpper.includes('IPC-A')) return 'Híbrido (Inflação)';
    if (taxaUpper.includes('IGP-M') || taxaUpper.includes('IGPM')) return 'Híbrido (Inflação)';
    if (taxaUpper.includes('LFT') || taxaUpper.includes('SELIC')) return 'Pós-fixado (Selic)';
    if (taxaUpper.includes('%')) return 'Pré-fixado';
    return 'Outro';
}

function gerarChaveDeAgrupamento(nomeDoProduto) {
    let chave = nomeDoProduto.toUpperCase();
    const stopWords = ['S/A', 'S.A.', 'LTDA', 'JUROS SEMESTRAIS', 'DI', 'CDB', 'CDE', 'LCI', 'LCA', 'CRI', 'CRA', 'DEB', 'LIG'];
    chave = chave.replace(/-/g, ' ');
    stopWords.forEach(word => {
        chave = chave.replace(new RegExp(`\\b${word}\\b`, 'g'), '');
    });
    chave = chave.replace(/\s+\d+[A-Z]\s?S?\b/g, '');
    chave = chave.replace(/[A-Z]{3}\/\d{4}/g, '');
    return chave.replace(/\s+/g, ' ').trim();
}

const formatCurrency = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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

/**
 * Processa os dados de um ativo encontrado no extrato do BTG.
 * @param {Array} match O resultado da execução do Regex.
 * @returns {Object} Um objeto formatado com os dados do ativo.
 */
function parseBTGMatch(match) {
    // A estrutura do Regex do BTG captura os dados em índices diferentes
    // dependendo se é Tesouro ou LCA. Esta função normaliza isso.
    const emissor = match[1] || match[8];
    const produto = match[2] || match[9];
    const dataVencimento = match[4] || match[11];
    const taxa = match[5] || match[12];
    const valorLiquidoStr = match[7] || match[14];
    
    // Limpa a string do valor e a converte para número
    const valorLiquido = parseFloat(valorLiquidoStr.replace(/\./g, '').replace(',', '.'));

    return {
        tipo: produto.split(' ')[0], // Pega a primeira palavra como tipo (LFT, LCA, etc)
        banco: emissor.trim(),
        produto: produto.trim(),
        dataAplicacao: match[3] || match[10], // Data de Emissão/Aquisição
        dataVencimento: dataVencimento,
        taxa: taxa.replace(/\s+/g, ' ').trim(), // Limpa espaços extras na taxa
        // O relatório de posição do BTG não informa o valor aplicado,
        // então usaremos o valor líquido como uma aproximação.
        valorAplicado: valorLiquido,
        valorLiquido: valorLiquido
    };
}

function parseXPMatch(match) {
    const tipoAtivo = match[1];
    const fullProductName = match[2];
    const chaveAgrupamento = gerarChaveDeAgrupamento(`${tipoAtivo} ${fullProductName}`);
    
    return {
        tipo: tipoAtivo,
        banco: chaveAgrupamento,
        produto: fullProductName.trim(),
        dataAplicacao: match[3],
        dataVencimento: match[5],
        taxa: match[6].trim(),
        valorAplicado: parseFloat(match[7].replace(/\./g, '').replace(',', '.')),
        valorLiquido: parseFloat(match[9].replace(/\./g, '').replace(',', '.')) // O 9º grupo é o Valor Líquido no padrão da XP
    };
}

function normalizarAtivo(ativo) {
    const ativoNormalizado = { ...ativo };

    // --- PONTO 1: Normaliza o nome do Emissor ---
    if (ativoNormalizado.banco && ativoNormalizado.banco.toUpperCase().includes('BACEN')) {
        ativoNormalizado.banco = 'Tesouro Nacional';
    }

    // Padroniza o campo 'taxa'
    if (ativoNormalizado.taxa) {
        let taxaUpper = ativoNormalizado.taxa.toUpperCase();
        
        taxaUpper = taxaUpper.replace('IPC-A', 'IPCA');
        taxaUpper = taxaUpper.replace('IGP-M', 'IGPM');
        
        ativoNormalizado.taxa = taxaUpper.replace(/\s+/g, ' ').trim();
    }
    
    return ativoNormalizado;
}


const regexXP = /(CDB|CDE|LCI|LCA|CRI|CRA|DEB|LIG)\s(.*?)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(.*?)\s+\d+\s*\d*\s+R\$\s+([\d.,]+)\s+R\$\s+([\d.,]+)\s+R\$\s+([\d.,]+)/g;
const regexBTG = /(BACEN - BANCO CENTRAL DO BRASIL\s*-\s*RJ)\s+(LFT|LTN|NTNB(?: - P)?)\s+(\d{2}\/\d{2}\/\d{2,4})\s+(\d{2}\/\d{2}\/\d{2,4})[\s\S]*?((?:SELIC|OVER|IPCA)\s*\+\s*[\d,]+\s*%)[\s\S]*?([\d.,]+)\s+(?:[\d.,]+|-)\s+-\s+([\d.,]+)|(BANCO BTG PACTUAL S A)\s+(LCA\s*-\s*.*?)\s+(\d{2}\/\d{2}\/\d{2,4})\s+(\d{2}\/\d{2}\/\d{2,4})[\s\S]*?((?:IPCA|CDI)\s*\+\s*[\d,]+\s*%)[\s\S]*?([\d.,]+)\s+-\s+-\s+([\d.,]+)/g;

// 2. Montagem da Biblioteca
const BIBLIOTECA_DE_PARSERS = [
    {
        nomeCorretora: 'BTG Pactual',
        regex: regexBTG,
        funcaoDeExtracao: parseBTGMatch
    },
    {
        nomeCorretora: 'XP Investimentos',
        regex: regexXP,
        funcaoDeExtracao: parseXPMatch
    }
    // PARA ADICIONAR UMA NOVA CORRETORA, BASTA ADICIONAR UM NOVO OBJETO AQUI!
];

function processarTextoDoPDF(text) {
    let ativos = [];

    // Loop principal que testa cada parser da nossa biblioteca
    for (const parser of BIBLIOTECA_DE_PARSERS) {
        let match;
        // O "g" no final do regex é importante para que o loop while funcione
        parser.regex.lastIndex = 0; // Reseta o índice do regex para uma nova busca

        while ((match = parser.regex.exec(text)) !== null) {
            // Usa a função de extração específica daquela corretora
            const ativoBruto = parser.funcaoDeExtracao(match);
            // Normaliza os dados extraídos para garantir consistência
            const ativoNormalizado = normalizarAtivo(ativoBruto);
            ativos.push(ativoNormalizado);
        }

        // Se encontrou ativos com este parser, assume que é a corretora certa e para o loop
        if (ativos.length > 0) {
            console.log(`PDF identificado como padrão da corretora: ${parser.nomeCorretora}`);
            break;
        }
    }

    if (ativos.length > 0) {
        reportContainer.style.display = 'block';
        todosOsAtivos = ativos;
        popularFiltros(todosOsAtivos);
        aplicarFiltros();
    } else {
        alert("Nenhum ativo de Renda Fixa foi encontrado em um formato reconhecido. Verifique o documento PDF.");
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
    desenharGraficoIndexadores(ativos);
}

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

    const projecaoCDI = parseFloat(document.getElementById('projecao-cdi').value) / 100;
    const projecaoIPCA = parseFloat(document.getElementById('projecao-ipca').value) / 100;
    const emissoresFuturo = {};
    
    ativos.forEach(ativo => {
        const tiposFGC = ['CDB', 'CDE', 'LCI', 'LCA', 'LIG'];
        if(tiposFGC.includes(ativo.tipo.toUpperCase())){
            if (!emissoresFuturo[ativo.banco]) {
                emissoresFuturo[ativo.banco] = 0;
            }
            const valorFuturo = calcularValorFuturo(ativo, projecaoCDI, projecaoIPCA);
            emissoresFuturo[ativo.banco] += valorFuturo;
        }
    });

    for (const [emissor, valorProjetado] of Object.entries(emissoresFuturo)) {
        if (valorProjetado > 250000) {
             insightsHTML += `<li><span style="color: #dc3545; font-weight: bold;">Risco FGC Futuro:</span> O valor total projetado para o emissor <strong>${emissor}</strong> atingirá <strong>${formatCurrency(valorProjetado)}</strong>, ultrapassando a garantia de R$ 250 mil. <strong><a href="#" onclick="document.getElementById('contact-btn').click(); return false;">Fale com um especialista</a></strong> para reestruturar sua carteira.</li>`;
        }
    }
    
    const bancosData = {};
    ativos.forEach(ativo => {
        bancosData[ativo.banco] = (bancosData[ativo.banco] || 0) + ativo.valorLiquido;
    });

    if (Object.keys(bancosData).length > 0) {
        const [maiorEmissor, valorMaiorEmissor] = Object.entries(bancosData).reduce((a, b) => a[1] > b[1] ? a : b);
        const percentualConcentracao = (valorMaiorEmissor / totalValor) * 100;
        
        if (percentualConcentracao > 50 && Object.keys(bancosData).length > 1) {
            insightsHTML += `<li><span style="color: #ffc107; font-weight: bold;">Ponto de Atenção:</span> ${percentualConcentracao.toFixed(0)}% da carteira está concentrada no emissor <strong>${maiorEmissor}</strong>. Considere diversificar.</li>`;
        }
    }
    
    const indexadoresData = {};
    ativos.forEach(ativo => {
        const categoria = categorizarPorIndexador(ativo.taxa);
        indexadoresData[categoria] = (indexadoresData[categoria] || 0) + ativo.valorLiquido;
    });

    if(Object.keys(indexadoresData).length > 0){
        const [maiorIndexador, valorMaiorIndexador] = Object.entries(indexadoresData).reduce((a,b) => a[1] > b[1] ? a : b);
        const percentualIndexador = (valorMaiorIndexador / totalValor) * 100;

        if(percentualIndexador >= 90){
             insightsHTML += `<li><span style="color: #0d6efd; font-weight: bold;">Oportunidade:</span> ${percentualIndexador.toFixed(0)}% da sua carteira está atrelada a <strong>${maiorIndexador}</strong>. Diversificar os indexadores pode proteger seu patrimônio. <strong><a href="#" onclick="document.getElementById('contact-btn').click(); return false;">Converse conosco</a></strong>.</li>`;
        }
    }

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const proximoAtivo = ativos
        .map(a => ({ ...a, dataVencObj: new Date(a.dataVencimento.split('/').reverse().join('-')) }))
        .filter(a => a.dataVencObj >= hoje)
        .sort((a, b) => a.dataVencObj - b.dataVencObj)[0];

    if (proximoAtivo) {
        insightsHTML += `<li>Seu próximo vencimento é em <strong>${proximoAtivo.dataVencimento}</strong> (${proximoAtivo.produto}). Planeje o reinvestimento.</li>`;
    }

    insightsHTML += `<li>Análise de <strong>${ativos.length}</strong> ativos, somando <strong>${formatCurrency(totalValor)}</strong> (valor líquido atual).</li>`;
    
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

function criarGraficoProjecao(ativos) {
    const vencimentosAgrupados = {};
    ativos.forEach(ativo => {
        const dataVenc = ativo.dataVencimento;
        if (!vencimentosAgrupados[dataVenc]) {
            vencimentosAgrupados[dataVenc] = 0;
        }
        vencimentosAgrupados[dataVenc] += ativo.valorAplicado; 
    });

    const datasOrdenadas = Object.keys(vencimentosAgrupados).sort((a, b) => new Date(a.split('/').reverse().join('-')) - new Date(b.split('/').reverse().join('-')));
    
    let patrimonioAplicado = ativos.reduce((sum, ativo) => sum + ativo.valorLiquido, 0);
    
    const labelsLinhaDoTempo = ['Hoje'];
    const dadosLinhaDoTempo = [patrimonioAplicado];

    datasOrdenadas.forEach(data => {
        labelsLinhaDoTempo.push(data);
        const principalQueVence = vencimentosAgrupados[data];
        patrimonioAplicado -= principalQueVence;
        dadosLinhaDoTempo.push(Math.max(0, patrimonioAplicado)); 
    });

    desenharGraficoLinhaDoTempo(labelsLinhaDoTempo, dadosLinhaDoTempo);
}

function calcularValorFuturo(ativo, projecaoCDI, projecaoIPCA) {
    /**
     * Helper para converter datas nos formatos DD/MM/YY ou DD/MM/YYYY para um objeto Date.
     * Isso corrige o problema de anos com 2 dígitos.
     */
    const parseDataCorretamente = (strData) => {
        const partes = strData.split('/');
        let ano = parseInt(partes[2], 10);
        
        // Converte anos de 2 dígitos para 4 dígitos (ex: 25 -> 2025)
        if (ano < 100) {
            ano += 2000;
        }
        
        const mes = parseInt(partes[1], 10) - 1; // Mês no JavaScript é de 0 a 11
        const dia = parseInt(partes[0], 10);
        
        return new Date(ano, mes, dia);
    };

    const projecaoSelic = parseFloat(projecaoSelicInput.value) / 100;
    const projecaoIGPM = parseFloat(projecaoIgpmInput.value) / 100;
    const nomeProduto = ativo.produto.toUpperCase();
    const taxaStr = ativo.taxa.toUpperCase();

    if (nomeProduto.includes('JUROS MENSAIS') || nomeProduto.includes('JURO MENSAL')) {
        return ativo.valorAplicado;
    }
    
    const hoje = new Date();
    // Usa nossa nova função para garantir que a data seja lida corretamente
    const dataVenc = parseDataCorretamente(ativo.dataVencimento);
    const diffTime = dataVenc - hoje;

    // Ativos já vencidos não entram na projeção futura
    if (diffTime <= 0) {
        return ativo.valorLiquido;
    }

    const diffAnos = diffTime / (1000 * 60 * 60 * 24 * 365.25);
    const valorPresente = ativo.valorLiquido;
    let taxaAnual = 0;

    const extrairJurosDaTaxa = (str) => {
        const apenasNumeros = str.replace(/[^\d,.]/g, '');
        if (apenasNumeros) {
            return parseFloat(apenasNumeros.replace(',', '.')) / 100;
        }
        return 0;
    };

    if (taxaStr.includes('CDI')) {
        const percentualCDI = extrairJurosDaTaxa(taxaStr);
        taxaAnual = percentualCDI * projecaoCDI;

    } else if (taxaStr.includes('IPCA')) {
        const jurosReais = extrairJurosDaTaxa(taxaStr);
        taxaAnual = (1 + projecaoIPCA) * (1 + jurosReais) - 1;

    } else if (taxaStr.includes('LFT') || taxaStr.includes('SELIC') || taxaStr.includes('OVER')) {
        const jurosAdicionais = extrairJurosDaTaxa(taxaStr);
        if (taxaStr.includes('-')) {
            taxaAnual = projecaoSelic - jurosAdicionais;
        } else {
            taxaAnual = projecaoSelic + jurosAdicionais;
        }

    } else if (taxaStr.includes('IGPM')) {
        const jurosReais = extrairJurosDaTaxa(taxaStr);
        taxaAnual = (1 + projecaoIGPM) * (1 + jurosReais) - 1;

    } else { 
        const taxaPre = extrairJurosDaTaxa(taxaStr);
        if (taxaPre > 0) {
            taxaAnual = taxaPre;
        } else {
            // Se não for possível calcular, retorna o valor atual para não quebrar o gráfico
            return valorPresente;
        }
    }
    
    return valorPresente * Math.pow((1 + taxaAnual), diffAnos);
}

function desenharGraficoLinhaDoTempo(labels, data) {
    if (projecaoChart) projecaoChart.destroy();
    projecaoChart = new Chart(projecaoChartCtx, { 
        type: 'line', 
        data: { 
            labels: labels, 
            datasets: [{ 
                label: 'Patrimônio Aplicado (R$)',
                data: data, 
                borderColor: '#198754', 
                backgroundColor: 'rgba(25, 135, 84, 0.1)', 
                fill: true, 
                stepped: true 
            }] 
        }, 
        options: { 
            scales: { y: { beginAtZero: false } } 
        } 
    });
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
        type: 'pie',
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