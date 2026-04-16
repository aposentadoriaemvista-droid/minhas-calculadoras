import * as XLSX from "xlsx";

export type CategoryKey =
  | "Renda Variavel Brasil"
  | "Renda Fixa Brasil"
  | "Multimercado"
  | "Renda Variavel Global"
  | "Renda Fixa Global"
  | "Alternativo"
  | "Fundos Imobiliários"
  | "Caixa";

export const CATEGORIES: CategoryKey[] = [
  "Renda Variavel Brasil",
  "Renda Fixa Brasil",
  "Multimercado",
  "Renda Variavel Global",
  "Renda Fixa Global",
  "Alternativo",
  "Fundos Imobiliários",
  "Caixa",
];

export const CATEGORY_SHORT: Record<CategoryKey, string> = {
  "Renda Variavel Brasil": "RV Brasil",
  "Renda Fixa Brasil": "RF Brasil",
  Multimercado: "Multimercado",
  "Renda Variavel Global": "RV Global",
  "Renda Fixa Global": "RF Global",
  Alternativo: "Alternativo",
  "Fundos Imobiliários": "FIIs",
  Caixa: "Caixa",
};

export type SubclassKey =
  | "Pós-fixada"
  | "Prefixada"
  | "Inflação"
  | "Fundo Imobiliário"
  | "Ibov"
  | "Dólar"
  | "Multimercado"
  | "Alternativo";

export interface Asset {
  nome: string;
  valor: number;
  sub: string;
}

export interface DetailEntry {
  total: number;
  assets: Asset[];
}

export type DetailMap = Partial<Record<CategoryKey, DetailEntry>>;
export type StrategyMap = Record<CategoryKey, number>;
export type SubclassMap = Record<string, number>;
export type TargetMap = Record<CategoryKey, number>;

export const emptyStrategy = (): StrategyMap =>
  CATEGORIES.reduce((acc, c) => ({ ...acc, [c]: 0 }), {} as StrategyMap);

export const emptyTargets = (): TargetMap =>
  CATEGORIES.reduce((acc, c) => ({ ...acc, [c]: 0 }), {} as TargetMap);

const norm = (txt: unknown): string =>
  txt ? txt.toString().replace(/\s+/g, " ").trim() : "";

export const cleanV = (v: unknown): number => {
  if (v === undefined || v === null) return 0;
  if (typeof v === "number") return v;
  const s = v.toString().replace("R$", "").replace(/\./g, "").replace(",", ".").trim();
  return parseFloat(s) || 0;
};

const mapToSeven = (subclasseXp: string, ativo: string): CategoryKey => {
  const s = subclasseXp.toLowerCase();
  const a = ativo.toUpperCase();

  if (s.includes("fii") || s.includes("imobiliário") || s.includes("listados")) {
    return "Fundos Imobiliários";
  }

  const base: CategoryKey[] = [
    "Renda Variavel Brasil",
    "Renda Fixa Brasil",
    "Multimercado",
    "Renda Variavel Global",
    "Renda Fixa Global",
    "Alternativo",
    "Caixa",
  ];
  const direct = base.find((c) => c.toLowerCase() === s);
  if (direct) return direct;

  if (a.includes("IVVB11") || a.includes("NASD11") || a.includes("WRLD11") || a.includes("BNDX11"))
    return "Renda Variavel Global";
  if (s.includes("ações") || s.includes("variável brasil") || s.includes("renda variável"))
    return "Renda Variavel Brasil";
  if (
    s.includes("pós-fixado") ||
    s.includes("inflação") ||
    s.includes("fixa") ||
    s.includes("renda fixa") ||
    s.includes("prefixada")
  )
    return "Renda Fixa Brasil";
  if (s.includes("multimercado")) return "Multimercado";
  if (s.includes("alternativo")) return "Alternativo";
  return "Caixa";
};

export function padronizarSubclasse(subRaw: string, categoriaMain: CategoryKey): SubclassKey {
  const s = (subRaw || "").toString().toLowerCase();

  if (s.includes("fii") || s.includes("imobiliári") || s.includes("imobiliari")) return "Fundo Imobiliário";
  if (s.includes("pós") || s.includes("pos") || s.includes("cdi") || s.includes("selic") || s.includes("di"))
    return "Pós-fixada";
  if (s.includes("pré") || s.includes("pre") || s.includes("fixado")) return "Prefixada";
  if (s.includes("ipca") || s.includes("inflação") || s.includes("inflacao") || s.includes("ima-b")) return "Inflação";
  if (s.includes("ibov") || s.includes("açõe") || s.includes("acoe") || s.includes("variável") || s.includes("variavel"))
    return "Ibov";
  if (
    s.includes("dólar") ||
    s.includes("dolar") ||
    s.includes("global") ||
    s.includes("exterior") ||
    s.includes("s&p") ||
    s.includes("nasdaq")
  )
    return "Dólar";
  if (s.includes("multi")) return "Multimercado";
  if (s.includes("alternativo") || s.includes("cripto") || s.includes("coe")) return "Alternativo";

  switch (categoriaMain) {
    case "Fundos Imobiliários":
      return "Fundo Imobiliário";
    case "Renda Fixa Brasil":
      return "Pós-fixada";
    case "Renda Variavel Brasil":
      return "Ibov";
    case "Renda Variavel Global":
    case "Renda Fixa Global":
      return "Dólar";
    case "Multimercado":
      return "Multimercado";
    case "Alternativo":
      return "Alternativo";
    case "Caixa":
      return "Pós-fixada";
    default:
      return "Pós-fixada";
  }
}

const GLOSSARY_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQwj0rEui2phiCxHiXMKh6mR-X2q0VkUQMUgWBNslaYnYuQs3rEfuyuiebd8drxq9n1ZzC_dVnQXVAe/pub?output=csv";

export type Glossary = Record<string, { cat: string; subclasse: string }>;

export async function loadGlossaryFromDrive(): Promise<Glossary> {
  try {
    const response = await fetch(GLOSSARY_URL);
    const data = await response.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    const dict: Glossary = {};
    json.forEach((row) => {
      const ativo = norm(row["Ativos"] || row["ATIVOS"] || row["Ativo"]);
      const classe = row["Classe"] || row["CLASSE"];
      if (ativo) {
        dict[ativo] = {
          cat: classe ? classe.toString().trim() : "",
          subclasse: (row["Subclasse"] as string) || (row["SUBCLASSE"] as string) || "Outros",
        };
      }
    });
    return dict;
  } catch (e) {
    console.error("Erro ao carregar glossário online:", e);
    return {};
  }
}

export interface ParseResult {
  estrategia: StrategyMap;
  subclasses: SubclassMap;
  detalhe: DetailMap;
  total: number;
}

export function analisarCarteira(matrix: any[][], glossary: Glossary): ParseResult {
  const estrategia = emptyStrategy();
  const subclasses: SubclassMap = {};
  const detalhe: DetailMap = {};
  let total = 0;
  let currentXpCategory = "Caixa";
  let colPosicaoIdx = -1;

  matrix.forEach((row) => {
    if (!row || row.length === 0) return;
    const rowStr = row.map((c: unknown) => norm(c));
    const tituloSeccao = row.find((c: unknown) => c && c.toString().includes("|"));
    if (tituloSeccao) currentXpCategory = tituloSeccao.toString().split("|")[1].trim();

    const headValor = ["Posição", "Posição a mercado", "Valor líquido", "Financeiro", "Valor aplicado", "Provisionado"];
    let foundValor = -1;
    for (const v of headValor) {
      const idx = rowStr.indexOf(v);
      if (idx !== -1) {
        foundValor = idx;
        break;
      }
    }
    if (foundValor !== -1) {
      colPosicaoIdx = foundValor;
      return;
    }

    if (currentXpCategory.toLowerCase().includes("proventos")) return;

    if (colPosicaoIdx !== -1) {
      const nomeAtivo = norm(row[0]);
      const valor = cleanV(row[colPosicaoIdx]);
      if (nomeAtivo && valor > 0.01 && !nomeAtivo.includes("|") && !["Ativo", "Total"].includes(nomeAtivo)) {
        const gData = glossary[nomeAtivo];
        const topico: CategoryKey =
          gData && typeof gData === "object" && CATEGORIES.includes(gData.cat as CategoryKey)
            ? (gData.cat as CategoryKey)
            : mapToSeven(currentXpCategory, nomeAtivo);

        const subRaw = gData && typeof gData === "object" && gData.subclasse ? gData.subclasse : currentXpCategory;
        const subNome = padronizarSubclasse(subRaw, topico);

        estrategia[topico] += valor;
        total += valor;
        subclasses[subNome] = (subclasses[subNome] || 0) + valor;

        if (!detalhe[topico]) detalhe[topico] = { total: 0, assets: [] };
        detalhe[topico]!.total += valor;
        detalhe[topico]!.assets.push({ nome: nomeAtivo, valor, sub: subNome });
      }
    }
  });

  return { estrategia, subclasses, detalhe, total };
}

export async function parseExcelFile(file: File): Promise<any[][]> {
  const buf = await file.arrayBuffer();
  const data = new Uint8Array(buf);
  const workbook = XLSX.read(data, { type: "array" });
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }) as any[][];
}

export function recomputeFromDetalhe(detalhe: DetailMap): {
  estrategia: StrategyMap;
  subclasses: SubclassMap;
  total: number;
} {
  const estrategia = emptyStrategy();
  const subclasses: SubclassMap = {};
  let total = 0;

  (Object.keys(detalhe) as CategoryKey[]).forEach((cat) => {
    const entry = detalhe[cat];
    if (!entry) return;
    estrategia[cat] = entry.total;
    total += entry.total;
    entry.assets.forEach((a) => {
      const finalSub = padronizarSubclasse(a.sub, cat);
      subclasses[finalSub] = (subclasses[finalSub] || 0) + a.valor;
    });
  });

  return { estrategia, subclasses, total: Number(total.toFixed(2)) };
}

export const fmtBRL = (v: number, fraction = 2) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: fraction, maximumFractionDigits: fraction })}`;

export const fmtPct = (v: number, fraction = 1) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: fraction, maximumFractionDigits: fraction })}%`;
