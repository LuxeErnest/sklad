import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import GlassmorphismWrapper from "@/components/theme/GlassmorphismWrapper";
import SimpleCalculator from "@/components/calculator/SimpleCalculator";
import { Plus, Pencil, Calculator, Settings, FileText, Wrench, Home, Hash, ScrollText } from "lucide-react";
import { useApp } from "@/contexts/AppContext";

export const Sidebar = () => {
  const { navigateToAdd } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [isGlassmorphism, setIsGlassmorphism] = useState(false);
  const [isSimpleCalculatorOpen, setIsSimpleCalculatorOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const checkTheme = () => {
      const isGlass = document.documentElement.classList.contains('glassmorphism-theme');
      setIsGlassmorphism(isGlass);
    };

    checkTheme();
    
    // Слушаем изменения темы
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { 
      attributes: true, 
      attributeFilter: ['class'] 
    });

    return () => observer.disconnect();
  }, []);

  const Item = ({ 
    icon: Icon, 
    label, 
    onClick, 
    isActive = false 
  }: { 
    icon: any; 
    label: string; 
    onClick?: () => void;
    isActive?: boolean;
  }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button 
          variant={isActive ? "default" : "secondary"} 
          size="icon" 
          className={cn(
            "w-10 h-10", 
            !collapsed && "w-full justify-start px-3",
            isActive && "bg-primary text-primary-foreground"
          )}
          onClick={onClick} 
          aria-label={label}
        >
          <Icon className="shrink-0" />
          {!collapsed && <span className="ml-3 text-sm">{label}</span>}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );

  const handleAddClick = () => {
    navigateToAdd();
  };

  const sidebarContent = (
    <aside className={cn("h-screen sticky top-0 p-3 border-r bg-background", collapsed ? "w-16" : "w-64")}
      aria-label="Левая панель навигации">
      <div className="flex items-center justify-between mb-4">
        {!collapsed && <span className="font-semibold tracking-wide">Склад</span>}
        <Button variant="outline" size="icon" onClick={() => setCollapsed(!collapsed)} aria-label="Свернуть/развернуть">
          {collapsed ? ">" : "<"}
        </Button>
      </div>
      <nav className="grid gap-2">
        <Item 
          icon={Home} 
          label="Склад" 
          onClick={() => navigate("/")} 
          isActive={location.pathname === "/"}
        />
        <Item 
          icon={Plus} 
          label="Добавить" 
          onClick={handleAddClick} 
        />
        <Item 
          icon={Pencil} 
          label="Изменить" 
          onClick={() => navigate("/edit")} 
          isActive={location.pathname === "/edit"}
        />
        <div className="relative">
          <Item 
            icon={Calculator} 
            label="Статистика" 
            onClick={() => navigate("/calculator")} 
            isActive={location.pathname === "/calculator"}
          />
          {!collapsed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute -top-1 -right-1 w-6 h-6 bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => setIsSimpleCalculatorOpen(true)}
                >
                  <Hash className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Простой калькулятор</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <Item 
          icon={Wrench} 
          label="Конфигурации" 
          onClick={() => navigate("/configurations")} 
          isActive={location.pathname === "/configurations"}
        />
        <Item 
          icon={ScrollText} 
          label="Журнал" 
          onClick={() => navigate("/journal")} 
          isActive={location.pathname === "/journal"}
        />
        <Item 
          icon={FileText} 
          label="Документы" 
          onClick={() => navigate("/documents")} 
          isActive={location.pathname === "/documents"}
        />
        <Item 
          icon={Settings} 
          label="Настройки" 
          onClick={() => navigate("/settings")} 
          isActive={location.pathname === "/settings"}
        />
      </nav>
    </aside>
  );

  return (
    <>
      {isGlassmorphism ? (
        <GlassmorphismWrapper variant="sidebar" className="h-screen sticky top-0">
          {sidebarContent}
        </GlassmorphismWrapper>
      ) : sidebarContent}
      
      <SimpleCalculator 
        isOpen={isSimpleCalculatorOpen} 
        onClose={() => setIsSimpleCalculatorOpen(false)} 
      />
    </>
  );
};

export default Sidebar;
