import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface FilterBarProps {
  categories: string[];
  category: string | null;
  onCategory: (v: string | null) => void;
}

export const FilterBar = ({ categories, category, onCategory }: FilterBarProps) => {
  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-[220px]">
        <Select value={category ?? "all"} onValueChange={(v) => onCategory(v === "all" ? null : v)}>
          <SelectTrigger aria-label="Фильтр по категории">
            <SelectValue placeholder="Категория" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все категории</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default FilterBar;
