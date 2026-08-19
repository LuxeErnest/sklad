import { useMemo } from "react";
import { SearchableSelect, type SelectOption } from "@/components/common/SearchableSelect";
import type { CategoryNode } from "@/lib/db";

interface FilterBarProps {
  categoryTree: CategoryNode[];
  category: string | null;
  onCategory: (v: string | null) => void;
  /** Названия мест хранения, встречающихся в текущем списке. */
  locations: string[];
  location: string | null;
  onLocation: (v: string | null) => void;
}

function flattenCategories(nodes: CategoryNode[], prefix = ""): SelectOption[] {
  const out: SelectOption[] = [];
  nodes.forEach((n) => {
    const path = prefix ? `${prefix} / ${n.name}` : n.name;
    out.push({ value: n.name, label: path });
    if (n.children.length) out.push(...flattenCategories(n.children, path));
  });
  return out;
}

export const FilterBar = ({
  categoryTree,
  category,
  onCategory,
  locations,
  location,
  onLocation,
}: FilterBarProps) => {
  // Список остаётся плоским, вложенность видна по пути через «/»: искать по
  // такому списку можно по любой части пути, а раскрывать ветви не нужно.
  const categoryOptions = useMemo(() => flattenCategories(categoryTree), [categoryTree]);
  const locationOptions = useMemo<SelectOption[]>(
    () => locations.map((l) => ({ value: l, label: l })),
    [locations]
  );

  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <SearchableSelect
        className="min-w-[220px]"
        options={categoryOptions}
        value={category}
        onChange={onCategory}
        emptyLabel="Все категории"
        placeholder="Поиск категории"
        ariaLabel="Фильтр по категории"
      />

      {/*
        Отбор по складу. Список берётся из того, что реально лежит на складах, а
        не из справочника мест хранения: место без единого остатка в этом отборе
        бесполезно — оно ничего не покажет.
      */}
      <SearchableSelect
        className="min-w-[220px]"
        options={locationOptions}
        value={location}
        onChange={onLocation}
        emptyLabel="Все склады"
        placeholder="Поиск склада"
        ariaLabel="Фильтр по складу"
      />
    </div>
  );
};

export default FilterBar;
