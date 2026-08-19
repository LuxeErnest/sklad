import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/theme/ThemeToggle";
import GlassmorphismWrapper from "@/components/theme/GlassmorphismWrapper";
import { SearchWithTagAutocomplete } from "@/components/search/SearchWithTagAutocomplete";
import { ScanLine } from "lucide-react";

interface TopBarProps {
  search: string;
  onSearch: (v: string) => void;
  summary?: { name: string; quantity: number; location: string; category: string } | null;
  onBarcodeScan?: () => void;
  tags?: { id: number; name: string }[];
}

export const TopBar = ({ search, onSearch, summary, onBarcodeScan, tags = [] }: TopBarProps) => {
  const [isGlassmorphism, setIsGlassmorphism] = useState(false);

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

  const topBarContent = (
    <header className="w-full sticky top-0 z-10 bg-background/80 backdrop-blur border-b">
      <div className="container mx-auto px-4 py-3 flex items-center gap-3">
        <SearchWithTagAutocomplete
          value={search}
          onChange={onSearch}
          tags={tags}
          placeholder="Поиск: название, описание, #тег. Пример: #Медный или #ГОСТ"
        />
        {onBarcodeScan && (
          <Button 
            variant="outline" 
            onClick={onBarcodeScan}
            title="Сканировать штрихкод"
          >
            <ScanLine className="h-4 w-4" />
          </Button>
        )}
        <ThemeToggle />
      </div>
      {summary && (
        <div className="container mx-auto px-4 pb-3 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          <Badge variant="secondary" className="justify-start h-9">{summary.name} • {summary.quantity} шт.</Badge>
          <Badge variant="secondary" className="justify-start h-9">Расположение: {summary.location}</Badge>
          <Badge variant="secondary" className="justify-start h-9">Категория: {summary.category}</Badge>
        </div>
      )}
    </header>
  );

  return isGlassmorphism ? (
    <GlassmorphismWrapper variant="topbar" className="w-full sticky top-0 z-10">
      {topBarContent}
    </GlassmorphismWrapper>
  ) : topBarContent;
};

export default TopBar;
