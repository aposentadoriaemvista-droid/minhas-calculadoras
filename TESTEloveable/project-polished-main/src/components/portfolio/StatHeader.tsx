import { fmtBRL } from "@/lib/portfolio";
import { Wallet, User, FileSpreadsheet, Layers } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Stat {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
}

export function StatHeader({
  total,
  assetCount,
  hasData,
}: {
  total: number;
  assetCount: number;
  hasData: boolean;
}) {
  const stats: Stat[] = [
    { label: "Patrimônio Total", value: hasData ? fmtBRL(total) : "—", icon: Wallet, accent: true },
    { label: "Conta XP", value: "Carteira Local", icon: User },
    { label: "Ativos", value: hasData ? String(assetCount) : "—", icon: Layers },
    {
      label: "Última Análise",
      value: hasData ? new Date().toLocaleDateString("pt-BR") : "—",
      icon: FileSpreadsheet,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border rounded-lg overflow-hidden shadow-card">
      {stats.map((s) => (
        <div key={s.label} className="surface-1 p-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="label-eyebrow mb-2">{s.label}</p>
            <p
              className={`tabular text-xl lg:text-2xl font-semibold tracking-tight truncate ${
                s.accent ? "gradient-gold-text" : "text-foreground"
              }`}
            >
              {s.value}
            </p>
          </div>
          <s.icon className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
        </div>
      ))}
    </div>
  );
}
