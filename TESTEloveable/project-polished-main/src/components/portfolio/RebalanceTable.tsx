import { CATEGORIES, type CategoryKey, fmtBRL, fmtPct, type StrategyMap, type TargetMap } from "@/lib/portfolio";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, Check } from "lucide-react";

interface Props {
  estrategia: StrategyMap;
  targets: TargetMap;
  total: number;
  aporte: number;
}

export function RebalanceTable({ estrategia, targets, total, aporte }: Props) {
  const totalFuturo = total + aporte;
  const rows = CATEGORIES.map((cat) => {
    const targetPerc = Number(targets[cat]) || 0;
    const valorAtual = estrategia[cat] || 0;
    const atualPerc = total > 0 ? (valorAtual / total) * 100 : 0;
    const valorIdeal = (targetPerc / 100) * totalFuturo;
    const diff = valorIdeal - valorAtual;
    return { cat, targetPerc, valorAtual, atualPerc, diff };
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="label-eyebrow text-left py-2.5 pr-3 font-medium">Categoria</th>
            <th className="label-eyebrow text-right py-2.5 px-3 font-medium">Atual</th>
            <th className="label-eyebrow text-right py-2.5 px-3 font-medium">Alvo</th>
            <th className="label-eyebrow text-right py-2.5 pl-3 font-medium">Ação Sugerida</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ cat, targetPerc, atualPerc, diff }) => {
            const isOk = Math.abs(diff) < 0.01;
            const isAporte = diff > 0.01 && aporte > 0;
            const isAjuste = diff > 0.01 && aporte === 0;
            const isExcedente = diff < -0.01;

            return (
              <tr key={cat} className="border-b border-border/50 last:border-0 hover:bg-surface-2/40 transition-colors">
                <td className="py-3 pr-3 font-medium text-foreground">{cat}</td>
                <td className="py-3 px-3 text-right tabular text-muted-foreground">{fmtPct(atualPerc)}</td>
                <td className="py-3 px-3 text-right tabular text-foreground">{fmtPct(targetPerc, 0)}</td>
                <td className="py-3 pl-3 text-right">
                  {isOk ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-success">
                      <Check className="w-3.5 h-3.5" /> Equilibrado
                    </span>
                  ) : (
                    <div className="inline-flex items-center gap-2">
                      <Badge type={isAporte ? "aporte" : isAjuste ? "ajuste" : "excedente"} />
                      <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                        {isExcedente ? (
                          <ArrowDown className="w-3 h-3 text-destructive" />
                        ) : (
                          <ArrowUp className="w-3 h-3 text-success" />
                        )}
                        <span className="tabular text-foreground">{fmtBRL(Math.abs(diff), 0)}</span>
                      </span>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Badge({ type }: { type: "aporte" | "ajuste" | "excedente" }) {
  const map = {
    aporte: { label: "APORTE", cls: "bg-primary/15 text-primary border-primary/30" },
    ajuste: { label: "AJUSTE", cls: "bg-gold/15 text-gold border-gold/30" },
    excedente: { label: "EXCEDENTE", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  } as const;
  const { label, cls } = map[type];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider border",
        cls,
      )}
    >
      {label}
    </span>
  );
}
