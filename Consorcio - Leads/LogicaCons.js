document.addEventListener('DOMContentLoaded', () => {
    // --- LÓGICA DE CONTROLE DE USO E COLETA DE LEADS ---
    const form = document.getElementById('form-simulacao');
    const btnCalcular = document.querySelector('.btn-calcular');
    const API_URL = 'https://sheetdb.io/api/v1/2movwuamqwsf1';
    const MAX_USOS_POS_CADASTRO = 2; // Número de usos extras após o cadastro

    // --- Função para criar e exibir o pop-up de coleta ---
    const exibirPopupColeta = () => {
        // Verifica se o pop-up já existe
        let popup = document.getElementById('popup-coleta');
        if (popup) {
            popup.style.display = 'block';
            document.getElementById('popup-overlay').style.display = 'block';
            return;
        }

        // Se não existir, cria o pop-up
        popup = document.createElement('div');
        popup.id = 'popup-coleta';
        popup.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: var(--cor-fundo-card);
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.2);
            z-index: 1000;
            text-align: center;
            width: 90%;
            max-width: 400px;
        `;
        popup.innerHTML = `
            <h3>Cadastre-se para Continuar</h3>
            <p>Sua simulação é valiosa! Preencha seus dados para ter mais dois usos gratuitos da calculadora.</p>
            <form id="form-coleta-leads">
                <div class="form-group">
                    <label for="email-coleta">E-mail:</label>
                    <input type="email" id="email-coleta" required>
                </div>
                <div class="form-group" style="margin-top: 15px;">
    <label for="telefone-coleta">Telefone:</label>
    <input type="tel" id="telefone-coleta" maxlength="11" pattern="[0-9]{11}" required>
</div>
                <button type="submit" class="btn-calcular" style="margin-top: 25px;">Continuar e Enviar</button>
            </form>
            <button id="fechar-popup" style="background: none; border: none; font-size: 1.5rem; position: absolute; top: 10px; right: 15px; cursor: pointer;">&times;</button>
        `;
        document.body.appendChild(popup);

        // Adiciona um fundo escuro para o pop-up
        const overlay = document.createElement('div');
        overlay.id = 'popup-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 999;
        `;
        document.body.appendChild(overlay);

        // Lógica para fechar o pop-up
        document.getElementById('fechar-popup').addEventListener('click', () => {
            popup.style.display = 'none';
            overlay.style.display = 'none';
        });

        // Lógica de envio do formulário de coleta
        document.getElementById('form-coleta-leads').addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('email-coleta').value;
            const telefone = document.getElementById('telefone-coleta').value;

            enviarDadosECalcular(email, telefone);
        });
    };

    // --- Função para enviar dados para a API e continuar ---
    const enviarDadosECalcular = async (email, telefone) => {
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: [{ email, telefone }]
                })
            });
            const data = await response.json();
            
            console.log('Dados enviados com sucesso:', data);
            alert('Obrigado! Você tem mais dois usos gratuitos.');
            
            // Define o contador para o número de usos extras
            localStorage.setItem('usosExtras', '0');
            localStorage.setItem('contadorUso', '1');
            
            // Fecha o pop-up de coleta
            document.getElementById('popup-coleta').style.display = 'none';
            document.getElementById('popup-overlay').style.display = 'none';
            
            // Executa o cálculo imediatamente após o cadastro
            executarCalculo();
            
        } catch (error) {
            console.error('Erro ao enviar dados:', error);
            alert('Ocorreu um erro. Tente novamente.');
        }
    };
    
    // Lógica para exibir pop-up de bloqueio
const exibirPopupBloqueio = () => {
    let popup = document.getElementById('popup-bloqueio');
    if (popup) {
        popup.style.display = 'block';
        document.getElementById('popup-overlay-bloqueio').style.display = 'block';
        return;
    }

    popup = document.createElement('div');
    popup.id = 'popup-bloqueio';
    popup.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: var(--cor-fundo-card);
        padding: 30px;
        border-radius: 10px;
        box-shadow: 0 5px 20px rgba(0, 0, 0, 0.2);
        z-index: 1000;
        text-align: center;
        width: 90%;
        max-width: 400px;
    `;
    popup.innerHTML = `
        <h3>Limite de Uso Atingido</h3>
        <p>Para ter acesso ilimitado à nossa calculadora e a outras ferramentas, siga-nos no Instagram para ficar por dentro das novidades.</p>
        <a href="https://www.instagram.com/mateuspalermo/?hl=pt-br" target="_blank" style="background: none; border: none; font-size: 1.5rem; position: absolute; top: 10px; right: 15px; cursor: pointer; color: var(--cor-principal); text-decoration: none;">&times;</a>
    `;
    document.body.appendChild(popup);

    const overlay = document.createElement('div');
    overlay.id = 'popup-overlay-bloqueio';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 999;
    `;
    document.body.appendChild(overlay);

    // O pop-up não pode ser fechado sem clicar no "X" (agora um link)
    // O evento de clique é removido para que o link funcione
};
    
    // --- Lógica de controle de uso no botão Calcular ---
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        
        const usosExtras = localStorage.getItem('usosExtras');

        // Se o usuário já se cadastrou, usamos o contador de usos extras
        if (usosExtras !== null) {
            let contadorExtra = parseInt(usosExtras, 10);
            if (contadorExtra < MAX_USOS_POS_CADASTRO) {
                // Se ainda há usos extras, incrementa e calcula
                contadorExtra++;
                localStorage.setItem('usosExtras', contadorExtra.toString());
                executarCalculo();
            } else {
                // Acabaram os usos extras, mostra o bloqueio
                exibirPopupBloqueio();
            }
            return;
        }

        // --- Lógica de bloqueio para o uso inicial, antes do cadastro ---
        let contador = parseInt(localStorage.getItem('contadorUso') || '0', 10);
        
        if (contador >= 2) {
            // Se o contador for 2 ou mais, estamos na terceira ou mais tentativas
            exibirPopupBloqueio();
            return; // Impede que o código de cálculo continue
        }

        // Incrementa o contador para a próxima vez
        contador++;
        localStorage.setItem('contadorUso', contador.toString());

        // Lógica de controle de uso para quem ainda não se cadastrou
        if (contador === 1) {
            executarCalculo();
        } else if (contador === 2) {
            executarCalculo();
            exibirPopupColeta();
        }
    });

    // --- Função principal que executa o cálculo da sua calculadora ---
    const executarCalculo = () => {
        // --- Código de cálculo original da calculadora ---
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
    };

    // --- Restante do seu código original (funções de cálculo e exibição) ---
    // (Código de formatação, calcularFinanciamentoSAC, calcularConsorcio, exibirTabelaResultados, exibirResumoFinal, exibirGrafico...)
    
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

    const calcularConsorcio = (valorCarta, taxaAdm, numeroMeses, ipcaMensal, valorLance) => {
        const cronograma = [];
        let custoAcumulado = 0;
        let dividaAtual = valorCarta * (1 + taxaAdm);
        
        if (numeroMeses >= 1) {
            const mesesRestantes = numeroMeses;
            const parcelaMensal = dividaAtual / mesesRestantes;
            const saldoAposParcela = dividaAtual - parcelaMensal;
            let residuoFinal = saldoAposParcela * (1 + ipcaMensal);
            custoAcumulado += parcelaMensal;

            cronograma.push({
                mes: 1,
                saldoDevedor: residuoFinal,
                parcelaMensal: parcelaMensal,
                custoAcumulado: custoAcumulado
            });
            dividaAtual = residuoFinal;
        }

        dividaAtual -= valorLance;
        custoAcumulado += valorLance;

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
                <p class="aviso-consorcio">
                    <b>Aviso:</b> O cálculo do Consórcio assume a contemplação por lance na primeira assembleia.
                </p>
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

        const backgroundGradientFin = ctx.createLinearGradient(0, 0, 0, 400);
        backgroundGradientFin.addColorStop(0, 'rgba(27, 64, 67, 0.4)');
        backgroundGradientFin.addColorStop(1, 'rgba(27, 64, 67, 0)');

        const backgroundGradientCon = ctx.createLinearGradient(0, 0, 0, 400);
        backgroundGradientCon.addColorStop(0, 'rgba(245, 158, 11, 0.4)');
        backgroundGradientCon.addColorStop(1, 'rgba(245, 158, 11, 0)');

        const data = {
            labels: financiamantoData.map(mes => mes.mes),
            datasets: [{
                label: 'Custo Acumulado - Financiamento',
                data: financiamantoData.map(mes => mes.custoAcumulado),
                borderColor: '#1b4043',
                backgroundColor: backgroundGradientFin,
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointHoverRadius: 6,
            }, {
                label: 'Custo Acumulado - Consórcio',
                data: consorcioData.map(mes => mes.custoAcumulado),
                borderColor: '#F59E0B',
                backgroundColor: backgroundGradientCon,
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointHoverRadius: 6,
            }]
        };
        
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