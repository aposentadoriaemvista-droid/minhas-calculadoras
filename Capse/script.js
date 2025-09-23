// Versão com Otimizador Interativo
document.addEventListener('DOMContentLoaded', () => {

    let projectionChartInstance = null;
    let incomePieChartInstance = null;
    let growthCompositionChartInstance = null;
    
    let lastResults = {};
    let originalResults = {};
    
    const mascaraTelefone = (event) => {
        let input = event.target;
        input.value = phoneMask(input.value);
    }
    const phoneMask = (value) => {
        if (!value) return ""
        value = value.replace(/\D/g,'')
        value = value.replace(/(\d{2})(\d)/,"($1) $2")
        value = value.replace(/(\d)(\d{4})$/,"$1-$2")
        return value
    }
    document.getElementById('user-phone').addEventListener('input', mascaraTelefone);

    const rootStyles = getComputedStyle(document.documentElement);
    const primaryColor = rootStyles.getPropertyValue('--primary-color').trim();
    const successColor = rootStyles.getPropertyValue('--success-color').trim();
    const warningColor = rootStyles.getPropertyValue('--warning-color').trim();
    const dangerColor = rootStyles.getPropertyValue('--danger-color').trim();
    const cardBgColor = rootStyles.getPropertyValue('--card-bg').trim();
    const textColorMuted = rootStyles.getPropertyValue('--text-muted-color').trim();
    
    document.querySelectorAll('.main-button[data-nav]').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('section.card').forEach(s => s.classList.add('hidden'));
            document.getElementById(button.dataset.nav)?.classList.remove('hidden');
            window.scrollTo(0, 0);
        });
    });

    const essentialExpensesInput = document.getElementById('despesas-essenciais');
    const nonEssentialExpensesInput = document.getElementById('despesas-nao-essenciais');
    const debtsInput = document.getElementById('dividas-mensais');
    const monthsInput = document.getElementById('reserva-meses');

    document.getElementById('skip-emergency-fund').addEventListener('change', (e) => {
        const disabled = e.target.checked;
        document.getElementById('emergency-fund-inputs').style.display = disabled ? 'none' : 'block';
        if (disabled) {
            essentialExpensesInput.value = '';
            nonEssentialExpensesInput.value = '';
            debtsInput.value = '';
            monthsInput.value = '';
        }
        updateEmergencyFund();
    });

    [essentialExpensesInput, nonEssentialExpensesInput, debtsInput, monthsInput].forEach(input => input.addEventListener('input', updateEmergencyFund));
    
    function updateEmergencyFund() {
        const essential = unformatNumber(essentialExpensesInput.value);
        const nonEssential = unformatNumber(nonEssentialExpensesInput.value);
        const debts = unformatNumber(debtsInput.value);
        const months = unformatNumber(monthsInput.value);

        const totalMonthlyExpenses = essential + nonEssential + debts;
        const idealReserve = totalMonthlyExpenses * months;

        document.getElementById('emergency-fund-total-expenses').textContent = totalMonthlyExpenses > 0 ? `Total de despesas mensais consideradas: ${formatCurrency(totalMonthlyExpenses)}` : '';
        document.getElementById('reserva-ideal-result').textContent = idealReserve > 0 ? `Sua reserva ideal é de: ${formatCurrency(idealReserve)}` : '';
    }

    document.getElementById('include-aporte-growth').addEventListener('change', (e) => {
        document.getElementById('aporte-growth-group').classList.toggle('hidden', !e.target.checked);
    });
    const incomeInput = document.getElementById('salario');
    const expenseInput = document.getElementById('despesas-gerais');
    [incomeInput, expenseInput].forEach(input => input.addEventListener('input', updateAporte));
    function updateAporte() {
        const aporte = unformatNumber(incomeInput.value) - unformatNumber(expenseInput.value);
        document.getElementById('resumo-mensal').innerHTML = `<div class="summary-highlight">Seu potencial de aporte mensal inicial é de: <strong>${formatCurrency(aporte)}</strong></div>`;
        return aporte;
    }

    const addGoalBtn = document.getElementById('add-goal-btn');
    addGoalBtn.addEventListener('click', () => {
        const list = document.getElementById('goals-list');
        const newItem = document.createElement('div');
        newItem.classList.add('goal-item');
        newItem.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;"><h4>Novo Projeto de Vida</h4><button class="remove-button" onclick="this.closest('.goal-item').remove()">×</button></div>
            <div class="goal-grid">
                <div class="form-group"><label>Tipo</label><select class="goal-type"><option value="objetivo">Projeto (Saída de dinheiro)</option><option value="evento">Evento (Entrada de dinheiro)</option></select></div>
                <div class="form-group"><label>Descrição</label><input type="text" class="goal-description" placeholder="Ex: Viagem para a Europa"></div>
                <div class="form-group"><label>Valor (R$)</label><input type="text" class="formatted-number" id="goal-value" placeholder="50.000"></div>
                <div class="form-group"><label>Com que idade?</label><input type="text" class="formatted-number" id="goal-age" placeholder="35"></div>
            </div>`;
        list.appendChild(newItem);
        newItem.querySelectorAll('.formatted-number').forEach(el => el.addEventListener('input', formatNumberInput));
    });

    function addDefaultRetirementGoal() {
        addGoalBtn.click();
        const firstGoal = document.querySelector('.goal-item');
        firstGoal.querySelector('h4').textContent = 'Projeto de Aposentadoria';
        firstGoal.querySelector('.goal-type').innerHTML = '<option value="aposentadoria">Aposentadoria (Principal)</option>';
        firstGoal.querySelector('.goal-description').value = 'Aposentadoria';
        firstGoal.querySelector('.goal-description').readOnly = true;
        firstGoal.querySelector('[id="goal-value"]').placeholder = '10.000';
        firstGoal.querySelector('[id="goal-value"]').previousElementSibling.textContent = 'Renda Mensal Desejada (R$)';
        firstGoal.querySelector('[id="goal-age"]').placeholder = '60';
        firstGoal.querySelector('[id="goal-age"]').previousElementSibling.textContent = 'Idade de Aposentadoria';
        
        const lifeExpectancyField = document.createElement('div');
        lifeExpectancyField.classList.add('form-group');
        lifeExpectancyField.innerHTML = `<label>Expectativa de Vida</label><input type="text" class="formatted-number" id="goal-life-expectancy" placeholder="100">`;
        firstGoal.querySelector('.goal-grid').appendChild(lifeExpectancyField);
        
        const postRetirementContainer = document.createElement('div');
        postRetirementContainer.classList.add('form-group');
        postRetirementContainer.style.gridColumn = "1 / -1";
        postRetirementContainer.innerHTML = `
            <label class="toggle-switch">
                <input type="checkbox" class="toggle-post-retirement-income">
                <span class="slider"></span>
                <span class="label-text">Considerar renda extra na aposentadoria (INSS, aluguel, etc)?</span>
            </label>
            <div class="form-group hidden" style="margin-top: 15px;">
                <label>Valor Mensal da Renda Extra</label>
                <input type="text" class="formatted-number" id="goal-post-retirement-income" placeholder="R$ 3.000">
            </div>
        `;
        firstGoal.querySelector('.goal-grid').appendChild(postRetirementContainer);

        const toggle = postRetirementContainer.querySelector('.toggle-post-retirement-income');
        const inputGroup = postRetirementContainer.querySelector('.hidden');
        toggle.addEventListener('change', () => {
            inputGroup.classList.toggle('hidden', !toggle.checked);
        });

        firstGoal.querySelector('.remove-button').remove();
        firstGoal.querySelectorAll('.formatted-number').forEach(el => el.addEventListener('input', formatNumberInput));
    }
    addDefaultRetirementGoal();

    document.getElementById('generate-dashboard-btn').addEventListener('click', () => {
        runFinancialPlan();
    });
    
    document.getElementById('share-plan-btn').addEventListener('click', sharePlan);
    loadPlanFromURL();
    
    function runFinancialPlan() {
        enviarDadosParaPlanilha();
        try {
            const inputs = { 
                userName: document.getElementById('user-name').value,
                userPhone: document.getElementById('user-phone').value,
                idadeAtual: unformatNumber(document.getElementById('idade-atual').value), 
                patrimonioInicial: unformatNumber(document.getElementById('patrimonio').value), 
                aporteMensal: updateAporte(), 
                perfilRisco: document.getElementById('risk-profile').value, 
                aporteGrowth: document.getElementById('include-aporte-growth').checked ? (unformatNumber(document.getElementById('aporte-growth').value) / 100) : 0,
                despesasEssenciais: unformatNumber(document.getElementById('despesas-essenciais').value) || 0,
                reservaIdeal: unformatNumber(document.getElementById('reserva-ideal-result').textContent.replace(/[^0-9,.-]/g, ''))
            };

            let userGoals = [];
            document.querySelectorAll('.goal-item').forEach(item => {
                const goal = { type: item.querySelector('.goal-type').value, description: item.querySelector('.goal-description').value, value: unformatNumber(item.querySelector('[id="goal-value"]')?.value), age: unformatNumber(item.querySelector('[id="goal-age"]')?.value) };
                if (goal.type === 'aposentadoria') {
                    goal.lifeExpectancy = unformatNumber(item.querySelector('[id="goal-life-expectancy"]')?.value) || 100;
                    goal.postRetirementIncome = unformatNumber(item.querySelector('[id="goal-post-retirement-income"]')?.value) || 0;
                }
                userGoals.push(goal);
            });
            
            const retirementGoal = userGoals.find(g => g.type === 'aposentadoria');
            if (!retirementGoal || !retirementGoal.age || inputs.idadeAtual >= retirementGoal.age) {
                alert('Por favor, preencha os dados do objetivo de Aposentadoria com uma idade futura à sua idade atual.');
                return;
            }
            
            const premissas = { taxasJurosReais: { muitoConservador: 0.02, conservador: 0.04, moderado: 0.06, arrojado: 0.08, muitoArrojado: 0.10 } };
            const taxaJurosAtual = premissas.taxasJurosReais[inputs.perfilRisco];
            const anosParaAposentar = retirementGoal.age - inputs.idadeAtual;
            const anosDeAposentadoria = retirementGoal.lifeExpectancy - retirementGoal.age;
            const rendaComplementarNecessaria = Math.max(0, retirementGoal.value - retirementGoal.postRetirementIncome);
            
            const metaMinima = calculatePresentValue(rendaComplementarNecessaria * 12, taxaJurosAtual, anosDeAposentadoria);
            const metaIdeal = (rendaComplementarNecessaria * 12) / taxaJurosAtual;
            
            const aporteMinimo = calculateRequiredPMT(inputs.patrimonioInicial, metaMinima, taxaJurosAtual, anosParaAposentar, inputs.aporteGrowth);
            const aporteIdeal = calculateRequiredPMT(inputs.patrimonioInicial, metaIdeal, taxaJurosAtual, anosParaAposentar, inputs.aporteGrowth);

            const fullProjection = generateFullProjection(inputs, userGoals, taxaJurosAtual);
            const patrimonioNaAposentadoria = anosParaAposentar > 0 ? fullProjection.accumulation.slice(-1)[0].saldoFinal : inputs.patrimonioInicial;
            
            const resultsForImpact = { ...inputs, userGoals, retirementGoal, taxaJurosAtual, metaIdeal, metaMinima, aporteGrowth: inputs.aporteGrowth };
            const impactAnalysis = calculateImpactAnalysis(fullProjection, resultsForImpact);
            
            lastResults = { projecaoAtual: patrimonioNaAposentadoria, metaMinima, metaIdeal, aporteMinimo, aporteIdeal, inputs, retirementGoal, fullProjection, taxaJurosAtual, impactAnalysis, userGoals };
            originalResults = JSON.parse(JSON.stringify(lastResults));
            
            updateDashboardUI(lastResults);
            setupScenarioSimulator(originalResults);

        } catch (error) {
            console.error("Erro ao gerar o dashboard:", error);
            alert("Ocorreu um erro ao gerar seu planejamento. Verifique se todos os campos foram preenchidos corretamente.");
        }
    }
        
    function updateDashboardUI(results) {
        const { projecaoAtual, metaMinima, metaIdeal, aporteMinimo, aporteIdeal, inputs, retirementGoal, fullProjection, userGoals, taxaJurosAtual, impactAnalysis } = results;
        document.getElementById('dashboard-subtitle').textContent = `Olá, ${inputs.userName}! Veja o resumo e o plano de ação para sua aposentadoria.`;
        
        const metricsContainer = document.getElementById('metrics-container');
        let alertHTML = '';

        if (inputs.reservaIdeal > 0) {
            let timeProjection = '';
            if (inputs.aporteMensal > 0) {
                const monthsToComplete = Math.ceil(inputs.reservaIdeal / inputs.aporteMensal);
                const years = Math.floor(monthsToComplete / 12);
                const months = monthsToComplete % 12;
                const completionAge = (inputs.idadeAtual || 0) + years;
                let timeText = '';
                if (years > 0) timeText += `${years} ano${years > 1 ? 's' : ''}`;
                if (months > 0) timeText += `${years > 0 ? ' e ' : ''}${months} m${months > 1 ? 'eses' : 'ês'}`;
                timeProjection = ` Com seu aporte mensal atual, você pode atingir essa meta em aproximadamente <strong>${timeText}</strong>, aos <strong>${completionAge} anos</strong>.`;
            }
            alertHTML = `<div id="emergency-fund-alert" style="background-color: var(--input-bg); border-left: 4px solid var(--warning-color); padding: 15px; margin-bottom: 20px; border-radius: 4px;">💡 <strong>Plano de Ação Imediato:</strong> Sua primeira meta deve ser construir sua reserva de emergência de <strong>${formatCurrency(inputs.reservaIdeal)}</strong>.${timeProjection}</div>`;
        }

        const rendaComplementar = Math.max(0, retirementGoal.value - retirementGoal.postRetirementIncome);
        const gapDeAporteMinimo = aporteMinimo - inputs.aporteMensal;
        const gapDeAporteIdeal = aporteIdeal - inputs.aporteMensal;
        const atingeMinima = projecaoAtual >= metaMinima;
        
        const metricsHTML = `
            <h3>Seu Objetivo Principal</h3>
            <div class="metric-item"><div class="label">Renda Total Desejada</div><div class="value">${formatCurrency(retirementGoal.value)}</div></div>
            <div class="metric-item"><div class="label">Renda Extra (INSS, aluguel, etc)</div><div class="value">-${formatCurrency(retirementGoal.postRetirementIncome)}</div></div>
            <div class="metric-item" style="border-bottom: 2px solid var(--primary-color);"><div class="label"><b>Renda a ser gerada por Invest.</b></div><div class="value"><b id="dashboard-renda-invest">${formatCurrency(rendaComplementar)}</b></div></div>
            <h3 style="margin-top:20px;">Metas de Investimento</h3>
            <div class="scenario-comparison">
                <div class="scenario-card">
                    <h4 style="color: var(--warning-color);">CENÁRIO MÍNIMO</h4>
                    <div class="metric-item"><div class="label">Meta de Patrimônio <span class="info-icon">i<span class="tooltip">Valor necessário para gerar sua renda na aposentadoria, considerando que você gastará o principal aos poucos.</span></span></div><div class="value" id="dashboard-meta-minima">${formatCurrency(metaMinima)}</div></div>
                    <div class="metric-item"><div class="label">Aporte Necessário <span class="info-icon">i<span class="tooltip">Quanto você precisa investir por mês, a partir de hoje, para atingir a meta de patrimônio MÍNIMA.</span></span></div><div class="value" id="dashboard-aporte-minimo">${isFinite(aporteMinimo) ? formatCurrency(aporteMinimo) : 'Inatingível'}</div></div>
                </div>
                <div class="scenario-card">
                    <h4 style="color: var(--success-color);">CENÁRIO IDEAL</h4>
                    <div class="metric-item"><div class="label">Meta de Patrimônio <span class="info-icon">i<span class="tooltip">Valor necessário para viver apenas dos rendimentos, sem consumir o principal. É a independência financeira completa.</span></span></div><div class="value" id="dashboard-meta-ideal">${formatCurrency(metaIdeal)}</div></div>
                    <div class="metric-item"><div class="label">Aporte Necessário <span class="info-icon">i<span class="tooltip">Quanto você precisa investir por mês, a partir de hoje, para atingir a meta de patrimônio IDEAL.</span></span></div><div class="value" id="dashboard-aporte-ideal">${isFinite(aporteIdeal) ? formatCurrency(aporteIdeal) : 'Inatingível'}</div></div>
                </div>
            </div>
            <h3 style="margin-top:20px;">Diagnóstico e Plano de Ação</h3>
            <div class="metric-item"><div class="label">Seu Aporte Mensal</div><div class="value">${formatCurrency(inputs.aporteMensal)}</div></div>
            <div class="metric-item"><div class="label">Sua Projeção de Patrimônio <span class="info-icon">i<span class="tooltip">Estimativa de quanto você terá ao se aposentar, mantendo seu aporte e perfil de risco atuais.</span></span></div><div class="value" id="dashboard-projecao">${formatCurrency(projecaoAtual)}</div></div>
            <div class="metric-item"><div class="label">Atinge a Meta Mínima?</div><div class="value ${atingeMinima ? 'positive' : 'negative'}" id="dashboard-atinge-minima">${atingeMinima ? 'Sim' : 'Não'}</div></div>
            <div class="metric-item"><div class="label"><b>Ajuste no Aporte (p/ Meta Mín.)</b></div><div class="value ${gapDeAporteMinimo <= 0 ? 'positive' : 'negative'}" id="dashboard-gap-minimo"><b>${isFinite(gapDeAporteMinimo) ? formatCurrency(gapDeAporteMinimo) : '-'}</b></div></div>
            <div class="metric-item"><div class="label"><b>Ajuste no Aporte (p/ Meta Ideal)</b></div><div class="value ${gapDeAporteIdeal <= 0 ? 'positive' : 'negative'}" id="dashboard-gap-ideal"><b>${isFinite(gapDeAporteIdeal) ? formatCurrency(gapDeAporteIdeal) : '-'}</b></div></div>
        `;
        metricsContainer.innerHTML = alertHTML + metricsHTML;
        
        const optimizerCard = document.getElementById('optimizer-card');
        optimizerCard.classList.toggle('hidden', atingeMinima); 
        if (!atingeMinima) {
            renderOptimizer(inputs, userGoals, taxaJurosAtual, metaMinima, aporteMinimo);
        }
        
        document.getElementById('chart-legend').innerHTML = `<div class="legend-item"><span class="color-dot dot-primary"></span>Seus Investimentos</div><div class="legend-item"><span class="color-dot dot-yellow"></span>Cenário Mínimo</div><div class="legend-item"><span class="color-dot dot-green"></span>Cenário Ideal</div>`;
        document.getElementById('chart-title').textContent = `Projeção dos Seus Investimentos para gerar ${formatCurrency(rendaComplementar)}/mês`;
        
        const retirementGoalOnly = [retirementGoal];
        const minimalProjection = generateFullProjection({...inputs, aporteMensal: aporteMinimo}, retirementGoalOnly, taxaJurosAtual);
        const idealProjection = generateFullProjection({...inputs, aporteMensal: aporteIdeal}, retirementGoalOnly, taxaJurosAtual);
        
        renderChart(fullProjection, minimalProjection, idealProjection, inputs.idadeAtual, null, userGoals);
        renderIncomePieChart(retirementGoal);
        renderSensitivityAnalysis(inputs, userGoals, taxaJurosAtual);
        renderMilestones(fullProjection, metaMinima, metaIdeal, inputs);
        renderGrowthCompositionChart(fullProjection.accumulation);

        populateProjectionTable(fullProjection.accumulation);
        updateImpactAnalysisPanel(impactAnalysis);
    }
    
    function renderChart(dataAtual, dataMinima, dataIdeal, idadeInicial, dataSimulada = null, userGoals = []) {
        const anosAteAposentar = dataAtual.accumulation.length > 0 ? dataAtual.accumulation.length - 1 : 0;
        const anosTotais = anosAteAposentar + dataAtual.decumulation.length;
        const labels = Array.from({ length: anosTotais }, (_, i) => idadeInicial + i);
        
        if (projectionChartInstance) {
            projectionChartInstance.destroy();
        }

        const ctx = document.getElementById('projectionChart').getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, 450);
        grad.addColorStop(0, 'rgba(102, 246, 241, 0.3)');
        grad.addColorStop(1, 'rgba(102, 246, 241, 0)');

        const datasets = [
            { label: 'Seus Investimentos', data: [...dataAtual.accumulation.map(d => d.saldoFinal), ...dataAtual.decumulation.map(d => d.saldoFinal)], borderColor: primaryColor, backgroundColor: grad, fill: true, tension: 0.1, borderWidth: 4, pointRadius: 0 },
            dataMinima ? { label: 'Cenário Mínimo', data: [...dataMinima.accumulation.map(d => d.saldoFinal), ...dataMinima.decumulation.map(d => d.saldoFinal)], borderColor: warningColor, borderDash: [6, 6], pointRadius: 0, borderWidth: 2, fill: false } : null,
            dataIdeal ? { label: 'Cenário Ideal', data: [...dataIdeal.accumulation.map(d => d.saldoFinal), ...dataIdeal.decumulation.map(d => d.saldoFinal)], borderColor: successColor, borderDash: [6, 6], pointRadius: 0, borderWidth: 2, fill: false } : null
        ].filter(Boolean);

        if (dataSimulada) {
            datasets.push({
                label: 'Sua Simulação',
                data: [...dataSimulada.accumulation.map(d => d.saldoFinal), ...dataSimulada.decumulation.map(d => d.saldoFinal)],
                borderColor: dangerColor, borderWidth: 3, borderDash: [5, 5], pointRadius: 0, fill: false, tension: 0.1,
            });
        }

        const projectAnnotations = {};
        userGoals.filter(g => g.type !== 'aposentadoria' && g.age && g.age > idadeInicial).forEach((goal, index) => {
            const anoDoProjeto = goal.age - idadeInicial;
            if (anoDoProjeto > 0 && anoDoProjeto < labels.length) {
                const corLinha = goal.type === 'objetivo' ? dangerColor : successColor;
                
                projectAnnotations[`line${index}`] = {
                    type: 'line',
                    xMin: anoDoProjeto,
                    xMax: anoDoProjeto,
                    borderColor: corLinha,
                    borderWidth: 2,
                    borderDash: [6, 6], 
                    label: {
                        content: goal.description,
                        enabled: true,
                        position: 'start',
                        yAdjust: -15,
                        backgroundColor: cardBgColor,
                        color: corLinha,
                        font: { weight: 'bold' }
                    }
                };
            }
        });

        const retirementLine = {
            type: 'line',
            xMin: anosAteAposentar,
            xMax: anosAteAposentar,
            borderColor: primaryColor,
            borderWidth: 2,
            borderDash: [6, 6],
            label: { content: 'Aposentadoria', enabled: true, position: 'start', yAdjust: -15, backgroundColor: 'rgba(34, 84, 88, 0.8)', color: primaryColor, font: { weight: 'bold' } }
        };
        
        projectionChartInstance = new Chart(ctx, {
            type: 'line',
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { ticks: { color: textColorMuted, callback: value => `R$${(value / 1000000).toFixed(1)}M` }, grid: { color: 'rgba(224, 224, 241, 0.1)' } },
                    x: { ticks: { color: textColorMuted }, grid: { display: false } }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: c => `${c.dataset.label}: ${formatCurrency(c.raw)}` }, backgroundColor: '#FFF', titleColor: '#333', bodyColor: '#333', borderColor: '#DDD', borderWidth: 1 },
                    annotation: {
                        annotations: {
                            retirementLine,
                            ...projectAnnotations
                        }
                    }
                },
                interaction: { intersect: false, mode: 'index' }
            }
        });
    }

    function renderIncomePieChart(retirementGoal) {
        const container = document.getElementById('income-pie-chart-card');
        if (retirementGoal.value <= 0) { container.style.display = 'none'; return; }
        container.style.display = 'block';
        const ctx = document.getElementById('incomePieChart').getContext('2d');
        const rendaComplementar = Math.max(0, retirementGoal.value - retirementGoal.postRetirementIncome);
        if (incomePieChartInstance) incomePieChartInstance.destroy();
        incomePieChartInstance = new Chart(ctx, { 
            type: 'doughnut', data: { labels: ['Renda Extra', 'Saque dos Investimentos'], datasets: [{ data: [retirementGoal.postRetirementIncome, rendaComplementar], backgroundColor: [successColor, primaryColor], borderColor: cardBgColor, borderWidth: 4 }] }, 
            options: { responsive: true, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { color: textColorMuted } } } } 
        });
    }

    function renderGrowthCompositionChart(projectionData) {
        const ctx = document.getElementById('growthCompositionChart').getContext('2d');
        if (growthCompositionChartInstance) {
            growthCompositionChartInstance.destroy();
        }
        const labels = projectionData.map(d => d.idade);
        const aportesData = projectionData.map(d => d.totalAportado);
        const jurosData = projectionData.map(d => d.saldoFinal - d.totalAportado);
        growthCompositionChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Total Aportado por Você',
                    data: aportesData,
                    backgroundColor: primaryColor,
                }, {
                    label: 'Crescimento do Patrimônio',
                    data: jurosData,
                    backgroundColor: successColor,
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: textColorMuted } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${formatCurrency(c.raw)}` } } }, scales: { x: { stacked: true, ticks: { color: textColorMuted }, grid: { display: false } }, y: { stacked: true, ticks: { color: textColorMuted, callback: value => `R$${(value / 1000).toFixed(0)}k` }, grid: { color: 'rgba(224, 224, 241, 0.1)' } } } }
        });
    }

    function renderSensitivityAnalysis(inputs, userGoals, taxaJurosAtual) {
        const container = document.getElementById('sensitivity-analysis-container');
        const cenarios = { 'Pessimista (-2%)': taxaJurosAtual - 0.02, 'Realista (Atual)': taxaJurosAtual, 'Otimista (+2%)': taxaJurosAtual + 0.02, };
        let html = '';
        for (const [nome, taxa] of Object.entries(cenarios)) {
            if (taxa <= 0) continue;
            const projection = generateFullProjection(inputs, userGoals, taxa);
            const patrimonioFinal = projection.accumulation.length > 1 ? projection.accumulation.slice(-1)[0].saldoFinal : inputs.patrimonioInicial;
            html += `<div class="metric-item"><div class="label">${nome}</div><div class="value">${formatCurrency(patrimonioFinal)}</div></div>`;
        }
        container.innerHTML = html;
    }

    function renderMilestones(fullProjection, metaMinima, metaIdeal, inputs) {
        const container = document.getElementById('milestones-container');
        const accumulation = fullProjection.accumulation;
        const achievedMilestones = [];

        const milestonesValues = [
            { value: 100000, text: 'Você atingirá seus primeiros R$ 100 mil!', icon: '💰' },
            { value: 500000, text: 'Meio milhão de reais! Você está no caminho certo.', icon: '🏆' },
            { value: 1000000, text: 'Parabéns! Você alcançará o marco de R$ 1 milhão!', icon: '⭐' }
        ];

        milestonesValues.forEach(milestone => {
            const point = accumulation.find(p => p.saldoFinal >= milestone.value);
            if (point) {
                achievedMilestones.push({ idade: point.idade, title: `Aos ${point.idade} anos`, description: milestone.text, icon: milestone.icon });
            }
        });

        if (metaMinima > 0) {
            const fiftyPercentPoint = accumulation.find(p => p.saldoFinal >= metaMinima / 2);
            if (fiftyPercentPoint) {
                achievedMilestones.push({ idade: fiftyPercentPoint.idade, title: `Aos ${fiftyPercentPoint.idade} anos`, description: `Você estará na metade do caminho para sua meta mínima!`, icon: '🏁' });
            }
        }
        
        const snowballPoint = accumulation.find((p, i) => {
            if (i === 0) return false;
            const pmtAnual = (inputs.aporteMensal * 12) * Math.pow(1 + (inputs.aporteGrowth || 0), i - 1);
            return p.jurosGanhos > pmtAnual;
        });
        if (snowballPoint) {
            achievedMilestones.push({ idade: snowballPoint.idade, title: `Aos ${snowballPoint.idade} anos`, description: `A mágica acontece! Seus juros anuais superarão seus aportes.`, icon: '🚀' });
        }

        if (inputs.despesasEssenciais > 0) {
            const financialFreedomPoint = accumulation.find(p => p.jurosGanhos >= (inputs.despesasEssenciais * 12));
            if (financialFreedomPoint) {
                achievedMilestones.push({ idade: financialFreedomPoint.idade, title: `Aos ${financialFreedomPoint.idade} anos`, description: `Liberdade! Seus juros anuais sozinhos já cobrem seus gastos essenciais.`, icon: '🎉' });
            }
        }

        const idealGoalPoint = accumulation.find(p => p.saldoFinal >= metaIdeal);
        if (idealGoalPoint) {
             achievedMilestones.push({ idade: idealGoalPoint.idade, title: `Aos ${idealGoalPoint.idade} anos`, description: `Conquista máxima! Você atingirá o patrimônio da sua meta ideal.`, icon: '👑' });
        }

        if (achievedMilestones.length === 0) {
            container.innerHTML = '<p>Sua jornada está apenas começando! Continue aportando para ver seus marcos aqui.</p>';
            return;
        }

        const uniqueMilestones = Array.from(new Map(achievedMilestones.map(m => [m.description, m])).values()).sort((a, b) => a.idade - b.idade);
        let html = '<div class="timeline-container">';
        uniqueMilestones.forEach(milestone => {
            html += `<div class="timeline-item"><div class="timeline-icon">${milestone.icon}</div><div class="timeline-content"><h4>${milestone.title}</h4><p>${milestone.description}</p></div></div>`;
        });
        html += '</div>';
        container.innerHTML = html;
    }
    
    // ALTERADO: Função reescrita para ser interativa e com melhor design
    function renderOptimizer(inputs, userGoals, taxaJurosAtual, metaMinima, aporteMinimo) {
        const container = document.getElementById('optimizer-container');
        let html = `<p>Seu plano atual não atinge a meta mínima. Aqui estão algumas ações que você pode simular para corrigir o rumo:</p>`;
        
        // Sugestão 1: Aumentar o Aporte
        if (isFinite(aporteMinimo) && aporteMinimo > 0) {
             html += `
            <div class="optimizer-suggestion">
                <i class="fas fa-hand-holding-usd suggestion-icon"></i>
                <div class="suggestion-content">
                    <strong>Aumentar seu aporte mensal</strong>
                    <p>O jeito mais direto de atingir sua meta é aumentar seus investimentos. O valor necessário seria <strong>${formatCurrency(aporteMinimo)}</strong>.</p>
                    <button class="suggestion-action-btn" data-action="set-aporte" data-value="${aporteMinimo}">Simular com este aporte</button>
                </div>
            </div>`;
        }

        // Sugestão 2: Aposentar mais tarde
        const newAge = calculateOptimalRetirementAge(inputs, userGoals, taxaJurosAtual, metaMinima);
        if (newAge) {
            html += `
            <div class="optimizer-suggestion">
                <i class="fas fa-calendar-alt suggestion-icon"></i>
                <div class="suggestion-content">
                    <strong>Aposentar um pouco mais tarde</strong>
                    <p>Ao adiar sua aposentadoria para os <strong>${newAge} anos</strong>, você dá mais tempo para seus investimentos crescerem e atingirem o objetivo.</p>
                    <button class="suggestion-action-btn" data-action="set-age" data-value="${newAge}">Simular com esta idade</button>
                </div>
            </div>`;
        }

        // Sugestão 3: Aumentar o Risco
        const newProfile = calculateOptimalRiskProfile(inputs, userGoals, metaMinima);
        if (newProfile) {
            html += `
            <div class="optimizer-suggestion">
                <i class="fas fa-chart-line suggestion-icon"></i>
                <div class="suggestion-content">
                    <strong>Aumentar o risco (com cautela)</strong>
                    <p>Mudar seu perfil para <strong>${newProfile}</strong> pode aumentar a rentabilidade esperada e ajudar a alcançar sua meta no prazo original.</p>
                    <button class="suggestion-action-btn" data-action="set-profile" data-value="${newProfile.toLowerCase().replace(' ','')}">Simular com este perfil</button>
                </div>
            </div>`;
        }
        
        container.innerHTML = html;
    }
    
    // NOVO: Event listener para os botões do otimizador
    document.getElementById('optimizer-container').addEventListener('click', (e) => {
        if (!e.target.matches('.suggestion-action-btn')) return;

        const action = e.target.dataset.action;
        const value = e.target.dataset.value;
        const simulatorCard = document.getElementById('scenario-simulator-card');

        let targetInput;

        if (action === 'set-aporte') {
            targetInput = document.getElementById('sim-aporte');
            targetInput.value = value;
        } else if (action === 'set-age') {
            targetInput = document.getElementById('sim-idade-reforma');
            targetInput.value = value;
        } else if (action === 'set-profile') {
            targetInput = document.getElementById('sim-perfil-risco');
            targetInput.value = value;
        }
        
        if (targetInput) {
            // Dispara o evento 'input' para que o simulador atualize o gráfico e os dados
            targetInput.dispatchEvent(new Event('input', { bubbles: true }));
            // Rola a tela até o simulador para o usuário ver a alteração
            simulatorCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });

    function setupScenarioSimulator(results) {
        const { inputs, retirementGoal, userGoals } = results;
        const aporteSlider = document.getElementById('sim-aporte');
        const aporteValue = document.getElementById('sim-aporte-value');
        const idadeSlider = document.getElementById('sim-idade-reforma');
        const idadeValue = document.getElementById('sim-idade-reforma-value');
        const perfilSelect = document.getElementById('sim-perfil-risco');
        const resetButton = document.getElementById('reset-scenario-btn');

        aporteSlider.min = 0;
        aporteSlider.max = Math.max(inputs.aporteMensal * 3, 5000, unformatNumber(document.getElementById('salario').value)); 
        aporteSlider.step = 100;
        aporteSlider.value = inputs.aporteMensal;
        aporteValue.textContent = formatCurrency(inputs.aporteMensal);

        idadeSlider.min = inputs.idadeAtual + 1;
        idadeSlider.max = 80;
        idadeSlider.step = 1;
        idadeSlider.value = retirementGoal.age;
        idadeValue.textContent = `${retirementGoal.age} anos`;

        perfilSelect.innerHTML = document.getElementById('risk-profile').innerHTML;
        perfilSelect.value = inputs.perfilRisco;
        
        [aporteSlider, idadeSlider, perfilSelect].forEach(el => {
            el.addEventListener('input', () => runSimulation(userGoals));
        });
        
        resetButton.addEventListener('click', () => {
            updateDashboardUI(originalResults);
            setupScenarioSimulator(originalResults);
        });
    }

    function runSimulation(userGoals) {
        const simAporte = parseFloat(document.getElementById('sim-aporte').value);
        const simIdade = parseInt(document.getElementById('sim-idade-reforma').value);
        const simPerfil = document.getElementById('sim-perfil-risco').value;

        document.getElementById('sim-aporte-value').textContent = formatCurrency(simAporte);
        document.getElementById('sim-idade-reforma-value').textContent = `${simIdade} anos`;

        let simulatedInputs = { ...originalResults.inputs, aporteMensal: simAporte, perfilRisco: simPerfil };
        let simulatedGoals = JSON.parse(JSON.stringify(userGoals));
        let simulatedRetirementGoal = simulatedGoals.find(g => g.type === 'aposentadoria');
        simulatedRetirementGoal.age = simIdade;
        
        const premissas = { taxasJurosReais: { muitoConservador: 0.02, conservador: 0.04, moderado: 0.06, arrojado: 0.08, muitoArrojado: 0.10 } };
        const taxaJurosSimulada = premissas.taxasJurosReais[simPerfil];

        const anosParaAposentar = simulatedRetirementGoal.age - simulatedInputs.idadeAtual;
        const anosDeAposentadoria = simulatedRetirementGoal.lifeExpectancy - simulatedRetirementGoal.age;
        const rendaComplementarNecessaria = Math.max(0, simulatedRetirementGoal.value - simulatedRetirementGoal.postRetirementIncome);
        
        const metaMinima = calculatePresentValue(rendaComplementarNecessaria * 12, taxaJurosSimulada, anosDeAposentadoria);
        const metaIdeal = (rendaComplementarNecessaria * 12) / taxaJurosSimulada;
        
        const aporteMinimo = calculateRequiredPMT(simulatedInputs.patrimonioInicial, metaMinima, taxaJurosSimulada, anosParaAposentar, simulatedInputs.aporteGrowth);
        const aporteIdeal = calculateRequiredPMT(simulatedInputs.patrimonioInicial, metaIdeal, taxaJurosSimulada, anosParaAposentar, simulatedInputs.aporteGrowth);

        const simulatedProjection = generateFullProjection(simulatedInputs, simulatedGoals, taxaJurosSimulada);
        const patrimonioNaAposentadoria = anosParaAposentar > 0 ? simulatedProjection.accumulation.slice(-1)[0].saldoFinal : simulatedInputs.patrimonioInicial;
        
        const gapDeAporteMinimo = aporteMinimo - simAporte;
        const gapDeAporteIdeal = aporteIdeal - simAporte;
        const atingeMinima = patrimonioNaAposentadoria >= metaMinima;
        
        renderChart(originalResults.fullProjection, null, null, originalResults.inputs.idadeAtual, simulatedProjection, userGoals);

        document.getElementById('dashboard-renda-invest').textContent = formatCurrency(rendaComplementarNecessaria);
        document.getElementById('dashboard-meta-minima').textContent = formatCurrency(metaMinima);
        document.getElementById('dashboard-aporte-minimo').textContent = isFinite(aporteMinimo) ? formatCurrency(aporteMinimo) : 'Inatingível';
        document.getElementById('dashboard-meta-ideal').textContent = formatCurrency(metaIdeal);
        document.getElementById('dashboard-aporte-ideal').textContent = isFinite(aporteIdeal) ? formatCurrency(aporteIdeal) : 'Inatingível';
        document.getElementById('dashboard-projecao').textContent = formatCurrency(patrimonioNaAposentadoria);
        
        const atingeMinimaEl = document.getElementById('dashboard-atinge-minima');
        atingeMinimaEl.textContent = atingeMinima ? 'Sim' : 'Não';
        atingeMinimaEl.className = `value ${atingeMinima ? 'positive' : 'negative'}`;

        const gapMinimoEl = document.getElementById('dashboard-gap-minimo');
        gapMinimoEl.innerHTML = `<b>${isFinite(gapDeAporteMinimo) ? formatCurrency(gapDeAporteMinimo) : '-'}</b>`;
        gapMinimoEl.className = `value ${gapDeAporteMinimo <= 0 ? 'positive' : 'negative'}`;
        
        const gapIdealEl = document.getElementById('dashboard-gap-ideal');
        gapIdealEl.innerHTML = `<b>${isFinite(gapDeAporteIdeal) ? formatCurrency(gapDeAporteIdeal) : '-'}</b>`;
        gapIdealEl.className = `value ${gapDeAporteIdeal <= 0 ? 'positive' : 'negative'}`;
    }
    
    function calculateOptimalRetirementAge(inputs, userGoals, taxaJurosAtual, metaMinima) { let originalRetirementGoal = userGoals.find(g => g.type === 'aposentadoria'); for (let newAge = originalRetirementGoal.age + 1; newAge <= 80; newAge++) { let tempGoals = JSON.parse(JSON.stringify(userGoals)); let tempRetirementGoal = tempGoals.find(g => g.type === 'aposentadoria'); tempRetirementGoal.age = newAge; tempRetirementGoal.lifeExpectancy = Math.max(newAge + 1, originalRetirementGoal.lifeExpectancy); const projection = generateFullProjection(inputs, tempGoals, taxaJurosAtual); const finalPatrimony = projection.accumulation.slice(-1)[0].saldoFinal; if (finalPatrimony >= metaMinima) return newAge; } return null; }
    function calculateOptimalRiskProfile(inputs, userGoals, metaMinima) { const premissas = { taxasJurosReais: { muitoConservador: 0.02, conservador: 0.04, moderado: 0.06, arrojado: 0.08, muitoArrojado: 0.10 } }; const profiles = ['conservador', 'moderado', 'arrojado', 'muitoArrojado']; const currentProfileIndex = profiles.indexOf(inputs.perfilRisco); for (let i = currentProfileIndex + 1; i < profiles.length; i++) { const newProfile = profiles[i]; const newRate = premissas.taxasJurosReais[newProfile]; const projection = generateFullProjection(inputs, userGoals, newRate); const finalPatrimony = projection.accumulation.slice(-1)[0].saldoFinal; if (finalPatrimony >= metaMinima) return newProfile.charAt(0).toUpperCase() + newProfile.slice(1); } return null; }
    function sharePlan() { try { const planData = { profile: { name: document.getElementById('user-name').value, phone: document.getElementById('user-phone').value, age: document.getElementById('idade-atual').value, }, risk: { skip: document.getElementById('skip-emergency-fund').checked, expenses: document.getElementById('despesas-essenciais').value, months: document.getElementById('reserva-meses').value, }, financials: { income: document.getElementById('salario').value, expenses: document.getElementById('despesas-gerais').value, includeGrowth: document.getElementById('include-aporte-growth').checked, growth: document.getElementById('aporte-growth').value, }, patrimony: { initial: document.getElementById('patrimonio').value, profile: document.getElementById('risk-profile').value, }, goals: [] }; document.querySelectorAll('.goal-item').forEach(item => { planData.goals.push({ type: item.querySelector('.goal-type').value, description: item.querySelector('.goal-description').value, value: item.querySelector('[id="goal-value"]').value, age: item.querySelector('[id="goal-age"]').value, lifeExpectancy: item.querySelector('[id="goal-life-expectancy"]')?.value || '', postRetirementIncome: item.querySelector('[id="goal-post-retirement-income"]')?.value || '', includePostRetirement: item.querySelector('.toggle-post-retirement-income')?.checked || false, }); }); const jsonString = JSON.stringify(planData); const compressed = pako.deflate(jsonString, { to: 'string' }); const encodedData = btoa(compressed); const url = `${window.location.protocol}//${window.location.host}${window.location.pathname}?data=${encodeURIComponent(encodedData)}`; const copyToClipboard = (text) => { if (navigator.clipboard && window.isSecureContext) { return navigator.clipboard.writeText(text); } else { const textArea = document.createElement('textarea'); textArea.value = text; textArea.style.position = 'absolute'; textArea.style.left = '-9999px'; document.body.appendChild(textArea); textArea.select(); return new Promise((res, rej) => { document.execCommand('copy') ? res() : rej(); textArea.remove(); }); } }; copyToClipboard(url).then(() => { const shareButton = document.getElementById('share-plan-btn'); const originalText = shareButton.textContent; shareButton.textContent = 'Link Copiado!'; setTimeout(() => { shareButton.textContent = originalText; }, 2000); }).catch(() => { alert('Não foi possível copiar o link. Tente manualmente.'); }); } catch (error) { console.error("Erro ao compartilhar plano:", error); alert("Não foi possível gerar o link do plano."); } }
    function loadPlanFromURL() { try { const params = new URLSearchParams(window.location.search); if (!params.has('data')) return; const encodedData = decodeURIComponent(params.get('data')); const compressed = atob(encodedData); const jsonString = pako.inflate(compressed, { to: 'string' }); const planData = JSON.parse(jsonString); document.getElementById('user-name').value = planData.profile.name; document.getElementById('user-phone').value = planData.profile.phone; document.getElementById('idade-atual').value = planData.profile.age; document.getElementById('skip-emergency-fund').checked = planData.risk.skip; document.getElementById('despesas-essenciais').value = planData.risk.expenses; document.getElementById('reserva-meses').value = planData.risk.months; document.getElementById('skip-emergency-fund').dispatchEvent(new Event('change')); document.getElementById('salario').value = planData.financials.income; document.getElementById('despesas-gerais').value = planData.financials.expenses; document.getElementById('include-aporte-growth').checked = planData.financials.includeGrowth; document.getElementById('aporte-growth').value = planData.financials.growth; document.getElementById('include-aporte-growth').dispatchEvent(new Event('change')); document.getElementById('patrimonio').value = planData.patrimony.initial; document.getElementById('risk-profile').value = planData.patrimony.profile; document.querySelectorAll('.goal-item:not(:first-child)').forEach(g => g.remove()); planData.goals.forEach((goalData, index) => { if (index > 0) addGoalBtn.click(); const goalItem = document.querySelectorAll('.goal-item')[index]; goalItem.querySelector('.goal-type').value = goalData.type; goalItem.querySelector('.goal-description').value = goalData.description; goalItem.querySelector('[id="goal-value"]').value = goalData.value; goalItem.querySelector('[id="goal-age"]').value = goalData.age; if(goalData.type === 'aposentadoria') { goalItem.querySelector('[id="goal-life-expectancy"]').value = goalData.lifeExpectancy; goalItem.querySelector('[id="goal-post-retirement-income"]').value = goalData.postRetirementIncome; const toggle = goalItem.querySelector('.toggle-post-retirement-income'); toggle.checked = goalData.includePostRetirement; toggle.dispatchEvent(new Event('change')); } }); document.querySelectorAll('.formatted-number').forEach(el => el.dispatchEvent(new Event('input'))); updateAporte(); } catch(error) { console.error("Erro ao carregar plano da URL:", error); } }
    function populateProjectionTable(projectionData) { const tableBody = document.getElementById('projection-table-body'); tableBody.innerHTML = ''; if(!projectionData || projectionData.length < 2) return; for (let i = 1; i < projectionData.length; i++) { const data = projectionData[i]; tableBody.innerHTML += `<tr><td>${data.idade} anos</td><td>${formatCurrency(data.totalAportado)}</td><td>${formatCurrency(data.jurosGanhos)}</td><td class="final-balance">${formatCurrency(data.saldoFinal)}</td></tr>`; } }
    function updateImpactAnalysisPanel(analysis) { const container = document.getElementById('impact-analysis-container'); if (!analysis || analysis.length === 0) { container.innerHTML = ''; return; } let panelHTML = `<h2 id="impact-analysis-title">Análise de Impacto dos Projetos</h2><div id="impact-analysis-panel" class="impact-analysis">`; analysis.forEach(item => { const isSaida = item.type === 'objetivo'; const label = isSaida ? 'Custo do Projeto' : 'Entrada de Capital'; const valueColor = isSaida ? 'var(--danger-color)' : 'var(--success-color)'; const signal = isSaida ? '-' : '+'; panelHTML += `<div class="impact-item"><h4>${item.description} (aos ${item.age} anos)</h4><div class="metric-item"><span class="label">Patrimônio no Início do Ano</span><span class="value">${formatCurrency(item.patrimonioAntes)}</span></div><div class="metric-item"><span class="label">${label}</span><span class="value" style="color: ${valueColor};">${signal} ${formatCurrency(item.value)}</span></div><div class="metric-item"><span class="label">Patrimônio ao Final do Ano</span><span class="value">${formatCurrency(item.patrimonioDepois)}</span></div><div class="metric-item"><span class="label">Novo Aporte Mínimo (Pós)</span><span class="value" style="color: var(--warning-color);">${isFinite(item.novoAporteMinimo) ? formatCurrency(item.novoAporteMinimo) : 'Inatingível'}</span></div><div class="metric-item"><span class="label">Novo Aporte Ideal (Pós)</span><span class="value" style="color: var(--primary-color);">${isFinite(item.novoAporteIdeal) ? formatCurrency(item.novoAporteIdeal) : 'Inatingível'}</span></div></div>`; }); panelHTML += `</div>`; container.innerHTML = panelHTML; }
    const formatCurrency = (value) => (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    function formatNumberInput(e) { let value = e.target.value.replace(/\D/g, ''); if (value) { e.target.value = new Intl.NumberFormat('pt-BR').format(value); } else { e.target.value = ''; } }
    function unformatNumber(value) { return parseFloat(String(value).replace(/\./g, '').replace(',', '.')) || 0; }
    document.querySelectorAll('.formatted-number').forEach(el => el.addEventListener('input', formatNumberInput));
    function generateFullProjection(inputs, goals, taxaAnual) { const retirementGoal = goals.find(g => g.type === 'aposentadoria'); if (!retirementGoal) return { accumulation: [], decumulation: [] }; const anosParaAposentar = retirementGoal.age - inputs.idadeAtual; const anosDeAposentadoria = (retirementGoal.lifeExpectancy || 100) - retirementGoal.age; let accumulation = [{ ano: 0, idade: inputs.idadeAtual, saldoFinal: inputs.patrimonioInicial, totalAportado: inputs.patrimonioInicial, jurosGanhos: 0 }]; let saldo = inputs.patrimonioInicial; let pmtAnual = inputs.aporteMensal * 12; let totalAportado = inputs.patrimonioInicial; for (let ano = 1; ano <= anosParaAposentar; ano++) { const jurosDoAno = saldo * taxaAnual; let resgatesDoAno = 0; const currentAge = inputs.idadeAtual + ano; goals.forEach(goal => { if (goal.age === currentAge && goal.type !== 'aposentadoria') { resgatesDoAno += (goal.type === 'evento' ? goal.value : -goal.value); } }); saldo += jurosDoAno + pmtAnual + resgatesDoAno; totalAportado += pmtAnual; saldo = saldo < 0 ? 0 : saldo; accumulation.push({ ano, idade: currentAge, saldoFinal: saldo, totalAportado, jurosGanhos: jurosDoAno, jurosAcumulados: (accumulation[ano-1].jurosAcumulados || 0) + jurosDoAno }); pmtAnual *= (1 + (inputs.aporteGrowth || 0)); } let decumulation = []; const rendaComplementarNecessaria = Math.max(0, (retirementGoal.value || 0) - (retirementGoal.postRetirementIncome || 0)); const saqueAnual = rendaComplementarNecessaria * 12; for (let ano = 1; ano <= anosDeAposentadoria; ano++) { const juros = saldo * taxaAnual; saldo += juros - saqueAnual; if (saldo < 0) saldo = 0; decumulation.push({ ano, idade: retirementGoal.age + ano, saldoFinal: saldo }); } return { accumulation, decumulation }; }
    function calculateImpactAnalysis(fullProjection, analysisInputs) { const { idadeAtual, userGoals, retirementGoal, taxaJurosAtual, metaIdeal, metaMinima, aporteGrowth } = analysisInputs; const analysis = []; const intermediateEvents = userGoals.filter(g => g.type !== 'aposentadoria' && g.age < retirementGoal.age).sort((a,b) => a.age - b.age); intermediateEvents.forEach(goal => { const anoDoObjetivo = goal.age - idadeAtual; const projectionPoint = fullProjection.accumulation[anoDoObjetivo]; if (!projectionPoint) return; const patrimonioNoFinalDoAno = projectionPoint.saldoFinal; const patrimonioNoInicioDoAno = fullProjection.accumulation[anoDoObjetivo - 1]?.saldoFinal || analysisInputs.patrimonioInicial; const anosRestantesParaAposentar = retirementGoal.age - goal.age; const novoAporteIdeal = calculateRequiredPMT(patrimonioNoFinalDoAno, metaIdeal, taxaJurosAtual, anosRestantesParaAposentar, aporteGrowth); const novoAporteMinimo = calculateRequiredPMT(patrimonioNoFinalDoAno, metaMinima, taxaJurosAtual, anosRestantesParaAposentar, aporteGrowth); analysis.push({ type: goal.type, description: goal.description, age: goal.age, patrimonioAntes: patrimonioNoInicioDoAno, value: goal.value, patrimonioDepois: patrimonioNoFinalDoAno, novoAporteIdeal, novoAporteMinimo }); }); return analysis; }
    function calculatePresentValue(pmtAnual, i, n) { if (n <= 0) return 0; if (i === 0) return pmtAnual * n; return pmtAnual * ((1 - Math.pow(1 + i, -n)) / i); }
    function calculateRequiredPMT(vp, vf, i, n, pmtGrowth) { if (n <= 0) return vf > vp ? Infinity : 0; let pmtAnual = 0; if (Math.abs(i - (pmtGrowth||0)) > 1e-9) { const term1 = vf - vp * Math.pow(1 + i, n); const term2 = (Math.pow(1 + i, n) - Math.pow(1 + (pmtGrowth||0), n)) / (i - (pmtGrowth||0)); if (term2 === 0) return Infinity; pmtAnual = term1 / term2; } else { if (n === 0) return Infinity; pmtAnual = (vf - vp * Math.pow(1 + i, n)) / (n * Math.pow(1 + i, n - 1)); } return pmtAnual > 0 ? pmtAnual / 12 : 0; }
    document.getElementById('generate-report-btn').addEventListener('click', () => { const reportContainer = document.getElementById('report-page'); if (!reportContainer) return; const reportButton = document.getElementById('generate-report-btn'); const originalButtonText = reportButton.textContent; reportButton.textContent = 'Gerando...'; reportButton.disabled = true; const userName = document.getElementById('user-name').value || "Cliente"; const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }); html2canvas(document.getElementById('projectionChart')).then(canvas => { const chartImage = canvas.toDataURL('image/png'); const metricsHTML = document.getElementById('metrics-container').innerHTML; const impactHTML = document.getElementById('impact-analysis-container')?.innerHTML || ''; const tableHTML = document.querySelector('.projection-table').outerHTML; reportContainer.innerHTML = `<style>@media print { @page { size: A4; margin: 20mm; } body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } } body { background: white; color: #333; font-family: 'Poppins', sans-serif; font-size: 12px; line-height: 1.6; } .report-header { text-align: center; border-bottom: 2px solid #eee; padding-bottom: 15px; margin-bottom: 30px; } .report-header h1 { font-size: 28px; color: #1B4043; margin: 0; } .report-header p { font-size: 14px; color: #555; margin: 5px 0 0; } .report-section { margin-bottom: 30px; page-break-inside: avoid; } .report-section h2 { font-size: 20px; color: #1B4043; border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-bottom: 15px; } img.chart-image { max-width: 100%; border: 1px solid #eee; border-radius: 8px; margin-top: 10px; } .metrics-panel, .impact-analysis { background-color: #f8f9fa; padding: 20px; border-radius: 8px; } .metric-item { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e0e0e0; } .metric-item:last-child { border-bottom: none; } .metric-item .label { font-weight: 600; } .metric-item .value { font-weight: bold; } .impact-item { border-left: 4px solid #66F6F1; margin-bottom: 15px; } .projection-table { width: 100%; border-collapse: collapse; font-size: 11px; } .projection-table th, .projection-table td { padding: 10px; border: 1px solid #ddd; text-align: right; } .projection-table th { background-color: #1B4043; color: white; text-align: center; } .projection-table tbody tr:nth-child(even) { background-color: #f8f9fa; } .info-icon, .color-dot, .scenario-card h4, .addon-card h3, #emergency-fund-alert { display: none !important; } </style><div class="report-header"><h1>Relatório de Planejamento Financeiro</h1><p><strong>Cliente:</strong> ${userName} | <strong>Data:</strong> ${today}</p></div><div class="report-section"><h2>Resumo e Diagnóstico</h2><div class="metrics-panel">${metricsHTML}</div></div><div class="report-section"><h2>Projeção de Patrimônio</h2><img src="${chartImage}" class="chart-image" alt="Gráfico de Projeção"></div>${impactHTML ? `<div class="report-section"><h2>Análise de Impacto dos Objetivos</h2>${impactHTML}</div>` : ''}<div class="report-section"><h2>Evolução Detalhada Ano a Ano</h2>${tableHTML}</div>`; reportContainer.classList.add('report-ready-for-print'); setTimeout(() => { window.print(); reportContainer.classList.remove('report-ready-for-print'); reportContainer.innerHTML = ''; reportButton.textContent = originalButtonText; reportButton.disabled = false; }, 250); }).catch(error => { console.error('Erro ao gerar relatório:', error); alert('Ocorreu um erro ao gerar o relatório.'); reportButton.textContent = originalButtonText; reportButton.disabled = false; }); });
    updateAporte();
    updateEmergencyFund();
    function enviarDadosParaPlanilha() { const data = new Date().toLocaleString('pt-BR'); const nome = document.getElementById('user-name').value; const telefone = document.getElementById('user-phone').value; const idade = unformatNumber(document.getElementById('idade-atual').value); const patrimonio = unformatNumber(document.getElementById('patrimonio').value); const rendaMensal = unformatNumber(document.getElementById('salario').value); const aporteMensal = unformatNumber(document.getElementById('salario').value) - unformatNumber(document.getElementById('despesas-gerais').value); const perfilRisco = document.getElementById('risk-profile').value; const dadosParaEnviar = { data, nome, telefone, idade, patrimonio, rendaMensal, aporteMensal, perfilRisco }; const urlApi = 'https://sheetdb.io/api/v1/kqxmth5zljkyi'; fetch(urlApi, { method: 'POST', headers: { 'Content-Type': 'application/json', }, body: JSON.stringify({ data: dadosParaEnviar }), }).then(response => response.json()).then(data => { console.log('Dados enviados com sucesso para a planilha:', data); }).catch((error) => { console.error('Erro ao enviar dados para a planilha:', error); }); }
});