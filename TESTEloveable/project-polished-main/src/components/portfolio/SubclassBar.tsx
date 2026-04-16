import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtBRL, fmtPct, type SubclassMap } from "@/lib/portfolio";
import { colorForSubclass } from "@/lib/portfolio-colors";

interface Props {
  subclasses: SubclassMap;
  total: number;
}

export function SubclassBar({ subclasses, total }: Props) {
  const data = Object.entries(subclasses)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({
      name,
      value,
      pct: total > 0 ? (value / total) * 100 : 0,
    }));

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        Sem dados de exposição.
      </div>
    );
  }

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 60, top: 4, bottom: 4 }}>
          <XAxis type="number" hide />
          <YAxis
            dataKey="name"
            type="category"
            axisLine={false}
            tickLine={false}
            width={130}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--surface-2))" }}
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
              color: "hsl(var(--foreground))",
            }}
            formatter={(value: number) => [fmtBRL(value), "Valor"]}
            labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 11 }}
          />
          <Bar dataKey="value" radius={[4, 4, 4, 4]} barSize={18} label={{
            position: "right",
            fill: "hsl(var(--foreground))",
            fontSize: 11,
            formatter: (v: number) => fmtPct((v / total) * 100),
          }}>
            {data.map((d) => (
              <Cell key={d.name} fill={colorForSubclass(d.name)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
