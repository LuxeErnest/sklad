import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Warehouse, RefreshCw, Check, Pencil, Merge } from "lucide-react";
import { useState, useEffect } from "react";
import { getLocations, renameLocation, mergeLocations } from "@/lib/db";
import { toast } from "@/hooks/use-toast";

interface LocationRow {
  id: number;
  name: string;
  itemCount: number;
  totalQuantity: number;
}

/**
 * Управление местами хранения.
 *
 * Понадобилось потому, что раньше место было свободной строкой: в базе
 * оказались и «sklad», и «skladв». Отличить опечатку от отдельного склада может
 * только человек, поэтому объединение — ручное действие, а не догадка.
 */
export const LocationsCard = () => {
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [mergeSource, setMergeSource] = useState<LocationRow | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>("");

  const load = async () => {
    try {
      setLocations(await getLocations());
    } catch (error) {
      console.error("Не удалось загрузить места хранения:", error);
    }
  };

  useEffect(() => {
    load();
    const onUpdate = () => load();
    window.addEventListener("componentsUpdated", onUpdate);
    return () => window.removeEventListener("componentsUpdated", onUpdate);
  }, []);

  const handleRename = async (id: number) => {
    const name = draftName.trim();
    setEditing(null);
    if (!name) return;
    setBusy(true);
    try {
      await renameLocation(id, name);
      await load();
      toast({ title: "Место хранения переименовано", description: name });
    } catch (error) {
      toast({ title: "Не удалось переименовать", description: String(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleMerge = async () => {
    if (!mergeSource || !mergeTargetId) return;
    const source = mergeSource;
    const targetId = Number(mergeTargetId);
    setMergeSource(null);
    setMergeTargetId("");
    setBusy(true);
    try {
      await mergeLocations(source.id, targetId);
      await load();
      toast({
        title: "Места хранения объединены",
        description: `«${source.name}» больше нет, остатки и история перенесены`,
      });
    } catch (error) {
      toast({ title: "Не удалось объединить", description: String(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const targetName = locations.find((l) => l.id === Number(mergeTargetId))?.name ?? "";

  return (
    <>
      <Card className="border-dashed">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Warehouse className="h-4 w-4" />
            Места хранения
          </CardTitle>
          <CardDescription>Переименование и объединение опечаток</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-3">
          <Button size="sm" variant="ghost" onClick={load} disabled={busy} className="w-full">
            <RefreshCw className={`h-3 w-3 mr-2 ${busy ? "animate-spin" : ""}`} />
            Обновить
          </Button>

          {locations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Мест хранения пока нет</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {locations.map((location) => (
                <div
                  key={location.id}
                  className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
                >
                  {editing === location.id ? (
                    <Input
                      autoFocus
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(location.id);
                        if (e.key === "Escape") setEditing(null);
                      }}
                      className="h-7 text-sm"
                    />
                  ) : (
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{location.name}</p>
                      <p className="text-xs text-muted-foreground">
                        позиций {location.itemCount} · всего {location.totalQuantity} шт.
                      </p>
                    </div>
                  )}

                  <div className="flex gap-1 shrink-0">
                    {editing === location.id ? (
                      <Button size="sm" variant="outline" onClick={() => handleRename(location.id)}>
                        <Check className="h-3 w-3" />
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          title="Переименовать"
                          onClick={() => {
                            setEditing(location.id);
                            setDraftName(location.name);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || locations.length < 2}
                          title="Объединить с другим"
                          onClick={() => setMergeSource(location)}
                        >
                          <Merge className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!mergeSource}
        onOpenChange={(open) => {
          if (!open) {
            setMergeSource(null);
            setMergeTargetId("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Объединить «{mergeSource?.name}» с другим местом</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Остатки сложатся, история перепишется на выбранное место, а «
                  {mergeSource?.name}» перестанет существовать. Отменить это нельзя.
                </p>
                <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Куда объединить" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations
                      .filter((l) => l.id !== mergeSource?.id)
                      .map((l) => (
                        <SelectItem key={l.id} value={String(l.id)}>
                          {l.name}
                          <Badge variant="outline" className="ml-2">
                            {l.totalQuantity} шт.
                          </Badge>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {mergeTargetId && (
                  <p className="text-sm">
                    Итог: всё из «{mergeSource?.name}» ({mergeSource?.totalQuantity} шт.) окажется
                    в «{targetName}».
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction disabled={!mergeTargetId} onClick={handleMerge}>
              Объединить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
