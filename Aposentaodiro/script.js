document.addEventListener('DOMContentLoaded', () => {
    Chart.register(window['chartjs-plugin-annotation']);

    let projectionChartInstance = null;
    let incomePieChartInstance = null;
    let growthCompositionChartInstance = null;
    let assetAllocationChartInstance = null; // Será removido, mas mantido para evitar erros se referenciado

    let lastResults = {};
    let originalResults = {};

    // Este objeto não é mais usado para renderização, mas mantido se houver lógica dependente
    const allocationProfiles = {
        muitoConservador: { labels: ['Renda Fixa Pós-Fixada'], data: [100] },
        conservador: { labels: ['Renda Fixa Pós-Fixada', 'Renda Fixa Inflação'], data: [70, 30] },
        moderado: { labels: ['Renda Fixa', 'Ações Brasil', 'Ações Globais'], data: [50, 25, 25] },
        arrojado: { labels: ['Renda Fixa', 'Ações Brasil', 'Ações Globais'], data: [30, 35, 35] },
        muitoArrojado: { labels: ['Renda Fixa', 'Ações Brasil', 'Ações Globais', 'Cripto/Outros'], data: [15, 40, 40, 5] },
    };
    
    document.querySelectorAll('.main-button[data-nav]').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('section.card').forEach(s => s.classList.add('hidden'));
            document.getElementById(button.dataset.nav)?.classList.remove('hidden');
            window.scrollTo(0, 0);
        });
    });

    const essentialExpensesInput = document.getElementById('despesas-essenciais');
    const monthsInput = document.getElementById('reserva-meses');
    document.getElementById('skip-emergency-fund').addEventListener('change', (e) => {
        const disabled = e.target.checked;
        document.getElementById('emergency-fund-inputs').style.display = disabled ? 'none' : 'block';
        if (disabled) {
            essentialExpensesInput.value = '';
            monthsInput.value = '';
        }
        updateEmergencyFund();
    });
    [essentialExpensesInput, monthsInput].forEach(input => input.addEventListener('input', updateEmergencyFund));
    function updateEmergencyFund() {
        const ideal = unformatNumber(essentialExpensesInput.value) * unformatNumber(monthsInput.value);
        document.getElementById('reserva-ideal-result').textContent = ideal > 0 ? `Sua reserva ideal é de: ${formatCurrency(ideal)}` : '';
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
            <div style="display:flex; justify-content:space-between; align-items:center;"><h4>Novo Objetivo/Evento</h4><button class="remove-button" onclick="this.closest('.goal-item').remove()">×</button></div>
            <div class="goal-grid">
                <div class="form-group"><label>Tipo</label><select class="goal-type"><option value="objetivo">Objetivo (Saída)</option><option value="evento">Evento (Entrada)</option></select></div>
                <div class="form-group"><label>Descrição</label><input type="text" class="goal-description" placeholder="Ex: Comprar Carro"></div>
                <div class="form-group"><label>Valor (R$)</label><input type="text" class="formatted-number" id="goal-value" placeholder="80.000"></div>
                <div class="form-group"><label>Com que idade?</label><input type="text" class="formatted-number" id="goal-age" placeholder="30"></div>
            </div>`;
        list.appendChild(newItem);
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
    
    function runFinancialPlan() {
        try {
            const inputs = { userName: document.getElementById('user-name').value, idadeAtual: unformatNumber(document.getElementById('idade-atual').value), patrimonioInicial: unformatNumber(document.getElementById('patrimonio').value), aporteMensal: updateAporte(), perfilRisco: document.getElementById('risk-profile').value, aporteGrowth: document.getElementById('include-aporte-growth').checked ? (unformatNumber(document.getElementById('aporte-growth').value) / 100) : 0 };
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
            const probabilidadeSucesso = metaMinima > 0 ? Math.min((patrimonioNaAposentadoria / metaMinima) * 100, 100) : 100;

            const resultsForImpact = { ...inputs, userGoals, retirementGoal, taxaJurosAtual, metaIdeal, metaMinima, aporteGrowth: inputs.aporteGrowth };
            const impactAnalysis = calculateImpactAnalysis(fullProjection, resultsForImpact);
            
            lastResults = { projecaoAtual: patrimonioNaAposentadoria, metaMinima, metaIdeal, aporteMinimo, aporteIdeal, probabilidadeSucesso, inputs, retirementGoal, fullProjection, taxaJurosAtual, impactAnalysis, userGoals };
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
        const atingeMinima = projecaoAtual >= metaMinima;
        
        const metricsContainer = document.getElementById('metrics-container');
        metricsContainer.innerHTML = `
            <h3>Seu Objetivo Principal</h3>
            <div class="metric-item"><div class="label">Renda Total Desejada</div><div class="value">${formatCurrency(retirementGoal.value)}</div></div>
            <div class="metric-item"><div class="label">Renda Extra (INSS, aluguel, etc)</div><div class="value">-${formatCurrency(retirementGoal.postRetirementIncome)}</div></div>
            <div class="metric-item" style="border-bottom: 2px solid var(--primary-color);"><div class="label"><b>Renda a ser gerada por Invest.</b></div><div class="value"><b>${formatCurrency(rendaComplementar)}</b></div></div>

            <h3 style="margin-top:20px;">Metas de Investimento</h3>
            <div class="scenario-comparison">
                <div class="scenario-card"><h4 style="color: var(--warning-color);">CENÁRIO MÍNIMO</h4><div class="metric-item"><div class="label">Meta de Patrimônio</div><div class="value">${formatCurrency(metaMinima)}</div></div><div class="metric-item"><div class="label">Aporte Necessário</div><div class="value">${formatCurrency(aporteMinimo)}</div></div></div>
                <div class="scenario-card"><h4 style="color: var(--success-color);">CENÁRIO IDEAL</h4><div class="metric-item"><div class="label">Meta de Patrimônio</div><div class="value">${formatCurrency(metaIdeal)}</div></div><div class="metric-item"><div class="label">Aporte Necessário</div><div class="value">${formatCurrency(aporteIdeal)}</div></div></div>
            </div>

            <h3 style="margin-top:20px;">Diagnóstico e Plano de Ação</h3>
            <div class="metric-item"><div class="label">Seu Aporte Mensal</div><div class="value">${formatCurrency(inputs.aporteMensal)}</div></div>
            <div class="metric-item"><div class="label">Sua Projeção de Patrimônio</div><div class="value">${formatCurrency(projecaoAtual)}</div></div>
            <div class="metric-item"><div class="label">Atinge a Meta Mínima?</div><div class="value ${atingeMinima ? 'positive' : 'negative'}">${atingeMinima ? 'Sim' : 'Não'}</div></div>
            <div class="metric-item"><div class="label"><b>Ajuste no Aporte (p/ Meta Mín.)</b></div><div class="value ${gapDeAporteMinimo <= 0 ? 'positive' : 'negative'}"><b>${formatCurrency(gapDeAporteMinimo)}</b></div></div>
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
                <div class="milestone-item"><span class="age">Opção 1 (Aporte):</span> Aumentar seu aporte mensal para <b>${formatCurrency(aporteMinimo)}</b>.</div>
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
        renderMilestones(fullProjection, metaMinima, inputs);
        renderGrowthCompositionChart(fullProjection.accumulation);
        // removemos a chamada para renderAssetAllocationChart(inputs.perfilRisco);

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
            { label: 'Seus Investimentos', data: [...dataAtual.accumulation.map(d => d.saldoFinal), ...dataAtual.decumulation.map(d => d.saldoFinal)], borderColor: 'var(--primary-color)', backgroundColor: grad, fill: true, tension: 0.1, borderWidth: 4, pointRadius: 0 },
            dataMinima ? { label: 'Cenário Mínimo', data: [...dataMinima.accumulation.map(d => d.saldoFinal), ...dataMinima.decumulation.map(d => d.saldoFinal)], borderColor: 'var(--warning-color)', borderDash: [6, 6], pointRadius: 0, borderWidth: 2, fill: false } : null,
            dataIdeal ? { label: 'Cenário Ideal', data: [...dataIdeal.accumulation.map(d => d.saldoFinal), ...dataIdeal.decumulation.map(d => d.saldoFinal)], borderColor: 'var(--success-color)', borderDash: [6, 6], pointRadius: 0, borderWidth: 2, fill: false } : null
        ].filter(Boolean);

        if (dataSimulada) {
            datasets.push({
                label: 'Sua Simulação',
                data: [...dataSimulada.accumulation.map(d => d.saldoFinal), ...dataSimulada.decumulation.map(d => d.saldoFinal)],
                borderColor: 'var(--danger-color)',
                borderWidth: 3,
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false,
                tension: 0.1,
            });
        }
        
        projectionChartInstance = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: datasets }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { color: 'var(--text-muted-color)', callback: value => `R$${(value / 1000000).toFixed(1)}M` }, grid: { color: 'rgba(224, 224, 241, 0.1)' } }, x: { ticks: { color: 'var(--text-muted-color)' }, grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${formatCurrency(c.raw)}` }, backgroundColor: '#FFF', titleColor: '#333', bodyColor: '#333', borderColor: '#DDD', borderWidth: 1 }, annotation: { annotations: { retirementLine: { type: 'line', xMin: anosAteAposentar, xMax: anosAteAposentar, borderColor: 'var(--primary-color)', borderWidth: 2, borderDash: [6, 6], label: { content: 'Aposentadoria', enabled: true, position: 'start', yAdjust: -15, backgroundColor: 'rgba(34, 84, 88, 0.8)', color: 'var(--primary-color)', font: { weight: 'bold' } } } } } }, interaction: { intersect: false, mode: 'index' } } }); 
    }

    function renderIncomePieChart(retirementGoal) {
        const container = document.getElementById('income-pie-chart-card');
        if (retirementGoal.value <= 0) { container.style.display = 'none'; return; }
        container.style.display = 'block';
        const ctx = document.getElementById('incomePieChart').getContext('2d');
        const rendaComplementar = Math.max(0, retirementGoal.value - retirementGoal.postRetirementIncome);
        if (incomePieChartInstance) incomePieChartInstance.destroy();
        incomePieChartInstance = new Chart(ctx, { type: 'pie', data: { labels: ['Renda Extra', 'Saque dos Investimentos'], datasets: [{ data: [retirementGoal.postRetirementIncome, rendaComplementar], backgroundColor: ['#00C49F', '#66F6F1'], borderColor: 'var(--card-bg)', borderWidth: 2 }] }, options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: 'var(--text-color)' } } } } });
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
                    backgroundColor: 'var(--primary-color)',
                }, {
                    label: 'Juros Ganhos',
                    data: jurosData,
                    backgroundColor: 'var(--success-color)',
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: 'var(--text-color)' } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${formatCurrency(c.raw)}` } } }, scales: { x: { stacked: true, ticks: { color: 'var(--text-muted-color)' }, grid: { display: false } }, y: { stacked: true, ticks: { color: 'var(--text-muted-color)', callback: value => `R$${(value / 1000).toFixed(0)}k` }, grid: { color: 'rgba(224, 224, 241, 0.1)' } } } }
        });
    }

    // A função renderAssetAllocationChart não é mais necessária, pois o painel foi removido.
    // Mantê-la vazia ou remover totalmente depende se há outras referências a ela.
    function renderAssetAllocationChart(riskProfile) {
        // Conteúdo vazio ou pode ser removida se não houver outras chamadas.
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

    function renderMilestones(fullProjection, metaMinima, inputs) {
        const container = document.getElementById('milestones-container');
        const accumulation = fullProjection.accumulation;
        let html = '';
        const milestonesValues = [100000, 500000, 1000000];
        milestonesValues.forEach(value => {
            const point = accumulation.find(p => p.saldoFinal >= value);
            if (point) { html += `<div class="milestone-item"><span class="age">Aos ${point.idade} anos:</span> você atingirá ${formatCurrency(value)}.</div>`; }
        });
        if (metaMinima > 0) {
            const fiftyPercent = accumulation.find(p => p.saldoFinal >= metaMinima / 2);
            if (fiftyPercent) { html += `<div class="milestone-item"><span class="age">Aos ${fiftyPercent.idade} anos:</span> você alcançará 50% da sua meta mínima.</div>`; }
        }
        const snowball = accumulation.find((p, i) => {
            if (i === 0) return false;
            const pmtAnual = (inputs.aporteMensal * 12) * Math.pow(1 + (inputs.aporteGrowth || 0), i - 1);
            return p.jurosGanhos > pmtAnual;
        });
        if (snowball) { html += `<div class="milestone-item"><span class="age">Aos ${snowball.idade} anos:</span> seus juros anuais superarão seus aportes! (Efeito bola de neve 🚀)</div>`; }
        container.innerHTML = html || '<p>Ainda não há marcos suficientes para exibir. Continue aportando!</p>';
    }
    
    function setupScenarioSimulator(results) {
        const { inputs, retirementGoal } = results;
        const aporteSlider = document.getElementById('sim-aporte');
        const aporteValue = document.getElementById('sim-aporte-value');
        const idadeSlider = document.getElementById('sim-idade-reforma');
        const idadeValue = document.getElementById('sim-idade-reforma-value');
        const perfilSelect = document.getElementById('sim-perfil-risco');
        const resetButton = document.getElementById('reset-scenario-btn');

        aporteSlider.min = 0;
        // Ajustar o max do aporte para ser mais dinâmico
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

        document.getElementById('sim-aporte-value').textContent = formatCurrency(simAporte);
        document.getElementById('sim-idade-reforma-value').textContent = `${simIdade} anos`;

        let simulatedInputs = JSON.parse(JSON.stringify(originalResults.inputs));
        let simulatedGoals = JSON.parse(JSON.stringify(originalResults.userGoals));

        simulatedInputs.aporteMensal = simAporte;
        simulatedInputs.perfilRisco = simPerfil;
        simulatedGoals.find(g => g.type === 'aposentadoria').age = simIdade;
        
        const premissas = { taxasJurosReais: { muitoConservador: 0.02, conservador: 0.04, moderado: 0.06, arrojado: 0.08, muitoArrojado: 0.10 } };
        const taxaJurosSimulada = premissas.taxasJurosReais[simPerfil];

        const simulatedProjection = generateFullProjection(simulatedInputs, simulatedGoals, taxaJurosSimulada);
        
        renderChart(originalResults.fullProjection, null, null, originalResults.inputs.idadeAtual, simulatedProjection);
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
        const premissas = { taxasJurosReais: { muitoConservador: 0.02, conservador: 0.04, moderado: 0.06, arrojado: 0.08, muitoArrojado: 0.10 } };
        const profiles = ['conservador', 'moderado', 'arrojado', 'muitoArrojado'];
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
            navigator.clipboard.writeText(url).then(() => {
                const shareButton = document.getElementById('share-plan-btn');
                const originalText = shareButton.textContent;
                shareButton.textContent = 'Link Copiado!';
                setTimeout(() => { shareButton.textContent = originalText; }, 2000);
            });
        } catch (error) { console.error("Erro ao compartilhar plano:", error); alert("Não foi possível gerar o link do plano."); }
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
    function generateFullProjection(inputs, goals, taxaAnual) { const retirementGoal = goals.find(g => g.type === 'aposentadoria'); if (!retirementGoal) return { accumulation: [], decumulation: [] }; const anosParaAposentar = retirementGoal.age - inputs.idadeAtual; const anosDeAposentadoria = (retirementGoal.lifeExpectancy || 100) - retirementGoal.age; let accumulation = [{ ano: 0, idade: inputs.idadeAtual, saldoFinal: inputs.patrimonioInicial, totalAportado: inputs.patrimonioInicial, jurosGanhos: 0 }]; let saldo = inputs.patrimonioInicial; let pmtAnual = inputs.aporteMensal * 12; let totalAportado = inputs.patrimonioInicial; for (let ano = 1; ano <= anosParaAposentar; ano++) { const jurosDoAno = saldo * taxaAnual; let resgatesDoAno = 0; const currentAge = inputs.idadeAtual + ano; goals.forEach(goal => { if (goal.age === currentAge && goal.type !== 'aposentadoria') { resgatesDoAno += (goal.type === 'evento' ? goal.value : -goal.value); } }); saldo += jurosDoAno + pmtAnual + resgatesDoAno; totalAportado += pmtAnual; saldo = saldo < 0 ? 0 : saldo; accumulation.push({ ano, idade: currentAge, saldoFinal: saldo, totalAportado, jurosGanhos: jurosDoAno }); pmtAnual *= (1 + (inputs.aporteGrowth || 0)); } let decumulation = []; const rendaComplementarNecessaria = Math.max(0, (retirementGoal.value || 0) - (retirementGoal.postRetirementIncome || 0)); const saqueAnual = rendaComplementarNecessaria * 12; for (let ano = 1; ano <= anosDeAposentadoria; ano++) { const juros = saldo * taxaAnual; saldo += juros - saqueAnual; if (saldo < 0) saldo = 0; decumulation.push({ ano, idade: retirementGoal.age + ano, saldoFinal: saldo }); } return { accumulation, decumulation }; }
    function calculateImpactAnalysis(fullProjection, analysisInputs) { const { idadeAtual, userGoals, retirementGoal, taxaJurosAtual, metaIdeal, metaMinima, aporteGrowth } = analysisInputs; const analysis = []; const intermediateEvents = userGoals.filter(g => g.type !== 'aposentadoria' && g.age < retirementGoal.age).sort((a,b) => a.age - b.age); intermediateEvents.forEach(goal => { const anoDoObjetivo = goal.age - idadeAtual; const projectionPoint = fullProjection.accumulation[anoDoObjetivo]; if (!projectionPoint) return; const patrimonioNoFinalDoAno = projectionPoint.saldoFinal; const patrimonioNoInicioDoAno = fullProjection.accumulation[anoDoObjetivo - 1]?.saldoFinal || analysisInputs.patrimonioInicial; const anosRestantesParaAposentar = retirementGoal.age - goal.age; const novoAporteIdeal = calculateRequiredPMT(patrimonioNoFinalDoAno, metaIdeal, taxaJurosAtual, anosRestantesParaAposentar, aporteGrowth); const novoAporteMinimo = calculateRequiredPMT(patrimonioNoFinalDoAno, metaMinima, taxaJurosAtual, anosRestantesParaAposentar, aporteGrowth); analysis.push({ type: goal.type, description: goal.description, age: goal.age, patrimonioAntes: patrimonioNoInicioDoAno, value: goal.value, patrimonioDepois: patrimonioNoFinalDoAno, novoAporteIdeal, novoAporteMinimo }); }); return analysis; }
    function calculatePresentValue(pmtAnual, i, n) { if (n <= 0) return 0; if (i === 0) return pmtAnual * n; return pmtAnual * ((1 - Math.pow(1 + i, -n)) / i); }
    function calculateRequiredPMT(vp, vf, i, n, pmtGrowth) { if (n <= 0) return vf > vp ? Infinity : 0; let pmtAnual = 0; if (Math.abs(i - (pmtGrowth||0)) > 1e-9) { const term1 = vf - vp * Math.pow(1 + i, n); const term2 = (Math.pow(1 + i, n) - Math.pow(1 + (pmtGrowth||0), n)) / (i - (pmtGrowth||0)); if (term2 === 0) return Infinity; pmtAnual = term1 / term2; } else { if (n === 0) return Infinity; pmtAnual = (vf - vp * Math.pow(1 + i, n)) / (n * Math.pow(1 + i, n - 1)); } return pmtAnual > 0 ? pmtAnual / 12 : 0; }
    document.getElementById('generate-report-btn').addEventListener('click', () => { const reportContainer = document.getElementById('report-page'); const userName = document.getElementById('user-name').value; const today = new Date().toLocaleDateString('pt-BR'); html2canvas(document.getElementById('projectionChart')).then(canvas => { const chartImage = canvas.toDataURL('image/png'); const metricsHTML = document.getElementById('metrics-container').innerHTML; const impactHTML = document.getElementById('impact-analysis-container')?.innerHTML || ''; const tableHTML = document.querySelector('.projection-table').outerHTML; reportContainer.innerHTML = `<style> body { background: white; color: black; font-family: sans-serif; margin: 20px; font-size: 12px; } h1, h2, h3 { color: #1f303f; border-bottom: 2px solid #eee; padding-bottom: 5px; } h1 {font-size: 24px;} h2 {font-size: 18px;} h3 {font-size: 16px;} p { text-align: left; margin: 10px 0;} img { max-width: 100%; margin-top: 20px; border: 1px solid #eee; border-radius: 8px; } .metrics-panel, .impact-analysis { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin-top: 20px;} .metric-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #ddd; } .metric-item:last-child { border-bottom: none; } .metric-item .label { font-weight: bold; } .info-icon, .color-dot { display: none; } .projection-table { font-size: 10px; } </style> <h1>Relatório de Planejamento Financeiro</h1> <p><strong>Cliente:</strong> ${userName}</p><p><strong>Data de Geração:</strong> ${today}</p> <div class="metrics-panel">${metricsHTML}</div> <h2>Projeção de Patrimônio</h2><img src="${chartImage}" alt="Gráfico de Projeção"> ${impactHTML} <h2>Evolução Detalhada</h2>${tableHTML}`; requestAnimationFrame(() => { window.print(); }); }); });

    updateAporte();
    updateEmergencyFund();
});