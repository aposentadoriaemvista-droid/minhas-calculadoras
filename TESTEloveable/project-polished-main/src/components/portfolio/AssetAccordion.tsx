import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import type { CategoryKey, DetailMap } from "@/lib/portfolio";
import { fmtBRL } from "@/lib/portfolio";
import { Trash2 } from "lucide-react";

interface Props {
  detalhe: DetailMap;
  onRemove: (cat: CategoryKey, index: number) => void;
}

export function AssetAccordion({ detalhe, onRemove }: Props) {
  const cats = (Object.keys(detalhe) as CategoryKey[])
    .filter((c) => (detalhe[c]?.total || 0) > 0)
    .sort((a, b) => (detalhe[b]!.total - detalhe[a]!.total));

  if (cats.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-muted-foreground">
        Nenhum ativo carregado.
      </div>
    );
  }

  return (
    <Accordion type="multiple" className="w-full">
      {cats.map((cat) => {
        const entry = detalhe[cat]!;
        return (
          <AccordionItem key={cat} value={cat} className="border-border">
            <AccordionTrigger className="hover:no-underline group">
              <div className="flex items-center justify-between w-full pr-3">
                <span className="font-medium">{cat}</span>
                <span className="tabular text-sm gradient-gold-text font-semibold">{fmtBRL(entry.total)}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="overflow-x-auto rounded-md border border-border/60">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2/60">
                    <tr>
                      <th className="label-eyebrow text-left py-2 px-3 font-medium">Ativo</th>
                      <th className="label-eyebrow text-left py-2 px-3 font-medium">Subclasse</th>
                      <th className="label-eyebrow text-right py-2 px-3 font-medium">Valor</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.assets
                      .map((a, i) => ({ ...a, _i: i }))
                      .sort((a, b) => b.valor - a.valor)
                      .map((a) => (
                        <tr key={`${cat}-${a._i}`} className="border-t border-border/60 hover:bg-surface-2/40">
                          <td className="py-2 px-3 text-foreground">{a.nome}</td>
                          <td className="py-2 px-3 text-muted-foreground text-xs">{a.sub}</td>
                          <td className="py-2 px-3 text-right tabular">{fmtBRL(a.valor)}</td>
                          <td className="py-2 px-2 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => onRemove(cat, a._i)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
