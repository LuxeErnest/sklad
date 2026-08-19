import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import UniversalBackground from "@/components/UniversalBackground";
import Seo from "@/components/seo/Seo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Trash2, Plus, Search, Filter, FolderTree, Tag, Archive } from "lucide-react";
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
import { useState, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { upsertComponent, archiveComponent, addScrappedItem, getComponentGroups, scrapFromLocation, scrapAllFromAllLocations } from "@/lib/db";
import { updateItem } from "@/services/inventoryService";
import { logAndFormatError, getErrorMessage } from "@/services/errorHandler";
import { toast } from "@/hooks/use-toast";
import { useApp } from "@/contexts/AppContext";
import { useSearchParams } from "react-router-dom";
import { CategoriesModal } from "@/components/edit/CategoriesModal";
import { TagsModal } from "@/components/edit/TagsModal";
import { TagsManager } from "@/components/settings/TagsManager";
// Fallback mock only if DB empty
const mockItems = [
  { id: 1, name: "SSD 1TB", quantity: 12, category: "Накопители", location: "Склад А-12", lastUpdated: "2025-08-01", description: "Твердотельный накопитель 1TB", website: "https://example.com/ssd", price: 150 },
];

const formSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  quantity: z.number().min(0, "Количество не может быть отрицательным"),
  category: z.string().min(1, "Категория обязательна"),
  location: z.string().min(1, "Расположение обязательно"),
  description: z.string().optional(),
  website: z.string().url("Неверный URL").optional().or(z.literal("")),
  price: z.number().min(0, "Цена не может быть отрицательной").optional(),
});

type FormData = z.infer<typeof formSchema>;

/**
 * Форма редактирования работает и с записями из БД, и с запасным набором.
 * Раньше состояние типизировалось прямо по мок-объекту, из-за чего InventoryItem
 * в него не присваивался: у него нет поля website.
 */
type EditableItem = {
  id: number;
  name: string;
  quantity: number;
  category: string;
  location: string;
  lastUpdated?: string;
  description?: string | null;
  website?: string;
  price?: number | null;
};

const Edit = () => {
  const { items, categories, refreshItems, getItemById } = useApp();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [editingItem, setEditingItem] = useState<EditableItem | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [scrapItem, setScrapItem] = useState<EditableItem | null>(null);
  const [isScrapDialogOpen, setIsScrapDialogOpen] = useState(false);
  const [scrapQuantity, setScrapQuantity] = useState("");
  const [scrapLocation, setScrapLocation] = useState("");
  const [scrapReason, setScrapReason] = useState("");
  const [availableGroups, setAvailableGroups] = useState<
    Awaited<ReturnType<typeof getComponentGroups>>
  >([]);
  const [categoriesModalOpen, setCategoriesModalOpen] = useState(false);
  const [tagsModalOpen, setTagsModalOpen] = useState(false);
  const [tagsManagerModalOpen, setTagsManagerModalOpen] = useState(false);
  // Намеренно узкий тип: архивированию нужны только идентификатор и название.
  // Полный typeof mockItems[0] здесь не подходит — InventoryItem из БД не имеет
  // поля website, из-за чего присваивание не проходит по типам.
  const [itemToArchive, setItemToArchive] = useState<{ id: number; name: string } | null>(null);

  // Auto-select item from URL parameter
  useEffect(() => {
    const itemIdParam = searchParams.get('itemId');
    if (itemIdParam) {
      const itemId = parseInt(itemIdParam);
      const item = getItemById(itemId);
      if (item) {
        handleEdit(item);
      }
    }
  }, [searchParams, getItemById]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchSearch = item.name.toLowerCase().includes(search.toLowerCase()) ||
                         item.description?.toLowerCase().includes(search.toLowerCase());
      const matchCategory = categoryFilter === "all" || item.category === categoryFilter;
      return matchSearch && matchCategory;
    });
  }, [items, search, categoryFilter]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      quantity: 0,
      category: "",
      location: "",
      description: "",
      website: "",
      price: 0,
    },
  });

  const categoryOptions = useMemo(() => {
    const list = [...categories];
    const current = editingItem?.category || form.watch("category");
    if (current && !list.includes(current)) list.push(current);
    return list;
  }, [categories, editingItem?.category, form.watch("category")]);

  // Items are loaded from context, no need to load separately
  useEffect(() => {
    refreshItems();
  }, [refreshItems]);

  const onSubmit = async (data: FormData) => {
    try {
      if (editingItem) {
        const result = await updateItem(
          editingItem.id,
          data.quantity,
          {
            name: data.name,
            category: data.category,
            location: data.location,
            price: data.price,
            description: data.description,
            url: data.website,
          }
        );

        if (result.success) {
          await refreshItems();
          toast({ title: result.userMessage ?? "Товар успешно обновлён" });
          setIsEditDialogOpen(false);
          setEditingItem(null);
          form.reset();
        } else {
          toast({
            title: "Ошибка сохранения",
            description: result.userMessage ?? result.error ?? "Не удалось обновить товар",
            variant: "destructive",
          });
        }
      } else {
        setIsEditDialogOpen(false);
        setEditingItem(null);
        form.reset();
      }
    } catch (error) {
      const errorMessage = logAndFormatError(error, "обновление товара");
      toast({
        title: "Ошибка при сохранении",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleEdit = (item: EditableItem) => {
    setEditingItem(item);
    form.reset({
      name: item.name,
      quantity: item.quantity,
      category: item.category,
      location: item.location,
      description: item.description || "",
      website: item.website || "",
      price: item.price || 0,
    });
    setIsEditDialogOpen(true);
  };

  const handleArchiveConfirm = async () => {
    if (!itemToArchive) return;
    const item = itemToArchive;
    setItemToArchive(null);
    try {
      await archiveComponent(item.id);
      toast({
        title: "Изделие в архиве",
        description: `«${item.name}» убрано из списка. История сохранена, восстановить можно в настройках.`,
      });
      await refreshItems();
    } catch (error) {
      console.error('Ошибка архивирования:', error);
      toast({
        title: "Не удалось архивировать",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const handleScrap = async (item: EditableItem) => {
    setScrapItem(item);
    setScrapQuantity("");
    setScrapLocation("");
    setScrapReason("");
    
    // Load available groups for this component
    try {
      const groups = await getComponentGroups(item.id);
      setAvailableGroups(groups);
    } catch (error) {
      console.error('Error loading groups:', error);
      setAvailableGroups([]);
    }
    
    setIsScrapDialogOpen(true);
  };

  const handleScrapSubmit = async () => {
    if (!scrapItem || !scrapQuantity) {
      toast({ title: "Укажите количество", description: "Без количества списать нечего", variant: "destructive" });
      return;
    }

    const quantity = parseInt(scrapQuantity);
    if (quantity <= 0) {
      toast({ title: "Количество должно быть больше нуля", variant: "destructive" });
      return;
    }

    // Проверяем, нужно ли выбирать склад (только если списываем не все)
    const isScrapAll = quantity === scrapItem.quantity;
    if (!isScrapAll && !scrapLocation) {
      toast({ title: "Выберите склад", description: "Списание идёт с конкретного места хранения", variant: "destructive" });
      return;
    }

    try {
      if (isScrapAll) {
        // Списание всего количества со всех складов
        // Delete all groups for this component
        await scrapAllFromAllLocations(scrapItem.id);
        
        // Add to scrapped items report (don't update quantity - already done by scrapAllFromAllLocations)
        await addScrappedItem({
          componentId: scrapItem.id,
          quantity: quantity,
          reason: scrapReason || "Полное списание со всех складов",
          scrappedBy: "Пользователь",
          updateQuantity: false
        });

        toast({ title: "Списано со всех складов", description: `«${scrapItem.name}» — ${quantity} шт.` });
      } else {
        // Списание частичного количества с конкретного склада
        // Update group quantity or delete if reaches 0
        await scrapFromLocation(scrapItem.id, scrapLocation, quantity);
        
        // Add to scrapped items report (don't update quantity - already done by scrapFromLocation)
        await addScrappedItem({
          componentId: scrapItem.id,
          quantity: quantity,
          reason: scrapReason || `Списание со склада ${scrapLocation}`,
          scrappedBy: "Пользователь",
          updateQuantity: false
        });

        toast({ title: "Списано", description: `«${scrapItem.name}» — ${quantity} шт. со склада «${scrapLocation}»` });
      }

      setIsScrapDialogOpen(false);
      setScrapItem(null);
      
      // Reload items from context
      await refreshItems();
    } catch (error) {
      console.error('Error scrapping item:', error);
      toast({
        title: "Не удалось списать",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const summary = { 
    name: "Редактирование", 
    quantity: filteredItems.length, 
    location: "Склад", 
    category: "Компоненты" 
  };

  return (
    <div className="min-h-screen relative">
      <Seo 
        title="Редактирование компонентов — управление складом"
        description="Редактирование и управление компонентами склада. Изменение количества, расположения, описания."
        canonical="/edit"
      />

      <div className="absolute inset-0 -z-10">
        <UniversalBackground />
      </div>

      <div className="grid grid-cols-[auto_1fr]">
        <Sidebar />
        <div className="min-h-screen flex flex-col">
          <TopBar search={search} onSearch={setSearch} summary={summary} />
          
          <main className="container mx-auto px-4 py-6 space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <Pencil className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold">Редактирование компонентов</h1>
                <p className="text-muted-foreground">Изменение информации о компонентах склада</p>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Фильтры и управление</CardTitle>
                <CardDescription>Настройте фильтры и управляйте тегами и категориями</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <Label htmlFor="category-filter">Категория</Label>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Все категории</SelectItem>
                        {categories.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  <Button type="button" variant="outline" onClick={() => setTagsManagerModalOpen(true)}>
                    <Tag className="h-4 w-4 mr-2" />
                    Управление тегами
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setCategoriesModalOpen(true)}>
                    <FolderTree className="h-4 w-4 mr-2" />
                    Управление категориями
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Компоненты склада</CardTitle>
                <CardDescription>Выберите компонент для редактирования</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Название</TableHead>
                      <TableHead>Категория</TableHead>
                      <TableHead>Количество</TableHead>
                      <TableHead>Расположение</TableHead>
                      <TableHead>Последнее обновление</TableHead>
                      <TableHead>Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map(item => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{item.name}</div>
                            {item.description && (
                              <div className="text-sm text-muted-foreground">{item.description}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{item.category}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{item.quantity} шт.</div>
                          {item.price && (
                            <div className="text-sm text-muted-foreground">{item.price}₽/шт.</div>
                          )}
                        </TableCell>
                        <TableCell>{item.location}</TableCell>
                        <TableCell>{item.lastUpdated}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEdit(item)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleScrap(item)}
                              title="Списать"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setItemToArchive(item)}
                              title="Убрать в архив"
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </main>
        </div>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Редактировать компонент</DialogTitle>
            <DialogDescription>
              Измените информацию о компоненте и сохраните изменения
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Название *</Label>
                <Input
                  id="name"
                  {...form.register("name")}
                  placeholder="Название компонента"
                />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="quantity">Количество *</Label>
                <Input
                  id="quantity"
                  type="number"
                  {...form.register("quantity", { valueAsNumber: true })}
                  placeholder="0"
                />
                {form.formState.errors.quantity && (
                  <p className="text-sm text-destructive">{form.formState.errors.quantity.message}</p>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="category">Категория *</Label>
                <div className="flex gap-2">
                  <Select value={form.watch("category") || ""} onValueChange={(value) => form.setValue("category", value)}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Выберите категорию" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="icon" onClick={() => setCategoriesModalOpen(true)} title="Управление категориями">
                    <FolderTree className="h-4 w-4" />
                  </Button>
                </div>
                {form.formState.errors.category && (
                  <p className="text-sm text-destructive">{form.formState.errors.category.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="location">Расположение *</Label>
                <Input
                  id="location"
                  {...form.register("location")}
                  placeholder="Склад А-12"
                />
                {form.formState.errors.location && (
                  <p className="text-sm text-destructive">{form.formState.errors.location.message}</p>
                )}
              </div>
            </div>
            <div>
              <Button type="button" variant="outline" onClick={() => setTagsModalOpen(true)}>
                <Tag className="h-4 w-4 mr-1" /> Теги изделия
              </Button>
            </div>

            <div>
              <Label htmlFor="description">Описание</Label>
              <Textarea
                id="description"
                {...form.register("description")}
                placeholder="Описание компонента"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="website">Ссылка на сайт</Label>
                <Input
                  id="website"
                  {...form.register("website")}
                  placeholder="https://example.com"
                />
                {form.formState.errors.website && (
                  <p className="text-sm text-destructive">{form.formState.errors.website.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="price">Цена (₽)</Label>
                <Input
                  id="price"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  defaultValue={editingItem?.price?.toFixed?.(2) ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const sanitized = raw
                      .replace(/[^0-9.]/g, '')
                      .replace(/(\..*)\./g, '$1');
                    const parts = sanitized.split('.');
                    const limited = parts.length === 2 ? parts[0] + '.' + parts[1].slice(0, 2) : parts[0];
                    const num = limited === '' || limited === '.' ? undefined : Number(limited);
                    form.setValue('price', Number.isFinite(num as number) ? (num as number) : undefined, { shouldValidate: true });
                    e.currentTarget.value = limited;
                  }}
                  onBlur={(e) => {
                    const num = Number(e.currentTarget.value);
                    if (!isNaN(num)) {
                      e.currentTarget.value = num.toFixed(2);
                      form.setValue('price', num, { shouldValidate: true });
                    }
                  }}
                />
                {form.formState.errors.price && (
                  <p className="text-sm text-destructive">{form.formState.errors.price.message}</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEditDialogOpen(false);
                  setEditingItem(null);
                  form.reset();
                }}
              >
                Отмена
              </Button>
              <Button type="submit">
                Сохранить изменения
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Scrap Dialog */}
      <Dialog open={isScrapDialogOpen} onOpenChange={setIsScrapDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Списание товара</DialogTitle>
            <DialogDescription>
              Укажите количество и склад для списания товара "{scrapItem?.name}"
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="scrap-quantity">Количество для списания *</Label>
              <Input
                id="scrap-quantity"
                type="number"
                min="1"
                max={scrapItem?.quantity || 0}
                value={scrapQuantity}
                onChange={(e) => setScrapQuantity(e.target.value)}
                placeholder="Введите количество"
              />
              <p className="text-sm text-muted-foreground">
                Доступно: {scrapItem?.quantity || 0} шт.
              </p>
            </div>

            {scrapQuantity !== scrapItem?.quantity?.toString() && (
              <div className="space-y-2">
                <Label htmlFor="scrap-location">Склад *</Label>
                <Select value={scrapLocation} onValueChange={setScrapLocation}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите склад" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableGroups.map((group) => (
                      <SelectItem key={group.id} value={group.location}>
                        {group.location} ({group.quantity} шт.)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="scrap-reason">Причина списания</Label>
              <Input
                id="scrap-reason"
                value={scrapReason}
                onChange={(e) => setScrapReason(e.target.value)}
                placeholder="Например: Брак, истечение срока годности"
              />
            </div>

            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <input
                type="checkbox"
                id="scrap-all"
                checked={scrapQuantity === scrapItem?.quantity?.toString()}
                onChange={(e) => {
                  if (e.target.checked) {
                    setScrapQuantity(scrapItem?.quantity?.toString() || "");
                    setScrapLocation(""); // Очищаем выбор склада при списании всего
                  } else {
                    setScrapQuantity("");
                    setScrapLocation("");
                  }
                }}
              />
              <Label htmlFor="scrap-all" className="text-sm">
                Списать все количество товара со всех складов
              </Label>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setIsScrapDialogOpen(false)}
            >
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={handleScrapSubmit}
              disabled={!scrapQuantity || (scrapQuantity !== scrapItem?.quantity?.toString() && !scrapLocation)}
            >
              Списать товар
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CategoriesModal
        open={categoriesModalOpen}
        onOpenChange={setCategoriesModalOpen}
        currentCategoryName={form.watch("category") || ""}
        onSelect={(name) => { form.setValue("category", name); setCategoriesModalOpen(false); }}
        onDeleted={refreshItems}
      />
      <TagsModal
        open={tagsModalOpen}
        onOpenChange={setTagsModalOpen}
        componentId={editingItem?.id ?? null}
        onSaved={refreshItems}
      />
      <Dialog open={tagsManagerModalOpen} onOpenChange={setTagsManagerModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Управление тегами</DialogTitle>
            <DialogDescription>
              Создание, редактирование и удаление тегов для классификации товаров
            </DialogDescription>
          </DialogHeader>
          <TagsManager />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!itemToArchive} onOpenChange={(open) => !open && setItemToArchive(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Убрать «{itemToArchive?.name}» в архив?</AlertDialogTitle>
            <AlertDialogDescription>
              Изделие пропадёт из списков и статистики, но перемещения, поставки, списания
              и документы останутся. Восстановить можно в настройках, в разделе «Архив».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchiveConfirm}>В архив</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Edit;
