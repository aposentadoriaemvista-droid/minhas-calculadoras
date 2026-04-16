
## Analisador Pro XP — Refinamento Visual Premium

Vou migrar a aplicação para a stack do projeto (React + TypeScript + Tailwind + shadcn/ui + Recharts) preservando 100% da lógica de negócio (parsing do Excel da XP, glossário do Google Sheets, mapeamento das 8 classes, rebalanceamento, simulador, salvar/abrir JSON, exportar PDF, adicionar ativo manual). O foco é elevar a interface para um padrão **dark premium institucional** — estilo private banking / Bloomberg.

### Direção de design
- **Paleta dark sóbria**: fundo grafite profundo (`#0A0E1A`), superfícies em camadas (`#111827` / `#1A2236`), bordas sutis. Acento azul petróleo + dourado discreto para valores monetários.
- **Tipografia**: Inter para UI, números tabulares (`font-variant-numeric: tabular-nums`) em todos os valores R$ e %.
- **Hierarquia**: títulos finos, labels em uppercase com letter-spacing, valores grandes em peso semibold — sem "neon", glow ou cores berrantes.
- **Espaçamento generoso** e cantos suaves (radius 12px), divisores ao invés de bordas pesadas.

### Estrutura da nova UI

**1. Sidebar refinada (esquerda)**
- Logo "XP Analyzer" no topo, status do glossário com indicador discreto.
- Seções colapsáveis enumeradas: Dados, Gestão de Projeto, Aporte, Gestão Manual, Alocação Alvo.
- Botões em variantes shadcn (`ghost`/`outline`), ícones lucide-react no lugar de emojis.
- Inputs de alocação alvo em grid 2 colunas com soma total exibida em rodapé (alerta se ≠ 100%).

**2. Header do dashboard**
- Stat cards em linha: Patrimônio Total, Conta XP, Última atualização, Nº de ativos — com microvariações tipográficas e separadores.

**3. Abas (tabs shadcn)**
- "Visão Geral" + uma aba por classe; aba ativa com indicador animado fluido.

**4. Visão Geral — layout de 12 colunas**
- **Esquerda (5 col)**: gráfico donut da estratégia atual (Recharts) com legenda lateral mostrando valor + %.
- **Direita (7 col)**: tabela "Plano de Execução" com badges refinadas (APORTE / AJUSTE / EXCEDENTE) — pílulas discretas com fundo translúcido, sem cores saturadas.
- **Linha 2 (full width)**: gráfico de barras horizontais "Exposição por Subclasse" com tooltip rico.
- **Linha 3**: Detalhamento por Ativo — Accordion shadcn com tabela interna sortable, botão de exclusão sutil (ícone trash, hover destrutivo).
- **Linha 4**: Simulador Iterativo — sliders shadcn com labels "+R$ X / -R$ Y" coloridos discretamente, comparativo Atual vs Simulado em barras agrupadas + donut simulado lado a lado.

**5. Abas por classe** — exibirão tabela de ativos da classe + mini-donut de subclasses + total da classe.

**6. Modal "Adicionar Ativo Manual"** — Dialog shadcn com Select estilizado, validação de campos.

### Funcionalidades preservadas (sem alteração na lógica)
- Upload `.xlsx/.xls/.csv` com parsing via `xlsx` (SheetJS)
- Carregamento do glossário online via Google Sheets CSV
- Mapeamento inteligente das 8 categorias e padronização de subclasses
- Cálculo de rebalanceamento com aporte
- Salvar/Abrir carteira em JSON
- Exportar relatório em PDF (`html2pdf.js`)
- Adicionar/excluir ativos manualmente
- Simulador interativo com sliders

### Implementação
1. Configurar design tokens no `index.css` e `tailwind.config.ts` (paleta dark premium, raios, sombras suaves).
2. Instalar `xlsx` e `html2pdf.js`; usar `recharts` (já compatível) para todos os gráficos.
3. Estruturar em `src/pages/Index.tsx` + componentes: `Sidebar`, `StatHeader`, `StrategyDonut`, `RebalanceTable`, `SubclassBar`, `AssetAccordion`, `Simulator`, `ClassTab`, `AddAssetDialog`.
4. Mover toda a lógica de parsing/mapeamento para `src/lib/portfolio.ts` (funções puras tipadas).
5. Estado global via hook `usePortfolio` (sem backend — tudo client-side, persistência por download/upload de JSON como hoje).
6. Manter textos em PT-BR e formatação `pt-BR` para R$ e %.

Resultado: mesma ferramenta, visual de produto institucional.
