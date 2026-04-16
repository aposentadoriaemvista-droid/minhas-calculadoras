import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { fmtBRL, fmtPct, type StrategyMap } from "@/lib/portfolio";
import { colorForCategory } from "@/lib/portfolio-colors";

interface Props {
  estrategia: StrategyMap;
  total: number;
}

export function StrategyDonut({ estrategia, total }: Props) {
  const data = (Object.entries(estrategia) as [string, number][])
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0 }));

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-72 text-sm text-muted-foreground">
        Carregue uma carteira para visualizar.
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-[1fr_1.1fr] gap-6 items-center">
      <div className="h-64 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={1.5}
              stroke="hsl(var(--surface-1))"
              strokeWidth={2}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={colorForCategory(d.name)} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="label-eyebrow">Total</p>
          <p className="tabular text-lg font-semibold gradient-gold-text">{fmtBRL(total, 0)}</p>
        </div>
      </div>

      <ul className="space-y-2.5">
        {data
          .sort((a, b) => b.value - a.value)
          .map((d) => (
            <li key={d.name} className="flex items-center gap-3 text-sm">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ background: colorForCategory(d.name) }}
              />
              <span className="flex-1 truncate text-foreground/90">{d.name}</span>
              <span className="tabular text-muted-foreground text-xs">{fmtBRL(d.value, 0)}</span>
              <span className="tabular text-foreground font-medium w-14 text-right">{fmtPct(d.pct)}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}
