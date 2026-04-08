import { createContext, useContext, useState, ReactNode } from "react";

export interface Goals {
  salary: number;
  bills: number;
  emergency: number;
}

interface GoalsContextType {
  userId: string;
  goals: Goals | null;
  setUserId: (id: string) => void;
  setGoals: (g: Goals) => void;
}

const GoalsContext = createContext<GoalsContextType>({
  userId: "usuario_teste",
  goals: null,
  setUserId: () => {},
  setGoals: () => {},
});

export const useGoals = () => useContext(GoalsContext);

export const GoalsProvider = ({ children }: { children: ReactNode }) => {
  const [userId, setUserId] = useState<string>("usuario_teste");
  const [goals, setGoals] = useState<Goals | null>(null);

  return (
    <GoalsContext.Provider value={{ userId, goals, setUserId, setGoals }}>
      {children}
    </GoalsContext.Provider>
  );
};
