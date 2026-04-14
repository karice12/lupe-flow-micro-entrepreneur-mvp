import { Lock } from "lucide-react";
import { Link } from "react-router-dom";

export function LgpdFooter() {
  return (
    <footer className="flex flex-col items-center gap-2 py-4 px-4">
      <div className="flex items-center justify-center gap-1.5">
        <Lock className="h-3 w-3 text-muted-foreground/60 shrink-0" />
        <p className="text-xs text-muted-foreground/60 text-center">
          Lupe Flow utiliza criptografia de ponta a ponta e está em conformidade com a LGPD.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Link
          to="/termos"
          className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          Termos de Uso
        </Link>
        <span className="text-muted-foreground/30 text-xs">·</span>
        <Link
          to="/privacidade"
          className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          Política de Privacidade
        </Link>
      </div>
    </footer>
  );
}
