import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Search } from "lucide-react";

interface TopBarProps {
  search: string;
  onSearch: (v: string) => void;
  summary?: { name: string; quantity: number; location: string; category: string } | null;
}

export const TopBar = ({ search, onSearch, summary }: TopBarProps) => {
  return (
    <header className="w-full sticky top-0 z-10 bg-background/80 backdrop-blur border-b">
      <div className="container mx-auto px-4 py-3 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-60" />
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Поиск по складу"
            aria-label="Поиск"
            className="pl-10"
          />
        </div>
        <Button variant="hero">Найти</Button>
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
};

export default TopBar;
