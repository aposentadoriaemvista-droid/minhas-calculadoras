import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATEGORIES, CATEGORY_SHORT, type CategoryKey, type TargetMap } from "@/lib/portfolio";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Download,
  FilePlus2,
  FileText,
  FolderOpen,
  Loader2,
  PlayCircle,
  Plus,
  TrendingUp,
  Upload,
  XCircle,
} from "lucide-react";

interface Props {
  glossaryLoaded: boolean;
  loading: boolean;
  hasFile: boolean;
  fileName?: string;
  targets: TargetMap;
  targetsSum: number;
  aporte: number;
  onUpload: (file: File) => void;
  onAporteChange: (v: number) => void;
  onTargetChange: (cat: CategoryKey, v: number) => void;
  onSave: () => void;
  onLoad: (file: File) => void;
  onExportPdf: () => void;
  onAddAsset: () => void;
  onAnalyze: () => void;
}

export function PortfolioSidebar(props: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const sumOk = Math.abs(props.targetsSum - 100) < 0.01;

  return (
    <aside className="w-[320px] shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-sidebar-border flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-sidebar-foreground tracking-tight">XP Analyzer</p>
          <p className="text-[10px] text-muted-foreground tracking-wider uppercase">Portfolio Pro</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Section title="01 · Dados">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) props.onUpload(f);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => fileRef.current?.click()}
            disabled={props.loading}
          >
            {props.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {props.hasFile ? "Recarregar Excel" : "Importar Excel XP"}
          </Button>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {props.glossaryLoaded ? (
              <CheckCircle2 className="w-3 h-3 text-success" />
            ) : (
              <XCircle className="w-3 h-3 text-muted-foreground" />
            )}
            Glossário online {props.glossaryLoaded ? "ativo" : "não carregado"}
          </div>
        </Section>

        <Section title="02 · Gestão de Projeto">
          <input
            ref={importRef}
            type="file"
            accept=".json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) props.onLoad(f);
              e.target.value = "";
            }}
          />
          <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={props.onSave}>
            <Download className="w-4 h-4" /> Salvar Carteira
          </Button>
          <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => importRef.current?.click()}>
            <FolderOpen className="w-4 h-4" /> Abrir Carteira
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 border-gold/40 text-gold hover:bg-gold/10 hover:text-gold"
            onClick={props.onExportPdf}
          >
            <FileText className="w-4 h-4" /> Exportar PDF
          </Button>
        </Section>

        <Section title="03 · Aporte Planejado">
          <div className="rounded-md border border-border surface-2 p-3 space-y-2">
            <p className="label-eyebrow">Valor (R$)</p>
            <Input
              type="number"
              inputMode="decimal"
              value={props.aporte}
              onChange={(e) => props.onAporteChange(parseFloat(e.target.value) || 0)}
              className="bg-background border-border tabular text-base h-9"
            />
          </div>
        </Section>

        <Section title="04 · Gestão Manual">
          <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={props.onAddAsset}>
            <Plus className="w-4 h-4" /> Adicionar Ativo
          </Button>
        </Section>

        <Section title="05 · Alocação Alvo">
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((cat) => (
              <div key={cat} className="rounded-md border border-border surface-2 px-2.5 py-1.5">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground truncate">{CATEGORY_SHORT[cat]}</p>
                <Input
                  type="number"
                  value={props.targets[cat] ?? 0}
                  onChange={(e) => props.onTargetChange(cat, parseFloat(e.target.value) || 0)}
                  className="bg-transparent border-0 px-0 h-6 tabular text-sm font-semibold focus-visible:ring-0"
                />
              </div>
            ))}
          </div>
          <div
            className={cn(
              "flex items-center justify-between text-xs px-1 mt-1",
              sumOk ? "text-success" : "text-warning",
            )}
          >
            <span>Soma das metas</span>
            <span className="tabular font-semibold">{props.targetsSum.toFixed(0)}%</span>
          </div>
        </Section>
      </div>

      <div className="p-4 border-t border-sidebar-border">
        <Button className="w-full gap-2" onClick={props.onAnalyze} disabled={!props.hasFile}>
          <PlayCircle className="w-4 h-4" /> Analisar e Rebalancear
        </Button>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4 border-b border-sidebar-border/60 space-y-2.5">
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">{title}</p>
      {children}
    </div>
  );
}
