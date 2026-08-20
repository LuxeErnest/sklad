import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Package, ChevronRight, ScanLine, TriangleAlert } from "lucide-react";
import { getLastMovement } from "@/lib/db";
import type { OperationLineView } from "@/lib/generated";
import { ItemActions } from "./ItemActions";
import { InventoryItem } from "./InventoryTable";

/**
 * Краткая справка по выбранной строке склада.
 *
 * Панель отвечает на один вопрос — где лежит и сколько. Цена, документы и
 * описание переехали в полную карточку: иначе панель повторяла её и при этом
 * не отвечала на главное. Раньше здесь показывались только сертификаты, а
 * остатки по местам хранения — нет, хотя именно они и есть суть склада.
 */

interface ItemBriefInfoProps {
  item: InventoryItem | null;
  /** Категории для выбора при правке. */
  categories: string[];
  /** Перечитать данные после изменения. */
  onRefresh: () => void | Promise<void>;
}

const KIND_LABELS: Record<string, string> = {
  receipt: "Поступление",
  transfer: "Перемещение",
  writeoff: "Списание",
  assembly: "Сборка",
  disassembly: "Разборка",
  correction: "Корректировка",
};

/** Куда и откуда — в одну строку, с учётом того, что одна из сторон может отсутствовать. */
function movementRoute(line: OperationLineView): string {
  if (line.fromLocation && line.toLocation) return `${line.fromLocation} → ${line.toLocation}`;
  if (line.toLocation) return `→ ${line.toLocation}`;
  if (line.fromLocation) return `${line.fromLocation} →`;
  return "";
}

function movementDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString("ru-RU");
}

export const ItemBriefInfo = ({ item, categories, onRefresh }: ItemBriefInfoProps) => {
  const navigate = useNavigate();
  const [lastMovement, setLastMovement] = useState<OperationLineView | null>(null);

  useEffect(() => {
    if (!item?.id || item.itemType === "configuration") {
      setLastMovement(null);
      return;
    }
    let отменено = false;
    getLastMovement(item.id)
      .then((line) => {
        if (!отменено) setLastMovement(line);
      })
      .catch(() => {
        if (!отменено) setLastMovement(null);
      });
    // Пока запрос идёт, показывать прошлое движение нельзя: строку уже
    // переключили, и оно относилось бы к другому изделию.
    return () => {
      отменено = true;
    };
  }, [item?.id, item?.itemType]);

  if (!item) {
    return (
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Информация о товаре
          </CardTitle>
          <CardDescription>
            Выберите товар из таблицы для просмотра краткой информации
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const handleDetails = () => {
    if (item.itemType === "configuration" && item.configurationId) {
      navigate(`/configurations?configId=${item.configurationId}`);
      return;
    }
    navigate(`/item/${item.id}`);
  };

  if (item.itemType === "configuration") {
    return (
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Конфигурация
          </CardTitle>
          <CardDescription>Собранная конфигурация на складе</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 text-sm">
            <div className="font-medium">{item.name}</div>
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Собрано:</span>
              <span className="font-medium">{item.quantity} шт.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Категория:</span>
              <span className="font-medium">{item.category}</span>
            </div>
          </div>
          <Button onClick={handleDetails} className="w-full gap-2" size="sm">
            К конфигурации <ChevronRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  const belowMinimum = item.minStock > 0 && item.quantity <= item.minStock;
  const places = (item.locations || []).filter((l) => l.quantity > 0);

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Информация о товаре
        </CardTitle>
        <CardDescription>Где лежит и сколько. «Подробнее» — полная карточка</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.name}
              className="h-16 w-16 rounded border object-cover shrink-0"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded border bg-muted text-xs text-muted-foreground">
              Нет фото
            </div>
          )}
          <div className="min-w-0 space-y-1">
            <div className="font-medium leading-tight break-words">{item.name}</div>
            {item.barcode ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ScanLine className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{item.barcode}</span>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Штрихкод не привязан</div>
            )}
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Всего:</span>
            <span className="font-medium">{item.quantity} шт.</span>
            {belowMinimum && (
              <Badge variant="destructive" className="gap-1 text-xs">
                <TriangleAlert className="h-3 w-3" />
                мин. {item.minStock}
              </Badge>
            )}
          </div>

          {/*
            Разбивка по местам хранения — то, ради чего остаток и перенесён из
            позиции в отдельную таблицу: один и тот же товар лежит на нескольких
            складах, и «сколько всего» без «где» ничего не говорит.
          */}
          {places.length > 0 ? (
            <ul className="space-y-1">
              {places.map((place) => (
                <li key={place.locationId} className="flex items-center justify-between gap-2">
                  <span className="truncate text-muted-foreground">{place.location}</span>
                  <span className="shrink-0 font-medium">{place.quantity} шт.</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Нет ни на одном складе</p>
          )}
        </div>

        <div className="space-y-1 border-t pt-3 text-sm">
          <span className="text-muted-foreground">Последнее движение:</span>
          {lastMovement ? (
            <p className="leading-snug">
              <span className="font-medium">
                {KIND_LABELS[lastMovement.kind] ?? lastMovement.kind}
              </span>
              {" · "}
              {lastMovement.quantity} шт.
              {movementRoute(lastMovement) && <> · {movementRoute(lastMovement)}</>}
              {" · "}
              {movementDate(lastMovement.performedAt)}
            </p>
          ) : (
            <p className="text-muted-foreground">Движений не было</p>
          )}
        </div>

        {/*
          Правка, списание и архив переехали сюда со страницы «Изменить»: та
          страница держала вторую таблицу склада только затем, чтобы выбрать в
          ней строку, — а выбрать её можно и здесь.
        */}
        <ItemActions item={item} categories={categories} onDone={onRefresh} />

        <Button onClick={handleDetails} className="w-full gap-2" size="sm">
          Подробнее <ChevronRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
};
