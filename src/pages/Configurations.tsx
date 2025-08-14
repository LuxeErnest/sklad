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
import { Separator } from "@/components/ui/separator";
import { Wrench, Plus, Save, Copy, Trash2, Package, DollarSign, Calculator, CheckCircle, AlertCircle, XCircle } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

// Mock data for configurations (fallback)
const mockComponents = [
  { id: 1, name: "SSD 1TB", quantity: 12, category: "Накопители", location: "Склад А-12", price: 150 },
  { id: 2, name: "DDR4 16GB", quantity: 34, category: "Память", location: "Склад B-02", price: 80 },
  { id: 3, name: "CPU Ryzen 7", quantity: 5, category: "Процессоры", location: "Склад А-03", price: 300 },
  { id: 4, name: "SATA кабель", quantity: 120, category: "Кабели", location: "Склад C-01", price: 5 },
  { id: 5, name: "Материнская плата", quantity: 8, category: "Платы", location: "Склад А-05", price: 200 },
  { id: 6, name: "Блок питания 650W", quantity: 15, category: "Питание", location: "Склад B-08", price: 120 },
];

const mockConfigurations = [
  {
    id: 1,
    name: "Игровой ПК",
    description: "Конфигурация для игрового компьютера",
    components: [
      { componentId: 3, quantity: 1, name: "CPU Ryzen 7" },
      { componentId: 5, quantity: 1, name: "Материнская плата" },
      { componentId: 2, quantity: 2, name: "DDR4 16GB" },
      { componentId: 1, quantity: 1, name: "SSD 1TB" },
      { componentId: 6, quantity: 1, name: "Блок питания 650W" },
    ],
    totalValue: 1050,
    totalItems: 6,
    createdAt: "2025-08-01",
  },
  {
    id: 2,
    name: "Офисный ПК",
    description: "Конфигурация для офисного компьютера",
    components: [
      { componentId: 3, quantity: 1, name: "CPU Ryzen 7" },
      { componentId: 5, quantity: 1, name: "Материнская плата" },
      { componentId: 2, quantity: 1, name: "DDR4 16GB" },
      { componentId: 1, quantity: 1, name: "SSD 1TB" },
    ],
    totalValue: 730,
    totalItems: 4,
    createdAt: "2025-08-05",
  },
  {
    id: 3,
    name: "Серверная сборка",
    description: "Конфигурация для сервера",
    components: [
      { componentId: 3, quantity: 2, name: "CPU Ryzen 7" },
      { componentId: 5, quantity: 1, name: "Материнская плата" },
      { componentId: 2, quantity: 4, name: "DDR4 16GB" },
      { componentId: 1, quantity: 2, name: "SSD 1TB" },
      { componentId: 6, quantity: 1, name: "Блок питания 650W" },
    ],
    totalValue: 1860,
    totalItems: 10,
    createdAt: "2025-08-10",
  },
];

const formSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  description: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

const Configurations = () => {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [configurations, setConfigurations] = useState(mockConfigurations);
  const [selectedConfiguration, setSelectedConfiguration] = useState<typeof mockConfigurations[0] | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedComponents, setSelectedComponents] = useState<{[key: number]: number}>({});

  const [components, setComponents] = useState(mockComponents);
  const categories = useMemo(() => Array.from(new Set(components.map(item => item.category))), [components]);
  useEffect(() => {
    (async () => {
      try {
        const { getComponents } = await import("@/lib/db");
        const rows = await getComponents();
        if (rows && Array.isArray(rows) && rows.length > 0) {
          setComponents(rows as any);
        }
      } catch {}
    })();
  }, []);

  const filteredComponents = useMemo(() => {
    return components.filter(item => {
      const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
      const matchCategory = categoryFilter === "all" || item.category === categoryFilter;
      return matchSearch && matchCategory;
    });
  }, [search, categoryFilter]);

  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | AvailabilityStatus>("all");
  const [sortBy, setSortBy] = useState<'name' | 'value' | 'canBuild' | 'date'>("canBuild");

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const calculateTotals = (selected: {[key: number]: number}) => {
    let totalValue = 0;
    let totalItems = 0;
    
    Object.entries(selected).forEach(([componentId, quantity]) => {
      const component = (components as any[]).find((c: any) => c.id === parseInt(componentId as any));
      if (component) {
        totalValue += component.price * quantity;
        totalItems += quantity;
      }
    });
    
    return { totalValue, totalItems };
  };

  type AvailabilityStatus = 'available' | 'partial' | 'unavailable' | 'missing';
  interface AvailabilityItem {
    componentId: number;
    quantity: number;
    name: string;
    available: number;
    required: number;
    status: AvailabilityStatus;
    stockComponent: typeof mockComponents[number] | null;
  }

  const checkConfigurationAvailability = (config: typeof mockConfigurations[0]) => {
    const availability: AvailabilityItem[] = config.components.map(comp => {
      const stockComponent = components.find(c => c.id === comp.componentId);
      if (!stockComponent) return { ...comp, available: 0, required: comp.quantity, status: 'missing' as const, stockComponent: null } as AvailabilityItem;
      
      const available = stockComponent.quantity;
      const required = comp.quantity;
      const status: AvailabilityStatus = available >= required ? 'available' : available > 0 ? 'partial' : 'unavailable';
      
      return { ...comp, available, required, status, stockComponent } as AvailabilityItem;
    });

    const allAvailable = availability.every(item => item.status === 'available');
    const anyAvailable = availability.some(item => item.status === 'available');
    const noneAvailable = availability.every(item => item.status === 'unavailable');

    return {
      items: availability,
      allAvailable,
      anyAvailable,
      noneAvailable,
      availableCount: availability.filter(item => item.status === 'available').length,
      totalCount: availability.length
    };
  };

  const getAvailabilityIcon = (status: 'available' | 'partial' | 'unavailable' | 'missing') => {
    switch (status) {
      case 'available':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'partial':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'unavailable':
      case 'missing':
        return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getAvailabilityBadge = (config: typeof mockConfigurations[0]) => {
    const availability = checkConfigurationAvailability(config);
    
    if (availability.allAvailable) {
      return <Badge variant="default" className="bg-green-500">Доступна</Badge>;
    } else if (availability.anyAvailable) {
      return <Badge variant="secondary" className="bg-yellow-500 text-yellow-900">Частично</Badge>;
    } else {
      return <Badge variant="destructive">Недоступна</Badge>;
    }
  };

  const handleCreateConfiguration = (data: FormData) => {
    const { totalValue, totalItems } = calculateTotals(selectedComponents);
    
    const newConfiguration = {
      id: Math.max(...configurations.map(c => c.id), 0) + 1,
      name: data.name,
      description: data.description || "",
      components: Object.entries(selectedComponents).map(([componentId, quantity]) => {
        const component = mockComponents.find(c => c.id === parseInt(componentId));
        return {
          componentId: parseInt(componentId),
          quantity,
          name: component?.name || "",
        };
      }),
      totalValue,
      totalItems,
      createdAt: new Date().toISOString().split('T')[0],
    };
    
    setConfigurations(prev => [...prev, newConfiguration]);
    setIsCreateDialogOpen(false);
    setSelectedComponents({});
    form.reset();
  };

  const handleDeleteConfiguration = (id: number) => {
    if (confirm("Вы уверены, что хотите удалить эту конфигурацию?")) {
      setConfigurations(prev => prev.filter(config => config.id !== id));
    }
  };

  const updateComponentQuantity = (componentId: number, quantity: number) => {
    if (quantity <= 0) {
      const newSelected = { ...selectedComponents };
      delete newSelected[componentId];
      setSelectedComponents(newSelected);
    } else {
      setSelectedComponents(prev => ({ ...prev, [componentId]: quantity }));
    }
  };

  const availabilityStats = useMemo(() => {
    const stats = configurations.map(config => checkConfigurationAvailability(config));
    return {
      total: configurations.length,
      available: stats.filter(s => s.allAvailable).length,
      partial: stats.filter(s => s.anyAvailable && !s.allAvailable).length,
      unavailable: stats.filter(s => s.noneAvailable).length,
    };
  }, [configurations]);

  const getMaxBuilds = (config: typeof mockConfigurations[0]) => {
    const availability = checkConfigurationAvailability(config);
    if (availability.items.length === 0) return 0;
    const limits = availability.items.map(i => Math.floor(i.available / i.required));
    return Math.max(0, Math.min(...limits));
  };

  const filteredConfigurations = useMemo(() => {
    const list = configurations.filter(config => {
      const text = (config.name + ' ' + (config.description || '')).toLowerCase();
      const matchSearch = text.includes(search.toLowerCase());
      if (!matchSearch) return false;

      if (availabilityFilter !== 'all') {
        const a = checkConfigurationAvailability(config);
        if (availabilityFilter === 'available' && !a.allAvailable) return false;
        if (availabilityFilter === 'partial' && !(a.anyAvailable && !a.allAvailable)) return false;
        if (availabilityFilter === 'unavailable' && !a.noneAvailable) return false;
        if (availabilityFilter === 'missing') return false;
      }
      return true;
    });

    const sorted = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'value':
          return b.totalValue - a.totalValue;
        case 'canBuild':
          return getMaxBuilds(b) - getMaxBuilds(a);
        case 'date':
          return (new Date(b.createdAt).getTime()) - (new Date(a.createdAt).getTime());
        default:
          return 0;
      }
    });
    return sorted;
  }, [configurations, search, availabilityFilter, sortBy]);

  const summary = { 
    name: "Конфигурации", 
    quantity: filteredConfigurations.length, 
    location: "Склад", 
    category: "Сборки" 
  };

  return (
    <div className="min-h-screen relative">
      <Seo 
        title="Конфигурации компонентов — создание сборок"
        description="Создание и управление конфигурациями компонентов. Подсчет стоимости и количества."
        canonical="/configurations"
      />

      <div className="absolute inset-0 -z-10">
        <BackgroundGlow />
      </div>

      <div className="grid grid-cols-[auto_1fr]">
        <Sidebar />
        <div className="min-h-screen flex flex-col">
          <TopBar search={search} onSearch={setSearch} summary={summary} />
          
          <main className="container mx-auto px-4 py-6 space-y-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Wrench className="h-8 w-8 text-primary" />
                <div>
                  <h1 className="text-3xl font-bold">Конфигурации</h1>
                  <p className="text-muted-foreground">Создание и управление сборками компонентов</p>
                </div>
              </div>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Создать конфигурацию
              </Button>
            </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Существующие конфигурации */}
              <Card>
                <CardHeader>
                  <CardTitle>Существующие конфигурации</CardTitle>
                  <CardDescription>Выберите конфигурацию для просмотра</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-3 mb-4">
                      <div className="w-48">
                        <Label>Доступность</Label>
                        <Select value={availabilityFilter} onValueChange={(v) => setAvailabilityFilter(v as any)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Все</SelectItem>
                            <SelectItem value="available">Доступны</SelectItem>
                            <SelectItem value="partial">Частично</SelectItem>
                            <SelectItem value="unavailable">Недоступны</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-48">
                        <Label>Сортировка</Label>
                        <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="canBuild">Можно собрать</SelectItem>
                            <SelectItem value="value">Стоимость</SelectItem>
                            <SelectItem value="name">Название</SelectItem>
                            <SelectItem value="date">Дата</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  <div className="space-y-3">
                    {filteredConfigurations.map(config => {
                      const availability = checkConfigurationAvailability(config);
                        const maxBuilds = getMaxBuilds(config);
                      return (
                        <div key={config.id} className="border rounded-lg p-4 hover:bg-accent/50 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="font-medium">{config.name}</h3>
                            <div className="flex gap-2">
                              {getAvailabilityBadge(config)}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedConfiguration(config);
                                  setIsViewDialogOpen(true);
                                }}
                              >
                                <Package className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDeleteConfiguration(config.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          {config.description && (
                            <p className="text-sm text-muted-foreground mb-2">{config.description}</p>
                          )}
                          <div className="flex items-center gap-4 text-sm">
                            <span className="flex items-center gap-1">
                              <Package className="h-4 w-4" />
                              {config.totalItems} компонентов
                            </span>
                            <span className="flex items-center gap-1">
                              <DollarSign className="h-4 w-4" />
                              {config.totalValue.toLocaleString()}₽
                            </span>
                            <span className="text-muted-foreground">{config.createdAt}</span>
                            <span className="ml-auto flex items-center gap-1">
                              <Badge variant={maxBuilds > 0 ? "default" : "secondary"}>{maxBuilds}</Badge>
                              можно собрать
                            </span>
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            Доступность: {availability.availableCount}/{availability.totalCount} компонентов
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Статистика */}
              <Card>
                <CardHeader>
                  <CardTitle>Статистика</CardTitle>
                  <CardDescription>Общая информация о конфигурациях</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 bg-primary/5 rounded-lg">
                      <Calculator className="h-8 w-8 text-primary mx-auto mb-2" />
                      <div className="text-2xl font-bold">{configurations.length}</div>
                      <div className="text-sm text-muted-foreground">Всего конфигураций</div>
                    </div>
                    <div className="text-center p-4 bg-primary/5 rounded-lg">
                      <DollarSign className="h-8 w-8 text-primary mx-auto mb-2" />
                      <div className="text-2xl font-bold">
                        {configurations.reduce((sum, config) => sum + config.totalValue, 0).toLocaleString()}₽
                      </div>
                      <div className="text-sm text-muted-foreground">Общая стоимость</div>
                    </div>
                  </div>
                  
                  <Separator className="my-4" />
                  
                  <div>
                    <h4 className="font-medium mb-3">Доступность конфигураций</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          Полностью доступны
                        </span>
                        <Badge variant="default" className="bg-green-500">{availabilityStats.available}</Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-yellow-500" />
                          Частично доступны
                        </span>
                        <Badge variant="secondary" className="bg-yellow-500 text-yellow-900">{availabilityStats.partial}</Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-red-500" />
                          Недоступны
                        </span>
                        <Badge variant="destructive">{availabilityStats.unavailable}</Badge>
                      </div>
                    </div>
                  </div>
                  
                  <Separator className="my-4" />
                  
                  <div>
                    <h4 className="font-medium mb-3">Популярные компоненты</h4>
                    <div className="space-y-2">
                      {mockComponents.slice(0, 5).map(component => (
                        <div key={component.id} className="flex justify-between items-center text-sm">
                          <span>{component.name}</span>
                          <Badge variant="secondary">{component.quantity} шт.</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>

      {/* Диалог создания конфигурации */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Создать новую конфигурацию</DialogTitle>
            <DialogDescription>
              Выберите компоненты и создайте конфигурацию
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={form.handleSubmit(handleCreateConfiguration)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Название конфигурации *</Label>
                <Input
                  id="name"
                  {...form.register("name")}
                  placeholder="Игровой ПК"
                />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="description">Описание</Label>
                <Input
                  id="description"
                  {...form.register("description")}
                  placeholder="Описание конфигурации"
                />
              </div>
            </div>

            <div>
              <Label>Выбор компонентов</Label>
              <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                {filteredComponents.map(component => (
                  <div key={component.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium">{component.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {component.category} • {component.price}₽/шт. • В наличии: {component.quantity} шт.
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        max={component.quantity}
                        value={selectedComponents[component.id] || ""}
                        onChange={(e) => updateComponentQuantity(component.id, parseInt(e.target.value) || 0)}
                        placeholder="0"
                        className="w-20"
                      />
                      <Button
                        size="sm"
                        variant={selectedComponents[component.id] ? "default" : "outline"}
                        onClick={() => updateComponentQuantity(component.id, selectedComponents[component.id] ? 0 : 1)}
                      >
                        {selectedComponents[component.id] ? "Убрать" : "Добавить"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {Object.keys(selectedComponents).length > 0 && (
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-2">Итоги конфигурации</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-2xl font-bold">{calculateTotals(selectedComponents).totalValue.toLocaleString()}₽</div>
                    <div className="text-sm text-muted-foreground">Общая стоимость</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{calculateTotals(selectedComponents).totalItems}</div>
                    <div className="text-sm text-muted-foreground">Общее количество</div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsCreateDialogOpen(false);
                  setSelectedComponents({});
                  form.reset();
                }}
              >
                Отмена
              </Button>
              <Button type="submit" disabled={Object.keys(selectedComponents).length === 0}>
                <Save className="h-4 w-4 mr-2" />
                Создать конфигурацию
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Диалог просмотра конфигурации */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedConfiguration?.name}</DialogTitle>
            <DialogDescription>
              {selectedConfiguration?.description}
            </DialogDescription>
          </DialogHeader>
          
          {selectedConfiguration && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-primary/5 rounded-lg">
                  <Package className="h-8 w-8 text-primary mx-auto mb-2" />
                  <div className="text-2xl font-bold">{selectedConfiguration.totalItems}</div>
                  <div className="text-sm text-muted-foreground">Компонентов</div>
                </div>
                <div className="text-center p-4 bg-primary/5 rounded-lg">
                  <DollarSign className="h-8 w-8 text-primary mx-auto mb-2" />
                  <div className="text-2xl font-bold">{selectedConfiguration.totalValue.toLocaleString()}₽</div>
                  <div className="text-sm text-muted-foreground">Общая стоимость</div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-3">Компоненты и доступность</h4>
                <div className="space-y-2">
                  {checkConfigurationAvailability(selectedConfiguration).items.map((item, index) => (
                    <div key={index} className="flex justify-between items-center p-2 border rounded">
                      <div className="flex items-center gap-2">
                        {getAvailabilityIcon(item.status)}
                        <span>{item.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{item.required} шт.</Badge>
                        <span className="text-sm text-muted-foreground">
                          {item.available}/{item.required}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-sm text-muted-foreground">
                Создано: {selectedConfiguration.createdAt}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Configurations;
