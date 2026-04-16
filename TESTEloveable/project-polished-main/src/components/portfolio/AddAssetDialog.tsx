import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, type CategoryKey } from "@/lib/portfolio";
import { toast } from "sonner";

const SUBCLASSES = [
  "Prefixada",
  "Pós-fixada",
  "Inflação",
  "Ibov",
  "Dólar",
  "Multimercado",
  "Alternativo",
  "Fundo Imobiliário",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (cat: CategoryKey, nome: string, sub: string, valor: number) => void;
}

export function AddAssetDialog({ open, onOpenChange, onAdd }: Props) {
  const [nome, setNome] = useState("");
  const [classe, setClasse] = useState<CategoryKey>("Renda Variavel Brasil");
  const [sub, setSub] = useState("");
  const [valor, setValor] = useState("");

  const handleSave = () => {
    const v = parseFloat(valor);
    if (!nome.trim() || !sub || !v || v <= 0) {
      toast.error("Preencha todos os campos");
      return;
    }
    onAdd(classe, nome.trim(), sub, v);
    setNome("");
    setSub("");
    setValor("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="surface-1 border-border">
        <DialogHeader>
          <DialogTitle>Adicionar Ativo Manual</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome do Ativo</Label>
            <Input id="nome" placeholder="Ex: PETR4" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Classe</Label>
            <Select value={classe} onValueChange={(v) => setClasse(v as CategoryKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Subclasse</Label>
            <Select value={sub} onValueChange={setSub}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {SUBCLASSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="valor">Valor (R$)</Label>
            <Input
              id="valor"
              type="number"
              inputMode="decimal"
              placeholder="0,00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar Ativo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
