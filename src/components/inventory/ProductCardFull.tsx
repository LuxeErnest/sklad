import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, Calendar, MapPin, Package, DollarSign, FileText, Download, Truck, Trash2, ArrowLeft, Tag } from "lucide-react";
import { getDocumentsByComponentId, getConfigurationsByComponentId, getTags, getComponentTagIds, setComponentTags, readDocument } from "@/lib/db";
import { InventoryItem } from "./InventoryTable";
import { LocationDistribution } from "./LocationDistribution";
import { ProductHistoryModals } from "./ProductHistoryModals";

interface ProductCardFullProps {
  item: InventoryItem;
  categories: string[];
  onUpdateItem: (id: number, updates: Partial<InventoryItem>) => void;
  onBack: () => void;
  onRefresh?: () => void;
}

export const ProductCardFull = ({ item, onBack, onRefresh }: ProductCardFullProps) => {
  const [linkedDocuments, setLinkedDocuments] = useState<
    Awaited<ReturnType<typeof getDocumentsByComponentId>>
  >([]);
  const [configurations, setConfigurations] = useState<Array<{ id: number; name: string; quantity: number }>>([]);
  const [allTags, setAllTags] = useState<{ id: number; name: string }[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [historySuppliesOpen, setHistorySuppliesOpen] = useState(false);
  const [historyScrapOpen, setHistoryScrapOpen] = useState(false);
  const [historyMovementsOpen, setHistoryMovementsOpen] = useState(false);

  /** Содержимое файла лежит на диске и читается только при скачивании. */
  const downloadDocument = async (doc: { id: number; name: string; type: string }) => {
    try {
      const base64 = await readDocument(doc.id);
      const link = document.createElement("a");
      link.href = `data:application/octet-stream;base64,${base64}`;
      link.download = doc.type ? `${doc.name}.${doc.type}` : doc.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Не удалось скачать документ:", error);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        // Документы запрашиваются по изделию, а не отбираются из общего списка.
        // Прежний отбор разбирал componentIds как строку с запятыми — после
        // переработки схемы это массив, и условие перестало срабатывать
        // вообще: документы на карточке не показывались.
        setLinkedDocuments(await getDocumentsByComponentId(item.id));
      } catch (_) {
        setLinkedDocuments([]);
      }
    })();
    Promise.all([
      getConfigurationsByComponentId(item.id).then((cfgs) => setConfigurations(cfgs || [])).catch(() => setConfigurations([])),
      getTags().then(setAllTags).catch(() => setAllTags([])),
      getComponentTagIds(item.id).then(setSelectedTagIds).catch(() => setSelectedTagIds([])),
    ]).catch(() => {});
  }, [item.id]);

  const handleTagsChange = async (tagIds: number[]) => {
    setSelectedTagIds(tagIds);
    try {
      await setComponentTags(item.id, tagIds);
      onRefresh?.();
    } catch {
      // Обновление списка не обязано удаться: основное действие уже выполнено
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack} aria-label="Назад">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <CardTitle className="text-xl">{item.name}</CardTitle>
              <CardDescription>
                <Badge variant="secondary" className="mt-1">
                  {item.category}
                </Badge>
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {(item.imageUrl || item.imageBase64) && (
          <div className="flex justify-center">
            <img
              src={item.imageBase64 || item.imageUrl}
              alt={item.name}
              className="w-40 h-40 object-cover rounded-lg border shadow-md"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </div>
        )}

        <Separator />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Количество:</span>
              <span className="font-medium">{item.quantity} шт.</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Расположение:</span>
              <span className="font-medium">{item.location}</span>
            </div>
            {item.price != null && item.price > 0 && (
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Цена:</span>
                <span className="font-medium">{item.price.toFixed(2)} ₽/шт.</span>
              </div>
            )}
            {item.lastUpdated && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Обновлено:</span>
                <span className="font-medium">{item.lastUpdated}</span>
              </div>
            )}
          </div>
        </div>

        {item.description && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Описание</h4>
              <p className="text-sm leading-relaxed">{item.description}</p>
            </div>
          </>
        )}

        {(item.tags && item.tags.length > 0) && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Теги</h4>
              <div className="flex flex-wrap gap-2">
                {item.tags.map((t) => (
                  <Badge key={t} variant="secondary">{t}</Badge>
                ))}
              </div>
            </div>
          </>
        )}

        {allTags.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Tag className="h-4 w-4" /> Назначить теги
              </h4>
              <div className="flex flex-wrap gap-2">
                {allTags.map((t) => (
                  <Badge
                    key={t.id}
                    variant={selectedTagIds.includes(t.id) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => {
                      const next = selectedTagIds.includes(t.id)
                        ? selectedTagIds.filter((id) => id !== t.id)
                        : [...selectedTagIds, t.id];
                      handleTagsChange(next);
                    }}
                  >
                    {t.name}
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}

        {item.url && (
          <div className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline text-sm"
            >
              Ссылка на товар
            </a>
          </div>
        )}

        {linkedDocuments.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Документы</h4>
              <ul className="space-y-2">
                {linkedDocuments.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between rounded border p-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      {doc.name}.{doc.type}
                    </span>
                    <button
                      type="button"
                      onClick={() => downloadDocument(doc)}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Download className="h-3 w-3" /> Скачать
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {configurations.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Конфигурации</h4>
              <ul className="space-y-1 text-sm">
                {configurations.map((c) => (
                  <li key={c.id}>
                    <span className="font-medium">{c.name}</span>
                    {c.quantity > 1 && (
                      <span className="text-muted-foreground"> × {c.quantity}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        <Separator />

        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">Распределение по складам</h4>
          <LocationDistribution componentId={item.id} componentName={item.name} />
        </div>

        <Separator />

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHistorySuppliesOpen(true)}
            className="gap-1"
          >
            <Package className="h-3.5 w-3.5" />
            История поставок
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHistoryScrapOpen(true)}
            className="gap-1"
          >
            <Trash2 className="h-3.5 w-3.5" />
            История списаний
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHistoryMovementsOpen(true)}
            className="gap-1"
          >
            <Truck className="h-3.5 w-3.5" />
            История перемещений
          </Button>
        </div>
      </CardContent>

      <ProductHistoryModals
        componentId={item.id}
        componentName={item.name}
        suppliesOpen={historySuppliesOpen}
        scrapOpen={historyScrapOpen}
        movementsOpen={historyMovementsOpen}
        onSuppliesClose={() => setHistorySuppliesOpen(false)}
        onScrapClose={() => setHistoryScrapOpen(false)}
        onMovementsClose={() => setHistoryMovementsOpen(false)}
      />
    </Card>
  );
};
