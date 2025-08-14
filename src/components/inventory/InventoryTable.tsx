import { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface InventoryItem {
  id: number;
  name: string;
  quantity: number;
  category: string;
  location: string;
  price?: number;
  url?: string;
  description?: string;
  lastUpdated?: string;
}

interface InventoryTableProps {
  items: InventoryItem[];
  search: string;
  categoryFilter: string | null;
  selectedItem?: InventoryItem | null;
  onSelectItem?: (item: InventoryItem) => void;
}

export const InventoryTable = ({ items, search, categoryFilter, selectedItem, onSelectItem }: InventoryTableProps) => {
  type SortKey = "name" | "category" | "quantity" | "lastUpdated";
  type SortDir = "asc" | "desc";

  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const filtered = useMemo(() => {
    return items.filter((i) => {
      const matchSearch = [i.name, i.category, i.location].join(" ").toLowerCase().includes(search.toLowerCase());
      const matchCategory = !categoryFilter || i.category === categoryFilter;
      return matchSearch && matchCategory;
    });
  }, [items, search, categoryFilter]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let res = 0;
      switch (sortKey) {
        case "name":
          res = a.name.localeCompare(b.name);
          break;
        case "category":
          res = a.category.localeCompare(b.category);
          break;
        case "quantity":
          res = a.quantity - b.quantity;
          break;
        case "lastUpdated": {
          const at = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
          const bt = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
          res = at - bt;
          break;
        }
      }
      return sortDir === "asc" ? res : -res;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const setSort = (key: SortKey) => {
    setSortDir((prev) => (sortKey === key ? (prev === "asc" ? "desc" : "asc") : "asc"));
    setSortKey(key);
  };

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>№</TableHead>
            <TableHead
              className="cursor-pointer select-none"
              onClick={() => setSort("name")}
            >
              Имя {sortKey === "name" ? (sortDir === "asc" ? "▲" : "▼") : ""}
            </TableHead>
            <TableHead
              className="cursor-pointer select-none"
              onClick={() => setSort("category")}
            >
              Категория {sortKey === "category" ? (sortDir === "asc" ? "▲" : "▼") : ""}
            </TableHead>
            <TableHead
              className="cursor-pointer select-none"
              onClick={() => setSort("quantity")}
            >
              Кол-во {sortKey === "quantity" ? (sortDir === "asc" ? "▲" : "▼") : ""}
            </TableHead>
            <TableHead>Расположение</TableHead>
            <TableHead
              className="cursor-pointer select-none"
              onClick={() => setSort("lastUpdated")}
            >
              Дата {sortKey === "lastUpdated" ? (sortDir === "asc" ? "▲" : "▼") : ""}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((i, idx) => (
            <TableRow 
              key={i.id} 
              className={`hover:bg-accent/40 cursor-pointer transition-colors ${
                selectedItem?.id === i.id ? 'bg-accent/60' : ''
              }`}
              onClick={() => onSelectItem?.(i)}
            >
              <TableCell>{idx + 1}</TableCell>
              <TableCell className="font-medium">{i.name}</TableCell>
              <TableCell>{i.category}</TableCell>
              <TableCell>{i.quantity}</TableCell>
              <TableCell>{i.location}</TableCell>
              <TableCell>{i.lastUpdated ?? "—"}</TableCell>
            </TableRow>
          ))}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                Ничего не найдено
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default InventoryTable;
