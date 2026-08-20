import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getDeadStock, getMovementSummary, getValueByLocation } from "@/lib/db";
import type { DeadStockItem, LocationValue, MovementByKind } from "@/lib/generated";
import { formatCurrency, plural } from "@/lib/utils";
import { ItemLink } from "@/components/common/ItemLink";

/**
 * Отчёты, которые считаются по журналу и остаткам, а не по одному числу.
 *
 * Экран статистики раньше показывал общую стоимость склада, но не показывал ни
 * что происходило за период, ни где именно лежат деньги, ни что лежит без
 * движения. Всё это в данных было — на экран не выводилось.
 */

const KIND_LABELS: Record<string, string> = {
  receipt: "Поступление",
  transfer: "Перемещение",
  writeoff: "Списание",
  assembly: "Сборка",
  disassembly: "Разборка",
  correction: "Корректировка",
};

const PERIODS = [
  { days: 7, label: "Неделя" },
  { days: 30, label: "Месяц" },
  { days: 90, label: "Квартал" },
];

const DEAD_PERIODS = [
  { days: 90, label: "3 месяца" },
  { days: 180, label: "полгода" },
  { days: 365, label: "год" },
];

function movementDate(iso: string | null): string {
  if (!iso) return "не двигалось ни разу";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString("ru-RU");
}

export function WarehouseReports() {
  const [movementDays, setMovementDays] = useState(30);
  const [deadDays, setDeadDays] = useState(90);
  const [movement, setMovement] = useState<MovementByKind[]>([]);
  const [byLocation, setByLocation] = useState<LocationValue[]>([]);
  const [dead, setDead] = useState<DeadStockItem[]>([]);

  useEffect(() => {
    let отменено = false;
    getMovementSummary(movementDays)
      .then((rows) => !отменено && setMovement(rows))
      .catch(() => !отменено && setMovement([]));
    return () => {
      отменено = true;
    };
  }, [movementDays]);

  useEffect(() => {
    let отменено = false;
    getValueByLocation()
      .then((rows) => !отменено && setByLocation(rows))
      .catch(() => !отменено && setByLocation([]));
    return () => {
      отменено = true;
    };
  }, []);

  useEffect(() => {
    let отменено = false;
    getDeadStock(deadDays)
      .then((rows) => !отменено && setDead(rows))
      .catch(() => !отменено && setDead([]));
    return () => {
      отменено = true;
    };
  }, [deadDays]);

  const totalValue = byLocation.reduce((sum, l) => sum + l.value, 0);
  const deadValue = dead.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>Движение за период</CardTitle>
              <CardDescription>Что происходило со складом, а не что на нём лежит</CardDescription>
            </div>
            <div className="flex gap-1 shrink-0">
              {PERIODS.map((p) => (
                <Button
                  key={p.days}
                  size="sm"
                  variant={movementDays === p.days ? "default" : "outline"}
                  onClick={() => setMovementDays(p.days)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {movement.length === 0 ? (
            <p className="text-sm text-muted-foreground">За этот период движений не было</p>
          ) : (
            <ul className="space-y-2">
              {movement.map((row) => (
                <li key={row.kind} className="flex items-center justify-between gap-2 border-b pb-2 last:border-0">
                  <span>{KIND_LABELS[row.kind] ?? row.kind}</span>
                  <span className="text-right">
                    <span className="font-medium">{row.units} шт.</span>
                    <span className="ml-2 text-sm text-muted-foreground">
                      за {row.operations}{" "}
                      {plural(row.operations, "операцию", "операции", "операций")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Где лежат деньги</CardTitle>
          <CardDescription>
            Стоимость запаса по складам. Общая сумма одним числом скрывает перекос
          </CardDescription>
        </CardHeader>
        <CardContent>
          {byLocation.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ни на одном складе ничего нет</p>
          ) : (
            <ul className="space-y-2">
              {byLocation.map((row) => {
                // Доля показывается рядом с суммой: именно она и отвечает на
                // вопрос, не сосредоточено ли всё в одном месте.
                const share = totalValue > 0 ? Math.round((row.value / totalValue) * 100) : 0;
                return (
                  <li key={row.locationId} className="space-y-1 border-b pb-2 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{row.location}</span>
                      <span className="shrink-0 font-medium">{formatCurrency(row.value)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                      <span>
                        {row.items} поз. · {row.units} шт.
                      </span>
                      <span>{share}%</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>Мёртвый запас</CardTitle>
              <CardDescription>
                Лежит без движения дольше выбранного срока
                {dead.length > 0 && <> — всего на {formatCurrency(deadValue)}</>}
              </CardDescription>
            </div>
            <div className="flex gap-1 shrink-0">
              {DEAD_PERIODS.map((p) => (
                <Button
                  key={p.days}
                  size="sm"
                  variant={deadDays === p.days ? "default" : "outline"}
                  onClick={() => setDeadDays(p.days)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {dead.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Всё двигалось за выбранный срок
            </p>
          ) : (
            <ul className="space-y-2">
              {dead.map((row) => (
                <li
                  key={row.itemId}
                  className="flex items-center justify-between gap-2 border-b pb-2 last:border-0"
                >
                  <div className="min-w-0">
                    <ItemLink itemId={row.itemId} itemName={row.name} variant="ghost" size="sm" />
                    <div className="text-sm text-muted-foreground">
                      последнее движение: {movementDate(row.lastMovementAt)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-medium">{formatCurrency(row.value)}</div>
                    <div className="text-sm text-muted-foreground">{row.quantity} шт.</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
