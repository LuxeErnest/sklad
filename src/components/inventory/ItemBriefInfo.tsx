import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, DollarSign, Calendar, FileText, Download, ChevronRight } from "lucide-react";
import { getCertificatesByComponentId, readDocument } from "@/lib/db";
import { InventoryItem } from "./InventoryTable";
import { useApp } from "@/contexts/AppContext";

const getMimeFromExtension = (ext: string) => {
  const e = (ext || '').toLowerCase();
  if (e === 'pdf') return 'application/pdf';
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
  if (e === 'png') return 'image/png';
  if (e === 'txt') return 'text/plain;charset=utf-8';
  return 'application/octet-stream';
};

const truncate = (s: string, maxLen: number) => {
  if (!s) return '';
  return s.length <= maxLen ? s : s.slice(0, maxLen).trim() + '…';
};

interface ItemBriefInfoProps {
  item: InventoryItem | null;
}

export const ItemBriefInfo = ({ item }: ItemBriefInfoProps) => {
  const navigate = useNavigate();
  const [certificates, setCertificates] = useState<Array<{ id: number; name: string; type: string; url: string }>>([]);

  useEffect(() => {
    if (!item?.id || item.itemType === "configuration") {
      setCertificates([]);
      return;
    }
    // Содержимое файлов больше не лежит в базе и не приходит вместе со списком:
    // оно читается с диска отдельно и только для тех документов, что показываем.
    getCertificatesByComponentId(item.id)
      .then((rows) =>
        Promise.all(
          rows.map(async (r) => ({
            id: r.id,
            name: r.name,
            type: r.type,
            url: `data:${getMimeFromExtension(r.type)};base64,${await readDocument(r.id).catch(() => "")}`,
          }))
        )
      )
      .then(setCertificates)
      .catch(() => setCertificates([]));
  }, [item?.id]);

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
          <CardDescription>
            Собранная конфигурация на складе
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 text-sm">
            <div className="font-medium">{item.name}</div>
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Количество:</span>
              <span className="font-medium">{item.quantity} шт.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Категория:</span>
              <span className="font-medium">{item.category}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Расположение:</span>
              <span className="font-medium">{item.location}</span>
            </div>
          </div>
          <Button onClick={handleDetails} className="w-full gap-2" size="sm">
            К конфигурации <ChevronRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  const available = item.quantity;

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Информация о товаре
        </CardTitle>
        <CardDescription>
          Краткие данные. Нажмите «Подробнее» для полной карточки
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Количество:</span>
            <span className="font-medium">{available} шт.</span>
          </div>

          {item.price != null && item.price > 0 && (
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Цена:</span>
              <span className="font-medium">{item.price.toFixed(2)} ₽/шт.</span>
            </div>
          )}

          {certificates.length > 0 && (
            <div>
              <span className="text-muted-foreground block mb-1">Сертификаты:</span>
              <ul className="space-y-1">
                {certificates.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm truncate">
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      {doc.name}.{doc.type}
                    </span>
                    <a
                      href={doc.url}
                      download={`${doc.name}.${doc.type}`}
                      className="shrink-0 text-primary hover:underline text-xs inline-flex items-center gap-0.5"
                    >
                      <Download className="h-3 w-3" /> Скачать
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {item.lastUpdated && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Обновлено:</span>
              <span className="font-medium">{item.lastUpdated}</span>
            </div>
          )}

          {item.description && (
            <div>
              <span className="text-muted-foreground block mb-1">Описание:</span>
              <p className="text-sm leading-relaxed">{truncate(item.description, 120)}</p>
            </div>
          )}
        </div>

        <Button onClick={handleDetails} className="w-full gap-2" size="sm">
          Подробнее <ChevronRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
};
