import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AppProvider } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { setupGlobalErrorHandlers } from "@/utils/errorHandler";
import { useEffect } from "react";
// import { useGlassmorphism } from "@/hooks/useGlassmorphism";
import Index from "./pages/Index";
import Calculator from "./pages/Calculator";
import Edit from "./pages/Edit";
import Configurations from "./pages/Configurations";
import Documents from "./pages/Documents";
import Journal from "./pages/Journal";
import SettingsPage from "./pages/Settings";
import ProductCardPage from "./pages/ProductCard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  // useGlassmorphism hook disabled for now

  // Настройка глобальных обработчиков ошибок
  useEffect(() => {
    setupGlobalErrorHandlers();
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <AppProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/calculator" element={<Calculator />} />
                  <Route path="/edit" element={<Edit />} />
                  <Route path="/configurations" element={<Configurations />} />
                  <Route path="/documents" element={<Documents />} />
                  <Route path="/journal" element={<Journal />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/item/:id" element={<ProductCardPage />} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </AppProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
