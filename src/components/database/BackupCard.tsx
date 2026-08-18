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
import { Archive, RefreshCw, RotateCcw } from "lucide-react";
import { useState, useEffect } from "react";
import { DatabaseBackup, type BackupInfo } from "@/lib/db-config";
import { toast } from "@/hooks/use-toast";

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
};

const formatDate = (iso: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("ru-RU");
};

export const BackupCard = () => {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [dbPath, setDbPath] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [toRestore, setToRestore] = useState<BackupInfo | null>(null);

  const load = async () => {
    try {
      const [list, path] = await Promise.all([
        DatabaseBackup.listBackups(),
        DatabaseBackup.getDatabasePath().catch(() => ""),
      ]);
      setBackups(list);
      setDbPath(path);
    } catch (error) {
      console.error("Не удалось получить список резервных копий:", error);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    setBusy(true);
    try {
      const path = await DatabaseBackup.createBackup();
      await load();
      toast({
        title: "Резервная копия создана",
        description: path.split(/[\\/]/).pop(),
      });
    } catch (error) {
      console.error("Не удалось создать резервную копию:", error);
      toast({
        title: "Не удалось создать копию",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    if (!toRestore) return;
    const target = toRestore;
    setToRestore(null);
    setBusy(true);
    try {
      // Приложение перезапустится внутри вызова — код после него не выполнится.
      await DatabaseBackup.restoreBackup(target.path);
    } catch (error) {
      console.error("Не удалось восстановить базу:", error);
      toast({
        title: "Не удалось восстановить",
        description: String(error),
        variant: "destructive",
      });
      setBusy(false);
    }
  };

  return (
    <>
      <Card className="border-dashed">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Archive className="h-4 w-4" />
            Резервные копии
          </CardTitle>
          <CardDescription>
            {dbPath ? `База: ${dbPath}` : "Создание и восстановление"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-3">
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={busy} className="flex-1">
              <Archive className="h-3 w-3 mr-2" />
              Создать копию
            </Button>
            <Button size="sm" variant="ghost" onClick={load} disabled={busy}>
              <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {backups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Копий пока нет</p>
          ) : (
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {backups.map((b) => (
                <div
                  key={b.path}
                  className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{b.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(b.createdAt)} · {formatSize(b.sizeBytes)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setToRestore(b)}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Восстановить
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!toRestore} onOpenChange={(open) => !open && setToRestore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Восстановить базу из копии?</AlertDialogTitle>
            <AlertDialogDescription>
              Текущие данные будут заменены содержимым «{toRestore?.name}». Перед заменой
              автоматически сохраняется копия текущего состояния. После восстановления
              приложение перезапустится.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore}>Восстановить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
