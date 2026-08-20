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
  tags: { id: number; name: string }[];
  /** Что уже есть на складе — для подсказок по названию и слияния одноимённых. */
  items: InventoryItem[];
  onAddItem: (
    item: Omit<InventoryItem, 'id'>,
    tagIds?: number[],
    existingItemId?: number
  ) => void | Promise<void>;
  prefill?: AddItemPrefill | null;
}

export const AddItemDialog = ({ open, onOpenChange, tags, items, onAddItem, prefill }: AddItemDialogProps) => {
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
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [createdTagsInSession, setCreatedTagsInSession] = useState<{ id: number; name: string }[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Подсказки по названию: пока человек печатает, показываем то, что уже есть
  // на складе. Выбор подсказки заполняет остальные поля и приходует количество
  // к существующей позиции, а не заводит вторую с тем же именем.
  const [nameSuggestionsOpen, setNameSuggestionsOpen] = useState(false);
  const nameFieldRef = useRef<HTMLDivElement>(null);

  /** Только номенклатура: собранные конфигурации приходовать нельзя. */
  const knownItems = items.filter((i) => i.itemType !== "configuration");

  const typedName = formData.name.trim().toLowerCase();

  /**
   * Позиция, к которой добавится количество.
   *
   * Совпадение по имени считается тем же товаром — так и просили: одинаковые
   * названия должны сходиться в один остаток, а не размножать позиции. Раньше
   * форма создавала вторую позицию с тем же именем, и склад расходился по
   * дубликатам.
   */
  const matchedItem =
    prefill?.existingItemId != null
      ? knownItems.find((i) => i.id === prefill.existingItemId) ?? null
      : typedName
        ? knownItems.find((i) => i.name.trim().toLowerCase() === typedName) ?? null
        : null;

  const nameSuggestions =
    typedName && !matchedItem
      ? knownItems.filter((i) => i.name.toLowerCase().includes(typedName)).slice(0, 8)
      : [];

  // Форма работает как поступление, если позиция уже известна — по штрихкоду
  // или по совпадению названия.
  const isReceipt = matchedItem != null;

  useEffect(() => {
    if (!nameSuggestionsOpen) return;
    const closeOnOutside = (e: MouseEvent) => {
      if (nameFieldRef.current && !nameFieldRef.current.contains(e.target as Node)) {
        setNameSuggestionsOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, [nameSuggestionsOpen]);

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

  /** Сколько тегов показывать списком, прежде чем отправить человека к поиску. */
  const TAG_LIMIT = 24;
  const selectedTags = allTagsForSelect.filter((t) => selectedTagIds.includes(t.id));
  // Выбранные видны отдельным рядом, поэтому в списке предложений их не дублируем.
  const suggestable = filteredTags.filter((t) => !selectedTagIds.includes(t.id));
  const shownTags = suggestable.slice(0, TAG_LIMIT);
  const hiddenTagCount = suggestable.length - shownTags.length;
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
      await onAddItem(
        newItem as Omit<InventoryItem, 'id'>,
        selectedTagIds.length ? selectedTagIds : undefined,
        matchedItem?.id
      );
      setFormData({
        name: "", category: "", quantity: "", location: "", price: "", url: "",
        imageUrl: "", imageBase64: "", description: "", barcode: "",
      });
      setSelectedTagIds([]);
      setNewTagName("");
      setTagFilter("");
      setCreatedTagsInSession([]);
      onOpenChange(false);
    } catch {
      // Error toast is shown by parent
    }
  };

  /**
   * Подставляет в форму всё, что известно о выбранной позиции.
   *
   * Количество и место не заполняются намеренно: именно их человек и пришёл
   * указать, а остальное — повторный набор того же самого.
   */
  const applyExistingItem = (item: InventoryItem) => {
    setFormData((prev) => ({
      ...prev,
      name: item.name,
      category: item.category ?? "",
      price: item.price != null ? String(item.price) : "",
      url: item.url ?? "",
      description: item.description ?? "",
      barcode: item.barcode ?? "",
      imageUrl: item.imageUrl ?? "",
      imageBase64: "",
    }));
    setSelectedTagIds([]);
    setNameSuggestionsOpen(false);
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
              <div className="relative" ref={nameFieldRef}>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, name: e.target.value }));
                    setNameSuggestionsOpen(true);
                  }}
                  onFocus={() => setNameSuggestionsOpen(true)}
                  placeholder="Название товара"
                  autoComplete="off"
                  required
                />
                {nameSuggestionsOpen && nameSuggestions.length > 0 && (
                  <ul className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
                    {nameSuggestions.map((suggestion) => (
                      <li key={suggestion.id}>
                        <button
                          type="button"
                          onClick={() => applyExistingItem(suggestion)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                        >
                          <span className="truncate">{suggestion.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {suggestion.quantity} шт.
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {matchedItem && (
                <p className="text-xs text-muted-foreground">
                  Такое изделие уже есть — {matchedItem.quantity} шт. Количество добавится к нему,
                  вторая позиция не появится.
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="category">Категория *</Label>
              {/*
                Обычное поле, без выпадающего списка. Выбирать категорию из
                списка тут незачем: у известного изделия она подставляется сама,
                а для нового её всё равно надо назвать. Несуществующая категория
                создаётся при сохранении.
              */}
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
                placeholder="Например: Метизы"
                autoComplete="off"
                required
              />
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
            {/*
              Выбранные теги показываются отдельно и всегда. Раньше выбранные
              подсвечивались в общем списке — и стоило отфильтровать список
              поиском, как выбор пропадал из глаз: непонятно, что уже отмечено.
            */}
            {selectedTags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedTags.map((t) => (
                  <Badge key={t.id} className="cursor-pointer gap-1" onClick={() => toggleTag(t.id)}>
                    {t.name}
                    <X className="h-3 w-3" />
                  </Badge>
                ))}
              </div>
            )}
            <Input
              placeholder="Поиск тега..."
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
            />
            <ScrollArea className="max-h-[140px] border rounded-md p-2">
              <div className="flex flex-wrap gap-2">
                {shownTags.map((t) => (
                  <Badge
                    key={t.id}
                    variant={selectedTagIds.includes(t.id) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleTag(t.id)}
                  >
                    {t.name}
                  </Badge>
                ))}
                {shownTags.length === 0 && (
                  <span className="text-sm text-muted-foreground">
                    {tagFilter ? "Ничего не найдено" : "Тегов пока нет"}
                  </span>
                )}
              </div>
              {/*
                Список ограничен: при сотне тегов рисовать их все — значит
                предлагать человеку искать глазами то, для чего есть поиск.
              */}
              {hiddenTagCount > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Ещё {hiddenTagCount} — уточните поиск
                </p>
              )}
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