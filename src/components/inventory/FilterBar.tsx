import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CategoryNode } from "@/lib/db";

interface FilterBarProps {
  categoryTree: CategoryNode[];
  category: string | null;
  onCategory: (v: string | null) => void;
}

function flattenCategories(nodes: CategoryNode[], prefix = ""): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  nodes.forEach((n) => {
    out.push({ value: n.name, label: prefix ? `${prefix} / ${n.name}` : n.name });
    if (n.children.length) out.push(...flattenCategories(n.children, prefix ? `${prefix} / ${n.name}` : n.name));
  });
  return out;
}

export const FilterBar = ({ categoryTree, category, onCategory }: FilterBarProps) => {
  const flat = flattenCategories(categoryTree);

  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-[220px]">
        <Select value={category ?? "all"} onValueChange={(v) => onCategory(v === "all" ? null : v)}>
          <SelectTrigger aria-label="Фильтр по категории">
            <SelectValue placeholder="Категория" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все категории</SelectItem>
            {flat.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default FilterBar;
