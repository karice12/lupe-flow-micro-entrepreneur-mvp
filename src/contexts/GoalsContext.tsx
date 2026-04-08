import { createContext, useContext, useState, ReactNode } from "react";

export interface Goals {
  salary: number;
  bills: number;
  emergency: number;
}

interface GoalsContextType {
  goals: Goals | null;
  setGoals: (g: Goals) => void;
}

const GoalsContext = createContext<GoalsContextType>({
  goals: null,
  setGoals: () => {},
});

export const useGoals = () => useContext(GoalsContext);

export const GoalsProvider = ({ children }: { children: ReactNode }) => {
  const [goals, setGoals] = useState<Goals | null>(null);
  return (
    <GoalsContext.Provider value={{ goals, setGoals }}>
      {children}
    </GoalsContext.Provider>
  );
};
