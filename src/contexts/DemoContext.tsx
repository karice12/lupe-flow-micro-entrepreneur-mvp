import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import {
  installDemoInterceptor,
  uninstallDemoInterceptor,
} from "@/lib/demoInterceptor";

interface DemoContextType {
  isDemoMode: boolean;
  activateDemo: () => void;
  deactivateDemo: () => void;
}

const DemoContext = createContext<DemoContextType>({
  isDemoMode: false,
  activateDemo: () => {},
  deactivateDemo: () => {},
});

export const useDemo = () => useContext(DemoContext);

export const DemoProvider = ({ children }: { children: ReactNode }) => {
  const [isDemoMode, setIsDemoMode] = useState(false);

  const activateDemo = useCallback(() => {
    installDemoInterceptor();
    setIsDemoMode(true);
  }, []);

  const deactivateDemo = useCallback(() => {
    uninstallDemoInterceptor();
    setIsDemoMode(false);
  }, []);

  return (
    <DemoContext.Provider value={{ isDemoMode, activateDemo, deactivateDemo }}>
      {children}
    </DemoContext.Provider>
  );
};
