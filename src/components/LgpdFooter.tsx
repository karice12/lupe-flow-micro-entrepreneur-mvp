import { Lock } from "lucide-react";

export function LgpdFooter() {
  return (
    <footer className="flex items-center justify-center gap-1.5 py-4 px-4">
      <Lock className="h-3 w-3 text-muted-foreground/60 shrink-0" />
      <p className="text-xs text-muted-foreground/60 text-center">
        Lupe Flow utiliza criptografia de ponta a ponta e está em conformidade com a LGPD.
      </p>
    </footer>
  );
}
