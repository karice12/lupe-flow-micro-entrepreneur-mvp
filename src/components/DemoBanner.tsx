import { useDemo } from "@/contexts/DemoContext";

export const DemoBanner = () => {
  const { isDemoMode, deactivateDemo } = useDemo();

  if (!isDemoMode) return null;

  const handleCreateAccount = () => {
    deactivateDemo();
    window.location.href = "/";
  };

  return (
    <div
      className="fixed top-0 left-0 right-0 bg-black border-b-2 border-amber-500 text-white text-xs font-semibold py-2 px-4 flex items-center justify-between gap-2"
      style={{ zIndex: 9999 }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-400 animate-pulse" />
        <span className="text-amber-400 shrink-0 hidden sm:inline">Modo Demonstração Ativo:</span>
        <span className="text-amber-400 shrink-0 sm:hidden">Demo Ativa</span>
        <span className="text-white/80 truncate hidden sm:inline">
          Os dados serão perdidos ao atualizar a página.
        </span>
      </div>

      <button
        onClick={handleCreateAccount}
        className="shrink-0 bg-white text-black font-bold text-xs px-3 py-1 rounded-md hover:bg-amber-400 hover:text-black transition-colors whitespace-nowrap"
      >
        <span className="hidden sm:inline">SALVAR MEUS DADOS E CRIAR CONTA REAL</span>
        <span className="sm:hidden">CRIAR CONTA</span>
      </button>
    </div>
  );
};
