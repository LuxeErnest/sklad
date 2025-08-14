import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Pencil, Calculator, Settings, FileText, Wrench, Home } from "lucide-react";

export const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

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
    if (location.pathname === "/") {
      // If we're on the main page, trigger the add dialog
      const event = new CustomEvent('openAddDialog');
      window.dispatchEvent(event);
    } else {
      // If we're on another page, navigate to main page and then trigger add
      navigate("/");
      setTimeout(() => {
        const event = new CustomEvent('openAddDialog');
        window.dispatchEvent(event);
      }, 100);
    }
  };

  return (
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
        <Item 
          icon={Calculator} 
          label="Калькулятор" 
          onClick={() => navigate("/calculator")} 
          isActive={location.pathname === "/calculator"}
        />
        <Item 
          icon={Wrench} 
          label="Конфигурации" 
          onClick={() => navigate("/configurations")} 
          isActive={location.pathname === "/configurations"}
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
};

export default Sidebar;
