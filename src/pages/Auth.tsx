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
      if (!res.ok) return;
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
      // silent — don't block the UI if status check fails
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

  const handleGoogle = async () => {
    setIsLoading(true);
    try {
      const sb = await getSupabaseClient();
      if (!sb) throw new Error("Serviço de autenticação indisponível.");
      const { error } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw new Error(error.message);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao autenticar com Google.";
      toast.error(message);
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

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">ou</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Google */}
          <Button
            variant="outline"
            size="lg"
            onClick={handleGoogle}
            className="w-full h-12 rounded-xl text-sm border-border"
            disabled={isLoading}
            data-testid="button-google"
          >
            <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Entrar com o Google
          </Button>

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
