import { useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePortfolio } from "@/hooks/usePortfolio";
import { CATEGORIES, CATEGORY_SHORT, fmtBRL, type CategoryKey } from "@/lib/portfolio";
import { PortfolioSidebar } from "@/components/portfolio/PortfolioSidebar";
import { StatHeader } from "@/components/portfolio/StatHeader";
import { StrategyDonut } from "@/components/portfolio/StrategyDonut";
import { RebalanceTable } from "@/components/portfolio/RebalanceTable";
import { SubclassBar } from "@/components/portfolio/SubclassBar";
import { AssetAccordion } from "@/components/portfolio/AssetAccordion";
import { Simulator } from "@/components/portfolio/Simulator";
import { ClassTab } from "@/components/portfolio/ClassTab";
import { AddAssetDialog } from "@/components/portfolio/AddAssetDialog";
import { toast } from "sonner";

const Index = () => {
  const {
    state,
    setTarget,
    setAporte,
    processFile,
    addAsset,
    removeAsset,
    exportProject,
    importProject,
    targetsSum,
  } = usePortfolio();

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [addOpen, setAddOpen] = useState(false);
  const dashRef = useRef<HTMLDivElement>(null);

  const assetCount = (Object.keys(state.detalhe) as CategoryKey[]).reduce(
    (n, c) => n + (state.detalhe[c]?.assets.length || 0),
    0,
  );

  const handleUpload = (file: File) => {
    setPendingFile(file);
    setFileName(file.name);
    toast(`Arquivo ${file.name} pronto. Clique em "Analisar".`);
  };

  const handleAnalyze = () => {
    if (pendingFile) processFile(pendingFile);
    else toast.error("Importe um Excel antes de analisar.");
  };

  const handleExportPdf = async () => {
    if (!dashRef.current) return;
    if (state.total === 0) {
      toast.error("Nada para exportar. Carregue uma carteira.");
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const html2pdf = (await import("html2pdf.js")).default as any;
      toast("Gerando PDF — aguarde...");
      const opt = {
        margin: 8,
        filename: `Relatorio_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#0A0E1A" },
        jsPDF: { unit: "mm", format: "a3", orientation: "landscape" },
      };
      await html2pdf().set(opt).from(dashRef.current).save();
      toast.success("PDF gerado");
    } catch (e) {
      console.error(e);
      toast.error("Falha ao gerar PDF");
    }
  };

  const hasData = state.total > 0;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <PortfolioSidebar
        glossaryLoaded={state.glossaryLoaded}
        loading={state.loading}
        hasFile={!!pendingFile || hasData}
        fileName={fileName}
        targets={state.targets}
        targetsSum={targetsSum}
        aporte={state.aporte}
        onUpload={handleUpload}
        onAporteChange={setAporte}
        onTargetChange={setTarget}
        onSave={exportProject}
        onLoad={importProject}
        onExportPdf={handleExportPdf}
        onAddAsset={() => setAddOpen(true)}
        onAnalyze={handleAnalyze}
      />

      <main className="flex-1 min-w-0 overflow-x-hidden">
        <header className="px-8 py-6 border-b border-border surface-1/40">
          <p className="label-eyebrow">Análise de Portfólio</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Visão Estratégica da Carteira</h1>
        </header>

        <div ref={dashRef} className="px-8 py-6 space-y-6 animate-fade-in">
          <StatHeader total={state.total} assetCount={assetCount} hasData={hasData} />

          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="bg-surface-1 border border-border h-auto p-1 flex-wrap justify-start">
              <TabsTrigger value="overview" className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
                Visão Geral
              </TabsTrigger>
              {CATEGORIES.map((c) => (
                <TabsTrigger
                  key={c}
                  value={c}
                  className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary text-xs"
                >
                  {CATEGORY_SHORT[c]}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview" className="space-y-6 mt-6">
              <div className="grid lg:grid-cols-12 gap-6">
                <Card className="lg:col-span-5" title="Estratégia de Alocação">
                  <StrategyDonut estrategia={state.estrategia} total={state.total} />
                </Card>
                <Card
                  className="lg:col-span-7"
                  title="Plano de Execução"
                  subtitle={
                    state.aporte > 0
                      ? `Considerando aporte de ${fmtBRL(state.aporte, 0)}`
                      : "Defina alvos para gerar recomendações"
                  }
                >
                  <RebalanceTable
                    estrategia={state.estrategia}
                    targets={state.targets}
                    total={state.total}
                    aporte={state.aporte}
                  />
                </Card>
              </div>

              <Card title="Exposição por Subclasse" subtitle="Indexadores agregados">
                <SubclassBar subclasses={state.subclasses} total={state.total} />
              </Card>

              <Card title="Detalhamento por Ativo">
                <AssetAccordion detalhe={state.detalhe} onRemove={removeAsset} />
              </Card>

              <Card title="Simulador Iterativo" subtitle="Movimente os controles para projetar uma nova alocação">
                <Simulator estrategia={state.estrategia} total={state.total} />
              </Card>
            </TabsContent>

            {CATEGORIES.map((c) => (
              <TabsContent key={c} value={c} className="mt-6">
                <ClassTab category={c} detalhe={state.detalhe} onRemove={removeAsset} />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </main>

      <AddAssetDialog open={addOpen} onOpenChange={setAddOpen} onAdd={addAsset} />
    </div>
  );
};

function Card({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`surface-1 border border-border rounded-lg shadow-card ${className ?? ""}`}
    >
      <header className="px-5 py-4 border-b border-border/60 flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default Index;
