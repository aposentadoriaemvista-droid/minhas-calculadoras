import { useCallback, useMemo, useState } from "react";
import {
  analisarCarteira,
  CATEGORIES,
  type CategoryKey,
  type DetailMap,
  emptyStrategy,
  emptyTargets,
  loadGlossaryFromDrive,
  padronizarSubclasse,
  parseExcelFile,
  recomputeFromDetalhe,
  type StrategyMap,
  type SubclassMap,
  type TargetMap,
} from "@/lib/portfolio";
import { toast } from "sonner";

export interface PortfolioState {
  detalhe: DetailMap;
  estrategia: StrategyMap;
  subclasses: SubclassMap;
  total: number;
  targets: TargetMap;
  aporte: number;
  glossaryLoaded: boolean;
  loading: boolean;
}

const initial: PortfolioState = {
  detalhe: {},
  estrategia: emptyStrategy(),
  subclasses: {},
  total: 0,
  targets: emptyTargets(),
  aporte: 0,
  glossaryLoaded: false,
  loading: false,
};

export function usePortfolio() {
  const [state, setState] = useState<PortfolioState>(initial);

  const setTarget = useCallback((cat: CategoryKey, value: number) => {
    setState((s) => ({ ...s, targets: { ...s.targets, [cat]: value } }));
  }, []);

  const setAporte = useCallback((value: number) => {
    setState((s) => ({ ...s, aporte: value }));
  }, []);

  const processFile = useCallback(async (file: File) => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const [matrix, glossary] = await Promise.all([parseExcelFile(file), loadGlossaryFromDrive()]);
      const result = analisarCarteira(matrix, glossary);
      setState((s) => ({
        ...s,
        detalhe: result.detalhe,
        estrategia: result.estrategia,
        subclasses: result.subclasses,
        total: result.total,
        glossaryLoaded: Object.keys(glossary).length > 0,
        loading: false,
      }));
      toast.success("Carteira analisada com sucesso");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao processar a planilha");
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  const addAsset = useCallback((classe: CategoryKey, nome: string, sub: string, valor: number) => {
    setState((s) => {
      const detalhe: DetailMap = { ...s.detalhe };
      if (!detalhe[classe]) detalhe[classe] = { total: 0, assets: [] };
      detalhe[classe] = {
        total: detalhe[classe]!.total + valor,
        assets: [...detalhe[classe]!.assets, { nome, valor, sub }],
      };
      const r = recomputeFromDetalhe(detalhe);
      return { ...s, detalhe, ...r };
    });
    toast.success("Ativo adicionado");
  }, []);

  const removeAsset = useCallback((classe: CategoryKey, index: number) => {
    setState((s) => {
      const detalhe: DetailMap = { ...s.detalhe };
      const entry = detalhe[classe];
      if (!entry) return s;
      const assets = entry.assets.filter((_, i) => i !== index);
      const total = assets.reduce((sum, a) => sum + a.valor, 0);
      detalhe[classe] = { total, assets };
      const r = recomputeFromDetalhe(detalhe);
      return { ...s, detalhe, ...r };
    });
    toast.success("Ativo removido");
  }, []);

  const exportProject = useCallback(() => {
    const projeto = {
      detalhe: state.detalhe,
      subclasses: state.subclasses,
      targets: state.targets,
      total: state.total,
      portfolioBase: state.estrategia,
      aporte: state.aporte,
      dataExportacao: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(projeto, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `projeto_carteira_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Carteira exportada");
  }, [state]);

  const importProject = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const projeto = JSON.parse(e.target?.result as string);
        const detalhe: DetailMap = projeto.detalhe || {};
        // sanitize: ensure subclass standardized
        (Object.keys(detalhe) as CategoryKey[]).forEach((cat) => {
          const entry = detalhe[cat];
          if (entry) entry.assets = entry.assets.map((a) => ({ ...a, sub: padronizarSubclasse(a.sub, cat) }));
        });
        const r = recomputeFromDetalhe(detalhe);
        const targets: TargetMap = { ...emptyTargets(), ...(projeto.targets || {}) };
        // numeric coercion
        (Object.keys(targets) as CategoryKey[]).forEach((c) => {
          targets[c] = Number(targets[c]) || 0;
        });
        setState((s) => ({
          ...s,
          detalhe,
          ...r,
          targets,
          aporte: Number(projeto.aporte) || 0,
        }));
        toast.success("Carteira carregada");
      } catch (err) {
        console.error(err);
        toast.error("Arquivo inválido");
      }
    };
    reader.readAsText(file);
  }, []);

  const targetsSum = useMemo(
    () => CATEGORIES.reduce((sum, c) => sum + (Number(state.targets[c]) || 0), 0),
    [state.targets],
  );

  return { state, setTarget, setAporte, processFile, addAsset, removeAsset, exportProject, importProject, targetsSum };
}
