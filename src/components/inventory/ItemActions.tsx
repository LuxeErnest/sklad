import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Archive, FolderTree, Pencil, Tag, Trash2 } from "lucide-react";
import { CategoriesModal } from "@/components/edit/CategoriesModal";
import { TagsModal } from "@/components/edit/TagsModal";
import {
  archiveComponent,
  getComponentGroups,
  scrapAllFromAllLocations,
  scrapFromLocation,
} from "@/lib/db";
import { updateItem } from "@/services/inventoryService";
import { getErrorMessage, logAndFormatError } from "@/services/errorHandler";
import { toast } from "@/hooks/use-toast";
import { InventoryItem } from "./InventoryTable";

/**
 * Действия над выбранной позицией: правка, списание, архив.
 *
 * Раньше жили на отдельной странице «Изменить» — со своей таблицей, дублировавшей
 * список склада, и своими фильтрами. Страница нужна была только затем, чтобы
 * выбрать строку, а выбрать её можно и на главном экране.
 */

const formSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  quantity: z.number().min(0, "Количество не может быть отрицательным"),
  category: z.string().min(1, "Категория обязательна"),
  location: z.string().min(1, "Расположение обязательно"),
  description: z.string().optional(),
  website: z.string().url("Неверный URL").optional().or(z.literal("")),
  price: z.number().min(0, "Цена не может быть отрицательной").optional(),
  minStock: z.number().min(0, "Минимальный запас не может быть отрицательным"),
});

type FormData = z.infer<typeof formSchema>;

interface ItemActionsProps {
  item: InventoryItem;
  categories: string[];
  onDone: () => void | Promise<void>;
}

export function ItemActions({ item, categories, onDone }: ItemActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [scrapOpen, setScrapOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);

  const [scrapQuantity, setScrapQuantity] = useState("");
  const [scrapLocation, setScrapLocation] = useState("");
  const [scrapReason, setScrapReason] = useState("");
  const [places, setPlaces] = useState<Awaited<ReturnType<typeof getComponentGroups>>>([]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      quantity: 0,
      category: "",
      location: "",
      description: "",
      website: "",
      price: undefined,
      minStock: 0,
    },
  });

  // Категории для выбора: к списку добавляется текущая, даже если её нет в
  // справочнике, — иначе поле окажется пустым и правка потеряет категорию.
  const categoryOptions = [...new Set([...categories, item.category].filter(Boolean))];

  const openEdit = () => {
    form.reset({
      name: item.name,
      quantity: item.quantity,
      category: item.category,
      location: item.location,
      description: item.description ?? "",
      website: item.url ?? "",
      price: item.price ?? undefined,
      minStock: item.minStock ?? 0,
    });
    setEditOpen(true);
  };

  const submitEdit = async (data: FormData) => {
    try {
      const result = await updateItem(item.id, data.quantity, {
        name: data.name,
        category: data.category,
        location: data.location,
        price: data.price,
        minStock: data.minStock,
        description: data.description,
        url: data.website,
      });
      if (result.success) {
        await onDone();
        toast({ title: result.userMessage ?? "Изделие обновлено" });
        setEditOpen(false);
      } else {
        toast({
          title: "Ошибка сохранения",
          description: result.userMessage ?? result.error ?? "Не удалось обновить изделие",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Ошибка при сохранении",
        description: logAndFormatError(error, "обновление изделия"),
        variant: "destructive",
      });
    }
  };

  const openScrap = async () => {
    setScrapQuantity("");
    setScrapLocation("");
    setScrapReason("");
    try {
      setPlaces(await getComponentGroups(item.id));
    } catch {
      setPlaces([]);
    }
    setScrapOpen(true);
  };

  const scrapAll = scrapQuantity !== "" && Number(scrapQuantity) === item.quantity;

  const submitScrap = async () => {
    const quantity = parseInt(scrapQuantity, 10);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast({ title: "Количество должно быть больше нуля", variant: "destructive" });
      return;
    }
    if (!scrapAll && !scrapLocation) {
      toast({
        title: "Выберите склад",
        description: "Списание идёт с конкретного места хранения",
        variant: "destructive",
      });
      return;
    }

    try {
      // Списание регистрируется один раз. Раньше здесь вызывались подряд две
      // функции, и каждая записывала в журнал своё списание: остаток уходил
      // вдвое больше запрошенного.
      if (scrapAll) {
        await scrapAllFromAllLocations(item.id, scrapReason);
        toast({ title: "Списано со всех складов", description: `«${item.name}» — ${quantity} шт.` });
      } else {
        await scrapFromLocation(item.id, scrapLocation, quantity, scrapReason);
        toast({
          title: "Списано",
          description: `«${item.name}» — ${quantity} шт. со склада «${scrapLocation}»`,
        });
      }
      setScrapOpen(false);
      await onDone();
    } catch (error) {
      toast({
        title: "Не удалось списать",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const submitArchive = async () => {
    setArchiveOpen(false);
    try {
      await archiveComponent(item.id);
      toast({
        title: "Изделие в архиве",
        description: "Убрано из списка. История сохранена, восстановить можно в настройках.",
      });
      await onDone();
    } catch (error) {
      toast({
        title: "Не удалось архивировать",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="outline" size="sm" onClick={openEdit} className="gap-1.5">
          <Pencil className="h-3.5 w-3.5" /> Изменить
        </Button>
        <Button variant="outline" size="sm" onClick={openScrap} className="gap-1.5">
          <Trash2 className="h-3.5 w-3.5" /> Списать
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setArchiveOpen(true)}
          className="gap-1.5"
        >
          <Archive className="h-3.5 w-3.5" /> В архив
        </Button>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Изменить изделие</DialogTitle>
            <DialogDescription>
              Изменение количества оформляется корректировкой, а не списанием
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(submitEdit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="item-name">Название *</Label>
                <Input id="item-name" {...form.register("name")} placeholder="Название изделия" />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="item-quantity">Количество *</Label>
                <Input
                  id="item-quantity"
                  type="number"
                  {...form.register("quantity", { valueAsNumber: true })}
                  placeholder="0"
                />
                {form.formState.errors.quantity && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.quantity.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="item-category">Категория *</Label>
                <div className="flex gap-2">
                  <Select
                    value={form.watch("category") || ""}
                    onValueChange={(value) => form.setValue("category", value)}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Выберите категорию" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setCategoriesOpen(true)}
                    title="Управление категориями"
                  >
                    <FolderTree className="h-4 w-4" />
                  </Button>
                </div>
                {form.formState.errors.category && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.category.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="item-location">Расположение *</Label>
                <Input id="item-location" {...form.register("location")} placeholder="Склад А-12" />
                {form.formState.errors.location && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.location.message}
                  </p>
                )}
              </div>
            </div>

            <div>
              <Button type="button" variant="outline" onClick={() => setTagsOpen(true)}>
                <Tag className="mr-1 h-4 w-4" /> Теги изделия
              </Button>
            </div>

            <div>
              <Label htmlFor="item-description">Описание</Label>
              <Textarea
                id="item-description"
                {...form.register("description")}
                placeholder="Описание изделия"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="item-website">Ссылка на сайт</Label>
                <Input
                  id="item-website"
                  {...form.register("website")}
                  placeholder="https://example.com"
                />
                {form.formState.errors.website && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.website.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="item-price">Цена (₽)</Label>
                <Input
                  id="item-price"
                  type="number"
                  step="0.01"
                  min="0"
                  {...form.register("price", {
                    setValueAs: (v) => (v === "" ? undefined : Number(v)),
                  })}
                  placeholder="0.00"
                />
                {form.formState.errors.price && (
                  <p className="text-sm text-destructive">{form.formState.errors.price.message}</p>
                )}
              </div>
              {/*
                Минимальный запас задаётся здесь — раньше его нельзя было
                указать нигде, поэтому у всех позиций он оставался нулём, а
                «низкий запас» в статистике вырождался в «ноль на складе».
              */}
              <div>
                <Label htmlFor="item-min-stock">Минимальный запас (шт.)</Label>
                <Input
                  id="item-min-stock"
                  type="number"
                  min="0"
                  step="1"
                  {...form.register("minStock", {
                    setValueAs: (v) => (v === "" ? 0 : Number(v)),
                  })}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Ниже этого остатка изделие попадёт в «низкий запас». 0 — не следить.
                </p>
                {form.formState.errors.minStock && (
                  <p className="text-sm text-destructive">{form.formState.errors.minStock.message}</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Отмена
              </Button>
              <Button type="submit">Сохранить изменения</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={scrapOpen} onOpenChange={setScrapOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Списание изделия</DialogTitle>
            <DialogDescription>
              Списание уменьшает остаток безвозвратно. Опечатку исправляют правкой количества, а
              не списанием.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="scrap-quantity">Количество *</Label>
              <Input
                id="scrap-quantity"
                type="number"
                min="1"
                max={item.quantity}
                value={scrapQuantity}
                onChange={(e) => setScrapQuantity(e.target.value)}
                placeholder="Введите количество"
              />
              <p className="text-sm text-muted-foreground">Доступно: {item.quantity} шт.</p>
            </div>

            {!scrapAll && (
              <div className="space-y-2">
                <Label htmlFor="scrap-location">Склад *</Label>
                <Select value={scrapLocation} onValueChange={setScrapLocation}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите склад" />
                  </SelectTrigger>
                  <SelectContent>
                    {places.map((place) => (
                      <SelectItem key={place.id} value={place.location}>
                        {place.location} ({place.quantity} шт.)
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
                placeholder="Например: брак, истёк срок годности"
              />
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
              <input
                type="checkbox"
                id="scrap-all"
                checked={scrapAll}
                onChange={(e) => {
                  setScrapQuantity(e.target.checked ? String(item.quantity) : "");
                  setScrapLocation("");
                }}
              />
              <Label htmlFor="scrap-all" className="text-sm">
                Списать весь остаток со всех складов
              </Label>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setScrapOpen(false)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={submitScrap}
              disabled={!scrapQuantity || (!scrapAll && !scrapLocation)}
            >
              Списать
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Убрать «{item.name}» в архив?</AlertDialogTitle>
            <AlertDialogDescription>
              Изделие исчезнет из списка склада, но история операций и остатки сохранятся.
              Вернуть его можно в настройках, в разделе архива.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={submitArchive}>В архив</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CategoriesModal
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        currentCategoryName={form.watch("category") || item.category}
        onSelect={(name) => form.setValue("category", name)}
        onDeleted={onDone}
      />

      <TagsModal
        open={tagsOpen}
        onOpenChange={setTagsOpen}
        componentId={item.id}
        onSaved={onDone}
      />
    </>
  );
}
