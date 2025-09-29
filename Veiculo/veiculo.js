document.addEventListener('DOMContentLoaded', () => {
    // Seletores de elementos principais
    const modeSelector = document.getElementById('mode-selector');
    const calculatorSection = document.getElementById('calculator-section');
    const resultsSection = document.getElementById('results-section');
    const modeCards = document.querySelectorAll('.mode-card');
    const resetBtn = document.getElementById('reset-btn');
    const calculatorForm = document.getElementById('calculator-form');
    const formModulesContainer = document.getElementById('form-modules-container');
    const resultsContent = document.getElementById('results-content');
    const validationSummary = document.getElementById('validation-summary');

    const FIPE_API_BASE_URL = 'https://parallelum.com.br/fipe/api/v1/carros/marcas';
    let currentMode = '';
    let chartInstances = {};

    // --- NAVEGAÇÃO PRINCIPAL ---
    modeCards.forEach(card => {
        card.addEventListener('click', () => {
            currentMode = card.dataset.mode;
            setupCalculatorForMode(currentMode);
            modeSelector.classList.add('hidden');
            calculatorSection.classList.remove('hidden');
        });
    });

    resetBtn.addEventListener('click', () => {
        resultsSection.classList.add('hidden');
        modeSelector.classList.remove('hidden');
        calculatorForm.reset();
        formModulesContainer.innerHTML = '';
        validationSummary.classList.add('hidden');
        Object.values(chartInstances).forEach(instance => instance.destroy());
        chartInstances = {};
    });

    // --- MONTAGEM DO FORMULÁRIO ---
    function setupCalculatorForMode(mode) {
        const calculatorTitle = document.getElementById('calculator-title');
        let formHTML = '';

        if (mode === 'single_analysis') {
            calculatorTitle.textContent = 'Análise de Custo de Veículo';
            formHTML = generateGeneralParamsHTML() + generateVehicleHTML('A', 'Dados do Veículo');
        } else if (mode === 'trade_in_analysis') {
            calculatorTitle.textContent = 'Análise de Troca de Veículo';
            formHTML = generateCurrentCarHTML() + generateGeneralParamsHTML() + generateVehicleHTML('A', 'Dados do Carro Novo');
        } else if (mode === 'comparison_analysis') {
            calculatorTitle.textContent = 'Comparador de Veículos';
            formHTML = generateGeneralParamsHTML() + '<div class="comparison-grid">' + generateVehicleHTML('A', 'Veículo A') + generateVehicleHTML('B', 'Veículo B') + '</div>';
        }
        formModulesContainer.innerHTML = formHTML;
        attachEventListeners();
    }

    function generateCurrentCarHTML() {
        return `<div id="current-car-module" class="form-module"><h3>Dados do Seu Carro Atual</h3><div class="financial-columns"><div class="form-group"><label for="current-car-value">Valor de Mercado Atual (R$)</label><input type="text" id="current-car-value" required></div><div class="form-group"><label for="current-car-year">Ano de Fabricação</label><input type="number" id="current-car-year" required></div><div class="form-group"><label for="current-car-costs">Custos Anuais Atuais (R$)</label><input type="text" id="current-car-costs" required></div><div class="form-group"><label for="current-car-consumption">Consumo Atual (KM/L)</label><input type="number" id="current-car-consumption" required></div></div><div class="checkbox-group"><input type="checkbox" id="use-current-car-as-downpayment"><label for="use-current-car-as-downpayment">Usar o valor deste carro como entrada no Veículo A.</label></div></div>`;
    }

    function generateGeneralParamsHTML() {
        return `<div class="form-module" style="border:none; margin:0; padding:0;"><h3>Parâmetros da Simulação</h3><div class="financial-columns"><div class="form-group"><label for="car-ownership-years">Anos que pretende ficar com o carro</label><input type="number" id="car-ownership-years" required></div><div class="form-group"><label for="car-km-per-month">KMs Rodados por Mês</label><input type="text" id="car-km-per-month" required></div><div class="form-group"><label for="opportunity-cost-rate" style="display:flex;align-items:center;gap:8px;">Taxa de Rendimento Anual (%)<div class="info-icon" title="Rendimento estimado se o dinheiro da entrada fosse investido.">?</div></label><input type="number" id="opportunity-cost-rate" value="8" required></div></div></div>`;
    }
    
    // ALTERADO: Placeholders removidos
    function generateVehicleHTML(id, title) {
        return `<div class="vehicle-column" id="vehicle-column-${id}">
            <h4>${title}</h4>
            <div class="form-group"><label for="fipe-brand-${id}">Marca</label><select id="fipe-brand-${id}" required><option value="">Carregando marcas...</option></select></div>
            <div class="form-group"><label for="fipe-model-${id}">Modelo</label><select id="fipe-model-${id}" required disabled><option value="">Selecione uma marca</option></select></div>
            <div class="form-group"><label for="fipe-year-${id}">Ano</label><select id="fipe-year-${id}" required disabled><option value="">Selecione um modelo</option></select></div>
            <div class="form-group"><label for="car-price-${id}">Preço (R$)</label><input type="text" id="car-price-${id}" required></div>
            <div class="form-group"><label for="car-year-${id}">Ano de Fabricação</label><input type="number" id="car-year-${id}" required></div>
            <div class="form-group">
                <label for="vehicle-type-${id}">Tipo de Veículo</label>
                <select id="vehicle-type-${id}"><option value="gasolina">Gasolina</option><option value="flex">Flex</option><option value="diesel">Diesel</option><option value="eletrico">Elétrico</option></select>
            </div>
            <div class="form-group vehicle-fields" data-type="gasolina diesel flex"><label for="car-fuel-price-${id}">Preço Gasolina (R$/L)</label><input type="text" id="car-fuel-price-${id}" required></div>
            <div class="form-group vehicle-fields" data-type="gasolina diesel"><label for="car-fuel-consumption-${id}">Consumo (KM/L)</label><input type="number" id="car-fuel-consumption-${id}" required></div>
            <div class="financial-columns vehicle-fields hidden" data-type="flex">
                <div class="form-group"><label for="car-fuel-consumption-gas-${id}">Consumo Gasolina (KM/L)</label><input type="number" id="car-fuel-consumption-gas-${id}"></div>
                <div class="form-group"><label for="car-fuel-consumption-eth-${id}">Consumo Etanol (KM/L)</label><input type="number" id="car-fuel-consumption-eth-${id}"></div>
            </div>
            <div class="form-group vehicle-fields hidden" data-type="flex"><label for="car-fuel-price-eth-${id}">Preço Etanol (R$/L)</label><input type="text" id="car-fuel-price-eth-${id}"></div>
            <div class="form-group vehicle-fields hidden" data-type="flex"><label for="car-flex-proportion-${id}">Proporção de Uso Gasolina (%)</label><input type="number" id="car-flex-proportion-${id}" value="70"></div>
            <div class="form-group vehicle-fields hidden" data-type="eletrico"><label for="car-kwh-price-${id}">Preço Energia (R$/kWh)</label><input type="text" id="car-kwh-price-${id}"></div>
            <div class="form-group vehicle-fields hidden" data-type="eletrico"><label for="car-efficiency-${id}">Eficiência (KM/kWh)</label><input type="number" id="car-efficiency-${id}"></div>
            <div class="form-group"><label for="car-downpayment-${id}">Entrada (R$)</label><input type="text" id="car-downpayment-${id}" required></div>
            <div class="form-group"><label for="car-interest-rate-${id}">Juros Financiamento (% a.a.)</label><input type="number" id="car-interest-rate-${id}"></div>
            <div class="form-group"><label for="car-loan-term-${id}">Prazo (Meses)</label><input type="number" id="car-loan-term-${id}"></div>
            <div class="form-group"><label for="car-insurance-${id}">Seguro Anual (R$)</label><input type="text" id="car-insurance-${id}" required></div>
            <div class="form-group"><label for="car-tax-rate-${id}">Alíquota IPVA (%)</label><input type="number" id="car-tax-rate-${id}" required></div>
            <div class="form-group"><label for="car-maintenance-${id}">Manutenção Anual (R$)</label><input type="text" id="car-maintenance-${id}" required></div>
        </div>`;
    }

    // --- LÓGICA DE EVENTOS E FORMULÁRIO ---
    function attachEventListeners() {
        document.querySelectorAll('input[type="text"]').forEach(input => {
            const id = input.id;
            if (id.includes('price') || id.includes('kwh')) {
                input.addEventListener('input', formatDecimalInput);
            } else {
                input.addEventListener('input', formatNumberInput);
            }
        });
        
        document.querySelectorAll('select[id^="vehicle-type-"]').forEach(select => {
            select.addEventListener('change', (e) => updateVehicleFields(e.target.id.split('-')[2]));
            updateVehicleFields(select.id.split('-')[2]);
        });
        
        if (currentMode === 'trade_in_analysis') {
            const useAsDownpaymentCheck = document.getElementById('use-current-car-as-downpayment');
            const downpaymentInput = document.getElementById('car-downpayment-A');
            const currentCarValueInput = document.getElementById('current-car-value');
            useAsDownpaymentCheck.addEventListener('change', () => {
                if (useAsDownpaymentCheck.checked) {
                    downpaymentInput.value = currentCarValueInput.value;
                    downpaymentInput.disabled = true;
                } else { downpaymentInput.disabled = false; downpaymentInput.value = ''; }
            });
            currentCarValueInput.addEventListener('input', () => { if (useAsDownpaymentCheck.checked) downpaymentInput.value = currentCarValueInput.value; });
        }
        
        if (document.getElementById('vehicle-column-A')) setupFipeIntegration('A');
        if (document.getElementById('vehicle-column-B')) setupFipeIntegration('B');
    }

    // --- LÓGICA DE INTEGRAÇÃO COM API FIPE ---
    function setupFipeIntegration(id) {
        const brandSelect = document.getElementById(`fipe-brand-${id}`);
        const modelSelect = document.getElementById(`fipe-model-${id}`);
        const yearSelect = document.getElementById(`fipe-year-${id}`);
        const priceInput = document.getElementById(`car-price-${id}`);
        const yearInput = document.getElementById(`car-year-${id}`);

        const resetSelect = (select, text) => {
            select.innerHTML = `<option value="">${text}</option>`;
            select.disabled = true;
        };

        const populateSelect = (select, items) => {
            select.innerHTML = `<option value="">Selecione</option>`;
            items.forEach(item => {
                const option = document.createElement('option');
                option.value = item.codigo;
                option.textContent = item.nome;
                select.appendChild(option);
            });
            select.disabled = false;
        };

        const fetchAndPopulate = async (url, select) => {
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error('Falha na resposta da API');
                const data = await response.json();
                populateSelect(select, Array.isArray(data) ? data : data.modelos);
            } catch (error) {
                console.error("Erro ao buscar dados da FIPE:", error);
                resetSelect(select, 'Erro ao carregar');
            }
        };
        
        fetchAndPopulate(FIPE_API_BASE_URL, brandSelect);

        brandSelect.addEventListener('change', () => {
            resetSelect(modelSelect, 'Carregando modelos...');
            resetSelect(yearSelect, 'Selecione um modelo');
            if (brandSelect.value) {
                fetchAndPopulate(`${FIPE_API_BASE_URL}/${brandSelect.value}/modelos`, modelSelect);
            }
        });

        modelSelect.addEventListener('change', () => {
            resetSelect(yearSelect, 'Carregando anos...');
            if (brandSelect.value && modelSelect.value) {
                fetchAndPopulate(`${FIPE_API_BASE_URL}/${brandSelect.value}/modelos/${modelSelect.value}/anos`, yearSelect);
            }
        });

        yearSelect.addEventListener('change', async () => {
            if (brandSelect.value && modelSelect.value && yearSelect.value) {
                try {
                    const url = `${FIPE_API_BASE_URL}/${brandSelect.value}/modelos/${modelSelect.value}/anos/${yearSelect.value}`;
                    const response = await fetch(url);
                    if (!response.ok) throw new Error('Falha na resposta da API');
                    const data = await response.json();
                    
                    priceInput.value = data.Valor.replace('R$ ', '').replace('.', '').split(',')[0];
                    yearInput.value = data.AnoModelo;
                    priceInput.dispatchEvent(new Event('input'));

                } catch (error) {
                    console.error("Erro ao buscar preço da FIPE:", error);
                    priceInput.value = '';
                    yearInput.value = '';
                }
            }
        });
    }

    function updateVehicleFields(id) {
        const selectedType = document.getElementById(`vehicle-type-${id}`).value;
        const column = document.getElementById(`vehicle-column-${id}`);
        column.querySelectorAll('.vehicle-fields').forEach(field => {
            const supportedTypes = field.dataset.type.split(' ');
            if (supportedTypes.includes(selectedType)) {
                field.classList.remove('hidden');
                field.querySelectorAll('input, select').forEach(input => input.required = true);
            } else {
                field.classList.add('hidden');
                 field.querySelectorAll('input, select').forEach(input => input.required = false);
            }
        });
    }
    
    // --- FUNÇÕES DE FORMATAÇÃO E VALIDAÇÃO ---
    const formatCurrency = (value) => (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    function formatNumberInput(e) { let value = e.target.value.replace(/\D/g, ''); e.target.value = value ? new Intl.NumberFormat('pt-BR').format(value) : ''; }
    function formatDecimalInput(e) {
        let value = e.target.value.replace(/[^\d,]/g, '');
        const parts = value.split(',');
        if (parts.length > 2) { value = parts[0] + ',' + parts.slice(1).join(''); }
        e.target.value = value;
    }
    const getCleanValue = (id) => { 
        const el = document.getElementById(id); 
        if (!el || el.disabled) return 0; 
        const value = el.value; 
        return parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0; 
    };
    function validateForm() {
        let isValid = true;
        let errorMessages = [];
        document.querySelectorAll('#calculator-form [required]').forEach(input => {
            if (input.offsetParent !== null) {
                if (!input.value.trim()) {
                    isValid = false;
                    input.classList.add('input-error');
                    const label = input.closest('.form-group')?.querySelector('label');
                    if(label) errorMessages.push(`O campo "${label.textContent}" é obrigatório.`);
                } else {
                    input.classList.remove('input-error');
                }
            }
        });
        function checkLogic(idA, idB, message) {
            const valA = getCleanValue(idA);
            const valB = getCleanValue(idB);
            if (valA > valB) {
                isValid = false;
                document.getElementById(idA).classList.add('input-error');
                errorMessages.push(message);
            }
        }
        if (document.getElementById('car-price-A')) checkLogic('car-downpayment-A', 'car-price-A', 'A entrada (Veículo A) não pode ser maior que o preço.');
        if (document.getElementById('car-price-B')) checkLogic('car-downpayment-B', 'car-price-B', 'A entrada (Veículo B) não pode ser maior que o preço.');
        if (!isValid) {
            validationSummary.innerHTML = '<strong>Por favor, corrija os erros abaixo:</strong><br>' + [...new Set(errorMessages)].join('<br>');
            validationSummary.classList.remove('hidden');
            window.scrollTo(0, 0);
        } else {
            validationSummary.classList.add('hidden');
        }
        return isValid;
    }

    // --- LÓGICA DE CÁLCULO PRINCIPAL ---
    const getDepreciationRate = (age) => {
        if (age <= 1) return 0.20; if (age === 2) return 0.10; if (age === 3) return 0.09;
        if (age === 4) return 0.08; if (age === 5) return 0.07; if (age === 6) return 0.06;
        if (age === 7) return 0.05; if (age === 8) return 0.04; if (age === 9) return 0.03;
        if (age >= 10) return 0.02; return 0.01;
    }
    function calculateSingleVehicleTCO(vehicleData, generalData) {
        const loanAmount = vehicleData.price - vehicleData.downpayment;
        const monthlyInterestRate = vehicleData.interestRate / 12 / 100;
        let monthlyPayment = 0;
        if (loanAmount > 0 && vehicleData.loanTerm > 0) {
            monthlyPayment = monthlyInterestRate > 0 ?
                loanAmount * (monthlyInterestRate * Math.pow(1 + monthlyInterestRate, vehicleData.loanTerm)) / (Math.pow(1 + monthlyInterestRate, vehicleData.loanTerm) - 1) :
                loanAmount / vehicleData.loanTerm;
        }
        let yearlyBreakdown = [], currentValue = vehicleData.price, totalInterest = 0, totalDepreciation = 0, totalAnnualCosts = 0, remainingLoanBalance = loanAmount;
        const currentSystemYear = new Date().getFullYear();
        for (let year = 1; year <= generalData.ownershipYears; year++) {
            let interestForYear = 0;
            const paymentsInYear = Math.min(12, vehicleData.loanTerm - (year - 1) * 12);
            if (paymentsInYear > 0) {
                 for (let m = 0; m < paymentsInYear; m++) {
                    let interestComponent = remainingLoanBalance * monthlyInterestRate;
                    interestForYear += interestComponent;
                    remainingLoanBalance -= (monthlyPayment - interestComponent);
                 }
            }
            totalInterest += interestForYear;
            const carAge = (currentSystemYear - vehicleData.year) + year;
            const depRateThisYear = getDepreciationRate(carAge);
            const depreciationAmount = currentValue * depRateThisYear;
            totalDepreciation += depreciationAmount;
            const ipvaCost = currentValue * (vehicleData.taxRate / 100);
            const annualCostThisYear = vehicleData.insurance + ipvaCost + vehicleData.maintenance;
            totalAnnualCosts += annualCostThisYear;
            yearlyBreakdown.push({ year: year, initialValue: currentValue, depreciation: depreciationAmount, annualCosts: annualCostThisYear, interest: interestForYear });
            currentValue -= depreciationAmount;
        }
        const totalKm = generalData.kmPerMonth * 12 * generalData.ownershipYears;
        let totalFuelCost = 0;
        switch (vehicleData.vehicleType) {
            case 'eletrico': totalFuelCost = (totalKm / vehicleData.efficiency) * vehicleData.kwhPrice; break;
            case 'flex':
                const gasKm = totalKm * (vehicleData.flexProportion / 100);
                const ethKm = totalKm * (1 - (vehicleData.flexProportion / 100));
                const gasCost = (gasKm / vehicleData.fuelConsumptionGas) * vehicleData.fuelPrice;
                const ethCost = (ethKm / vehicleData.fuelConsumptionEth) * vehicleData.fuelPriceEth;
                totalFuelCost = gasCost + ethCost;
                break;
            default: totalFuelCost = (totalKm / vehicleData.fuelConsumption) * vehicleData.fuelPrice;
        }
        const opportunityRate = generalData.opportunityRate / 100;
        const opportunityCost = vehicleData.downpayment > 0 && opportunityRate > 0 ? (vehicleData.downpayment * Math.pow((1 + opportunityRate), generalData.ownershipYears)) - vehicleData.downpayment : 0;
        const tco = totalDepreciation + totalInterest + totalAnnualCosts + totalFuelCost;
        const totalPaidOnLoan = monthlyPayment * Math.min(vehicleData.loanTerm, generalData.ownershipYears * 12);
        const totalExpenses = vehicleData.downpayment + totalPaidOnLoan + totalAnnualCosts + totalFuelCost;
        return { ...vehicleData, ...generalData, totalExpenses, tco, totalInterest, totalDepreciation, totalAnnualCosts, totalFuelCost, opportunityCost, yearlyBreakdown };
    }
    
    document.getElementById('calculate-btn').addEventListener('click', () => {
        if (!validateForm()) return;
        calculatorSection.classList.add('hidden');
        resultsSection.classList.remove('hidden');
        const generalData = { ownershipYears: getCleanValue('car-ownership-years') || 1, kmPerMonth: getCleanValue('car-km-per-month'), opportunityRate: getCleanValue('opportunity-cost-rate') };
        function getVehicleData(id) {
            const brandSelect = document.getElementById(`fipe-brand-${id}`);
            const modelSelect = document.getElementById(`fipe-model-${id}`);
            const brandName = brandSelect.options[brandSelect.selectedIndex].text;
            const modelName = modelSelect.options[modelSelect.selectedIndex].text;
            const vehicleType = document.getElementById(`vehicle-type-${id}`).value;
            const data = {
                brand: `${brandName} ${modelName}`, price: getCleanValue(`car-price-${id}`), year: getCleanValue(`car-year-${id}`),
                downpayment: getCleanValue(`car-downpayment-${id}`), interestRate: getCleanValue(`car-interest-rate-${id}`),
                loanTerm: getCleanValue(`car-loan-term-${id}`), insurance: getCleanValue(`car-insurance-${id}`),
                taxRate: getCleanValue(`car-tax-rate-${id}`), maintenance: getCleanValue(`car-maintenance-${id}`),
                vehicleType: vehicleType,
            };
            if (vehicleType === 'eletrico') {
                data.kwhPrice = getCleanValue(`car-kwh-price-${id}`);
                data.efficiency = getCleanValue(`car-efficiency-${id}`) || 1;
            } else if (vehicleType === 'flex') {
                 data.fuelPrice = getCleanValue(`car-fuel-price-${id}`); data.fuelPriceEth = getCleanValue(`car-fuel-price-eth-${id}`);
                 data.fuelConsumptionGas = getCleanValue(`car-fuel-consumption-gas-${id}`) || 1; data.fuelConsumptionEth = getCleanValue(`car-fuel-consumption-eth-${id}`) || 1;
                 data.flexProportion = getCleanValue(`car-flex-proportion-${id}`);
            } else {
                 data.fuelPrice = getCleanValue(`car-fuel-price-${id}`); data.fuelConsumption = getCleanValue(`car-fuel-consumption-${id}`) || 1;
            }
            return data;
        }
        if (currentMode === 'single_analysis' || currentMode === 'trade_in_analysis') {
            const resultsA = calculateSingleVehicleTCO(getVehicleData('A'), generalData);
            if (currentMode === 'trade_in_analysis') {
                const currentCar = { value: getCleanValue('current-car-value'), year: getCleanValue('current-car-year'), annualCosts: getCleanValue('current-car-costs'), consumption: getCleanValue('current-car-consumption') || 1, };
                let futureDepreciation = 0, tempValue = currentCar.value, futureAnnualCosts = 0;
                const currentSystemYear = new Date().getFullYear();
                for (let year = 1; year <= generalData.ownershipYears; year++) {
                    const carAge = (currentSystemYear - currentCar.year) + year;
                    futureDepreciation += tempValue * getDepreciationRate(carAge); tempValue *= (1 - getDepreciationRate(carAge));
                    futureAnnualCosts += currentCar.annualCosts;
                }
                const futureFuelCost = (generalData.kmPerMonth * 12 * generalData.ownershipYears / currentCar.consumption) * getCleanValue('car-fuel-price-A');
                const tcoCurrentCar = futureAnnualCosts + futureFuelCost + futureDepreciation;
                displayTradeInResults(resultsA, tcoCurrentCar);
            } else { displaySingleResults(resultsA); }
        } else if (currentMode === 'comparison_analysis') {
            const resultsA = calculateSingleVehicleTCO(getVehicleData('A'), generalData);
            const resultsB = calculateSingleVehicleTCO(getVehicleData('B'), generalData);
            displayComparisonResults(resultsA, resultsB);
        }
    });

    // --- FUNÇÕES DE EXIBIÇÃO DE RESULTADOS ---
    function displaySingleResults(r) {
        resultsContent.innerHTML = `<h2 id="results-title">Análise do Custo do Veículo: ${r.brand}</h2><div class="dashboard-grid"><div style="position:relative;min-height:400px;width:100%;"><canvas id="tcoChartA"></canvas></div><div class="metrics-panel" id="metrics-container-A"></div></div><div id="report-container-A"></div>`;
        document.getElementById('metrics-container-A').innerHTML = generateMetricsHTML(r);
        document.getElementById('report-container-A').innerHTML = generateYearlyReportHTML(r);
        renderTcoChart('A', r);
    }
    function displayTradeInResults(newCarResults, tcoCurrent) {
        resultsContent.innerHTML = `<div id="verdict-section" class="verdict-section"></div><div id="intelligent-suggestion-section"></div><h2 id="results-title">Análise do Custo do Carro Novo: ${newCarResults.brand}</h2><div class="dashboard-grid"><div style="position:relative;min-height:400px;width:100%;"><canvas id="tcoChartA"></canvas></div><div class="metrics-panel"><div id="metrics-container-A"></div></div></div><div id="report-container-A"></div>`;
        document.getElementById('metrics-container-A').innerHTML = generateMetricsHTML(newCarResults);
        document.getElementById('report-container-A').innerHTML = generateYearlyReportHTML(newCarResults);
        renderTcoChart('A', newCarResults);
        displayVerdict(newCarResults.tco, tcoCurrent);
        if(newCarResults.tco > tcoCurrent){ displayIntelligentSuggestion(newCarResults.tco, tcoCurrent); }
    }
    // ALTERADO: Adiciona o container do novo gráfico e chama a função para renderizá-lo
    function displayComparisonResults(rA, rB) {
        const difference = Math.abs(rA.tco - rB.tco);
        const winner = rA.tco < rB.tco ? rA.brand : rB.brand;
        const conclusion = `O <strong>${winner}</strong> é a opção <strong style="color: var(--success-color);">${formatCurrency(difference)} mais econômica</strong>.`;
        resultsContent.innerHTML = `
            <div class="verdict-section"><h2>Resultado da Comparação</h2><p id="verdict-final">${conclusion}</p></div>
            <div class="comparison-results-grid">
                <div class="result-column"><h4>Veículo A: ${rA.brand}</h4><div class="metrics-panel" id="metrics-container-A"></div><div style="position:relative;min-height:300px;width:100%;margin-top:20px;"><canvas id="tcoChartA"></canvas></div><div id="report-container-A"></div></div>
                <div class="result-column"><h4>Veículo B: ${rB.brand}</h4><div class="metrics-panel" id="metrics-container-B"></div><div style="position:relative;min-height:300px;width:100%;margin-top:20px;"><canvas id="tcoChartB"></canvas></div><div id="report-container-B"></div></div>
            </div>
            <div class="comparison-chart-container" style="margin-top: 40px;">
                <h4 style="text-align:center;">Comparação Direta de Custos</h4>
                <div style="position:relative;min-height:400px;width:100%;"><canvas id="comparisonBarChart"></canvas></div>
            </div>`;
        document.getElementById('metrics-container-A').innerHTML = generateMetricsHTML(rA);
        document.getElementById('metrics-container-B').innerHTML = generateMetricsHTML(rB);
        document.getElementById('report-container-A').innerHTML = generateYearlyReportHTML(rA);
        document.getElementById('report-container-B').innerHTML = generateYearlyReportHTML(rB);
        renderTcoChart('A', rA);
        renderTcoChart('B', rB);
        renderComparisonBarChart(rA, rB); // NOVO
    }
    function generateMetricsHTML(r) { return `<h3>Visão Geral</h3> <div class="metric-item"><div class="label">Custo Líquido (TCO)</div><div class="value" style="color:var(--primary-color);font-weight:700;">${formatCurrency(r.tco)}</div></div><div class="metric-item"><div class="label">Total de Despesas</div><div class="value">${formatCurrency(r.totalExpenses)}</div></div><div class="metric-item"><div class="label">Custo Mensal</div><div class="value">${formatCurrency(r.tco > 0 ? r.tco / (r.ownershipYears * 12) : 0)}</div></div><div class="metric-item"><div class="label" style="display:flex;align-items:center;gap:8px;">Custo de Oportunidade<div class="info-icon" title="Ganho perdido ao investir o dinheiro da entrada.">?</div></div><div class="value" style="color: var(--warning-color);">${formatCurrency(r.opportunityCost)}</div></div>`; }
    function displayVerdict(tcoNew, tcoCurrent) {
        const container = document.getElementById('verdict-section');
        const difference = Math.abs(tcoNew - tcoCurrent);
        const conclusion = tcoNew < tcoCurrent ? `Trocar de carro é a opção <strong style="color: var(--success-color);">${formatCurrency(difference)} mais econômica</strong> para os próximos anos.` : `Manter seu carro atual pode te <strong style="color: var(--danger-color);">${formatCurrency(difference)} economizar</strong> nos próximos anos.`;
        container.innerHTML = `<h2>Análise de Troca: Vale a Pena?</h2><div class="verdict-comparison"><div class="verdict-box"><h4>Custo para TROCAR</h4><p>${formatCurrency(tcoNew)}</p></div><div class="verdict-box"><h4>Custo para MANTER</h4><p>${formatCurrency(tcoCurrent)}</p></div></div><p id="verdict-final">${conclusion}</p>`;
    }
    function displayIntelligentSuggestion(tcoNew, tcoCurrent){
        const container = document.getElementById('intelligent-suggestion-section');
        const difference = tcoNew - tcoCurrent;
        container.innerHTML = `<div class="intelligent-suggestion"><h3>Sugestão Inteligente</h3><p>A troca não parece vantajosa com o veículo escolhido. Para que a troca valesse a pena, o custo total do novo carro precisaria ser, no mínimo, <strong>${formatCurrency(difference)}</strong> menor.</p><p>Considere pesquisar por um veículo com uma ou mais das seguintes características:</p><ul><li><strong>Preço de compra menor:</strong> Isso reduz drasticamente a desvalorização e os juros do financiamento.</li><li><strong>Melhor eficiência de combustível:</strong> Um carro mais econômico gera uma grande economia a longo prazo.</li><li><strong>Custos anuais mais baixos:</strong> Pesquise o valor médio de seguro e manutenção para os modelos de seu interesse.</li></ul></div>`;
    }
    function generateYearlyReportHTML(r) {
        let tableHTML = `<details style="margin-top: 20px; cursor: pointer;"><summary style="font-weight: 600;">Ver Detalhes Ano a Ano</summary><table class="yearly-report-table"><thead><tr><th>Ano</th><th>Desvalorização</th><th>Juros</th><th>Custos Anuais</th><th>Total Anual</th></tr></thead><tbody>`;
        r.yearlyBreakdown.forEach(yearData => {
            const total = yearData.depreciation + yearData.interest + yearData.annualCosts;
            tableHTML += `<tr><td>${yearData.year}</td><td>${formatCurrency(yearData.depreciation)}</td><td>${formatCurrency(yearData.interest)}</td><td>${formatCurrency(yearData.annualCosts)}</td><td><strong>${formatCurrency(total)}</strong></td></tr>`;
        });
        tableHTML += '</tbody></table></details>';
        return tableHTML;
    }
    function renderTcoChart(id, results) {
        const canvasId = `tcoChart${id}`;
        const el = document.getElementById(canvasId); if (!el) return;
        const ctx = el.getContext('2d');
        if (chartInstances[canvasId]) chartInstances[canvasId].destroy();
        chartInstances[canvasId] = new Chart(ctx, { type: 'doughnut', data: { labels: ['Desvalorização', 'Combustível', 'Custos Anuais', 'Juros'], datasets: [{ data: [results.totalDepreciation, results.totalFuelCost, results.totalAnnualCosts, results.totalInterest], backgroundColor: ['#FF6384', '#FF9F40', '#4BC0C0', '#225458'], borderColor: 'var(--card-bg)', borderWidth: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => { const total = c.chart.data.datasets[0].data.reduce((a, b) => a + b, 0); const p = total > 0 ? ((c.raw / total) * 100).toFixed(1) : 0; return `${c.label}: ${formatCurrency(c.raw)} (${p}%)`; } } } } } });
    }
    
    // NOVO: Função para renderizar o gráfico de barras comparativo
    function renderComparisonBarChart(rA, rB) {
        const canvasId = 'comparisonBarChart';
        const el = document.getElementById(canvasId); if (!el) return;
        const ctx = el.getContext('2d');
        if (chartInstances[canvasId]) chartInstances[canvasId].destroy();

        chartInstances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Desvalorização', 'Combustível', 'Custos Anuais', 'Juros'],
                datasets: [
                    {
                        label: rA.brand,
                        data: [rA.totalDepreciation, rA.totalFuelCost, rA.totalAnnualCosts, rA.totalInterest],
                        backgroundColor: 'rgba(34, 84, 88, 0.7)', // Cor primária com transparência
                        borderColor: 'rgba(34, 84, 88, 1)',
                        borderWidth: 1
                    },
                    {
                        label: rB.brand,
                        data: [rB.totalDepreciation, rB.totalFuelCost, rB.totalAnnualCosts, rB.totalInterest],
                        backgroundColor: 'rgba(255, 159, 64, 0.7)', // Cor de destaque com transparência
                        borderColor: 'rgba(255, 159, 64, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
                scales: { y: { beginAtZero: true, ticks: { callback: (value) => formatCurrency(value) } } }
            }
        });
    }
});