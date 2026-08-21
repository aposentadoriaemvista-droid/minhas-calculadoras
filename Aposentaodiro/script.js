document.addEventListener('DOMContentLoaded', () => {
    Chart.register(window['chartjs-plugin-annotation']);

    let projectionChartInstance = null;
    let incomePieChartInstance = null;
    let growthCompositionChartInstance = null;
    
    let lastResults = {};
    let originalResults = {};

    // MELHORIA 1: Capturar as cores do CSS para usar nos gráficos
    const rootStyles = getComputedStyle(document.documentElement);
    const primaryColor = rootStyles.getPropertyValue('--primary-color').trim();
    const successColor = rootStyles.getPropertyValue('--success-color').trim();
    const warningColor = rootStyles.getPropertyValue('--warning-color').trim();
    const dangerColor = rootStyles.getPropertyValue('--danger-color').trim();
    const cardBgColor = rootStyles.getPropertyValue('--card-bg').trim();
    const textColorMuted = rootStyles.getPropertyValue('--text-muted-color').trim();
    const borderColor = rootStyles.getPropertyValue('--border-color').trim();
    
    document.querySelectorAll('.main-button[data-nav]').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('section.card').forEach(s => s.classList.add('hidden'));
            document.getElementById(button.dataset.nav)?.classList.remove('hidden');
            window.scrollTo(0, 0);
        });
    });

    
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
            <div style="display:flex; justify-content:space-between; align-items:center;"><h4>Novo Objetivo/Evento</h4><button class="remove-button" onclick="this.closest('.goal-item').remove()">×</button></div>
            <div class="goal-grid">
                <div class="form-group">
                    <label>Tipo</label>
                    <select class="goal-type">
                        <option value="objetivo">Objetivo (Saída Única)</option>
                        <option value="evento">Evento (Entrada Única)</option>
                        <option value="saida_mensal">Saída Recorrente (Mensal)</option>
                        <option value="entrada_mensal">Entrada Recorrente (Mensal)</option>
                        <option value="saida_anual">Saída Recorrente (Anual)</option>
                        <option value="entrada_anual">Entrada Recorrente (Anual)</option>
                    </select>
                </div>
                <div class="form-group"><label>Descrição</label><input type="text" class="goal-description" placeholder="Ex: Comprar Carro / Herança"></div>
                <div class="form-group"><label>Valor (R$)</label><input type="text" class="formatted-number" id="goal-value" placeholder="80.000"></div>
                <div class="form-group"><label>Com que idade (Início)?</label><input type="text" class="formatted-number" id="goal-age" placeholder="30"></div>
                <div class="form-group duration-group hidden"><label>Duração (Anos)</label><input type="text" class="formatted-number" id="goal-duration" placeholder="4"></div>
            </div>`;
        list.appendChild(newItem);
        
        // Mostrar/ocultar campo de duração dinamicamente
        const typeSelect = newItem.querySelector('.goal-type');
        const durationGroup = newItem.querySelector('.duration-group');
        typeSelect.addEventListener('change', (e) => {
            if (e.target.value.includes('mensal') || e.target.value.includes('anual')) {
                durationGroup.classList.remove('hidden');
            } else {
                durationGroup.classList.add('hidden');
            }
        });
        
        newItem.querySelectorAll('.formatted-number').forEach(el => el.addEventListener('input', formatNumberInput));
    });

    function addDefaultRetirementGoal() {
        addGoalBtn.click();
        const firstGoal = document.querySelector('.goal-item');
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

    // Cole isso em algum lugar na raiz do seu DOMContentLoaded
    document.getElementById('add-sim-goal-btn').addEventListener('click', addSimulatedGoal);

    function addSimulatedGoal() {
        const list = document.getElementById('sim-goals-list');
        const newItem = document.createElement('div');
        newItem.classList.add('goal-item'); // Reaproveitando sua classe CSS de box
        newItem.style.padding = '15px';
        newItem.style.marginTop = '10px';
        
        newItem.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px;">
                <select class="sim-goal-type" style="width: auto; padding: 6px; border-radius: 4px; background: var(--input-bg); color: var(--text-color); border: 1px solid var(--border-color);">
                    <option value="objetivo">Gasto / Retirada</option>
                    <option value="evento">Entrada / Ganho</option>
                </select>
                <button class="remove-button remove-sim-goal">×</button>
            </div>
            <div style="display: flex; gap: 10px;">
                <input type="text" class="formatted-number sim-goal-value" placeholder="Valor (R$)" style="flex: 1; padding: 8px; border-radius: 4px; background: var(--input-bg); color: var(--text-color); border: 1px solid var(--border-color);">
                <input type="number" class="sim-goal-age" placeholder="Sua Idade" style="width: 100px; padding: 8px; border-radius: 4px; background: var(--input-bg); color: var(--text-color); border: 1px solid var(--border-color);">
            </div>
        `;
        
        list.appendChild(newItem);
        
        // Formatar valor dinamicamente e rodar simulação na mudança
        const valueInput = newItem.querySelector('.sim-goal-value');
        valueInput.addEventListener('input', formatNumberInput);
        
        // Disparar o runSimulation ao preencher
        newItem.querySelectorAll('input, select').forEach(el => {
            el.addEventListener('input', runSimulation);
        });

        // Remover da simulação e recalcular
        newItem.querySelector('.remove-sim-goal').addEventListener('click', (e) => {
            e.target.closest('.goal-item').remove();
            runSimulation();
        });
    }
    
    function runFinancialPlan() {
    enviarDadosParaPlanilha();

    try {
        const inputs = { 
            userName: document.getElementById('user-name').value, 
            idadeAtual: unformatNumber(document.getElementById('idade-atual').value), 
            patrimonioInicial: unformatNumber(document.getElementById('patrimonio').value), 
            aporteMensal: updateAporte(), 
            perfilRisco: document.getElementById('risk-profile').value, 
            aporteGrowth: document.getElementById('include-aporte-growth').checked ? (unformatNumber(document.getElementById('aporte-growth').value) / 100) : 0,
        };

        let userGoals = [];
        document.querySelectorAll('.goal-item').forEach(item => {
            const goal = { type: item.querySelector('.goal-type').value, description: item.querySelector('.goal-description').value, value: unformatNumber(item.querySelector('[id="goal-value"]')?.value), age: unformatNumber(item.querySelector('[id="goal-age"]')?.value), duration: unformatNumber(item.querySelector('[id="goal-duration"]')?.value) || 1 };
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
        
        const premissas = { taxasJurosReais: { muitoConservador: 0.02, conservador: 0.04, moderado: 0.06, moderadoArrojado: 0.07, arrojado: 0.08, muitoArrojado: 0.10, 12: 0.12 } };
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
        
        const rendaComplementar = Math.max(0, retirementGoal.value - retirementGoal.postRetirementIncome);
        const gapDeAporteMinimo = aporteMinimo - inputs.aporteMensal;
        const gapDeAporteIdeal = aporteIdeal - inputs.aporteMensal;
        const atingeMinima = projecaoAtual >= metaMinima;
        
        const metricsContainer = document.getElementById('metrics-container');
        metricsContainer.innerHTML = `
            <h3>Seu Objetivo Principal</h3>
            <div class="metric-item"><div class="label">Renda Total Desejada</div><div class="value">${formatCurrency(retirementGoal.value)}</div></div>
            <div class="metric-item"><div class="label">Renda Extra (INSS, aluguel, etc)</div><div class="value">-${formatCurrency(retirementGoal.postRetirementIncome)}</div></div>
            <div class="metric-item" style="border-bottom: 2px solid var(--primary-color);"><div class="label"><b>Renda a ser gerada por Invest.</b></div><div class="value"><b id="dashboard-renda-invest">${formatCurrency(rendaComplementar)}</b></div></div>

            <h3 style="margin-top:20px;">Metas de Investimento</h3>
            <div class="scenario-comparison">
                <div class="scenario-card">
                    <h4 style="color: var(--warning-color);">CENÁRIO MÍNIMO</h4>
                    <div class="metric-item"><div class="label">Meta de Patrimônio</div><div class="value" id="dashboard-meta-minima">${formatCurrency(metaMinima)}</div></div>
                    <div class="metric-item"><div class="label">Aporte Necessário</div><div class="value" id="dashboard-aporte-minimo">${isFinite(aporteMinimo) ? formatCurrency(aporteMinimo) : 'Inatingível'}</div></div>
                </div>
                <div class="scenario-card">
                    <h4 style="color: var(--success-color);">CENÁRIO IDEAL</h4>
                    <div class="metric-item"><div class="label">Meta de Patrimônio</div><div class="value" id="dashboard-meta-ideal">${formatCurrency(metaIdeal)}</div></div>
                    <div class="metric-item"><div class="label">Aporte Necessário</div><div class="value" id="dashboard-aporte-ideal">${isFinite(aporteIdeal) ? formatCurrency(aporteIdeal) : 'Inatingível'}</div></div>
                </div>
            </div>

            <h3 style="margin-top:20px;">Diagnóstico e Plano de Ação</h3>
            <div class="metric-item"><div class="label">Seu Aporte Mensal</div><div class="value">${formatCurrency(inputs.aporteMensal)}</div></div>
            <div class="metric-item"><div class="label">Sua Projeção de Patrimônio</div><div class="value" id="dashboard-projecao">${formatCurrency(projecaoAtual)}</div></div>
            <div class="metric-item"><div class="label">Atinge a Meta Mínima?</div><div class="value ${atingeMinima ? 'positive' : 'negative'}" id="dashboard-atinge-minima">${atingeMinima ? 'Sim' : 'Não'}</div></div>
            <div class="metric-item"><div class="label"><b>Ajuste no Aporte (p/ Meta Mín.)</b></div><div class="value ${gapDeAporteMinimo <= 0 ? 'positive' : 'negative'}" id="dashboard-gap-minimo"><b>${isFinite(gapDeAporteMinimo) ? formatCurrency(gapDeAporteMinimo) : '-'}</b></div></div>
            <div class="metric-item"><div class="label"><b>Ajuste no Aporte (p/ Meta Ideal)</b></div><div class="value ${gapDeAporteIdeal <= 0 ? 'positive' : 'negative'}" id="dashboard-gap-ideal"><b>${isFinite(gapDeAporteIdeal) ? formatCurrency(gapDeAporteIdeal) : '-'}</b></div></div>
        `;

        const optimizerCard = document.getElementById('optimizer-card');
        if (atingeMinima) {
            optimizerCard.classList.add('hidden');
        } else {
            optimizerCard.classList.remove('hidden');
            const optimizerContainer = document.getElementById('optimizer-container');
            const newAge = calculateOptimalRetirementAge(inputs, userGoals, taxaJurosAtual, metaMinima);
            const newProfile = calculateOptimalRiskProfile(inputs, userGoals, metaMinima);
            optimizerContainer.innerHTML = `
                <p style="text-align: left; font-size: 14px; margin-bottom: 20px;">Seu plano atual não atinge a meta mínima. Aqui estão algumas alternativas para chegar lá:</p>
                <div class="milestone-item"><span class="age">Opção 1 (Aporte):</span> Aumentar seu aporte mensal para <b>${isFinite(aporteMinimo) ? formatCurrency(aporteMinimo) : 'um valor maior'}</b>.</div>
                ${newAge ? `<div class="milestone-item"><span class="age">Opção 2 (Tempo):</span> Aposentar-se aos <b>${newAge} anos</b>.</div>` : ''}
                ${newProfile ? `<div class="milestone-item"><span class="age">Opção 3 (Risco):</span> Mudar seu perfil de risco para <b>"${newProfile}"</b>.</div>` : ''}
            `;
        }
        
        document.getElementById('chart-legend').innerHTML = `<div class="legend-item"><span class="color-dot dot-primary"></span>Seus Investimentos</div><div class="legend-item"><span class="color-dot dot-yellow"></span>Cenário Mínimo</div><div class="legend-item"><span class="color-dot dot-green"></span>Cenário Ideal</div>`;
        document.getElementById('chart-title').textContent = `Projeção dos Seus Investimentos para gerar ${formatCurrency(rendaComplementar)}/mês`;
        
        const retirementGoalOnly = [retirementGoal];
        const minimalProjection = generateFullProjection({...inputs, aporteMensal: aporteMinimo}, retirementGoalOnly, taxaJurosAtual);
        const idealProjection = generateFullProjection({...inputs, aporteMensal: aporteIdeal}, retirementGoalOnly, taxaJurosAtual);
        
        renderChart(fullProjection, minimalProjection, idealProjection, inputs.idadeAtual);
        renderIncomePieChart(retirementGoal);
        renderSensitivityAnalysis(inputs, userGoals, taxaJurosAtual);
        renderMilestones(fullProjection, metaMinima, metaIdeal, inputs);
        renderGrowthCompositionChart(fullProjection.accumulation);

        populateProjectionTable(fullProjection.accumulation);
        updateImpactAnalysisPanel(impactAnalysis);
    }
    
    function renderChart(dataAtual, dataMinima, dataIdeal, idadeInicial, dataSimulada = null) { 
        const anosAteAposentar = dataAtual.accumulation.length > 0 ? dataAtual.accumulation.length - 1 : 0;
        const anosTotais = anosAteAposentar + dataAtual.decumulation.length; 
        const labels = Array.from({ length: anosTotais }, (_, i) => idadeInicial + i); 
        const ctx = document.getElementById('projectionChart').getContext('2d'); 
        if (projectionChartInstance) { projectionChartInstance.destroy(); } 
        
        const grad = ctx.createLinearGradient(0, 0, 0, 450); 
        grad.addColorStop(0, 'rgba(102, 246, 241, 0.3)'); 
        grad.addColorStop(1, 'rgba(102, 246, 241, 0)');
        
        const datasets = [
            // MELHORIA 1: Usar as variáveis de cor do JS
            { label: 'Seus Investimentos', data: [...dataAtual.accumulation.map(d => d.saldoFinal), ...dataAtual.decumulation.map(d => d.saldoFinal)], borderColor: primaryColor, backgroundColor: grad, fill: true, tension: 0.1, borderWidth: 4, pointRadius: 0 },
            dataMinima ? { label: 'Cenário Mínimo', data: [...dataMinima.accumulation.map(d => d.saldoFinal), ...dataMinima.decumulation.map(d => d.saldoFinal)], borderColor: warningColor, borderDash: [6, 6], pointRadius: 0, borderWidth: 2, fill: false } : null,
            dataIdeal ? { label: 'Cenário Ideal', data: [...dataIdeal.accumulation.map(d => d.saldoFinal), ...dataIdeal.decumulation.map(d => d.saldoFinal)], borderColor: successColor, borderDash: [6, 6], pointRadius: 0, borderWidth: 2, fill: false } : null
        ].filter(Boolean);

        if (dataSimulada) {
            datasets.push({
                label: 'Sua Simulação',
                data: [...dataSimulada.accumulation.map(d => d.saldoFinal), ...dataSimulada.decumulation.map(d => d.saldoFinal)],
                borderColor: warningColor, // Alterado de dangerColor para warningColor
                borderWidth: 3,
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false,
                tension: 0.1,
            });
        }
        
        projectionChartInstance = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: datasets }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { color: textColorMuted, callback: value => `R$${(value / 1000000).toFixed(1)}M` }, grid: { color: 'rgba(224, 224, 241, 0.1)' } }, x: { ticks: { color: textColorMuted }, grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${formatCurrency(c.raw)}` }, backgroundColor: '#FFF', titleColor: '#333', bodyColor: '#333', borderColor: '#DDD', borderWidth: 1 }, annotation: { annotations: { retirementLine: { type: 'line', xMin: anosAteAposentar, xMax: anosAteAposentar, borderColor: primaryColor, borderWidth: 2, borderDash: [6, 6], label: { content: 'Aposentadoria', enabled: true, position: 'start', yAdjust: -15, backgroundColor: 'rgba(34, 84, 88, 0.8)', color: primaryColor, font: { weight: 'bold' } } } } } }, interaction: { intersect: false, mode: 'index' } } }); 
    }

    function renderIncomePieChart(retirementGoal) {
        const container = document.getElementById('income-pie-chart-card');
        if (retirementGoal.value <= 0) { container.style.display = 'none'; return; }
        container.style.display = 'block';
        const ctx = document.getElementById('incomePieChart').getContext('2d');
        const rendaComplementar = Math.max(0, retirementGoal.value - retirementGoal.postRetirementIncome);
        if (incomePieChartInstance) incomePieChartInstance.destroy();
        incomePieChartInstance = new Chart(ctx, { 
            type: 'doughnut',
            data: { 
                labels: ['Renda Extra', 'Saque dos Investimentos'], 
                datasets: [{ 
                    data: [retirementGoal.postRetirementIncome, rendaComplementar], 
                    backgroundColor: [successColor, primaryColor], // MELHORIA 1: Usar as variáveis de cor do JS
                    borderColor: cardBgColor, 
                    borderWidth: 4 
                }] 
            }, 
            options: { 
                responsive: true, 
                cutout: '60%',
                plugins: { 
                    legend: { position: 'bottom', labels: { color: textColorMuted } } 
                } 
            } 
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
                    backgroundColor: primaryColor, // MELHORIA 1: Usar as variáveis de cor do JS
                }, {
                    label: 'Juros Ganhos',
                    data: jurosData,
                    backgroundColor: successColor, // MELHORIA 1: Usar as variáveis de cor do JS
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
            html += `
                <div class="timeline-item">
                    <div class="timeline-icon">${milestone.icon}</div>
                    <div class="timeline-content">
                        <h4>${milestone.title}</h4>
                        <p>${milestone.description}</p>
                    </div>
                </div>`;
        });
        html += '</div>';
        container.innerHTML = html;
    }
    
    function setupScenarioSimulator(results) {
        const { inputs, retirementGoal } = results;
        const aporteSlider = document.getElementById('sim-aporte');
        const aporteValue = document.getElementById('sim-aporte-value');
        const idadeSlider = document.getElementById('sim-idade-reforma');
        const idadeValue = document.getElementById('sim-idade-reforma-value');
        const perfilSelect = document.getElementById('sim-perfil-risco');
        const resetButton = document.getElementById('reset-scenario-btn');
        // NOVO: Pegando elementos da Renda Simulada
        const rendaSlider = document.getElementById('sim-renda');
        const rendaValue = document.getElementById('sim-renda-value');

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

        // NOVO: Configurando slider da Renda Simulada
        rendaSlider.min = 0;
        rendaSlider.max = Math.max(retirementGoal.value * 3, 20000); // Teto de 3x a renda ou 20k
        rendaSlider.step = 500;
        rendaSlider.value = retirementGoal.value;
        rendaValue.textContent = formatCurrency(retirementGoal.value);

        perfilSelect.innerHTML = document.getElementById('risk-profile').innerHTML;
        perfilSelect.value = inputs.perfilRisco;
        
        // NOVO: Limpar lista de objetivos manuais da simulação ao (re)iniciar e reatribuir listeners
        document.getElementById('sim-goals-list').innerHTML = '';
        
        [aporteSlider, idadeSlider, perfilSelect, rendaSlider].forEach(el => {
            el.addEventListener('input', runSimulation);
        });
        
        resetButton.addEventListener('click', () => {
            updateDashboardUI(originalResults);
            setupScenarioSimulator(originalResults);
        });
    }

    function runSimulation() {
        const simAporte = parseFloat(document.getElementById('sim-aporte').value);
        const simIdade = parseInt(document.getElementById('sim-idade-reforma').value);
        const simPerfil = document.getElementById('sim-perfil-risco').value;
const simRenda = parseFloat(document.getElementById('sim-renda').value);
        document.getElementById('sim-aporte-value').textContent = formatCurrency(simAporte);
        document.getElementById('sim-idade-reforma-value').textContent = `${simIdade} anos`;
        document.getElementById('sim-renda-value').textContent = formatCurrency(simRenda);


        
        let simulatedInputs = { ...originalResults.inputs, aporteMensal: simAporte, perfilRisco: simPerfil };
        let simulatedGoals = JSON.parse(JSON.stringify(originalResults.userGoals));


       // NOVO: Loop para varrer e adicionar os objetivos manuais criados na simulação
        document.querySelectorAll('#sim-goals-list .goal-item').forEach(item => {
            const type = item.querySelector('.sim-goal-type').value;
            const valueStr = item.querySelector('.sim-goal-value').value;
            const ageStr = item.querySelector('.sim-goal-age').value;
            
            // FALTAVA ISSO AQUI: Capturar o valor do input de duração
            const durationStr = item.querySelector('.sim-goal-duration')?.value;
            
            const value = unformatNumber(valueStr);
            const age = parseInt(ageStr);
            
            // FALTAVA ISSO AQUI: Transformar em número (ou 1 se estiver vazio)
            const duration = parseInt(durationStr) || 1;

            if (value > 0 && age > simulatedInputs.idadeAtual) {
                simulatedGoals.push({
                    type: type,
                    description: 'Simulação Dinâmica',
                    value: value,
                    age: age,
                    duration: duration // Adicionando a duração no objetivo simulado!
                });
            }
        });

        let simulatedRetirementGoal = simulatedGoals.find(g => g.type === 'aposentadoria');
        simulatedRetirementGoal.age = simIdade;
        // NOVO: Substituir a meta de renda do objetivo de aposentadoria clonado
        simulatedRetirementGoal.value = simRenda;
        
        // Substitua esta linha:
        // const premissas = { taxasJurosReais: { muitoConservador: 0.02, conservador: 0.04, moderado: 0.06, arrojado: 0.08, muitoArrojado: 0.10 } };
        
        // Por esta:
        const premissas = { taxasJurosReais: { muitoConservador: 0.02, conservador: 0.04, moderado: 0.06, moderadoArrojado: 0.07, arrojado: 0.08, muitoArrojado: 0.10, 12: 0.12 } };
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
        
        renderChart(originalResults.fullProjection, null, null, originalResults.inputs.idadeAtual, simulatedProjection);

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
    
    function calculateOptimalRetirementAge(inputs, userGoals, taxaJurosAtual, metaMinima) {
        let originalRetirementGoal = userGoals.find(g => g.type === 'aposentadoria');
        for (let newAge = originalRetirementGoal.age + 1; newAge <= 80; newAge++) {
            let tempGoals = JSON.parse(JSON.stringify(userGoals));
            let tempRetirementGoal = tempGoals.find(g => g.type === 'aposentadoria');
            tempRetirementGoal.age = newAge;
            tempRetirementGoal.lifeExpectancy = Math.max(newAge + 1, originalRetirementGoal.lifeExpectancy);
            const projection = generateFullProjection(inputs, tempGoals, taxaJurosAtual);
            const finalPatrimony = projection.accumulation.slice(-1)[0].saldoFinal;
            if (finalPatrimony >= metaMinima) return newAge;
        }
        return null;
    }
    
    function calculateOptimalRiskProfile(inputs, userGoals, metaMinima) {
        const premissas = { taxasJurosReais: { muitoConservador: 0.02, conservador: 0.04, moderado: 0.06, moderadoArrojado: 0.07, arrojado: 0.08, muitoArrojado: 0.10, 12: 0.12 } };
        const profiles = ['conservador', 'moderado', 'moderadoArrojado', 'arrojado','muitoArrojado', '12'];
        const currentProfileIndex = profiles.indexOf(inputs.perfilRisco);
        for (let i = currentProfileIndex + 1; i < profiles.length; i++) {
            const newProfile = profiles[i];
            const newRate = premissas.taxasJurosReais[newProfile];
            const projection = generateFullProjection(inputs, userGoals, newRate);
            const finalPatrimony = projection.accumulation.slice(-1)[0].saldoFinal;
            if (finalPatrimony >= metaMinima) return newProfile.charAt(0).toUpperCase() + newProfile.slice(1);
        }
        return null;
    }

    function sharePlan() {
    try {
        const planData = {
            profile: { name: document.getElementById('user-name').value, email: document.getElementById('user-email').value, age: document.getElementById('idade-atual').value, },
            risk: { skip: document.getElementById('skip-emergency-fund').checked, expenses: document.getElementById('despesas-essenciais').value, months: document.getElementById('reserva-meses').value, },
            financials: { income: document.getElementById('salario').value, expenses: document.getElementById('despesas-gerais').value, includeGrowth: document.getElementById('include-aporte-growth').checked, growth: document.getElementById('aporte-growth').value, },
            patrimony: { initial: document.getElementById('patrimonio').value, profile: document.getElementById('risk-profile').value, },
            goals: []
        };
        document.querySelectorAll('.goal-item').forEach(item => {
            planData.goals.push({
                type: item.querySelector('.goal-type').value,
                description: item.querySelector('.goal-description').value,
                value: item.querySelector('[id="goal-value"]').value,
                age: item.querySelector('[id="goal-age"]').value,
                lifeExpectancy: item.querySelector('[id="goal-life-expectancy"]')?.value || '',
                postRetirementIncome: item.querySelector('[id="goal-post-retirement-income"]')?.value || '',
                includePostRetirement: item.querySelector('.toggle-post-retirement-income')?.checked || false,
            });
        });

        const jsonString = JSON.stringify(planData);
        const compressed = pako.deflate(jsonString, { to: 'string' });
        const encodedData = btoa(compressed);
        const url = `${window.location.protocol}//${window.location.host}${window.location.pathname}?data=${encodeURIComponent(encodedData)}`;

        // MELHORIA: Lógica de cópia mais robusta com fallback
        const copyToClipboard = (text) => {
            if (navigator.clipboard && window.isSecureContext) {
                // Método moderno e seguro (funciona em https:// ou localhost)
                return navigator.clipboard.writeText(text);
            } else {
                // Método de fallback para ambientes não seguros (como file://)
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'absolute';
                textArea.style.left = '-9999px';
                document.body.appendChild(textArea);
                textArea.select();
                return new Promise((res, rej) => {
                    document.execCommand('copy') ? res() : rej();
                    textArea.remove();
                });
            }
        };

        copyToClipboard(url).then(() => {
            const shareButton = document.getElementById('share-plan-btn');
            const originalText = shareButton.textContent;
            shareButton.textContent = 'Link Copiado!';
            setTimeout(() => { shareButton.textContent = originalText; }, 2000);
        }).catch(() => {
            alert('Não foi possível copiar o link. Tente manualmente.');
        });

    } catch (error) {
        console.error("Erro ao compartilhar plano:", error);
        alert("Não foi possível gerar o link do plano.");
    }
}
    function loadPlanFromURL() {
        try {
            const params = new URLSearchParams(window.location.search);
            if (!params.has('data')) return;
            const encodedData = decodeURIComponent(params.get('data'));
            const compressed = atob(encodedData);
            const jsonString = pako.inflate(compressed, { to: 'string' });
            const planData = JSON.parse(jsonString);
            document.getElementById('user-name').value = planData.profile.name;
            document.getElementById('user-email').value = planData.profile.email;
            document.getElementById('idade-atual').value = planData.profile.age;
            document.getElementById('skip-emergency-fund').checked = planData.risk.skip;
            document.getElementById('despesas-essenciais').value = planData.risk.expenses;
            document.getElementById('reserva-meses').value = planData.risk.months;
            document.getElementById('skip-emergency-fund').dispatchEvent(new Event('change'));
            document.getElementById('salario').value = planData.financials.income;
            document.getElementById('despesas-gerais').value = planData.financials.expenses;
            document.getElementById('include-aporte-growth').checked = planData.financials.includeGrowth;
            document.getElementById('aporte-growth').value = planData.financials.growth;
            document.getElementById('include-aporte-growth').dispatchEvent(new Event('change'));
            document.getElementById('patrimonio').value = planData.patrimony.initial;
            document.getElementById('risk-profile').value = planData.patrimony.profile;
            document.querySelectorAll('.goal-item:not(:first-child)').forEach(g => g.remove());
            planData.goals.forEach((goalData, index) => {
                if (index > 0) addGoalBtn.click();
                const goalItem = document.querySelectorAll('.goal-item')[index];
                goalItem.querySelector('.goal-type').value = goalData.type;
                goalItem.querySelector('.goal-description').value = goalData.description;
                goalItem.querySelector('[id="goal-value"]').value = goalData.value;
                goalItem.querySelector('[id="goal-age"]').value = goalData.age;
                if(goalData.type === 'aposentadoria') {
                    goalItem.querySelector('[id="goal-life-expectancy"]').value = goalData.lifeExpectancy;
                    goalItem.querySelector('[id="goal-post-retirement-income"]').value = goalData.postRetirementIncome;
                    const toggle = goalItem.querySelector('.toggle-post-retirement-income');
                    toggle.checked = goalData.includePostRetirement;
                    toggle.dispatchEvent(new Event('change'));
                }
            });
            document.querySelectorAll('.formatted-number').forEach(el => el.dispatchEvent(new Event('input')));
            updateAporte();
        } catch(error) { console.error("Erro ao carregar plano da URL:", error); }
    }
    
    function populateProjectionTable(projectionData) { const tableBody = document.getElementById('projection-table-body'); tableBody.innerHTML = ''; if(!projectionData || projectionData.length < 2) return; for (let i = 1; i < projectionData.length; i++) { const data = projectionData[i]; tableBody.innerHTML += `<tr><td>${data.idade} anos</td><td>${formatCurrency(data.totalAportado)}</td><td>${formatCurrency(data.jurosGanhos)}</td><td class="final-balance">${formatCurrency(data.saldoFinal)}</td></tr>`; } }
    function updateImpactAnalysisPanel(analysis) { const container = document.getElementById('impact-analysis-container'); if (!analysis || analysis.length === 0) { container.innerHTML = ''; return; } let panelHTML = `<h2 id="impact-analysis-title">Análise de Impacto dos Objetivos</h2><div id="impact-analysis-panel" class="impact-analysis">`; analysis.forEach(item => { const isSaida = item.type === 'objetivo'; const label = isSaida ? 'Custo do Objetivo' : 'Entrada de Capital'; const valueColor = isSaida ? 'var(--warning-color)' : 'var(--success-color)'; const signal = isSaida ? '-' : '+'; panelHTML += `<div class="impact-item"><h4>${item.description} (aos ${item.age} anos)</h4><div class="metric-item"><span class="label">Patrimônio no Início do Ano</span><span class="value">${formatCurrency(item.patrimonioAntes)}</span></div><div class="metric-item"><span class="label">${label}</span><span class="value" style="color: ${valueColor};">${signal} ${formatCurrency(item.value)}</span></div><div class="metric-item"><span class="label">Patrimônio ao Final do Ano</span><span class="value">${formatCurrency(item.patrimonioDepois)}</span></div><div class="metric-item"><span class="label">Novo Aporte Mínimo (Pós)</span><span class="value" style="color: var(--warning-color);">${isFinite(item.novoAporteMinimo) ? formatCurrency(item.novoAporteMinimo) : 'Inatingível'}</span></div><div class="metric-item"><span class="label">Novo Aporte Ideal (Pós)</span><span class="value" style="color: var(--primary-color);">${isFinite(item.novoAporteIdeal) ? formatCurrency(item.novoAporteIdeal) : 'Inatingível'}</span></div></div>`; }); panelHTML += `</div>`; container.innerHTML = panelHTML; }
    const formatCurrency = (value) => (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    function formatNumberInput(e) { let value = e.target.value.replace(/\D/g, ''); if (value) { e.target.value = new Intl.NumberFormat('pt-BR').format(value); } else { e.target.value = ''; } }
    function unformatNumber(value) { return parseFloat(String(value).replace(/\./g, '').replace(',', '.')) || 0; }
    document.querySelectorAll('.formatted-number').forEach(el => el.addEventListener('input', formatNumberInput));

function generateFullProjection(inputs, goals, taxaAnual) { 
        const retirementGoal = goals.find(g => g.type === 'aposentadoria'); 
        if (!retirementGoal) return { accumulation: [], decumulation: [] }; 
        
        const anosParaAposentar = retirementGoal.age - inputs.idadeAtual; 
        const anosDeAposentadoria = (retirementGoal.lifeExpectancy || 100) - retirementGoal.age; 
        
        let accumulation = [{ ano: 0, idade: inputs.idadeAtual, saldoFinal: inputs.patrimonioInicial, totalAportado: inputs.patrimonioInicial, jurosGanhos: 0 }]; 
        let saldo = inputs.patrimonioInicial; 
        let pmtAnual = inputs.aporteMensal * 12; 
        let totalAportado = inputs.patrimonioInicial; 
        
        // Fase de Acúmulo (Antes da Aposentadoria)
        for (let ano = 1; ano <= anosParaAposentar; ano++) { 
            const jurosDoAno = saldo * taxaAnual; 
            let resgatesDoAno = 0; 
            const currentAge = inputs.idadeAtual + ano; 
            
           goals.forEach(goal => { 
                if (goal.type !== 'aposentadoria') { 
                    const idadeFim = goal.age + (goal.duration || 1) - 1; // Calcula a última idade do evento
                    
                    if (currentAge >= goal.age && currentAge <= idadeFim) {
                        let valorAnual = goal.value;
                        // Se for recorrente mensal, multiplica por 12 (ex: 11 mil por mês = 132k no ano)
                        if (goal.type.includes('mensal')) {
                            valorAnual *= 12;
                        }
                        
                        if (goal.type.includes('saida') || goal.type === 'objetivo') {
                            resgatesDoAno -= valorAnual;
                        } else if (goal.type.includes('entrada') || goal.type === 'evento') {
                            resgatesDoAno += valorAnual;
                        }
                    }
                } 
            });
            
            saldo += jurosDoAno + pmtAnual + resgatesDoAno; 
            totalAportado += pmtAnual; 
            saldo = saldo < 0 ? 0 : saldo; 
            accumulation.push({ ano, idade: currentAge, saldoFinal: saldo, totalAportado, jurosGanhos: jurosDoAno, jurosAcumulados: (accumulation[ano-1].jurosAcumulados || 0) + jurosDoAno }); 
            pmtAnual *= (1 + (inputs.aporteGrowth || 0)); 
        } 
        
        let decumulation = []; 
        const rendaComplementarNecessaria = Math.max(0, (retirementGoal.value || 0) - (retirementGoal.postRetirementIncome || 0)); 
        const saqueAnual = rendaComplementarNecessaria * 12; 
        
        // Fase de Desacumulação (Pós Aposentadoria)
        for (let ano = 1; ano <= anosDeAposentadoria; ano++) { 
            const currentAge = retirementGoal.age + ano;
            const juros = saldo * taxaAnual; 
            let resgatesDoAno = 0;
            
            // NOVO: Verificação de eventos na fase de aposentadoria
           goals.forEach(goal => { 
                if (goal.type !== 'aposentadoria') { 
                    const idadeFim = goal.age + (goal.duration || 1) - 1; // Calcula a última idade do evento
                    
                    if (currentAge >= goal.age && currentAge <= idadeFim) {
                        let valorAnual = goal.value;
                        // Se for recorrente mensal, multiplica por 12 (ex: 11 mil por mês = 132k no ano)
                        if (goal.type.includes('mensal')) {
                            valorAnual *= 12;
                        }
                        
                        if (goal.type.includes('saida') || goal.type === 'objetivo') {
                            resgatesDoAno -= valorAnual;
                        } else if (goal.type.includes('entrada') || goal.type === 'evento') {
                            resgatesDoAno += valorAnual;
                        }
                    }
                } 
            });
            
            saldo += juros - saqueAnual + resgatesDoAno; 
            if (saldo < 0) saldo = 0; 
            decumulation.push({ ano, idade: currentAge, saldoFinal: saldo }); 
        } 
        
        return { accumulation, decumulation }; 
    }



    
    function calculateImpactAnalysis(fullProjection, analysisInputs) { const { idadeAtual, userGoals, retirementGoal, taxaJurosAtual, metaIdeal, metaMinima, aporteGrowth } = analysisInputs; const analysis = []; const intermediateEvents = userGoals.filter(g => g.type !== 'aposentadoria' && g.age < retirementGoal.age).sort((a,b) => a.age - b.age); intermediateEvents.forEach(goal => { const anoDoObjetivo = goal.age - idadeAtual; const projectionPoint = fullProjection.accumulation[anoDoObjetivo]; if (!projectionPoint) return; const patrimonioNoFinalDoAno = projectionPoint.saldoFinal; const patrimonioNoInicioDoAno = fullProjection.accumulation[anoDoObjetivo - 1]?.saldoFinal || analysisInputs.patrimonioInicial; const anosRestantesParaAposentar = retirementGoal.age - goal.age; const novoAporteIdeal = calculateRequiredPMT(patrimonioNoFinalDoAno, metaIdeal, taxaJurosAtual, anosRestantesParaAposentar, aporteGrowth); const novoAporteMinimo = calculateRequiredPMT(patrimonioNoFinalDoAno, metaMinima, taxaJurosAtual, anosRestantesParaAposentar, aporteGrowth); analysis.push({ type: goal.type, description: goal.description, age: goal.age, patrimonioAntes: patrimonioNoInicioDoAno, value: goal.value, patrimonioDepois: patrimonioNoFinalDoAno, novoAporteIdeal, novoAporteMinimo }); }); return analysis; }
    function calculatePresentValue(pmtAnual, i, n) { if (n <= 0) return 0; if (i === 0) return pmtAnual * n; return pmtAnual * ((1 - Math.pow(1 + i, -n)) / i); }
    function calculateRequiredPMT(vp, vf, i, n, pmtGrowth) { if (n <= 0) return vf > vp ? Infinity : 0; let pmtAnual = 0; if (Math.abs(i - (pmtGrowth||0)) > 1e-9) { const term1 = vf - vp * Math.pow(1 + i, n); const term2 = (Math.pow(1 + i, n) - Math.pow(1 + (pmtGrowth||0), n)) / (i - (pmtGrowth||0)); if (term2 === 0) return Infinity; pmtAnual = term1 / term2; } else { if (n === 0) return Infinity; pmtAnual = (vf - vp * Math.pow(1 + i, n)) / (n * Math.pow(1 + i, n - 1)); } return pmtAnual > 0 ? pmtAnual / 12 : 0; }
    
    document.getElementById('generate-report-btn').addEventListener('click', () => {
        // Usa os resultados globais que já foram calculados na memória
        if (!lastResults || !lastResults.inputs) {
            alert('Por favor, gere o planejamento primeiro antes de emitir o relatório.');
            return;
        }

        const reportContainer = document.getElementById('report-page');
        if (!reportContainer) return;

        const reportButton = document.getElementById('generate-report-btn');
        const originalButtonText = reportButton.textContent;
        reportButton.textContent = 'Gerando PDF...';
        reportButton.disabled = true;

        const res = lastResults;
        const userName = res.inputs.userName || document.getElementById('user-name').value || "Cliente";
        const userEmail = document.getElementById('user-email').value || "Não informado";
        const today = new Date().toLocaleDateString('pt-BR');
        
        const rendaComplementar = Math.max(0, res.retirementGoal.value - res.retirementGoal.postRetirementIncome);

        // html2canvas com scale: 2 para dobrar a resolução da imagem no PDF
        html2canvas(document.getElementById('chart-container'), { scale: 2, backgroundColor: '#ffffff' }).then(canvas => {
            const chartImage = canvas.toDataURL('image/png');
            const impactHTML = document.getElementById('impact-analysis-container')?.innerHTML || '';
            const tableHTML = document.querySelector('.projection-table').outerHTML;

            // Injetando CSS focado em impressão e a nova estrutura de páginas
            reportContainer.innerHTML = `
                <style>
                    @media print {
                        @page { size: A4; margin: 0; }
                        body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; font-family: 'Poppins', sans-serif; background: #fff; color: #333; margin: 0; padding: 0; }
                        
                        /* Esconde o sistema e mostra apenas o PDF */
                        #app-container { display: none !important; }
                        #report-page { display: block !important; position: relative; }
                        
                        /* Configuração Padrão da Página A4 */
                        .page { width: 210mm; height: 296mm; padding: 20mm; box-sizing: border-box; page-break-after: always; position: relative; background: #fff; }
                        .page-auto { width: 210mm; padding: 20mm; box-sizing: border-box; background: #fff; page-break-inside: auto; }
                        
                        /* PAGINA 1: Capa (Cores da Identidade) */
                        .cover { background-color: #1B4043; color: #fff; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
                        .cover-logo { width: 140px; height: 140px; background-color: #f8f9f3; border: 4px solid #d4af37; border-radius: 50%; display: flex; justify-content: center; align-items: center; margin-bottom: 40px; box-shadow: 0 10px 20px rgba(0,0,0,0.2); }
                        .cover-logo span { color: #1B4043; font-size: 32px; font-weight: 700; line-height: 1.1; letter-spacing: -1px; }
                        .cover h1 { color: #f6e27f; font-size: 42px; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 15px; }
                        .cover h2 { font-size: 22px; font-weight: 400; color: #f8f9f3; margin-bottom: 80px; letter-spacing: 1px; }
                        .cover .client-details { border-top: 1px solid #2e8b57; padding-top: 40px; width: 70%; font-size: 16px; color: #f8f9f3; }
                        .cover .client-details strong { color: #d4af37; display: block; margin-bottom: 5px; font-size: 24px; }
                        
                        /* Componentes de Texto e Dados */
                        h3.section-title { color: #1B4043; font-size: 24px; border-bottom: 2px solid #d4af37; padding-bottom: 8px; margin-top: 0; margin-bottom: 25px; text-transform: uppercase; }
                        
                        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
                        .info-box { background-color: #f8f9f3; border-left: 5px solid #2e8b57; padding: 20px; border-radius: 0 8px 8px 0; }
                        .info-box .label { font-size: 13px; color: #666; text-transform: uppercase; font-weight: 600; margin-bottom: 8px; display: block; }
                        .info-box .value { font-size: 22px; color: #1B4043; font-weight: 700; }
                        
                        /* Cenários */
                        .scenario-box { padding: 25px; border-radius: 8px; border: 1px solid #eee; margin-bottom: 20px; page-break-inside: avoid; }
                        .scenario-box.ideal { background-color: rgba(46, 139, 87, 0.05); border-color: #2e8b57; border-left: 8px solid #2e8b57; }
                        .scenario-box.ideal h4 { color: #2e8b57; }
                        .scenario-box.minimo { background-color: rgba(212, 175, 55, 0.05); border-color: #d4af37; border-left: 8px solid #d4af37; }
                        .scenario-box.minimo h4 { color: #d4af37; }
                        .scenario-box h4 { margin: 0 0 20px 0; font-size: 18px; text-transform: uppercase; }
                        
                        .metric-row { display: flex; justify-content: space-between; border-bottom: 1px solid rgba(0,0,0,0.05); padding: 10px 0; }
                        .metric-row:last-child { border: none; padding-bottom: 0; }
                        
                        /* Gráfico de Alta Resolução */
                        .chart-container-print { text-align: center; margin: 30px 0; background: #f8f9f3; padding: 20px; border-radius: 12px; }
                        .chart-container-print img { max-width: 100%; height: auto; border-radius: 8px; background: #fff; }
                        
                        /* Tabela Detalhada */
                        .projection-table { width: 100%; border-collapse: collapse; font-size: 11px; page-break-inside: auto; }
                        .projection-table tr { page-break-inside: avoid; page-break-after: auto; }
                        .projection-table th { background-color: #1B4043; color: white; padding: 10px; text-align: right; }
                        .projection-table th:first-child { text-align: center; }
                        .projection-table td { padding: 10px; border-bottom: 1px solid #ddd; text-align: right; }
                        .projection-table td:first-child { text-align: center; }
                        .projection-table tr:nth-child(even) td { background-color: #f8f9f3; }
                        
                        .footer { position: absolute; bottom: 15mm; left: 20mm; right: 20mm; text-align: center; font-size: 11px; color: #888; border-top: 1px solid #eee; padding-top: 10px; }
                    }
                </style>
                
                <!-- PÁGINA 1: A Capa -->
                <div class="page cover">
                    <div class="cover-logo">
                       <img src="AEV.png.png" alt="Logo Aposentadoria em Vista" style="width: 100%; height: 100%; object-fit: contain; border-radius: 50%;">
                    </div>
                    <h1>Aposentadoria em Vista</h1>
                    <h2>Plano Financeiro Estratégico</h2>
                    
                    <div class="client-details">
                        Preparado exclusivamente para:<br>
                        <strong>${userName}</strong>
                        ${userEmail}<br><br>
                        Data de emissão: ${today}
                    </div>
                </div>

                <!-- PÁGINA 2: Diagnóstico e Metas -->
                <div class="page">
                    <h3 class="section-title">1. Seu Ponto de Partida</h3>
                    <div class="grid-2">
                        <div class="info-box">
                            <span class="label">Idade Atual</span>
                            <span class="value">${res.inputs.idadeAtual} anos</span>
                        </div>
                        <div class="info-box">
                            <span class="label">Patrimônio Investido</span>
                            <span class="value">${formatCurrency(res.inputs.patrimonioInicial)}</span>
                        </div>
                        <div class="info-box">
                            <span class="label">Aporte Mensal Atual</span>
                            <span class="value">${formatCurrency(res.inputs.aporteMensal)}</span>
                        </div>
                        <div class="info-box" style="border-left-color: #d4af37;">
                            <span class="label">Perfil de Risco</span>
                            <span class="value">${res.inputs.perfilRisco} (${(res.taxaJurosAtual*100).toFixed(0)}% a.a.)</span>
                        </div>
                    </div>

                    <h3 class="section-title" style="margin-top: 40px;">2. O Destino (Sua Aposentadoria)</h3>
                    <div class="grid-2">
                        <div class="info-box">
                            <span class="label">Idade Alvo</span>
                            <span class="value">${res.retirementGoal.age} anos</span>
                        </div>
                        <div class="info-box">
                            <span class="label">Renda Total Desejada</span>
                            <span class="value">${formatCurrency(res.retirementGoal.value)}</span>
                        </div>
                    </div>
                    <div class="info-box" style="background-color: #1B4043; border-left: 5px solid #d4af37;">
                        <span class="label" style="color: #f8f9f3;">Renda Mensal Necessária dos Investimentos</span>
                        <span class="value" style="color: #f6e27f; font-size: 28px;">${formatCurrency(rendaComplementar)}</span>
                    </div>
                    <div class="footer">Documento Confidencial - Aposentadoria em Vista | Página 2</div>
                </div>

                <!-- PÁGINA 3: Projeção e Caminho -->
                <div class="page">
                    <h3 class="section-title">3. O Caminho para a Conquista</h3>
                    
                    <div class="chart-container-print">
                        <img src="${chartImage}" alt="Gráfico de Projeção">
                    </div>

                    <div class="grid-2">
                        <div class="scenario-box minimo">
                            <h4>Cenário Mínimo</h4>
                            <div class="metric-row"><span>Meta de Patrimônio:</span> <strong>${formatCurrency(res.metaMinima)}</strong></div>
                            <div class="metric-row"><span>Aporte Mensal Necessário:</span> <strong>${isFinite(res.aporteMinimo) ? formatCurrency(res.aporteMinimo) : 'Inatingível'}</strong></div>
                        </div>
                        <div class="scenario-box ideal">
                            <h4>Cenário Ideal</h4>
                            <div class="metric-row"><span>Meta de Patrimônio:</span> <strong>${formatCurrency(res.metaIdeal)}</strong></div>
                            <div class="metric-row"><span>Aporte Mensal Necessário:</span> <strong>${isFinite(res.aporteIdeal) ? formatCurrency(res.aporteIdeal) : 'Inatingível'}</strong></div>
                        </div>
                    </div>
                    <div class="footer">Documento Confidencial - Aposentadoria em Vista | Página 3</div>
                </div>

                <!-- PÁGINA 4: Tabelas Dinâmicas (Permite quebra automática) -->
                <div class="page-auto">
                    ${impactHTML ? `
                        <h3 class="section-title">Análise de Impacto de Eventos</h3>
                        ${impactHTML}
                        <br><br>
                    ` : ''}
                    <h3 class="section-title">Evolução Detalhada Ano a Ano</h3>
                    ${tableHTML}
                </div>
            `;

            // Aplica a impressão
            setTimeout(() => {
                window.print(); 
                reportContainer.innerHTML = ''; // Limpa após a impressão
                reportButton.textContent = originalButtonText;
                reportButton.disabled = false;
            }, 500); // 500ms para garantir que o navegador renderizou o DOM pesado

        }).catch(error => {
            console.error('Erro ao gerar relatório:', error);
            alert('Ocorreu um erro ao gerar o relatório. Tente novamente.');
            reportButton.textContent = originalButtonText;
            reportButton.disabled = false;
        });
    });

    updateAporte();
    

function enviarDadosParaPlanilha() {
    const data = new Date().toLocaleString('pt-BR');
    const nome = document.getElementById('user-name').value;
    const email = document.getElementById('user-email').value;
    const idade = unformatNumber(document.getElementById('idade-atual').value);
    const patrimonio = unformatNumber(document.getElementById('patrimonio').value);
    const rendaMensal = unformatNumber(document.getElementById('salario').value);
    const aporteMensal = unformatNumber(document.getElementById('salario').value) - unformatNumber(document.getElementById('despesas-gerais').value);
    const perfilRisco = document.getElementById('risk-profile').value;

    const dadosParaEnviar = { data, nome, email, idade, patrimonio, rendaMensal, aporteMensal, perfilRisco };

    const urlApi = 'https://sheetdb.io/api/v1/kqxmth5zljkyi';
    fetch(urlApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', },
        body: JSON.stringify({ data: dadosParaEnviar }),
    })
    .then(response => response.json())
    .then(data => {
        console.log('Dados enviados com sucesso para a planilha:', data);
    })
    .catch((error) => {
        console.error('Erro ao enviar dados para a planilha:', error);
    });
}
});