import { useMemo, useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
  imageUrl?: string;
  imageBase64?: string;
  barcode?: string;
  tags?: string[];
  /** Элемент — конфигурация (id на складе отрицательный: -configurationId) */
  itemType?: "component" | "configuration";
  configurationId?: number;
}

const PAGE_SIZE_OPTIONS = [10, 30, 50];
const DEFAULT_PAGE_SIZE = 50;

/** Parses search: text (name/description/barcode) + #tag1 #tag2 (AND) and " или " for OR */
function matchSearchQuery(query: string, item: InventoryItem): boolean {
  const q = (query || "").trim();
  if (!q) return true;
  const orParts = q.split(/\s+или\s+/i).map((s) => s.trim()).filter(Boolean);
  const textParts: string[] = [];
  const tagAndGroups: string[][] = [];
  orParts.forEach((part) => {
    const tokens = part.split(/\s+/).filter(Boolean);
    const tags: string[] = [];
    tokens.forEach((t) => {
      if (t.startsWith("#")) tags.push(t.slice(1).trim());
      else textParts.push(t);
    });
    if (tags.length) tagAndGroups.push(tags);
  });
  const textQuery = [...new Set(textParts)].join(" ").toLowerCase();
  const itemTags = (item.tags || []).map((x) => x.toLowerCase());
  const itemText = [item.name, item.description || "", item.barcode || "", (item.tags || []).join(" ")].join(" ").toLowerCase();
  const matchText = !textQuery || itemText.includes(textQuery);
  if (tagAndGroups.length === 0) return matchText;
  const matchOr = tagAndGroups.some((andTags) =>
    andTags.every((tag) => itemTags.some((t) => t.includes(tag.toLowerCase()) || tag.toLowerCase().includes(t)))
  );
  return matchText && matchOr;
}

interface InventoryTableProps {
  items: InventoryItem[];
  search: string;
  /** Allowed category names (when filtering by category; parent includes descendants). Null = all */
  categoryFilterNames: string[] | null;
  selectedItem?: InventoryItem | null;
  onSelectItem?: (item: InventoryItem) => void;
  pageSizeOptions?: number[];
  defaultPageSize?: number;
  /** Зарезервировано в конфигурациях (componentId -> кол-во). Если задано, в колонке показывается доступно = quantity - reserved */
  reservedQuantities?: Record<number, number>;
}

export const InventoryTable = ({
  items,
  search,
  categoryFilterNames,
  selectedItem,
  onSelectItem,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  defaultPageSize = DEFAULT_PAGE_SIZE,
  reservedQuantities = {},
}: InventoryTableProps) => {
  const getAvailable = (i: InventoryItem) => i.quantity - (reservedQuantities[i.id] ?? 0);
  const getReserved = (i: InventoryItem) => reservedQuantities[i.id] ?? 0;
  type SortKey = "name" | "category" | "quantity" | "lastUpdated";
  type SortDir = "asc" | "desc";

  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    try {
      const saved = localStorage.getItem("inventory_page_size");
      if (saved) {
        const n = parseInt(saved, 10);
        if (pageSizeOptions.includes(n)) return n;
      }
    } catch {}
    return defaultPageSize;
  });

  const filtered = useMemo(() => {
    return items.filter((i) => {
      const matchCategory = !categoryFilterNames || categoryFilterNames.length === 0 || categoryFilterNames.includes(i.category);
      const matchSearch = matchSearchQuery(search, i);
      return matchSearch && matchCategory;
    });
  }, [items, search, categoryFilterNames]);


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
        case "quantity": {
          const qA = Object.keys(reservedQuantities).length ? getAvailable(a) : a.quantity;
          const qB = Object.keys(reservedQuantities).length ? getAvailable(b) : b.quantity;
          res = qA - qB;
          break;
        }
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
  }, [filtered, sortKey, sortDir, reservedQuantities]);

  const setSort = (key: SortKey) => {
    setSortDir((prev) => (sortKey === key ? (prev === "asc" ? "desc" : "asc") : "asc"));
    setSortKey(key);
  };

  const totalCount = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const start = (page - 1) * pageSize;
  const paginated = useMemo(() => sorted.slice(start, start + pageSize), [sorted, start, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const handlePageSizeChange = (v: string) => {
    const n = parseInt(v, 10);
    setPageSize(n);
    setPage(1);
    try {
      localStorage.setItem("inventory_page_size", String(n));
    } catch {}
  };

  return (
    <div className="rounded-lg border bg-card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
        <span className="text-sm text-muted-foreground">
          Всего {totalCount} изделий · Страница {page} из {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">На странице:</span>
          <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>№</TableHead>
            <TableHead>Изображение</TableHead>
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
              Кол-во (шт.) {sortKey === "quantity" ? (sortDir === "asc" ? "▲" : "▼") : ""}
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
          {paginated.map((i, idx) => (
            <TableRow 
              key={i.id} 
              className={`hover:bg-accent/40 cursor-pointer transition-all duration-200 hover:scale-[1.01] ${
                selectedItem?.id === i.id ? 'bg-accent/60 shadow-md' : ''
              }`}
              onClick={() => onSelectItem?.(i)}
            >
              <TableCell>{start + idx + 1}</TableCell>
              <TableCell>
                {i.itemType === "configuration" ? (
                  <div className="w-12 h-12 bg-primary/10 rounded border flex items-center justify-center text-primary">
                    <Package className="h-6 w-6" />
                  </div>
                ) : (i.imageUrl || i.imageBase64) ? (
                  <img 
                    src={i.imageBase64 || i.imageUrl} 
                    alt={i.name}
                    className="w-12 h-12 object-cover rounded border transition-transform duration-200 hover:scale-110"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-12 h-12 bg-muted rounded border flex items-center justify-center text-muted-foreground text-xs transition-colors duration-200 hover:bg-muted/80">
                    Нет фото
                  </div>
                )}
              </TableCell>
              <TableCell className="font-medium">
                {i.name}
                {i.itemType === "configuration" && (
                  <Badge variant="secondary" className="ml-2 text-xs">Конфигурация</Badge>
                )}
              </TableCell>
              <TableCell>{i.category}</TableCell>
              <TableCell>
                {i.itemType === "configuration"
                  ? `${i.quantity} шт.`
                  : Object.keys(reservedQuantities).length
                    ? getReserved(i) > 0
                      ? (
                          <span title={`Всего ${i.quantity} шт., в конфигурациях ${getReserved(i)} шт.`}>
                            {getAvailable(i)} шт. <span className="text-muted-foreground text-xs">(в конфиг. {getReserved(i)})</span>
                          </span>
                        )
                      : `${getAvailable(i)} шт.`
                    : `${i.quantity} шт.`
                }
              </TableCell>
              <TableCell>{i.location}</TableCell>
              <TableCell>{i.lastUpdated ?? "—"}</TableCell>
            </TableRow>
          ))}
          {paginated.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                Ничего не найдено
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" /> Предыдущая
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, k) => {
              let p: number;
              if (totalPages <= 5) p = k + 1;
              else if (page <= 3) p = k + 1;
              else if (page >= totalPages - 2) p = totalPages - 4 + k;
              else p = page - 2 + k;
              return (
                <Button
                  key={p}
                  variant={page === p ? "default" : "outline"}
                  size="sm"
                  className="w-9"
                  onClick={() => setPage(p)}
                >
                  {p}
                </Button>
              );
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Следующая <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default InventoryTable;
