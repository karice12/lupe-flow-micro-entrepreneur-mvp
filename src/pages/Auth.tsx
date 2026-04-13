import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Zap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useGoals } from "@/contexts/GoalsContext";
import { LgpdModal, isLgpdAcceptedLocally } from "@/components/LgpdModal";
import { LgpdFooter } from "@/components/LgpdFooter";
import { getSupabaseClient } from "@/lib/supabase";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [pendingDestination, setPendingDestination] = useState<"/dashboard" | "/onboarding">("/onboarding");
  const navigate = useNavigate();
  const { userId, isAuthReady, setGoals, setIsPremium } = useGoals();

  useEffect(() => {
    if (isAuthReady && userId) {
      routeAuthenticatedUser(userId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthReady, userId]);

  const routeAuthenticatedUser = async (uid: string) => {
    try {
      const res = await fetch(`/api/usuario/${encodeURIComponent(uid)}`);
      if (!res.ok) {
        navigate("/dashboard");
        return;
      }
      const data = await res.json();

      if (data.has_goals) {
        setGoals({
          salary: data.salary_goal,
          bills: data.bills_goal,
          emergency: data.emergency_goal,
        });
      }

      setIsPremium(!!data.is_premium);

      const destination: "/dashboard" | "/onboarding" = data.has_goals ? "/dashboard" : "/onboarding";
      const lgpdOk = data.lgpd_accepted || isLgpdAcceptedLocally(uid);

      if (!lgpdOk) {
        setPendingUserId(uid);
        setPendingDestination(destination);
        return;
      }

      navigate(destination);
    } catch {
      navigate("/dashboard");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Preencha todos os campos.");
      return;
    }

    setIsLoading(true);
    try {
      const sb = await getSupabaseClient();
      if (!sb) throw new Error("Serviço de autenticação indisponível. Verifique a configuração do Supabase.");

      if (isLogin) {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
        const uid = data.user?.id;
        if (!uid) throw new Error("Falha ao obter dados do usuário.");
        await routeAuthenticatedUser(uid);
        toast.success("Bem-vindo de volta!");
      } else {
        if (!name.trim()) {
          toast.error("Informe seu nome para criar a conta.");
          return;
        }
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: { data: { full_name: name } },
        });
        if (error) throw new Error(error.message);
        if (data.user && !data.session) {
          toast.success("Conta criada! Verifique seu e-mail para confirmar o cadastro.");
          return;
        }
        const uid = data.user?.id;
        if (!uid) throw new Error("Falha ao criar conta.");
        toast.success("Conta criada! Vamos configurar seu caixa.");
        await routeAuthenticatedUser(uid);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao autenticar.";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLgpdAccepted = () => {
    setPendingUserId(null);
    toast.success("Obrigado! Seus dados estão protegidos.");
    navigate(pendingDestination);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md space-y-8">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2">
              <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
                <Zap className="h-5 w-5 text-primary-foreground" />
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Lupe Flow</h1>
            </div>
            <p className="text-muted-foreground text-sm">Assuma o controle do seu negócio</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <Input
                type="text"
                placeholder="Seu nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-12 rounded-xl bg-card border-border"
                disabled={isLoading}
              />
            )}
            <Input
              type="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 rounded-xl bg-card border-border"
              disabled={isLoading}
              data-testid="input-email"
            />
            <Input
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 rounded-xl bg-card border-border"
              disabled={isLoading}
              data-testid="input-password"
            />
            <Button
              variant="cta"
              size="lg"
              type="submit"
              className="w-full h-12 rounded-xl text-base"
              disabled={isLoading}
              data-testid="button-submit"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isLogin ? "Entrando..." : "Criando conta..."}
                </span>
              ) : isLogin ? "Entrar" : "Criar conta"}
            </Button>
          </form>

          {/* Toggle */}
          <p className="text-center text-sm text-muted-foreground">
            {isLogin ? "Ainda não tem conta? " : "Já tem uma conta? "}
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary font-semibold hover:underline"
              disabled={isLoading}
            >
              {isLogin ? "Cadastre-se" : "Entrar"}
            </button>
          </p>
        </div>
      </div>

      <LgpdFooter />

      {pendingUserId && (
        <LgpdModal
          open={true}
          userId={pendingUserId}
          onAccepted={handleLgpdAccepted}
        />
      )}
    </div>
  );
};

export default Auth;
