import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Upload, X, Tag, Plus } from "lucide-react";
import { InventoryItem } from "./InventoryTable";
import { createTag, validateComponent } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * Значения, которыми открывается форма.
 *
 * Используется при сканировании штрихкода: известное про товар подставляется
 * сразу, человеку остаётся указать сколько и куда.
 */
export interface AddItemPrefill {
  name?: string;
  category?: string;
  price?: number | null;
  description?: string | null;
  url?: string | null;
  imageUrl?: string | null;
  barcode?: string | null;
  /** Задан, если штрихкод опознан: тогда это поступление, а не новая позиция. */
  existingItemId?: number;
}

interface AddItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: string[];
  tags: { id: number; name: string }[];
  onAddItem: (item: Omit<InventoryItem, 'id'>, tagIds?: number[]) => void | Promise<void>;
  onAddCategory: (category: string) => void;
  prefill?: AddItemPrefill | null;
}

export const AddItemDialog = ({ open, onOpenChange, categories, tags, onAddItem, onAddCategory, prefill }: AddItemDialogProps) => {
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    quantity: "",
    location: "",
    price: "",
    url: "",
    imageUrl: "",
    imageBase64: "",
    description: "",
    barcode: "",
  });
  const [newCategory, setNewCategory] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [createdTagsInSession, setCreatedTagsInSession] = useState<{ id: number; name: string }[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Товар считается известным, если штрихкод опознан: тогда форма работает как
  // поступление на склад, а не как заведение новой позиции.
  const isReceipt = prefill?.existingItemId != null;

  useEffect(() => {
    if (!open) return;
    setValidationErrors([]);
    if (!prefill) return;
    // Количество и место не подставляются намеренно: именно их человек и
    // указывает после сканирования.
    setFormData((prev) => ({
      ...prev,
      name: prefill.name ?? prev.name,
      category: prefill.category ?? prev.category,
      price: prefill.price != null ? String(prefill.price) : prev.price,
      description: prefill.description ?? prev.description,
      url: prefill.url ?? prev.url,
      imageUrl: prefill.imageUrl ?? prev.imageUrl,
      barcode: prefill.barcode ?? prev.barcode,
      quantity: "",
      location: "",
    }));
  }, [open, prefill]);

  const allTagsForSelect = [...tags, ...createdTagsInSession.filter((t) => !tags.some((x) => x.id === t.id))];
  const filteredTags = tagFilter.trim()
    ? allTagsForSelect.filter((t) => t.name.toLowerCase().includes(tagFilter.toLowerCase()))
    : allTagsForSelect;
  const toggleTag = (id: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };
  const handleCreateTag = async () => {
    const n = newTagName.trim();
    if (!n) return;
    try {
      const id = await createTag(n);
      setCreatedTagsInSession((prev) => [...prev.filter((t) => t.id !== id), { id, name: n }]);
      setSelectedTagIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      setNewTagName("");
      toast({ title: "Тег создан" });
    } catch (e) {
      toast({ title: "Ошибка", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationErrors([]);

    const quantity = Math.max(0, parseInt(String(formData.quantity), 10) || 0);
    const priceVal = formData.price ? parseFloat(formData.price) : undefined;
    const newItem = {
      name: formData.name.trim(),
      category: formData.category.trim(),
      quantity,
      location: formData.location.trim(),
      price: priceVal,
      url: formData.url || undefined,
      imageUrl: formData.imageUrl || undefined,
      imageBase64: formData.imageBase64 || undefined,
      description: formData.description || undefined,
      barcode: formData.barcode || undefined,
      lastUpdated: new Date().toISOString().split('T')[0],
    };

    const validation = validateComponent(newItem);
    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      toast({
        title: "Исправьте ошибки в форме",
        description: validation.errors.join(". "),
        variant: "destructive",
      });
      return;
    }

    try {
      await onAddItem(newItem as Omit<InventoryItem, 'id'>, selectedTagIds.length ? selectedTagIds : undefined);
      setFormData({
        name: "", category: "", quantity: "", location: "", price: "", url: "",
        imageUrl: "", imageBase64: "", description: "", barcode: "",
      });
      setNewCategory("");
      setShowNewCategory(false);
      setSelectedTagIds([]);
      setNewTagName("");
      setTagFilter("");
      setCreatedTagsInSession([]);
      onOpenChange(false);
    } catch {
      // Error toast is shown by parent
    }
  };

  const handleAddCategory = () => {
    if (newCategory.trim() && !categories.includes(newCategory.trim())) {
      onAddCategory(newCategory.trim());
      setFormData(prev => ({ ...prev, category: newCategory.trim() }));
      setNewCategory("");
      setShowNewCategory(false);
      toast({
        title: "Категория добавлена",
        description: `Категория "${newCategory.trim()}" создана`,
      });
    }
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
      setFormData(prev => ({ 
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
    setFormData(prev => ({ 
      ...prev, 
      imageBase64: '',
      imageUrl: ''
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>{isReceipt ? "Поступление товара" : "Добавить товар"}</DialogTitle>
          <DialogDescription>
            {isReceipt
              ? "Штрихкод опознан. Укажите, сколько поступило и на какой склад"
              : "Заполните информацию о новом товаре на складе"}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {validationErrors.length > 0 && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              <p className="font-medium mb-1">Исправьте следующие пункты:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {validationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Название *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Название товара"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="category">Категория *</Label>
              {showNewCategory ? (
                <div className="flex gap-2">
                  <Input
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="Название новой категории"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                  />
                  <Button type="button" size="sm" onClick={handleAddCategory}>
                    Добавить
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setShowNewCategory(false)}>
                    Отмена
                  </Button>
                </div>
              ) : (
                <Select
                  value={formData.category}
                  onValueChange={(value) => {
                    if (value === "new") {
                      setShowNewCategory(true);
                    } else {
                      setFormData(prev => ({ ...prev, category: value }));
                    }
                  }}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите категорию" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                    <SelectItem value="new">+ Новая категория</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Количество (шт.) *</Label>
              <Input
                id="quantity"
                type="number"
                min="0"
                value={formData.quantity}
                onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))}
                placeholder="0"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="location">Расположение *</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                placeholder="Склад А-12"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Цена (₽)</Label>
              <Input
                id="price"
                type="text"
                inputMode="decimal"
                value={formData.price}
                onChange={(e) => {
                  const raw = e.target.value;
                  // Разрешаем только цифры и одну точку, максимум 2 знака после точки
                  const sanitized = raw
                    .replace(/[^0-9.]/g, '')
                    .replace(/(\..*)\./g, '$1'); // только одна точка
                  const parts = sanitized.split('.');
                  const limited = parts.length === 2
                    ? parts[0] + '.' + parts[1].slice(0, 2)
                    : parts[0];
                  setFormData(prev => ({ ...prev, price: limited }));
                }}
                onBlur={(e) => {
                  const value = e.target.value;
                  if (!value) return;
                  // Приводим к двум знакам после запятой на blur
                  const num = Number(value);
                  if (!isNaN(num)) {
                    setFormData(prev => ({ ...prev, price: num.toFixed(2) }));
                  }
                }}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="barcode">Штрихкод (опционально)</Label>
              <Input
                id="barcode"
                type="text"
                value={formData.barcode}
                onChange={(e) => setFormData(prev => ({ ...prev, barcode: e.target.value }))}
                placeholder="1234567890123"
                onKeyDown={(e) => {
                  // Автоматический поиск при Enter
                  if (e.key === 'Enter' && formData.barcode) {
                    e.preventDefault();
                    // Можно добавить логику автозаполнения по штрихкоду
                  }
                }}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="url">URL (опционально)</Label>
              <Input
                id="url"
                type="url"
                value={formData.url}
                onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                placeholder="https://example.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Изображение товара (опционально)</Label>
            <div className="space-y-2">
              {(formData.imageBase64 || formData.imageUrl) && (
                <div className="relative">
                  <img 
                    src={formData.imageBase64 || formData.imageUrl} 
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
                  {formData.imageBase64 || formData.imageUrl ? 'Заменить' : 'Загрузить изображение'}
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
            <Label htmlFor="description">Описание (опционально)</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Дополнительная информация о товаре"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Теги (опционально)
            </Label>
            <Input
              placeholder="Поиск тега..."
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
            />
            <ScrollArea className="max-h-[120px] border rounded-md p-2">
              <div className="flex flex-wrap gap-2">
                {filteredTags.map((t) => (
                  <Badge
                    key={t.id}
                    variant={selectedTagIds.includes(t.id) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleTag(t.id)}
                  >
                    {t.name}
                  </Badge>
                ))}
              </div>
            </ScrollArea>
            <div className="flex gap-2">
              <Input
                placeholder="Новый тег"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleCreateTag())}
              />
              <Button type="button" size="sm" variant="outline" onClick={handleCreateTag}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="transition-all duration-200 hover:scale-105">
              Отмена
            </Button>
            <Button type="submit" className="transition-all duration-200 hover:scale-105">
              {isReceipt ? "Оприходовать" : "Добавить товар"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddItemDialog;