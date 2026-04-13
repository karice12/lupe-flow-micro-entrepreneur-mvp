import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GoalsProvider } from "@/contexts/GoalsContext";
import { DemoProvider } from "@/contexts/DemoContext";
import { DemoBanner } from "@/components/DemoBanner";
import Auth from "./pages/Auth.tsx";
import Onboarding from "./pages/Onboarding.tsx";
import Dashboard from "./pages/Index.tsx";
import Transactions from "./pages/Transactions.tsx";
import PaymentSuccess from "./pages/PaymentSuccess.tsx";
import PaymentFailure from "./pages/PaymentFailure.tsx";
import Demo from "./pages/Demo.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <GoalsProvider>
      <DemoProvider>
        <TooltipProvider>
          <DemoBanner />
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Auth />} />
              <Route path="/demo" element={<Demo />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/pagamento-sucesso" element={<PaymentSuccess />} />
              <Route path="/pagamento-falha" element={<PaymentFailure />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </DemoProvider>
    </GoalsProvider>
  </QueryClientProvider>
);

export default App;
