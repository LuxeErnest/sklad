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
import { Separator } from "@/components/ui/separator";
import { Wrench, Plus, Save, Copy, Trash2, Package, Banknote, Calculator, CheckCircle, AlertCircle, XCircle, PackageOpen, RotateCcw } from "lucide-react";
import { useState, useMemo, useEffect, useCallback } from "react";
import { getConfigurations, getConfigurationComponents, createConfiguration, deleteConfiguration, getAssembledCounts, assembleConfiguration, disassembleConfiguration, writeOffConfiguration, updateConfiguration } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useApp } from "@/contexts/AppContext";
import { useConfirm } from "@/components/common/ConfirmDialog";
import { useSearchParams } from "react-router-dom";
import { ItemLink } from "@/components/common/ItemLink";
import { toast } from "@/hooks/use-toast";

// Empty arrays for clean start
const mockComponents: any[] = [];
const mockConfigurations: any[] = [];

const formSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  description: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

const Configurations = () => {
  const { items, categories, refreshItems } = useApp();
  const { confirm, dialog } = useConfirm();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [configurations, setConfigurations] = useState(mockConfigurations);
  const [assembledCounts, setAssembledCounts] = useState<Record<number, number>>({});
  const [selectedConfiguration, setSelectedConfiguration] = useState<typeof mockConfigurations[0] | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedComponents, setSelectedComponents] = useState<{[key: number]: number}>({});
  const [componentSearch, setComponentSearch] = useState("");
  const [componentCategoryFilter, setComponentCategoryFilter] = useState<string>("all");
  const [disassembleQty, setDisassembleQty] = useState(1);
  const [writeOffQty, setWriteOffQty] = useState(1);
  const [actionLoading, setActionLoading] = useState(false);
  const [isAssembleDialogOpen, setIsAssembleDialogOpen] = useState(false);
  const [assembleQuantity, setAssembleQuantity] = useState(1);
  const [assembleCategory, setAssembleCategory] = useState("");
  const [assembleLocation, setAssembleLocation] = useState("");

  // Use items from context
  const components = items;

  // Auto-select configuration from URL
  useEffect(() => {
    const configIdParam = searchParams.get('configId');
    if (configIdParam) {
      const configId = parseInt(configIdParam);
      const config = configurations.find(c => c.id === configId);
      if (config) {
        setSelectedConfiguration(config);
        setIsViewDialogOpen(true);
      }
    }
  }, [searchParams, configurations]);

  // Load configurations and assembled counts
  const loadConfigurations = useCallback(async () => {
    try {
      const [cfgRows, counts] = await Promise.all([
        getConfigurations(),
        getAssembledCounts().catch(() => []),
      ]);
      const countMap: Record<number, number> = {};
      (counts || []).forEach((r: { configurationId: number; quantity: number }) => {
        countMap[r.configurationId] = r.quantity;
      });
      setAssembledCounts(countMap);

      if (cfgRows && Array.isArray(cfgRows) && cfgRows.length > 0) {
        const cfgWithComponents = await Promise.all(
          (cfgRows as any[]).map(async (cfg: any) => {
            const cc = await getConfigurationComponents(cfg.id);
            const enriched = (cc as any[]).map((row: any) => ({
              componentId: row.componentId,
              quantity: row.quantity,
              name: items.find((c) => c.id === row.componentId)?.name || "",
            }));
            return { ...cfg, components: enriched };
          })
        );
        setConfigurations(cfgWithComponents as any);
      } else {
        setConfigurations(mockConfigurations as any);
      }
    } catch (error) {
      console.error('Error loading configurations:', error);
      setConfigurations(mockConfigurations as any);
    }
  }, [items]);

  useEffect(() => {
    loadConfigurations();
    
    const handleConfigurationsUpdated = () => {
      loadConfigurations();
    };
    
    window.addEventListener('configurationsUpdated', handleConfigurationsUpdated);
    return () => {
      window.removeEventListener('configurationsUpdated', handleConfigurationsUpdated);
    };
  }, [loadConfigurations]);

  const filteredComponents = useMemo(() => {
    return components.filter(item => {
      const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
      const matchCategory = categoryFilter === "all" || item.category === categoryFilter;
      return matchSearch && matchCategory;
    });
  }, [search, categoryFilter]);

  const filteredComponentsForCreation = useMemo(() => {
    return components.filter(item => {
      const matchSearch = item.name.toLowerCase().includes(componentSearch.toLowerCase());
      const matchCategory = componentCategoryFilter === "all" || item.category === componentCategoryFilter;
      return matchSearch && matchCategory;
    });
  }, [componentSearch, componentCategoryFilter, components]);

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
    const availability: AvailabilityItem[] = config.components.map(
      (comp: { componentId: number; quantity: number; name: string }) => {
      const stockComponent = components.find(c => c.id === comp.componentId);
      if (!stockComponent) return { ...comp, available: 0, required: comp.quantity, status: 'missing' as const, stockComponent: null } as AvailabilityItem;
      // Резервирования больше нет: доступно то, что на складе.
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

  const handleCreateConfiguration = async (data: FormData) => {
    const { totalValue, totalItems } = calculateTotals(selectedComponents);
    const componentsPayload = Object.entries(selectedComponents).map(([componentId, quantity]) => ({
      componentId: parseInt(componentId as any),
      quantity: quantity as number,
    }));

    try {
      await createConfiguration({
        name: data.name,
        description: data.description || "",
        components: componentsPayload,
      });

      // Reload configurations
      await loadConfigurations();
      await refreshItems();
    } catch {
      // Ошибка обновления не отменяет уже выполненное действие
    }

    setIsCreateDialogOpen(false);
    setSelectedComponents({});
    setComponentSearch("");
    setComponentCategoryFilter("all");
    form.reset();
  };

  const handleDeleteConfiguration = async (id: number) => {
    const ok = await confirm({
      title: "Удалить конфигурацию?",
      description: "Рецепт сборки исчезнет. Уже собранные изделия останутся на складе.",
      confirmLabel: "Удалить",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteConfiguration(id);
      await loadConfigurations();
      window.dispatchEvent(new CustomEvent('configurationsUpdated'));
    } catch (error) {
      console.error('Error deleting configuration:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось удалить конфигурацию",
        variant: "destructive",
      });
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
  }, [configurations, components]);

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
        <UniversalBackground />
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
                          <div className="flex items-center gap-4 text-sm flex-wrap">
                            {(assembledCounts[config.id] ?? 0) > 0 && (
                              <span className="flex items-center gap-1 font-medium text-primary">
                                <Package className="h-4 w-4" />
                                Собрано: {assembledCounts[config.id]}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Package className="h-4 w-4" />
                              {config.totalItems} компонентов
                            </span>
                            <span className="flex items-center gap-1">
                              <Banknote className="h-4 w-4" />
                              {formatCurrency(config.totalValue)}
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
                      <Banknote className="h-8 w-8 text-primary mx-auto mb-2" />
                      <div className="text-2xl font-bold">
                        {formatCurrency(configurations.reduce((sum, config) => sum + config.totalValue, 0))}
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
                      {components.slice(0, 5).map(component => (
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
              
              {/* Фильтры для компонентов */}
              <div className="mt-2 mb-4 space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Поиск компонентов..."
                    value={componentSearch}
                    onChange={(e) => setComponentSearch(e.target.value)}
                    className="flex-1"
                  />
                  <Select value={componentCategoryFilter} onValueChange={setComponentCategoryFilter}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Категория" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все категории</SelectItem>
                      {categories.map(category => (
                        <SelectItem key={category} value={category}>{category}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                {filteredComponentsForCreation.map(component => {
                  const available = component.quantity;
                  return (
                  <div key={component.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium">{component.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {component.category} • {component.price}₽/шт. • Доступно: {available} шт.
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        max={available}
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
                  );
                })}
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

      {/* Диалог просмотра конфигурации — карточка изделия с составом, сборка/разборка/списание */}
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
                  <div className="text-sm text-muted-foreground">Компонентов в составе</div>
                </div>
                <div className="text-center p-4 bg-primary/5 rounded-lg">
                  <Banknote className="h-8 w-8 text-primary mx-auto mb-2" />
                  <div className="text-2xl font-bold">{formatCurrency(selectedConfiguration.totalValue)}</div>
                  <div className="text-sm text-muted-foreground">Общая стоимость</div>
                </div>
              </div>

              <div className="p-4 border rounded-lg bg-muted/30">
                <h4 className="font-medium mb-2">Собрано единиц</h4>
                <div className="text-2xl font-bold text-primary">{assembledCounts[selectedConfiguration.id] ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Компоненты этих единиц зарезервированы и не отображаются как свободные на складе.</p>
              </div>

              <div>
                <h4 className="font-medium mb-3">Состав конфигурации</h4>
                <div className="space-y-2">
                  {checkConfigurationAvailability(selectedConfiguration).items.map((item, index) => (
                    <div key={index} className="flex justify-between items-center p-2 border rounded">
                      <div className="flex items-center gap-2">
                        {getAvailabilityIcon(item.status)}
                        <ItemLink itemId={item.componentId || 0} itemName={item.name} variant="ghost" size="sm" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{item.required} шт.</Badge>
                        <span className="text-sm text-muted-foreground">
                          доступно {item.available}/{item.required}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    disabled={actionLoading || getMaxBuilds(selectedConfiguration) < 1}
                    onClick={() => {
                      setAssembleQuantity(1);
                      setAssembleCategory(selectedConfiguration.category?.trim() || "");
                      setAssembleLocation(selectedConfiguration.location?.trim() || "");
                      setIsAssembleDialogOpen(true);
                    }}
                  >
                    <Package className="h-4 w-4 mr-1" />
                    Собрать
                  </Button>
                </div>
                {(assembledCounts[selectedConfiguration.id] ?? 0) > 0 && (
                  <>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={assembledCounts[selectedConfiguration.id] ?? 0}
                        value={disassembleQty}
                        onChange={(e) => setDisassembleQty(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-16"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={actionLoading}
                        onClick={async () => {
                          setActionLoading(true);
                          const res = await disassembleConfiguration(selectedConfiguration.id, disassembleQty);
                          setActionLoading(false);
                          if (res.success) {
                            await loadConfigurations();
                            refreshItems();
                            toast({ title: `Разобрано ${disassembleQty} шт.`, description: "Компоненты возвращены на склад" });
                            setDisassembleQty(1);
                          } else {
                            toast({ title: "Ошибка", description: res.error, variant: "destructive" });
                          }
                        }}
                      >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Разобрать
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={assembledCounts[selectedConfiguration.id] ?? 0}
                        value={writeOffQty}
                        onChange={(e) => setWriteOffQty(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-16"
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={actionLoading}
                        onClick={async () => {
                          const ok = await confirm({
                            title: `Списать ${writeOffQty} шт. собранного изделия?`,
                            description: "Со склада уйдёт готовое изделие. Компоненты израсходованы ещё при сборке и не возвращаются.",
                            confirmLabel: "Списать",
                            destructive: true,
                          });
                          if (!ok) return;
                          setActionLoading(true);
                          const res = await writeOffConfiguration(selectedConfiguration.id, writeOffQty);
                          setActionLoading(false);
                          if (res.success) {
                            await loadConfigurations();
                            refreshItems();
                            toast({ title: `Списано ${writeOffQty} шт.`, description: "Собранное изделие снято со склада", variant: "destructive" });
                            setWriteOffQty(1);
                          } else {
                            toast({ title: "Ошибка", description: res.error, variant: "destructive" });
                          }
                        }}
                      >
                        <PackageOpen className="h-4 w-4 mr-1" />
                        Списать
                      </Button>
                    </div>
                  </>
                )}
              </div>

              <div className="text-sm text-muted-foreground">
                Создано: {selectedConfiguration.createdAt}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Диалог сборки: количество, категория, расположение */}
      <Dialog open={isAssembleDialogOpen} onOpenChange={setIsAssembleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Сборка конфигурации</DialogTitle>
            <DialogDescription>
              Укажите количество, категорию и расположение для отображения на складе
            </DialogDescription>
          </DialogHeader>
          {selectedConfiguration && (
            <div className="space-y-4 py-2">
              <div>
                <Label>Количество (макс. {getMaxBuilds(selectedConfiguration)})</Label>
                <Input
                  type="number"
                  min={1}
                  max={getMaxBuilds(selectedConfiguration)}
                  value={assembleQuantity}
                  onChange={(e) => setAssembleQuantity(Math.max(1, Math.min(getMaxBuilds(selectedConfiguration), parseInt(e.target.value) || 1)))}
                />
              </div>
              <div>
                <Label>Категория *</Label>
                <Input
                  placeholder="Например: Сборки, Готовые изделия"
                  value={assembleCategory}
                  onChange={(e) => setAssembleCategory(e.target.value)}
                />
              </div>
              <div>
                <Label>Расположение *</Label>
                <Input
                  placeholder="Например: Склад А-1"
                  value={assembleLocation}
                  onChange={(e) => setAssembleLocation(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsAssembleDialogOpen(false)}>Отмена</Button>
                <Button
                  disabled={actionLoading || !assembleCategory.trim() || !assembleLocation.trim() || assembleQuantity < 1}
                  onClick={async () => {
                    setActionLoading(true);
                    try {
                      await updateConfiguration(selectedConfiguration.id, {
                        category: assembleCategory.trim(),
                        location: assembleLocation.trim(),
                      });
                      const res = await assembleConfiguration({
                        configurationId: selectedConfiguration.id,
                        quantity: assembleQuantity,
                        notes: "Сборка с указанием категории и расположения",
                      });
                      if (res.success) {
                        await loadConfigurations();
                        refreshItems();
                        setIsAssembleDialogOpen(false);
                        toast({ title: `Собрано ${assembleQuantity} шт.`, description: `Категория: ${assembleCategory}, Расположение: ${assembleLocation}` });
                      } else {
                        toast({ title: "Ошибка", description: res.error, variant: "destructive" });
                      }
                    } finally {
                      setActionLoading(false);
                    }
                  }}
                >
                  Собрать
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {dialog}
    </div>
  );
};

export default Configurations;
