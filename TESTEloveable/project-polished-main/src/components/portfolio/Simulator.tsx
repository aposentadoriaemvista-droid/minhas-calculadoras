import { useEffect, useMemo, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { CATEGORIES, type CategoryKey, fmtBRL, type StrategyMap } from "@/lib/portfolio";
import { Bar, BarChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { colorForCategory } from "@/lib/portfolio-colors";
import { cn } from "@/lib/utils";

interface Props {
  estrategia: StrategyMap;
  total: number;
}

export function Simulator({ estrategia, total }: Props) {
  const [deltas, setDeltas] = useState<Record<CategoryKey, number>>(
    () => CATEGORIES.reduce((acc, c) => ({ ...acc, [c]: 0 }), {} as Record<CategoryKey, number>),
  );

  // reset whenever the underlying portfolio changes meaningfully
  useEffect(() => {
    setDeltas(CATEGORIES.reduce((acc, c) => ({ ...acc, [c]: 0 }), {} as Record<CategoryKey, number>));
  }, [total]);

  const simulated = useMemo(() => {
    const out = {} as Record<CategoryKey, number>;
    CATEGORIES.forEach((c) => {
      const v = (estrategia[c] || 0) + (deltas[c] || 0);
      out[c] = v < 0 ? 0 : v;
    });
    return out;
  }, [estrategia, deltas]);

  const aporteEfetivo = useMemo(
    () => CATEGORIES.reduce((sum, c) => sum + (simulated[c] - (estrategia[c] || 0)), 0),
    [simulated, estrategia],
  );
  const totalSim = total + aporteEfetivo;

  const compareData = CATEGORIES.map((c) => ({
    name: c,
    Atual: estrategia[c] || 0,
    Simulado: simulated[c],
  })).filter((d) => d.Atual > 0 || d.Simulado > 0);

  const pieData = CATEGORIES.filter((c) => simulated[c] > 0).map((c) => ({
    name: c,
    value: simulated[c],
  }));

  return (
    <div className="grid lg:grid-cols-[400px_1fr] gap-8">
      <div className="space-y-4">
        {CATEGORIES.map((cat) => {
          const original = estrategia[cat] || 0;
          const delta = deltas[cat] || 0;
          const max = Math.max(1_000_000, Math.ceil(original * 2));
          const sign = delta > 0 ? "+" : "";
          return (
            <div key={cat} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground/90 font-medium">{cat}</span>
                <span
                  className={cn(
                    "tabular font-semibold",
                    delta > 0 && "text-success",
                    delta < 0 && "text-destructive",
                    delta === 0 && "text-muted-foreground",
                  )}
                >
                  {sign}
                  {fmtBRL(delta, 0)}
                </span>
              </div>
              <Slider
                min={-Math.floor(original)}
                max={max}
                step={500}
                value={[delta]}
                onValueChange={([v]) => setDeltas((d) => ({ ...d, [cat]: v }))}
                disabled={total === 0}
              />
            </div>
          );
        })}
        <div className="border-t border-border pt-4 mt-4 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Aporte Efetivo</span>
            <span className="tabular font-semibold text-primary">{fmtBRL(aporteEfetivo)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Patrimônio Final</span>
            <span className="tabular font-semibold gradient-gold-text">{fmtBRL(totalSim)}</span>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <p className="label-eyebrow mb-3">Comparativo Atual × Simulado</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compareData} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
                <XAxis dataKey="name" hide />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--surface-2))" }}
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => fmtBRL(v, 0)}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Atual" fill="hsl(var(--muted-foreground) / 0.5)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Simulado" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <p className="label-eyebrow mb-3">Nova Composição</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="90%" paddingAngle={1.5} stroke="hsl(var(--surface-1))" strokeWidth={2}>
                  {pieData.map((d) => (
                    <Cell key={d.name} fill={colorForCategory(d.name)} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number, n: string) => [fmtBRL(v, 0), n]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="square" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
