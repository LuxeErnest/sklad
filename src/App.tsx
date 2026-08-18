import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { HashRouter, Routes, Route } from "react-router-dom";
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
            {/*
              Роутер стоит выше AppProvider намеренно. Раньше было наоборот, и
              из-за этого внутри контекста был недоступен useNavigate — переходы
              приходилось делать через window.location.href, то есть полной
              перезагрузкой страницы с потерей всего состояния.

              HashRouter, а не BrowserRouter: в собранном приложении страницы
              отдаёт не сервер, а протокол Tauri, и переход по обычному пути
              при перезагрузке упирается в отсутствие такого файла.
            */}
            <HashRouter>
              <AppProvider>
                <Toaster />
                <Sonner />
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
              </AppProvider>
            </HashRouter>
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
