import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import BackgroundGlow from "@/components/common/BackgroundGlow";
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
import { Pencil, Trash2, Plus, Search, Filter } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { getComponents, upsertComponent, deleteComponent } from "@/lib/db";
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

const Edit = () => {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [items, setItems] = useState(mockItems);
  const [editingItem, setEditingItem] = useState<typeof mockItems[0] | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const categories = useMemo(() => Array.from(new Set(items.map(item => item.category))), [items]);

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

  useEffect(() => {
    (async () => {
      try {
        const rows = await getComponents();
        if (rows && Array.isArray(rows) && rows.length > 0) {
          setItems(rows as any);
        }
      } catch {}
    })();
  }, []);

  const onSubmit = async (data: FormData) => {
    if (editingItem) {
      const id = await upsertComponent({
        id: editingItem.id,
        name: data.name,
        category: data.category,
        location: data.location,
        quantity: data.quantity,
        price: data.price,
      } as any);
      setItems(prev => prev.map(item => item.id === id ? { ...item, ...data, lastUpdated: new Date().toISOString().split('T')[0] } as any : item));
    }
    setIsEditDialogOpen(false);
    setEditingItem(null);
    form.reset();
  };

  const handleEdit = (item: typeof mockItems[0]) => {
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

  const handleDelete = async (id: number) => {
    if (confirm("Вы уверены, что хотите удалить этот компонент?")) {
      await deleteComponent(id);
      setItems(prev => prev.filter(item => item.id !== id));
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
        <BackgroundGlow />
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
                <CardTitle>Фильтры</CardTitle>
                <CardDescription>Настройте фильтры для поиска нужных компонентов</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  <div className="flex-1">
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
                              onClick={() => handleDelete(item.id)}
                            >
                              <Trash2 className="h-4 w-4" />
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
                <Select value={form.watch("category")} onValueChange={(value) => form.setValue("category", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите категорию" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  type="number"
                  {...form.register("price", { valueAsNumber: true })}
                  placeholder="0"
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
    </div>
  );
};

export default Edit;
