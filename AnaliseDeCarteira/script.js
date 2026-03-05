let chartEstrategia = null;
let chartSubclasses = null;
let currentPortfolio = {};
let totalPatrimonio = 0;

// 1. Mapeamento Inteligente com 8 Categorias
// 1. Mapeamento Inteligente com 8 Categorias (Prioridade para FIIs)
// 1. Mapeamento Inteligente com 8 Categorias
const mapToSeven = (subclasseXp, ativo) => {
    const s = subclasseXp.toLowerCase();
    const a = ativo.toUpperCase();
    
    // PRIORIDADE 1: Fundos Imobiliários (HGLG11 e outros listados)
    if (s.includes("fii") || s.includes("imobiliário") || s.includes("listados")) {
        return "Fundos Imobiliários";
    }

    const categoriasBase = ["Renda Variavel Brasil", "Renda Fixa Brasil", "Multimercado", "Renda Variavel Global", "Renda Fixa Global", "Alternativo", "Caixa"];
    if (categoriasBase.some(c => c.toLowerCase() === s)) {
        return categoriasBase.find(c => c.toLowerCase() === s);
    }

    if (a.includes("IVVB11") || a.includes("NASD11") || a.includes("WRLD11") || a.includes("BNDX11")) return "Renda Variavel Global";
    if (s.includes("ações") || s.includes("variável brasil") || s.includes("renda variável")) return "Renda Variavel Brasil";
    // Mapeia Renda Fixa, Pós, Inflação e Prefixados
    if (s.includes("pós-fixado") || s.includes("inflação") || s.includes("fixa") || s.includes("renda fixa") || s.includes("prefixada")) return "Renda Fixa Brasil";
    if (s.includes("multimercado")) return "Multimercado";
    if (s.includes("alternativo")) return "Alternativo";
    return "Caixa"; 
};
const norm = (txt) => txt ? txt.toString().replace(/\s+/g, ' ').trim() : "";

async function processarPlanilha() {
    const file = document.getElementById('excelFile').files[0];
    if (!file) return alert("Selecione o arquivo Excel da XP.");

    const glossary = await loadGlossaryExcel().catch(() => ({}));
    const reader = new FileReader();

    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
        analisarCarteira(matrix, glossary);
    };
    reader.readAsArrayBuffer(file);
}

async function loadGlossaryExcel() {
    const file = document.getElementById('glossaryFile').files[0];
    if (!file) return {};
    
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet);
            
            const dict = {};
            json.forEach(row => {
                const ativo = norm(row["Ativos"] || row["ATIVOS"] || row["Ativo"]);
                const classe = row["Classe"] || row["CLASSE"];
                // Garantimos que salvamos um OBJETO e não apenas uma string
                if (ativo) {
                    dict[ativo] = {
                        cat: classe ? classe.toString().trim() : "",
                        // Se não houver coluna 'Subclasse', usamos 'Outros'
                        subclasse: row["Subclasse"] || row["SUBCLASSE"] || "Outros"
                    };
                }
            });
            resolve(dict);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function analisarCarteira(matrix, glossary) {
    const estrategiaMap = { 
        "Renda Variavel Brasil": 0, "Renda Fixa Brasil": 0, "Multimercado": 0, 
        "Renda Variavel Global": 0, "Renda Fixa Global": 0, "Alternativo": 0, 
        "Fundos Imobiliários": 0, "Caixa": 0 
    };
    const subclassesMap = {};
    const detalheMap = {};
    totalPatrimonio = 0;
    let currentXpCategory = "Caixa";
    let colPosicaoIdx = -1;

    matrix.forEach(row => {
        if(!row || row.length === 0) return;
        
        const rowStr = row.map(c => norm(c));

        // 1. Detectar Categoria (Símbolo |)
        const tituloSeccao = row.find(c => c && c.toString().includes("|"));
        if (tituloSeccao) {
            currentXpCategory = tituloSeccao.toString().split("|")[1].trim();
        }

        // 2. Localizar coluna de Valor (Prioridade: Posição > Líquido > Financeiro)
        const headValor = ["Posição", "Posição a mercado", "Valor líquido", "Financeiro", "Valor aplicado", "Provisionado"];
        let foundValor = -1;
        for (let v of headValor) {
            let idx = rowStr.indexOf(v);
            if (idx !== -1) { foundValor = idx; break; }
        }

        if (foundValor !== -1) {
            colPosicaoIdx = foundValor;
            return; // Linha de cabeçalho identificada, não processamos como dado
        }

        // 3. Filtro Anti-Duplicidade (Ignora Proventos e Custódia)
        const lowCat = currentXpCategory.toLowerCase();
        if (lowCat.includes("proventos") || lowCat.includes("custódia") || lowCat.includes("distribuições")) return;

        // 4. Processar Ativo (Nome está SEMPRE na coluna 0 para evitar o erro de datas)
       if (colPosicaoIdx !== -1) {
    const nomeAtivo = norm(row[0]);
    const valor = cleanV(row[colPosicaoIdx]);
    
    const noise = ["Ativo", "Aplicação", "Papel", "Produto", "Fundo", "Data cota", "Total", "Subtotal"];
    if (nomeAtivo && valor > 0.01 && !noise.includes(nomeAtivo) && !nomeAtivo.includes("|")) {
        
        const gData = glossary[nomeAtivo];
        
        // CORREÇÃO: Verificamos se gData é um objeto antes de pegar .cat
        const topico = (gData && typeof gData === 'object') ? gData.cat : mapToSeven(currentXpCategory, nomeAtivo);
        
        // CORREÇÃO: Usamos o novo nome 'subclasse' definido no loadGlossary
        const subclasseNome = (gData && typeof gData === 'object' && gData.subclasse) ? gData.subclasse : currentXpCategory;

        estrategiaMap[topico] += valor;
        totalPatrimonio += valor;

        // Gráfico de Subclasses (agora com o nome correto)
        subclassesMap[subclasseNome] = (subclassesMap[subclasseNome] || 0) + valor;

        if (!detalheMap[topico]) detalheMap[topico] = { total: 0, assets: [] };
        detalheMap[topico].total += valor;
        detalheMap[topico].assets.push({ nome: nomeAtivo, valor: valor });
    }
}
    });

    // 5. Captura de Saldo Projetado
    const headerRow = matrix.find(r => r && r.some(c => norm(c) === "Saldo projetado"));
    if (headerRow) {
        const colSaldoIdx = headerRow.findIndex(c => norm(c) === "Saldo projetado");
        const valorRow = matrix[matrix.indexOf(headerRow) + 1];
        if (valorRow) {
            const saldoVal = cleanV(valorRow[colSaldoIdx]);
            estrategiaMap["Caixa"] += saldoVal;
            totalPatrimonio += saldoVal;
        }
    }

    renderDashboard(estrategiaMap, subclassesMap, detalheMap);
}
// ... (Funções de Renderização e Auxiliares permanecem as mesmas)
function cleanV(v) {
    if (v === undefined || v === null) return 0;
    if (typeof v === 'number') return v;
    let s = v.toString().replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
    return parseFloat(s) || 0;
}

function renderDashboard(estrategia, subclasses, detalhe) {
    const valorAporte = parseFloat(document.getElementById('valorAporte').value) || 0;
    const totalFuturo = totalPatrimonio + valorAporte;
    document.getElementById('txtTotal').innerText = `R$ ${totalPatrimonio.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;

    const labels1 = Object.keys(estrategia).filter(k => estrategia[k] > 0);
    const data1 = labels1.map(k => ((estrategia[k] / (totalPatrimonio || 1)) * 100).toFixed(1));
    
    const ctx1 = document.getElementById('chartEstrategia').getContext('2d');
    if (chartEstrategia) chartEstrategia.destroy();
    chartEstrategia = new Chart(ctx1, {
        type: 'doughnut',
        data: {
            labels: labels1.map((l, i) => `${l} (${data1[i]}%)`),
            datasets: [{
                data: data1,
                backgroundColor: ['#FF0000', '#0000FF', '#008000', '#FFFF00', '#FFA500', '#800080', '#00FFFF', '#FF00FF'],
                borderWidth: 0
            }]
        },
        options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

    const ctx2 = document.getElementById('chartSubclasses').getContext('2d');
    if (chartSubclasses) chartSubclasses.destroy();
    chartSubclasses = new Chart(ctx2, {
        type: 'bar',
        data: {
            labels: Object.keys(subclasses),
            datasets: [{ label: 'Volume R$', data: Object.values(subclasses), backgroundColor: '#1b4043' }]
        },
        options: { indexAxis: 'y', maintainAspectRatio: false }
    });

    renderRebalanceTable(estrategia, valorAporte, totalFuturo);
    renderAssetAccordion(detalhe);
}

function renderRebalanceTable(estrategia, aporteTotal, totalFuturo) {
    const body = document.getElementById('rebalanceBody');
    body.innerHTML = "";
    Object.keys(estrategia).forEach(cat => {
        const targetInput = document.querySelector(`.target-input[data-cat="${cat}"]`);
        if (!targetInput) return;
        const targetPerc = parseFloat(targetInput.value) || 0;
        const valorAtual = estrategia[cat] || 0;
        const atualPerc = (valorAtual / (totalPatrimonio || 1)) * 100;
        const valorIdealComAporte = (targetPerc / 100) * totalFuturo;
        const diff = valorIdealComAporte - valorAtual;

        let htmlAcao = "";
        if (diff > 0.01) {
            htmlAcao = aporteTotal > 0 ? `<span class="badge badge-aporte">APORTE</span>` : `<span class="badge badge-ajuste">AJUSTE</span>`;
            htmlAcao += ` <span class="action-text">Alocar <strong>R$ ${diff.toLocaleString('pt-BR')}</strong></span>`;
        } else if (diff < -0.01) {
            htmlAcao = `<span class="badge badge-venda">EXCEDENTE</span> <span class="action-text">Reduzir <strong>R$ ${Math.abs(diff).toLocaleString('pt-BR')}</strong></span>`;
        } else { htmlAcao = "✓ OK"; }
        body.innerHTML += `<tr><td><strong>${cat}</strong></td><td>${atualPerc.toFixed(1)}%</td><td>${targetPerc}%</td><td>${htmlAcao}</td></tr>`;
    });
}

function renderAssetAccordion(detalhe) {
    const container = document.getElementById('accordionAtivos');
    container.innerHTML = "<h3>Detalhamento por Ativo</h3>";
    const sortedCats = Object.keys(detalhe).sort((a, b) => detalhe[b].total - detalhe[a].total);
    sortedCats.forEach(cat => {
        container.innerHTML += `<div class="acc-item"><div class="acc-header" onclick="toggleAcc(this)"><span>${cat}</span><span style="color:#c5a059">R$ ${detalhe[cat].total.toLocaleString('pt-BR')}</span></div><div class="acc-content"><table class="data-table">${detalhe[cat].assets.map(a => `<tr><td>${a.nome}</td><td style="text-align:right">R$ ${a.valor.toLocaleString('pt-BR')}</td></tr>`).join('')}</table></div></div>`;
    });
}

function toggleAcc(el) {
    const content = el.nextElementSibling;
    content.style.display = content.style.display === 'block' ? 'none' : 'block';
}

document.getElementById('excelFile').addEventListener('change', function() {
    if (this.files.length > 0) {
        document.querySelector('label[for="excelFile"]').classList.add('loaded');
        document.querySelector('label[for="excelFile"]').innerText = "✓ Planilha OK";
    }
});
document.getElementById('glossaryFile').addEventListener('change', function() {
    if (this.files.length > 0) {
        document.querySelector('label[for="glossaryFile"]').classList.add('loaded');
        document.querySelector('label[for="glossaryFile"]').innerText = "✓ Glossário OK";
    }
});