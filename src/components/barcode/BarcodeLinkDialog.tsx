import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Plus, Link2 } from "lucide-react";
import { InventoryItem } from "@/components/inventory/InventoryTable";

interface BarcodeLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Отсканированный код, которого нет ни у одной позиции. */
  barcode: string;
  items: InventoryItem[];
  /** Привязать код к существующей позиции. */
  onLink: (item: InventoryItem) => void;
  /** Завести новую позицию с этим кодом. */
  onCreateNew: () => void;
}

/**
 * Что делать с незнакомым штрихкодом.
 *
 * Товар на складе может быть заведён давно и без кода — тогда первое
 * сканирование должно не плодить вторую карточку, а привязать код к уже
 * существующей позиции. После этого все последующие сканирования этого кода
 * будут сразу попадать в неё.
 */
export const BarcodeLinkDialog = ({
  open,
  onOpenChange,
  barcode,
  items,
  onLink,
  onCreateNew,
}: BarcodeLinkDialogProps) => {
  const [search, setSearch] = useState("");

  const found = useMemo(() => {
    const needle = search.trim().toLowerCase();
    // Позиции, у которых уже есть свой код, не предлагаем: перепривязка — это
    // отдельное осознанное действие, а не побочный эффект сканирования.
    const free = items.filter((i) => !i.barcode);
    if (!needle) return free.slice(0, 30);
    return free
      .filter(
        (i) =>
          i.name.toLowerCase().includes(needle) ||
          (i.category ?? "").toLowerCase().includes(needle)
      )
      .slice(0, 30);
  }, [items, search]);

  const close = () => {
    setSearch("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : close())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Штрихкод не привязан</DialogTitle>
          <DialogDescription>
            Код <span className="font-mono font-medium">{barcode}</span> встречается впервые.
            Найдите товар, к которому его привязать, — дальше сканирование будет сразу вести
            к нему. Или заведите новую позицию.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию или категории"
              className="pl-9"
            />
          </div>

          {found.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {items.some((i) => !i.barcode)
                ? "Ничего не найдено — измените запрос"
                : "У всех товаров на складе уже есть штрихкоды"}
            </p>
          ) : (
            <ScrollArea className="h-64 rounded-md border">
              <div className="p-1">
                {found.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onLink(item)}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.category || "Без категории"}
                        {item.location ? ` · ${item.location}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline">{item.quantity} шт.</Badge>
                      <Link2 className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={close}>
            Отмена
          </Button>
          <Button type="button" onClick={onCreateNew}>
            <Plus className="mr-2 h-4 w-4" />
            Это новый товар
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BarcodeLinkDialog;
