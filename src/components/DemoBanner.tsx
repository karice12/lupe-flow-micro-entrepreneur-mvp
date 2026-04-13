import { useDemo } from "@/contexts/DemoContext";

export const DemoBanner = () => {
  const { isDemoMode } = useDemo();

  if (!isDemoMode) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 bg-black border-b-2 border-amber-500 text-white text-xs font-semibold text-center py-2 px-4 flex items-center justify-center gap-2"
      style={{ zIndex: 9999 }}
    >
      <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
      <span className="text-amber-400">Modo Demonstração Ativo:</span>
      <span className="text-white/80">
        Os dados serão perdidos ao atualizar a página.
      </span>
    </div>
  );
};
