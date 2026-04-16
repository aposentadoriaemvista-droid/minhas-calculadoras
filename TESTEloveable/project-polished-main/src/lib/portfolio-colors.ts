import type { CategoryKey, SubclassKey } from "@/lib/portfolio";

export const CATEGORY_COLORS: Record<CategoryKey, string> = {
  "Renda Variavel Brasil": "hsl(var(--chart-1))",
  "Renda Fixa Brasil": "hsl(var(--chart-2))",
  Multimercado: "hsl(var(--chart-5))",
  "Renda Variavel Global": "hsl(var(--chart-4))",
  "Renda Fixa Global": "hsl(var(--chart-7))",
  Alternativo: "hsl(var(--chart-6))",
  "Fundos Imobiliários": "hsl(var(--chart-3))",
  Caixa: "hsl(var(--chart-8))",
};

export const SUBCLASS_COLORS: Record<string, string> = {
  "Pós-fixada": "hsl(var(--chart-7))",
  Prefixada: "hsl(var(--chart-4))",
  Inflação: "hsl(var(--chart-2))",
  "Fundo Imobiliário": "hsl(var(--chart-3))",
  Ibov: "hsl(var(--chart-1))",
  Dólar: "hsl(var(--chart-5))",
  Multimercado: "hsl(var(--chart-6))",
  Alternativo: "hsl(var(--chart-8))",
};

export const colorForCategory = (c: string) =>
  CATEGORY_COLORS[c as CategoryKey] || "hsl(var(--muted-foreground))";

export const colorForSubclass = (s: string) =>
  SUBCLASS_COLORS[s] || "hsl(var(--muted-foreground))";
