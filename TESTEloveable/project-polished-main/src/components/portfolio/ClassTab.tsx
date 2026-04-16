import { Button } from "@/components/ui/button";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { CategoryKey, DetailMap } from "@/lib/portfolio";
import { fmtBRL, fmtPct } from "@/lib/portfolio";
import { Trash2 } from "lucide-react";
import { colorForSubclass } from "@/lib/portfolio-colors";

interface Props {
  category: CategoryKey;
  detalhe: DetailMap;
  onRemove: (cat: CategoryKey, index: number) => void;
}

export function ClassTab({ category, detalhe, onRemove }: Props) {
  const entry = detalhe[category];

  if (!entry || entry.total <= 0) {
    return (
      <div className="surface-1 rounded-lg p-10 text-center text-sm text-muted-foreground border border-border">
        Nenhum ativo nesta categoria.
      </div>
    );
  }

  const subAgg: Record<string, number> = {};
  entry.assets.forEach((a) => {
    subAgg[a.sub] = (subAgg[a.sub] || 0) + a.valor;
  });
  const subData = Object.entries(subAgg).map(([name, value]) => ({ name, value }));

  const sorted = entry.assets.map((a, i) => ({ ...a, _i: i })).sort((a, b) => b.valor - a.valor);

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">
      <div className="surface-1 border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold">{category}</h3>
          <div className="text-right">
            <p className="label-eyebrow">Total na Classe</p>
            <p className="tabular gradient-gold-text font-semibold text-lg">{fmtBRL(entry.total)}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/60">
              <tr>
                <th className="label-eyebrow text-left py-2.5 px-4 font-medium">Ativo</th>
                <th className="label-eyebrow text-left py-2.5 px-4 font-medium">Subclasse</th>
                <th className="label-eyebrow text-right py-2.5 px-4 font-medium">Valor</th>
                <th className="label-eyebrow text-right py-2.5 px-4 font-medium">Peso</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => {
                const peso = (a.valor / entry.total) * 100;
                return (
                  <tr key={a._i} className="border-t border-border/60 hover:bg-surface-2/40">
                    <td className="py-3 px-4 font-medium">{a.nome}</td>
                    <td className="py-3 px-4">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-[10px] tracking-wider border font-semibold"
                        style={{
                          background: `${colorForSubclass(a.sub)}25`,
                          borderColor: `${colorForSubclass(a.sub)}55`,
                          color: colorForSubclass(a.sub),
                        }}
                      >
                        {a.sub}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right tabular">{fmtBRL(a.valor)}</td>
                    <td className="py-3 px-4 text-right tabular text-muted-foreground">{fmtPct(peso)}</td>
                    <td className="py-3 px-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => onRemove(category, a._i)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="surface-1 border border-border rounded-lg p-5">
        <p className="label-eyebrow mb-3">Composição por Subclasse</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={subData} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="88%" paddingAngle={1.5} stroke="hsl(var(--surface-1))" strokeWidth={2}>
                {subData.map((d) => (
                  <Cell key={d.name} fill={colorForSubclass(d.name)} />
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
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="space-y-2 mt-4">
          {subData
            .sort((a, b) => b.value - a.value)
            .map((d) => (
              <li key={d.name} className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-sm" style={{ background: colorForSubclass(d.name) }} />
                <span className="flex-1 text-foreground/90">{d.name}</span>
                <span className="tabular text-muted-foreground">{fmtBRL(d.value, 0)}</span>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
