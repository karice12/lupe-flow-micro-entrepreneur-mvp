import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface LgpdModalProps {
  open: boolean;
  userId: string;
  onAccepted: () => void;
}

const LGPD_KEY = (userId: string) => `lgpd_accepted_${userId}`;

export function saveLgpdLocally(userId: string) {
  try {
    localStorage.setItem(LGPD_KEY(userId), "true");
  } catch {}
}

export function isLgpdAcceptedLocally(userId: string): boolean {
  try {
    return localStorage.getItem(LGPD_KEY(userId)) === "true";
  } catch {
    return false;
  }
}

export function LgpdModal({ open, userId, onAccepted }: LgpdModalProps) {
  const [checked, setChecked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleAccept = async () => {
    if (!checked) return;
    setIsSaving(true);
    try {
      await fetch(`/api/usuario/${encodeURIComponent(userId)}/consent`, {
        method: "POST",
      });
    } catch {
      // non-blocking — localStorage fallback handles it
    } finally {
      saveLgpdLocally(userId);
      setIsSaving(false);
      onAccepted();
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="bg-card border-border max-w-md mx-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle className="text-foreground text-lg font-extrabold leading-tight">
              Termos de Uso e Privacidade
            </DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground text-sm leading-relaxed">
            Antes de continuar, leia como o Lupe Flow trata seus dados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed max-h-48 overflow-y-auto pr-1 border border-border rounded-lg p-3 bg-background/50">
          <p>
            <strong className="text-foreground">1. Coleta de Dados</strong><br />
            O Lupe Flow coleta dados financeiros (metas de receita, saldos por categoria) exclusivamente para fins de gestão de fluxo de caixa do microempreendedor.
          </p>
          <p>
            <strong className="text-foreground">2. Finalidade</strong><br />
            Seus dados são utilizados para calcular a divisão automática de recebimentos nas categorias Salário, Contas e Reserva de Emergência, conforme as metas por você definidas.
          </p>
          <p>
            <strong className="text-foreground">3. Conformidade com a LGPD</strong><br />
            O tratamento de dados segue a Lei Geral de Proteção de Dados (Lei nº 13.709/2018). Seus dados não são compartilhados com terceiros sem sua autorização expressa.
          </p>
          <p>
            <strong className="text-foreground">4. Segurança</strong><br />
            Todas as comunicações são protegidas com criptografia TLS. Os dados são armazenados em banco de dados seguro (Supabase / PostgreSQL).
          </p>
          <p>
            <strong className="text-foreground">5. Seus Direitos</strong><br />
            Você pode solicitar a exclusão ou portabilidade dos seus dados a qualquer momento pelo suporte.
          </p>
        </div>

        <div className="flex items-start gap-3 pt-1">
          <Checkbox
            id="lgpd-check"
            checked={checked}
            onCheckedChange={(v) => setChecked(!!v)}
            className="mt-0.5 border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
          <label
            htmlFor="lgpd-check"
            className="text-sm text-foreground cursor-pointer leading-snug"
          >
            Aceito os <span className="text-primary font-semibold">Termos de Uso</span> e a{" "}
            <span className="text-primary font-semibold">Política de Privacidade</span> conforme a LGPD.
          </label>
        </div>

        <Button
          variant="cta"
          size="lg"
          className="w-full h-12 rounded-xl text-base"
          disabled={!checked || isSaving}
          onClick={handleAccept}
          data-testid="button-lgpd-accept"
        >
          {isSaving ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Salvando...
            </span>
          ) : (
            "Continuar"
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
