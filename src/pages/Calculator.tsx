import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import UniversalBackground from "@/components/UniversalBackground";
import Seo from "@/components/seo/Seo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  Calculator as CalcIcon, 
  Banknote, 
  Package, 
  TrendingUp, 
  Search, 
  Filter, 
  Settings, 
  BarChart3, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Info,
  Zap,
  Target,
  ShoppingCart,
  Save,
  Copy,
  FileText,
  Calendar,
  TrendingDown,
  Plus
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  getComponentUsageHistory, 
  getConfigurationBuilds, 
  getWarehouseStatistics,
  getConfigurations,
  getConfigurationComponents,
  assembleConfiguration
} from "@/lib/db";
import * as XLSX from 'xlsx';
import { formatCurrency } from "@/lib/utils";
import {
  type AvailabilityStatus,
  calculateConfigurationAvailability as calcAvailability,
  calculateManualTotals as calcManualTotals,
  calculateWarehouseAnalytics as calcWarehouseAnalytics,
  type StockItem,
} from "@/lib/calculator";
import { useApp } from "@/contexts/AppContext";
import { toast } from "@/hooks/use-toast";
import { ItemLink } from "@/components/common/ItemLink";
import { AnalyticsTab } from "@/components/calculator/AnalyticsTab";
import { ScrapTab } from "@/components/calculator/ScrapTab";

// Empty arrays for clean start
const mockComponents: any[] = [];
const mockConfigurations: any[] = [];

const Calculator = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedItems, setSelectedItems] = useState<{[key: number]: number}>({});
  const [activeTab, setActiveTab] = useState("analytics");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [availabilityFilter, setAvailabilityFilter] = useState<string>("all");
  const { items, categories, refreshItems } = useApp();
  const [isLoading, setIsLoading] = useState(false);
  const [configurations, setConfigurations] = useState<any[]>(mockConfigurations);
  const [warehouseStats, setWarehouseStats] = useState<any>({});
  const [showPlanningStats, setShowPlanningStats] = useState(false);
  const [showDetailedAnalytics, setShowDetailedAnalytics] = useState(true);
  const [scrappedItems, setScrappedItems] = useState<any[]>([]);

  // Use items from context with minStock
  const components = useMemo(() => 
    items.map((r: any) => ({ ...r, minStock: r.minStock ?? 0 })),
    [items]
  );

  // Load configurations and additional data
  const loadData = async () => {
    try {
      // Load configurations if any exist in DB
      const cfgs = await getConfigurations();
      if (Array.isArray(cfgs) && cfgs.length > 0) {
        const full = [] as any[];
        for (const c of cfgs) {
          const comps = await getConfigurationComponents(c.id);
          const componentsList = comps.map((cc: any) => ({ 
            componentId: cc.componentId, 
            quantity: cc.quantity, 
            name: items.find((r: any) => r.id === cc.componentId)?.name || "" 
          }));
          const totalItems = componentsList.reduce((s: number, it: any) => s + it.quantity, 0);
          const totalValue = componentsList.reduce((s: number, it: any) => {
            const comp = items.find((r: any) => r.id === it.componentId);
            return s + (comp?.price || 0) * it.quantity;
          }, 0);
          full.push({ ...c, components: componentsList, totalItems, totalValue, priority: "medium" });
        }
        setConfigurations(full);
      } else {
        setConfigurations(mockConfigurations);
      }

      // Load additional data
      const stats = await getWarehouseStatistics();
      setWarehouseStats(stats);
      
      // Load scrapped items
      const { getScrappedItems } = await import("@/lib/db");
      const scrapped = await getScrappedItems();
      setScrappedItems(scrapped);
    } catch (error) {
      console.error('Error loading calculator data:', error);
      setConfigurations(mockConfigurations);
      setWarehouseStats({});
      setScrappedItems([]);
    }
  };

  useEffect(() => { 
    loadData();
    
    const handleConfigurationsUpdated = () => {
      loadData();
    };
    
    window.addEventListener('configurationsUpdated', handleConfigurationsUpdated);
    return () => {
      window.removeEventListener('configurationsUpdated', handleConfigurationsUpdated);
    };
  }, [items]);
  
  const filteredComponents = useMemo(() => {
    if (!search && selectedCategory === "all") {
      return components; // Return all if no filters applied
    }
    
    return components.filter(item => {
      const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
      const matchCategory = selectedCategory === "all" || item.category === selectedCategory;
      return matchSearch && matchCategory;
    });
  }, [search, selectedCategory, components]);

  const filteredConfigurations = useMemo(() => {
    return configurations.filter(config => {
      const matchSearch = config.name.toLowerCase().includes(search.toLowerCase()) ||
                         config.description?.toLowerCase().includes(search.toLowerCase());
      const matchPriority = priorityFilter === "all" || config.priority === priorityFilter;
      return matchSearch && matchPriority;
    });
  }, [search, priorityFilter, configurations]);

  // Расчёты живут в lib/calculator.ts — это чистые функции без React.
  const calculateConfigurationAvailability = (config: any) =>
    calcAvailability(config, components as StockItem[]);

  const manualCalculations = useMemo(
    () => calcManualTotals(selectedItems, components as StockItem[]),
    [selectedItems, components]
  );

  const warehouseAnalytics = useMemo(
    () => calcWarehouseAnalytics(components as StockItem[], configurations),
    [components, configurations]
  );

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return <Badge variant="destructive">Р’С‹СЃРѕРєРёР№</Badge>;
      case 'medium':
        return <Badge variant="secondary" className="bg-yellow-500 text-yellow-900">РЎСЂРµРґРЅРёР№</Badge>;
      case 'low':
        return <Badge variant="outline">РќРёР·РєРёР№</Badge>;
      default:
        return null;
    }
  };

  const updateQuantity = (itemId: number, quantity: number) => {
    // Validate quantity against available stock
    const item = components.find(i => i.id === itemId);
    if (!item) return;
    
    const maxQuantity = Math.min(quantity, item.quantity);
    
    if (maxQuantity <= 0) {
      const newSelected = { ...selectedItems };
      delete newSelected[itemId];
      setSelectedItems(newSelected);
    } else {
      setSelectedItems(prev => ({ ...prev, [itemId]: maxQuantity }));
    }
  };

  // Optimized function to clear all selections
  const clearSelections = () => {
    setSelectedItems({});
  };

  // Function to save current calculation
  const saveCalculation = () => {
    const calculation = {
      id: Date.now(),
      items: selectedItems,
      totalValue: manualCalculations.totalValue,
      totalItems: manualCalculations.totalItems,
      timestamp: new Date().toISOString(),
    };
    // In a real app, this would save to localStorage or backend
  };

  // Function to build configuration: резервирует компоненты (сборка без списания со склада)
  const buildConfiguration = async (config: typeof mockConfigurations[0]) => {
    const availability = calculateConfigurationAvailability(config);
    if (availability.maxPossibleBuilds === 0) {
      toast({ title: "Недостаточно компонентов", description: "Для сборки этой конфигурации не хватает остатков", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const res = await assembleConfiguration({
        configurationId: config.id,
        quantity: availability.maxPossibleBuilds,
        notes: 'Сборка из калькулятора',
      });
      if (res.success) {
        await loadData();
        refreshItems();
        toast({ title: "Сборка выполнена", description: `«${config.name}» — ${availability.maxPossibleBuilds} шт. Компоненты списаны со складов.` });
      } else {
        toast({ title: "Не удалось собрать", description: res.error || "Ошибка при сборке конфигурации", variant: "destructive" });
      }
    } catch (error) {
      console.error('Error building configuration:', error);
      toast({ title: "Не удалось собрать", description: "Ошибка при сборке конфигурации", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };


  // Function to download warehouse report as Excel
  const getAvailabilityIcon = (status: AvailabilityStatus) => {
    switch (status) {
      case 'available':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'partial':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'unavailable':
      case 'missing':
        return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const summary = { 
    name: "Калькулятор склада", 
    quantity: warehouseAnalytics.canBuildHighPriority, 
    location: "Анализ", 
    category: "Калькулятор" 
  };

  return (
    <div className="min-h-screen relative">
      <Seo 
        title="Статистика склада — анализ и планирование"
        description="Продвинутая статистика для анализа склада, расчета конфигураций и планирования закупок."
        canonical="/calculator"
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
              <CalcIcon className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold">Статистика склада</h1>
                <p className="text-muted-foreground">Анализ доступности, планирование сборок и управление запасами</p>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Banknote className="h-5 w-5 text-primary" />
                    <div>
                      <div className="text-2xl font-bold">{formatCurrency(warehouseAnalytics.totalStockValue)}</div>
                      <div className="text-sm text-muted-foreground">Общая стоимость склада</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-primary" />
                    <div>
                      <div className="text-2xl font-bold">{warehouseAnalytics.canBuildHighPriority}</div>
                      <div className="text-sm text-muted-foreground">Доступно высокоприоритетных</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    <div>
                      <div className="text-2xl font-bold">{warehouseAnalytics.lowStockItems.length}</div>
                      <div className="text-sm text-muted-foreground">Низкий запас</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-red-500" />
                    <div>
                      <div className="text-2xl font-bold">{warehouseAnalytics.outOfStockItems.length}</div>
                      <div className="text-sm text-muted-foreground">Нет в наличии</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="manual" className="flex items-center gap-2">
                  <CalcIcon className="h-4 w-4" />
                  Ручной расчет
                </TabsTrigger>
                <TabsTrigger value="scrap" className="flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  Списания
                </TabsTrigger>
                <TabsTrigger value="analytics" className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Аналитика
                </TabsTrigger>
              </TabsList>

              <TabsContent value="configurations" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="lg:col-span-2">
                    <Label htmlFor="config-search">Поиск конфигураций</Label>
                    <Input
                      id="config-search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Найти конфигурацию..."
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="priority-filter">Приоритет</Label>
                    <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Все приоритеты</SelectItem>
                        <SelectItem value="high">Высокий</SelectItem>
                        <SelectItem value="medium">Средний</SelectItem>
                        <SelectItem value="low">Низкий</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="availability-filter">Доступность</Label>
                    <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
                      <SelectTrigger className="mt-1">
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
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <Target className="h-5 w-5 text-primary" />
                        <div>
                          <div className="text-2xl font-bold">{filteredConfigurations.length}</div>
                          <div className="text-sm text-muted-foreground">Всего конфигураций</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                        <div>
                          <div className="text-2xl font-bold">
                            {filteredConfigurations.filter(config => {
                              const availability = calculateConfigurationAvailability(config);
                              return availability.maxPossibleBuilds > 0;
                            }).length}
                          </div>
                          <div className="text-sm text-muted-foreground">Доступны</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-yellow-500" />
                        <div>
                          <div className="text-2xl font-bold">
                            {filteredConfigurations.filter(config => {
                              const availability = calculateConfigurationAvailability(config);
                              return availability.anyAvailable && !availability.allAvailable;
                            }).length}
                          </div>
                          <div className="text-sm text-muted-foreground">Частично</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-5 w-5 text-red-500" />
                        <div>
                          <div className="text-2xl font-bold">
                            {filteredConfigurations.filter(config => {
                              const availability = calculateConfigurationAvailability(config);
                              return availability.noneAvailable;
                            }).length}
                          </div>
                          <div className="text-sm text-muted-foreground">Недоступны</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                  {filteredConfigurations.map(config => {
                    const availability = calculateConfigurationAvailability(config);
                    const isAvailable = availability.maxPossibleBuilds > 0;
                    
                    // Apply availability filter
                    if (availabilityFilter === "available" && !isAvailable) return null;
                    if (availabilityFilter === "partial" && (isAvailable || availability.noneAvailable)) return null;
                    if (availabilityFilter === "unavailable" && !availability.noneAvailable) return null;

                    return (
                      <Card key={config.id} className="hover:shadow-lg transition-all duration-200 hover:scale-[1.02]">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <CardTitle className="flex items-center gap-2 text-lg">
                                {config.name}
                                {getPriorityBadge(config.priority)}
                              </CardTitle>
                              {config.description && (
                                <CardDescription className="mt-1">{config.description}</CardDescription>
                              )}
                            </div>
                            <div className="text-right ml-4">
                              <div className="text-3xl font-bold text-primary">
                                {availability.maxPossibleBuilds}
                              </div>
                              <div className="text-sm text-muted-foreground">можно собрать</div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {/* Stats Grid */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="text-center p-3 bg-primary/5 rounded-lg border">
                              <div className="text-xl font-bold text-primary">{config.totalItems}</div>
                              <div className="text-xs text-muted-foreground">компонентов</div>
                            </div>
                            <div className="text-center p-3 bg-green-50 rounded-lg border">
                              <div className="text-xl font-bold text-green-600">
                                {(config.totalValue * availability.maxPossibleBuilds).toLocaleString()}₽
                              </div>
                              <div className="text-xs text-muted-foreground">общая стоимость</div>
                            </div>
                          </div>

                          {/* Availability Progress */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">Доступность компонентов</span>
                              <span className="text-sm text-muted-foreground">
                                {availability.availableCount}/{availability.totalCount}
                              </span>
                            </div>
                            <Progress 
                              value={(availability.availableCount / availability.totalCount) * 100} 
                              className="h-2"
                            />
                          </div>

                          {/* Component List */}
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium text-muted-foreground">Компоненты:</h4>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                              {availability.items.slice(0, 4).map((item, index) => (
                                <div key={index} className="flex items-center justify-between text-sm p-2 rounded bg-muted/30">
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    {getAvailabilityIcon(item.status)}
                                    <ItemLink 
                                      itemId={item.componentId || 0} 
                                      itemName={item.name} 
                                      variant="ghost" 
                                      size="sm"
                                      className="truncate"
                                    />
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <Badge variant="secondary" className="text-xs">{item.required} шт.</Badge>
                                    <span className="text-xs text-muted-foreground">
                                      {item.available}/{item.required}
                                    </span>
                                  </div>
                                </div>
                              ))}
                              {availability.items.length > 4 && (
                                <div className="text-xs text-muted-foreground text-center py-1">
                                  +{availability.items.length - 4} еще компонентов
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-2 pt-2">
                            <Button 
                              size="sm" 
                              className="flex-1 transition-all duration-200 hover:scale-105" 
                              disabled={!isAvailable || isLoading}
                              onClick={() => buildConfiguration(config)}
                            >
                              <ShoppingCart className="h-4 w-4 mr-2" />
                              {isLoading ? 'Сборка...' : 'Собрать'}
                            </Button>
                            <Button size="sm" variant="outline" title="Подробная информация" className="transition-all duration-200 hover:scale-105">
                              <Info className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Empty State */}
                {filteredConfigurations.length === 0 && (
                  <Card className="text-center py-12">
                    <CardContent>
                      <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-2">Конфигурации не найдены</h3>
                      <p className="text-muted-foreground mb-4">
                        Попробуйте изменить фильтры или создать новую конфигурацию
                      </p>
                      <Button onClick={() => navigate('/configurations')}>
                        <Plus className="h-4 w-4 mr-2" />
                        Создать конфигурацию
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="manual" className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Выбор компонентов</CardTitle>
                      <CardDescription>Выберите товары и укажите количество для расчета</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <Label htmlFor="search">Поиск</Label>
                          <Input
                            id="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Найти компонент..."
                          />
                        </div>
                        <div className="w-48">
                          <Label htmlFor="category">Категория</Label>
                          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
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

                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {filteredComponents.map(item => (
                          <div key={item.id} className="border rounded-lg p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <ItemLink 
                                  itemId={item.id} 
                                  itemName={item.name} 
                                  variant="ghost" 
                                  size="sm"
                                  className="font-medium"
                                />
                                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                  <span>{item.category}</span>
                                  <span>В наличии: {item.quantity} шт.</span>
                                  <span className="font-medium">{item.price}₽/шт.</span>
                                  {item.quantity <= item.minStock && (
                                    <Badge variant="destructive" className="text-xs">Низкий запас</Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min="0"
                                  max={item.quantity}
                                  value={selectedItems[item.id] || ""}
                                  onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 0)}
                                  placeholder="Кол-во"
                                  className="w-20"
                                />
                                <Button
                                  size="sm"
                                  variant={selectedItems[item.id] ? "default" : "outline"}
                                  onClick={() => updateQuantity(item.id, selectedItems[item.id] ? 0 : 1)}
                                  className="transition-all duration-200 hover:scale-105"
                                >
                                  {selectedItems[item.id] ? "Убрать" : "Добавить"}
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <div className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <TrendingUp className="h-5 w-5" />
                          Итоговый расчет
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="text-center p-4 bg-primary/5 rounded-lg">
                            <Banknote className="h-8 w-8 text-primary mx-auto mb-2" />
                            <div className="text-2xl font-bold">{formatCurrency(manualCalculations.totalValue)}</div>
                            <div className="text-sm text-muted-foreground">Общая стоимость</div>
                          </div>
                          <div className="text-center p-4 bg-primary/5 rounded-lg">
                            <Package className="h-8 w-8 text-primary mx-auto mb-2" />
                            <div className="text-2xl font-bold">{manualCalculations.totalItems}</div>
                            <div className="text-sm text-muted-foreground">Общее количество</div>
                          </div>
                        </div>

                        <Separator />

                        <div>
                          <h4 className="font-medium mb-3">По категориям</h4>
                          <div className="space-y-2">
                            {Object.entries(manualCalculations.categoryBreakdown).map(([category, value]) => (
                              <div key={category} className="flex justify-between items-center">
                                <Badge variant="secondary">{category}</Badge>
                                <span className="font-medium">{value.toLocaleString()}₽</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {manualCalculations.stockWarnings.length > 0 && (
                          <>
                            <Separator />
                            <div>
                              <h4 className="font-medium mb-3 text-yellow-600">Предупреждения о запасах</h4>
                              <div className="space-y-2">
                                {manualCalculations.stockWarnings.map((warning, index) => (
                                  <div key={index} className="flex justify-between items-center text-sm">
                                    <ItemLink 
                                      itemId={warning.item.id} 
                                      itemName={warning.item.name} 
                                      variant="ghost" 
                                      size="sm"
                                    />
                                    <Badge variant={warning.warningLevel === 'critical' ? 'destructive' : 'secondary'}>
                                      Останется: {warning.remaining}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}

                        <Separator />

                        <div>
                          <h4 className="font-medium mb-3">Выбранные товары</h4>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {Object.entries(selectedItems).map(([itemId, quantity]) => {
                            const item = components.find(i => i.id === parseInt(itemId));
                            if (!item) return null;
                            return (
                              <div key={itemId} className="flex justify-between items-center text-sm">
                                <div>
                                  <ItemLink 
                                    itemId={item.id} 
                                    itemName={item.name} 
                                    variant="ghost" 
                                    size="sm"
                                    className="font-medium"
                                  />
                                  <div className="text-muted-foreground">{quantity} × {item.price}₽</div>
                                </div>
                                <div className="font-medium">{(quantity * item.price).toLocaleString()}₽</div>
                              </div>
                            );
                          })}
                        </div>
                        </div>

                        <div className="flex gap-2">
                          <Button 
                            className="flex-1 transition-all duration-200 hover:scale-105" 
                            onClick={clearSelections}
                            variant="outline"
                          >
                            Очистить
                          </Button>
                          <Button 
                            className="flex-1 transition-all duration-200 hover:scale-105"
                            onClick={saveCalculation}
                            disabled={Object.keys(selectedItems).length === 0}
                          >
                            <Save className="h-4 w-4 mr-2" />
                            Сохранить
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              <ScrapTab scrappedItems={scrappedItems} />

              <AnalyticsTab
                warehouseAnalytics={warehouseAnalytics}
                components={components as StockItem[]}
                categories={categories}
                configurations={configurations}
                warehouseStats={warehouseStats}
                calculateConfigurationAvailability={calculateConfigurationAvailability}
                showDetailedAnalytics={showDetailedAnalytics}
                setShowDetailedAnalytics={setShowDetailedAnalytics}
                showPlanningStats={showPlanningStats}
                getPriorityBadge={getPriorityBadge}
              />

            </Tabs>
          </main>
        </div>
      </div>

    </div>
  );
};

export default Calculator;