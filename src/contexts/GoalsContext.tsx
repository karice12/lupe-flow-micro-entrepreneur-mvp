import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { getSupabaseClient } from "@/lib/supabase";

export interface Goals {
  salary: number;
  bills: number;
  emergency: number;
}

interface GoalsContextType {
  userId: string;
  goals: Goals | null;
  isPremium: boolean;
  isAuthReady: boolean;
  setUserId: (id: string) => void;
  setGoals: (g: Goals) => void;
  setIsPremium: (v: boolean) => void;
  signOut: () => Promise<void>;
}

const GoalsContext = createContext<GoalsContextType>({
  userId: "",
  goals: null,
  isPremium: false,
  isAuthReady: false,
  setUserId: () => {},
  setGoals: () => {},
  setIsPremium: () => {},
  signOut: async () => {},
});

export const useGoals = () => useContext(GoalsContext);

export const GoalsProvider = ({ children }: { children: ReactNode }) => {
  const [userId, setUserId] = useState<string>("");
  const [goals, setGoals] = useState<Goals | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    getSupabaseClient().then((sb) => {
      if (!sb) {
        setIsAuthReady(true);
        return;
      }

      sb.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          setUserId(session.user.id);
        }
        setIsAuthReady(true);
      });

      const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          setUserId(session.user.id);
        } else {
          setUserId("");
          setGoals(null);
          setIsPremium(false);
        }
        setIsAuthReady(true);
      });

      unsubscribe = () => subscription.unsubscribe();
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const signOut = async () => {
    const sb = await getSupabaseClient();
    if (sb) await sb.auth.signOut();
    setUserId("");
    setGoals(null);
    setIsPremium(false);
  };

  return (
    <GoalsContext.Provider value={{ userId, goals, isPremium, isAuthReady, setUserId, setGoals, setIsPremium, signOut }}>
      {children}
    </GoalsContext.Provider>
  );
};
