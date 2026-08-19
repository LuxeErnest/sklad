import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { ScrollArea } from "@/components/ui/scroll-area";
import { getSupplyRecordsByComponentId, getScrappedItemsByComponentId, getComponentPaths } from "@/lib/db";
import { Package, Truck, Trash2, Calendar } from "lucide-react";

interface ProductHistoryModalsProps {
  componentId: number;
  componentName: string;
  suppliesOpen: boolean;
  scrapOpen: boolean;
  movementsOpen: boolean;
  onSuppliesClose: () => void;
  onScrapClose: () => void;
  onMovementsClose: () => void;
}

export function ProductHistoryModals({
  componentId,
  componentName,
  suppliesOpen,
  scrapOpen,
  movementsOpen,
  onSuppliesClose,
  onScrapClose,
  onMovementsClose,
}: ProductHistoryModalsProps) {
  // Формы строк берутся из самих функций слоя данных: описывать их здесь
  // заново значило бы завести вторую версию того же описания.
  const [supplies, setSupplies] = useState<
    Awaited<ReturnType<typeof getSupplyRecordsByComponentId>>
  >([]);
  const [scrapItems, setScrapItems] = useState<
    Awaited<ReturnType<typeof getScrappedItemsByComponentId>>
  >([]);
  const [movements, setMovements] = useState<
    Awaited<ReturnType<typeof getComponentPaths>>
  >([]);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    if (suppliesOpen && componentId) {
      setLoading("supplies");
      getSupplyRecordsByComponentId(componentId)
        .then((rows) => setSupplies(rows || []))
        .finally(() => setLoading(null));
    }
  }, [suppliesOpen, componentId]);

  useEffect(() => {
    if (scrapOpen && componentId) {
      setLoading("scrap");
      getScrappedItemsByComponentId(componentId)
        .then(setScrapItems)
        .finally(() => setLoading(null));
    }
  }, [scrapOpen, componentId]);

  useEffect(() => {
    if (movementsOpen && componentId) {
      setLoading("movements");
      getComponentPaths(componentId)
        .then((paths) => {
          setMovements((paths || []).filter((p) => p.stepType === "transfer"));
        })
        .finally(() => setLoading(null));
    }
  }, [movementsOpen, componentId]);

  const formatDate = (d: string) => {
    if (!d) return "—";
    try {
      const date = new Date(d);
      return date.toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return d;
    }
  };

  return (
    <>
      <Dialog open={suppliesOpen} onOpenChange={(v) => !v && onSuppliesClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              История поставок — {componentName}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[400px] pr-4">
            {loading === "supplies" ? (
              <p className="text-muted-foreground text-sm">Загрузка…</p>
            ) : supplies.length === 0 ? (
              <p className="text-muted-foreground text-sm">Нет записей о поставках</p>
            ) : (
              <ul className="space-y-3">
                {supplies.map((s) => (
                  <li key={s.id} className="rounded border p-3 text-sm">
                    <div className="font-medium">+{s.quantity} шт.</div>
                    {s.location && <div className="text-muted-foreground">Склад: {s.location}</div>}
                    <div className="mt-2 flex flex-wrap gap-2 text-muted-foreground">
                      {s.suppliedAt && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {formatDate(s.suppliedAt)}
                        </span>
                      )}
                      {s.suppliedBy && <span>Кто: {s.suppliedBy}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={scrapOpen} onOpenChange={(v) => !v && onScrapClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              История списаний — {componentName}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[400px] pr-4">
            {loading === "scrap" ? (
              <p className="text-muted-foreground text-sm">Загрузка…</p>
            ) : scrapItems.length === 0 ? (
              <p className="text-muted-foreground text-sm">Нет записей о списаниях</p>
            ) : (
              <ul className="space-y-3">
                {scrapItems.map((s) => (
                  <li key={s.id} className="rounded border p-3 text-sm">
                    <div className="font-medium">Списано: {s.quantity} шт.</div>
                    {s.reason && <div className="text-muted-foreground mt-1">{s.reason}</div>}
                    <div className="mt-2 flex flex-wrap gap-2 text-muted-foreground">
                      {s.scrappedAt && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {formatDate(s.scrappedAt)}
                        </span>
                      )}
                      {s.scrappedBy && <span>Кто: {s.scrappedBy}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={movementsOpen} onOpenChange={(v) => !v && onMovementsClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              История перемещений — {componentName}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[400px] pr-4">
            {loading === "movements" ? (
              <p className="text-muted-foreground text-sm">Загрузка…</p>
            ) : movements.length === 0 ? (
              <p className="text-muted-foreground text-sm">Нет записей о перемещениях</p>
            ) : (
              <ul className="space-y-3">
                {movements.map((s) => (
                  <li key={s.id} className="rounded border p-3 text-sm">
                    <div className="font-medium">{s.stepName}</div>
                    {s.stepDescription && <div className="text-muted-foreground">{s.stepDescription}</div>}
                    <div className="mt-2 flex flex-wrap gap-2 text-muted-foreground">
                      {s.stepDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {formatDate(s.stepDate)}
                        </span>
                      )}
                      {s.stepLocation && <span>{s.stepLocation}</span>}
                      {s.stepQuantity != null && <span>Кол-во: {s.stepQuantity}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
