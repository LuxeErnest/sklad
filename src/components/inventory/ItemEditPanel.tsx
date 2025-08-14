import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { ExternalLink, Calendar, MapPin, Package } from "lucide-react";
import { InventoryItem } from "./InventoryTable";

interface ItemEditPanelProps {
  item: InventoryItem | null;
  categories: string[];
  onUpdateItem: (id: number, updates: Partial<InventoryItem>) => void;
}

export const ItemEditPanel = ({ item, categories, onUpdateItem }: ItemEditPanelProps) => {
  const [editData, setEditData] = useState<Partial<InventoryItem>>({});
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (item) {
      setEditData(item);
      setIsEditing(false);
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
            <Button size="sm" onClick={() => setIsEditing(true)}>
              Редактировать
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleCancel}>
                Отмена
              </Button>
              <Button size="sm" onClick={handleSave}>
                Сохранить
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
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
                <Label htmlFor="edit-quantity">Количество</Label>
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
              <Label htmlFor="edit-url">URL</Label>
              <Input
                id="edit-url"
                type="url"
                value={editData.url || ""}
                onChange={(e) => setEditData(prev => ({ ...prev, url: e.target.value }))}
              />
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

              {item.lastUpdated && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Обновлено:</span>
                  <span className="font-medium">{item.lastUpdated}</span>
                </div>
              )}

              {item.url && (
                <div className="flex items-center gap-2">
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
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

              {item.description && (
                <>
                  <Separator />
                  <div>
                    <span className="text-sm text-muted-foreground block mb-1">Описание:</span>
                    <p className="text-sm">{item.description}</p>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ItemEditPanel;