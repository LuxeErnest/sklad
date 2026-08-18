import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Archive, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import {
  getArchivedComponents,
  restoreComponent,
  deleteComponentPermanently,
  getComponentReferenceCounts,
} from "@/lib/db";
import { toast } from "@/hooks/use-toast";

interface ArchivedItem {
  id: number;
  name: string;
  category?: string;
  quantity?: number;
  archivedAt?: string;
}

/** Человекочитаемые названия таблиц для окна подтверждения. */
const TABLE_LABELS: Record<string, string> = {
  component_groups: "мест хранения",
  component_paths: "этапов перемещения",
  scrapped_items: "записей о списании",
  supply_records: "записей о поставке",
  component_usage_history: "записей истории",
  purchase_recommendations: "рекомендаций к закупке",
  configuration_components: "вхождений в конфигурации",
  documents: "документов",
  component_tags: "тегов",
  document_components: "привязок документов",
};

export const ArchiveCard = () => {
  const [items, setItems] = useState<ArchivedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<ArchivedItem | null>(null);
  const [refs, setRefs] = useState<Record<string, number>>({});

  const load = async () => {
    try {
      const rows = await getArchivedComponents();
      setItems((rows || []) as ArchivedItem[]);
    } catch (error) {
      console.error("Не удалось загрузить архив:", error);
    }
  };

  useEffect(() => {
    load();
    const onUpdate = () => load();
    window.addEventListener("componentsUpdated", onUpdate);
    return () => window.removeEventListener("componentsUpdated", onUpdate);
  }, []);

  const handleRestore = async (item: ArchivedItem) => {
    setBusy(true);
    try {
      await restoreComponent(item.id);
      await load();
      toast({ title: "Восстановлено", description: `«${item.name}» снова в списках` });
    } catch (error) {
      toast({
        title: "Не удалось восстановить",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const askDelete = async (item: ArchivedItem) => {
    setToDelete(item);
    setRefs({});
    try {
      setRefs(await getComponentReferenceCounts(item.id));
    } catch (error) {
      console.error("Не удалось посчитать связанные записи:", error);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    const item = toDelete;
    setToDelete(null);
    setBusy(true);
    try {
      await deleteComponentPermanently(item.id);
      await load();
      toast({ title: "Удалено безвозвратно", description: `«${item.name}» и его история` });
    } catch (error) {
      console.error("Не удалось удалить:", error);
      toast({
        title: "Не удалось удалить",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const refLines = Object.entries(refs)
    .map(([table, n]) => `${n} ${TABLE_LABELS[table] ?? table}`)
    .join(", ");

  return (
    <>
      <Card className="border-dashed">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Archive className="h-4 w-4" />
            Архив изделий
          </CardTitle>
          <CardDescription>Убранные из оборота, история сохранена</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-3">
          <Button size="sm" variant="ghost" onClick={load} disabled={busy} className="w-full">
            <RefreshCw className={`h-3 w-3 mr-2 ${busy ? "animate-spin" : ""}`} />
            Обновить
          </Button>

          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Архив пуст</p>
          ) : (
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.category || "Без категории"} · {item.quantity ?? 0} шт.
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => handleRestore(item)}
                      title="Восстановить"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => askDelete(item)}
                      title="Удалить безвозвратно"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить «{toDelete?.name}» безвозвратно?</AlertDialogTitle>
            <AlertDialogDescription>
              {refLines
                ? `Вместе с изделием будет удалено: ${refLines}. Восстановить будет невозможно.`
                : "Связанных записей нет. Восстановить будет невозможно."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Удалить навсегда</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
