document.addEventListener('DOMContentLoaded', () => {
    // --- Código de formatação de números (sem alterações) ---
    const inputs = document.querySelectorAll('#valor-imovel, #valor-entrada, #valor-carta, #valor-lance');

    const formatarNumero = (valor) => {
        let valorLimpo = valor.replace(/[^\d,]/g, '');
        if (!valorLimpo) { return ''; }
        let valorNumerico = parseFloat(valorLimpo.replace(',', '.'));
        if (isNaN(valorNumerico)) { return ''; }
        return valorNumerico.toLocaleString('pt-BR');
    };

    inputs.forEach(input => {
        input.addEventListener('input', (event) => {
            const inputAtual = event.target;
            const valor = inputAtual.value;
            const cursorStart = inputAtual.selectionStart;

            let cursorOffset = 0;
            const valorFormatado = formatarNumero(valor);
            const dif = valorFormatado.length - valor.length;
            cursorOffset = cursorStart + dif;

            inputAtual.value = valorFormatado;
            try {
                inputAtual.setSelectionRange(cursorOffset, cursorOffset);
            } catch (e) {
                // Em alguns casos, como o input estar vazio, pode dar erro. Ignoramos.
            }
        });
    });

    // --- Seção para a lógica de cálculo e exibição ---
    const form = document.getElementById('form-simulacao');

    form.addEventListener('submit', (event) => {
        event.preventDefault();

        const valorImovel = parseFloat(document.getElementById('valor-imovel').value.replace(/\./g, '').replace(',', '.'));
        const valorEntrada = parseFloat(document.getElementById('valor-entrada').value.replace(/\./g, '').replace(',', '.'));
        const taxaJurosAnual = parseFloat(document.getElementById('taxa-juros').value) / 100;
        const taxaTRAnual = parseFloat(document.getElementById('taxa-referencial').value) / 100;
        const numeroMeses = parseInt(document.getElementById('numero-meses').value);
        const valorCarta = parseFloat(document.getElementById('valor-carta').value.replace(/\./g, '').replace(',', '.'));
        const taxaAdm = parseFloat(document.getElementById('taxa-adm').value) / 100;
        const valorLance = parseFloat(document.getElementById('valor-lance').value.replace(/\./g, '').replace(',', '.')) || 0;
        const ipcaAnual = parseFloat(document.getElementById('ipca').value) / 100;

        const taxaJurosMensal = Math.pow(1 + taxaJurosAnual, 1 / 12) - 1;
        const taxaTRMensal = Math.pow(1 + taxaTRAnual, 1 / 12) - 1;
        const ipcaMensal = Math.pow(1 + ipcaAnual, 1 / 12) - 1;

        const saldoFinanciado = valorImovel - valorEntrada;
        
        const resultadosFinanciamento = calcularFinanciamentoSAC(
            saldoFinanciado,
            taxaJurosMensal,
            taxaTRMensal,
            numeroMeses,
            valorEntrada
        );

        const resultadosConsorcio = calcularConsorcio(
            valorCarta,
            taxaAdm,
            numeroMeses,
            ipcaMensal,
            valorLance
        );

        exibirResumoFinal(resultadosFinanciamento, resultadosConsorcio);
        exibirGrafico(resultadosFinanciamento, resultadosConsorcio);
        exibirTabelaResultados(resultadosFinanciamento, resultadosConsorcio);
    });

    const calcularFinanciamentoSAC = (saldoInicial, taxaJurosMensal, taxaTRMensal, numeroMeses, valorEntrada) => {
        let saldoDevedor = saldoInicial;
        const cronograma = [];
        let custoAcumulado = valorEntrada; 

        for (let i = 1; i <= numeroMeses; i++) {
            const dividaInicial = saldoDevedor;
            const correcao = dividaInicial * taxaTRMensal;
            const dividaCorrigida = dividaInicial + correcao;
            const mesesRestantes = numeroMeses - i + 1;
            const amortizacao = dividaCorrigida / mesesRestantes;
            const juros = dividaCorrigida * taxaJurosMensal;
            let parcela = amortizacao + juros;
            saldoDevedor = dividaCorrigida - amortizacao;
            if (i === numeroMeses && saldoDevedor > 0.01) {
                parcela += saldoDevedor;
                saldoDevedor = 0;
            }
            custoAcumulado += parcela;
            cronograma.push({
                mes: i, saldoDevedor: saldoDevedor > 0 ? saldoDevedor : 0,
                amortizacao: amortizacao, juros: juros, parcela: parcela,
                custoAcumulado: custoAcumulado
            });
        }
        return cronograma;
    };
// ==================================================================
// === FUNÇÃO DE CÁLCULO DO CONSÓRCIO (LÓGICA FINAL REVISADA) ======
// ==================================================================
const calcularConsorcio = (valorCarta, taxaAdm, numeroMeses, ipcaMensal, valorLance) => {
    const cronograma = [];
    let custoAcumulado = 0;

    // Documentação da Lógica Final:
    // 1. A Dívida inicial é o Valor da Carta + Taxa de Adm.
    // 2. A Parcela é a Dívida atual dividida pelos meses restantes.
    // 3. O Resíduo (próxima Dívida) é (Dívida - Parcela) * (1 + IPCA).
    // 4. A Parcela 1 é paga, e SÓ ENTÃO o lance é abatido do resíduo.

    // --- MÊS 1 (PRÉ-LANCE) ---
    let dividaAtual = valorCarta * (1 + taxaAdm);
    
    if (numeroMeses >= 1) {
        const mesesRestantes = numeroMeses;
        const parcelaMensal = dividaAtual / mesesRestantes;
        
        // A correção do IPCA é aplicada sobre o saldo após o pagamento da parcela.
        const saldoAposParcela = dividaAtual - parcelaMensal;
        let residuoFinal = saldoAposParcela * (1 + ipcaMensal);

        custoAcumulado += parcelaMensal;

        cronograma.push({
            mes: 1,
            saldoDevedor: residuoFinal, // O saldo devedor já inclui a correção
            parcelaMensal: parcelaMensal,
            custoAcumulado: custoAcumulado
        });

        // A dívida para o próximo mês é o resíduo do mês anterior.
        dividaAtual = residuoFinal;
    }

    // --- APLICA O LANCE (CONTEMPLAÇÃO) ---
    // O lance é abatido da dívida que sobrou após o primeiro mês.
    dividaAtual -= valorLance;
    custoAcumulado += valorLance;

    // --- MESES SEGUINTES (PÓS-LANCE) ---
    for (let i = 2; i <= numeroMeses; i++) {
        if (dividaAtual <= 0.01) break;

        const mesesRestantes = numeroMeses - i + 1;
        const parcelaMensal = dividaAtual / mesesRestantes;

        const saldoAposParcela = dividaAtual - parcelaMensal;
        const residuoFinal = saldoAposParcela * (1 + ipcaMensal);

        custoAcumulado += parcelaMensal;
        
        cronograma.push({
            mes: i,
            saldoDevedor: residuoFinal,
            parcelaMensal: parcelaMensal,
            custoAcumulado: custoAcumulado
        });

        dividaAtual = residuoFinal;
    }
    
    // O resto da função continua igual...
    const mesesCalculados = cronograma.length;
    if (mesesCalculados > 0 && mesesCalculados < numeroMeses) {
        const ultimoCusto = cronograma[cronograma.length - 1].custoAcumulado;
        for (let i = mesesCalculados + 1; i <= numeroMeses; i++) {
            cronograma.push({
                mes: i, saldoDevedor: 0, parcelaMensal: 0, custoAcumulado: ultimoCusto 
            });
        }
    }
    
    return cronograma;
};


    // --- Funções de exibição de resultados (sem alterações) ---
    const exibirTabelaResultados = (financiamantoData, consorcioData) => {
        const tabelaContainer = document.getElementById('tabela-container');
        tabelaContainer.innerHTML = '';
        const tabelaHTML = `
            <div class="resultado-card tabela-card">
                <h3>Comparativo Detalhado (Mês a Mês)</h3>
                <div class="tabela-container">
                    <table>
                        <thead>
                            <tr>
                                <th rowspan="2">Mês</th>
                                <th colspan="3">Financiamento</th>
                                <th colspan="2">Consórcio</th>
                            </tr>
                            <tr>
                                <th>Parcela</th>
                                <th>Custo Acumulado</th>
                                <th>Saldo Devedor</th>
                                <th>Parcela</th>
                                <th>Custo Acumulado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${financiamantoData.map((finMes, index) => {
                                const consorcioMes = consorcioData[index] || {};
                                return `
                                    <tr>
                                        <td>${finMes.mes}</td>
                                        <td>${finMes.parcela.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                        <td>${finMes.custoAcumulado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                        <td>${finMes.saldoDevedor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                        <td>${(consorcioMes.parcelaMensal || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                        <td>${(consorcioMes.custoAcumulado || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        tabelaContainer.innerHTML = tabelaHTML;
    };

    const exibirResumoFinal = (financiamantoData, consorcioData) => {
        const resumoContainer = document.getElementById('resumo-container');
        resumoContainer.innerHTML = '';
        const totalPagoFinanciamento = financiamantoData[financiamantoData.length - 1].custoAcumulado;
        const totalPagoConsorcio = consorcioData.length > 0 ? consorcioData[consorcioData.length - 1].custoAcumulado : 0;
        let mensagem = '';
        if (totalPagoFinanciamento < totalPagoConsorcio) {
            mensagem = 'O financiamento é a melhor escolha!';
        } else if (totalPagoConsorcio < totalPagoFinanciamento) {
            mensagem = 'O consórcio é a melhor escolha!';
        } else {
            mensagem = 'Ambas as opções são equivalentes.';
        }
        const resumoHTML = `
            <div class="resultado-card">
                <h3>Resumo da Simulação</h3>
                <div class="resumo-valores">
                    <div class="valor-box financiamento">
                        <p>Total Pago (Financiamento):</p>
                        <h4>${totalPagoFinanciamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</h4>
                    </div>
                    <div class="valor-box consorcio">
                        <p>Total Pago (Consórcio):</p>
                        <h4>${totalPagoConsorcio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</h4>
                    </div>
                </div>
                <h4 class="resultado-mensagem">${mensagem}</h4>
            </div>
        `;
        resumoContainer.innerHTML = resumoHTML;
    };

    const exibirGrafico = (financiamantoData, consorcioData) => {
        const graficoContainer = document.getElementById('grafico-container');
        graficoContainer.innerHTML = '';
        graficoContainer.innerHTML = '<canvas id="grafico-comparativo"></canvas>';
        const ctx = document.getElementById('grafico-comparativo').getContext('2d');
        if (window.myChart) {
            window.myChart.destroy();
        }

        // Gradiente para o Financiamento (original, verde-azulado)
        const backgroundGradientFin = ctx.createLinearGradient(0, 0, 0, 400);
        backgroundGradientFin.addColorStop(0, 'rgba(27, 64, 67, 0.4)');
        backgroundGradientFin.addColorStop(1, 'rgba(27, 64, 67, 0)');

        // --- ALTERAÇÃO AQUI ---
        // Novo gradiente para o Consórcio (nova cor, âmbar/laranja)
        const backgroundGradientCon = ctx.createLinearGradient(0, 0, 0, 400);
        backgroundGradientCon.addColorStop(0, 'rgba(245, 158, 11, 0.4)'); // Cor principal do gradiente alterada
        backgroundGradientCon.addColorStop(1, 'rgba(245, 158, 11, 0)');    // Cor final do gradiente alterada

        const data = {
            labels: financiamantoData.map(mes => mes.mes),
            datasets: [{
                label: 'Custo Acumulado - Financiamento',
                data: financiamantoData.map(mes => mes.custoAcumulado),
                borderColor: '#1b4043', // Cor original mantida (verde-azulado escuro)
                backgroundColor: backgroundGradientFin,
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointHoverRadius: 6,
            }, {
                label: 'Custo Acumulado - Consórcio',
                data: consorcioData.map(mes => mes.custoAcumulado),
                // --- ALTERAÇÃO AQUI ---
                borderColor: '#F59E0B', // Nova cor com alto contraste (âmbar/laranja)
                backgroundColor: backgroundGradientCon, // Usando o novo gradiente
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointHoverRadius: 6,
            }]
        };
        
        // O restante da configuração do gráfico continua igual...
        const config = {
            type: 'line',
            data: data,
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    },
                },
                scales: {
                    y: {
                        title: {
                            display: true,
                            text: 'Custo Acumulado (R$)'
                        },
                        beginAtZero: true,
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Meses'
                        }
                    }
                }
            }
        };
        window.myChart = new Chart(ctx, config);
    };
});