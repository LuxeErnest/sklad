import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HardDrive, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { getDatabaseInfo, getWarehouseStatistics } from "@/lib/db";

interface Storage {
  path: string;
  sizeBytes: number;
  walBytes: number;
  documentsBytes: number;
  backupsCount: number;
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
};

/**
 * Сведения о хранилище.
 *
 * Заменила карточки «Пул соединений» и «Кэш». Обе описывали механизмы, которых
 * больше нет: пул удалён вместе с переездом слоя данных в Rust, кэш — вместе с
 * переходом на react-query. Показывали они при этом всегда одно и то же —
 * пустое состояние и нули, а кнопка очистки кэша ничего не делала.
 */
export const StorageCard = () => {
  const [storage, setStorage] = useState<Storage | null>(null);
  const [counts, setCounts] = useState<{ items: number; operations: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [info, stats] = await Promise.all([getDatabaseInfo(), getWarehouseStatistics()]);
      setStorage(info);
      setCounts({ items: stats.totalComponents, operations: stats.operationsTotal });
    } catch (error) {
      console.error("Не удалось получить сведения о хранилище:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const onUpdate = () => load();
    window.addEventListener("componentsUpdated", onUpdate);
    return () => window.removeEventListener("componentsUpdated", onUpdate);
  }, []);

  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );

  return (
    <Card className="border-dashed">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <HardDrive className="h-4 w-4" />
          Хранилище
        </CardTitle>
        <CardDescription className="break-all">
          {storage?.path ?? "Расположение и объём данных"}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-2">
        {storage && (
          <div className="space-y-1.5">
            {row("База данных:", formatSize(storage.sizeBytes))}
            {/* Данные, ещё не перенесённые в основной файл, лежат в журнале —
                без него размер базы выглядит меньше реального. */}
            {storage.walBytes > 0 && row("Журнал (WAL):", formatSize(storage.walBytes))}
            {row("Документы на диске:", formatSize(storage.documentsBytes))}
            {row("Резервных копий:", String(storage.backupsCount))}
            {counts && row("Позиций номенклатуры:", String(counts.items))}
            {counts && row("Операций в журнале:", String(counts.operations))}
          </div>
        )}
        <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="w-full">
          <RefreshCw className={`h-3 w-3 mr-2 ${loading ? "animate-spin" : ""}`} />
          Обновить
        </Button>
      </CardContent>
    </Card>
  );
};
