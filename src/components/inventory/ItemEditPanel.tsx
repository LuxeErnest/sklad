import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { ExternalLink, Calendar, MapPin, Package, Upload, X, DollarSign, FileText, Download, Truck, Trash2 } from "lucide-react";
import { getDocuments, getConfigurationsByComponentId } from "@/lib/db";
import { InventoryItem } from "./InventoryTable";
import { LocationDistribution } from "./LocationDistribution";
import { ProductHistoryModals } from "./ProductHistoryModals";

interface ItemEditPanelProps {
  item: InventoryItem | null;
  categories: string[];
  onUpdateItem: (id: number, updates: Partial<InventoryItem>) => void;
}

export const ItemEditPanel = ({ item, categories, onUpdateItem }: ItemEditPanelProps) => {
  const [editData, setEditData] = useState<Partial<InventoryItem>>({});
  const [isEditing, setIsEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [linkedDocuments, setLinkedDocuments] = useState<Array<{id:number; name:string; type:string; url:string;}>>([]);
  const [configurations, setConfigurations] = useState<Array<{id:number; name:string; quantity:number}>>([]);
  const [historySuppliesOpen, setHistorySuppliesOpen] = useState(false);
  const [historyScrapOpen, setHistoryScrapOpen] = useState(false);
  const [historyMovementsOpen, setHistoryMovementsOpen] = useState(false);

  useEffect(() => {
    if (item) {
      // Инициализируем URL из возможного старого поля website
      const initialUrl = (item as any).url || (item as any).website || "";
      setEditData({ ...item, url: initialUrl });
      setIsEditing(false);
      // load linked docs
      (async () => {
        try {
          const rows: any[] = await getDocuments();
          const docs = rows.filter((r: any) => {
            if (typeof r.componentIds === 'string' && r.componentIds) {
              return r.componentIds.split(',').map((id: string)=>Number(id)).includes(item.id);
            }
            if (r.legacyComponentId) return Number(r.legacyComponentId) === item.id;
            if (typeof r.componentId !== 'undefined') return Number(r.componentId) === item.id;
            return false;
          }).map((r: any) => ({
            id: r.id,
            name: r.name,
            type: r.type,
            url: `data:${(r.type || '').toString()};base64,${r.dataBase64}`,
          }));
          setLinkedDocuments(docs);
        } catch (_) {
          setLinkedDocuments([]);
        }
      })();
      // load configurations using this component
      getConfigurationsByComponentId(item.id)
        .then((cfgs) => setConfigurations(cfgs || []))
        .catch(() => setConfigurations([]));
    }
  }, [item]);

  const handleSave = () => {
    if (!item) return;

    onUpdateItem(item.id, editData);
    setIsEditing(false);
    
    toast({
      title: "Изменения сохранены",
      description: `Информация о товаре "${item.name}" обновлена`,
    });
  };

  const handleCancel = () => {
    if (item) {
      setEditData(item);
    }
    setIsEditing(false);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Проверяем тип файла
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Ошибка",
        description: "Пожалуйста, выберите изображение (JPG, PNG, GIF)",
        variant: "destructive",
      });
      return;
    }

    // Проверяем размер файла (максимум 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Ошибка",
        description: "Размер файла не должен превышать 5MB",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setEditData(prev => ({ 
        ...prev, 
        imageBase64: result,
        imageUrl: '' // Очищаем URL если загружаем файл
      }));
      toast({
        title: "Изображение загружено",
        description: "Файл успешно загружен",
      });
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setEditData(prev => ({ 
      ...prev, 
      imageBase64: '',
      imageUrl: ''
    }));
  };

  if (!item) {
    return (
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Описание товара
          </CardTitle>
          <CardDescription>
            Выберите товар из таблицы для просмотра и редактирования информации
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="h-fit">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {isEditing ? "Редактирование" : "Информация о товаре"}
          </CardTitle>
          {!isEditing ? (
            <Button size="sm" onClick={() => setIsEditing(true)} className="transition-all duration-200 hover:scale-105">
              Редактировать
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleCancel} className="transition-all duration-200 hover:scale-105">
                Отмена
              </Button>
              <Button size="sm" onClick={handleSave} className="transition-all duration-200 hover:scale-105">
                Сохранить
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {linkedDocuments.length > 0 && (
          <div className="space-y-2">
            <Label>Документы</Label>
            <div className="flex flex-col gap-2">
              {linkedDocuments.map(doc => (
                <div key={doc.id} className="flex items-center justify-between rounded border p-2">
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4" />
                    <span className="font-medium">{doc.name}</span>
                    <span className="text-muted-foreground uppercase">.{doc.type}</span>
                  </div>
                  <a href={doc.url} download={doc.name} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                    <Download className="h-3 w-3" /> Скачать
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
        {isEditing ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="edit-name">Название</Label>
              <Input
                id="edit-name"
                value={editData.name || ""}
                onChange={(e) => setEditData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-category">Категория</Label>
              <Select
                value={editData.category || ""}
                onValueChange={(value) => setEditData(prev => ({ ...prev, category: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-quantity">Количество (шт.)</Label>
                <Input
                  id="edit-quantity"
                  type="number"
                  min="0"
                  value={editData.quantity || ""}
                  onChange={(e) => setEditData(prev => ({ ...prev, quantity: parseInt(e.target.value) || 0 }))}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-location">Расположение</Label>
                <Input
                  id="edit-location"
                  value={editData.location || ""}
                  onChange={(e) => setEditData(prev => ({ ...prev, location: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-price">Цена за штуку (₽)</Label>
              <Input
                id="edit-price"
                type="number"
                min="0"
                step="0.01"
                value={editData.price ? editData.price.toFixed(2) : ""}
                onChange={(e) => setEditData(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                placeholder="0.00"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-barcode">Штрихкод</Label>
                <Input
                  id="edit-barcode"
                  type="text"
                  value={editData.barcode || ""}
                  onChange={(e) => setEditData(prev => ({ ...prev, barcode: e.target.value }))}
                  placeholder="1234567890123"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-url">URL</Label>
                <Input
                  id="edit-url"
                  type="url"
                  value={editData.url || ""}
                  onChange={(e) => setEditData(prev => ({ ...prev, url: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Изображение товара</Label>
              <div className="space-y-2">
                {(editData.imageBase64 || editData.imageUrl) && (
                  <div className="relative">
                    <img 
                      src={editData.imageBase64 || editData.imageUrl} 
                      alt="Предварительный просмотр"
                      className="w-24 h-24 object-cover rounded border"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute -top-2 -right-2 h-6 w-6 p-0"
                      onClick={removeImage}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 transition-all duration-200 hover:scale-105"
                  >
                    <Upload className="h-4 w-4" />
                    {editData.imageBase64 || editData.imageUrl ? 'Заменить' : 'Загрузить изображение'}
                  </Button>
                  
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
                
                <div className="text-sm text-muted-foreground">
                  Поддерживаются форматы: JPG, PNG, GIF. Максимальный размер: 5MB
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">Описание</Label>
              <Textarea
                id="edit-description"
                value={editData.description || ""}
                onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <h3 className="font-semibold text-lg">{item.name}</h3>
              <Badge variant="secondary" className="mt-1">{item.category}</Badge>
            </div>

            {(item.imageUrl || item.imageBase64) && (
              <div className="flex justify-center">
                <img 
                  src={item.imageBase64 || item.imageUrl} 
                  alt={item.name}
                  className="w-32 h-32 object-cover rounded border transition-transform duration-200 hover:scale-105 shadow-lg"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            )}

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Количество:</span>
                <span className="font-medium">{item.quantity} шт.</span>
              </div>

              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Расположение:</span>
                <span className="font-medium">{item.location}</span>
              </div>

              {item.price && (
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Цена:</span>
                  <span className="font-medium">{item.price.toFixed(2)}₽/шт.</span>
                </div>
              )}

              {item.lastUpdated && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Обновлено:</span>
                  <span className="font-medium">{item.lastUpdated}</span>
                </div>
              )}

              {item.barcode && (
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Штрихкод:</span>
                  <span className="font-medium text-sm font-mono">{item.barcode}</span>
                </div>
              )}

              {(item.url || (item as any).website) && (
                <div className="flex items-center gap-2">
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  <a 
                    href={(item.url || (item as any).website) as string} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm"
                  >
                    Ссылка на товар
                  </a>
                </div>
              )}

              {item.description && (
                <>
                  <Separator />
                  <div>
                    <span className="text-sm text-muted-foreground block mb-1">Описание:</span>
                    <p className="text-sm">{item.description}</p>
                  </div>
                </>
              )}

              {configurations.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <span className="text-sm text-muted-foreground block mb-1">Конфигурации:</span>
                    <ul className="text-sm space-y-1">
                      {configurations.map((c) => (
                        <li key={c.id}>
                          <span className="font-medium">{c.name}</span>
                          {c.quantity > 1 && <span className="text-muted-foreground"> × {c.quantity}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              <Separator />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setHistorySuppliesOpen(true)} className="gap-1">
                  <Package className="h-3.5 w-3" />
                  История поставок
                </Button>
                <Button variant="outline" size="sm" onClick={() => setHistoryScrapOpen(true)} className="gap-1">
                  <Trash2 className="h-3.5 w-3" />
                  История списаний
                </Button>
                <Button variant="outline" size="sm" onClick={() => setHistoryMovementsOpen(true)} className="gap-1">
                  <Truck className="h-3.5 w-3" />
                  История перемещений
                </Button>
              </div>
            </div>
          </>
        )}
        
        {/* Location Distribution */}
        {!isEditing && item && (
          <div className="mt-6">
            <LocationDistribution 
              componentId={item.id} 
              componentName={item.name} 
            />
          </div>
        )}
      </CardContent>

      {item && (
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
      )}
    </Card>
  );
};

export default ItemEditPanel;