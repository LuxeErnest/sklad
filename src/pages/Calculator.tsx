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
  addComponentUsageHistory,
  getConfigurationBuilds, 
  getWarehouseStatistics,
  getConfigurations,
  getConfigurationComponents,
  assembleConfiguration
} from "@/lib/db";
import * as XLSX from 'xlsx';
import { formatCurrency } from "@/lib/utils";
import { useApp } from "@/contexts/AppContext";
import { ItemLink } from "@/components/common/ItemLink";

// Type definitions for better type safety
type AvailabilityStatus = 'available' | 'partial' | 'unavailable' | 'missing';

interface AvailabilityItem {
  componentId: number;
  quantity: number;
  name: string;
  available: number;
  required: number;
  status: AvailabilityStatus;
  maxBuilds: number;
  stockComponent: any | null;
}

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
  const { items, categories, refreshItems, reservedQuantities } = useApp();
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

  // Calculate availability for configurations
  const calculateConfigurationAvailability = (config: any) => {
    const availability = config.components.map(comp => {
      const stockComponent = components.find(c => c.id === comp.componentId);
      if (!stockComponent) return { 
        ...comp, 
        available: 0, 
        required: comp.quantity,
        status: 'missing' as const, 
        maxBuilds: 0,
        stockComponent: null
      };
      
      const reserved = reservedQuantities[comp.componentId] ?? 0;
      const available = Math.max(0, stockComponent.quantity - reserved);
      const required = comp.quantity;
      const maxBuilds = Math.floor(available / required);
      const status: AvailabilityStatus = available >= required ? 'available' : available > 0 ? 'partial' : 'unavailable';
      
      return {
        ...comp,
        available,
        required,
        status,
        maxBuilds,
        stockComponent
      };
    });

    const maxPossibleBuilds = availability.length > 0 ? Math.min(...availability.map(item => item.maxBuilds)) : 0;
    const allAvailable = availability.every(item => item.status === 'available');
    const anyAvailable = availability.some(item => item.status === 'available');
    const noneAvailable = availability.every(item => item.status === 'unavailable');

    return {
      items: availability,
      maxPossibleBuilds: maxPossibleBuilds > 0 ? maxPossibleBuilds : 0,
      allAvailable,
      anyAvailable,
      noneAvailable,
      availableCount: availability.filter(item => item.status === 'available').length,
      totalCount: availability.length,
      totalValue: config.totalValue * maxPossibleBuilds,
      remainingComponents: availability.map(item => ({
        ...item,
        remaining: item.available - (item.required * maxPossibleBuilds)
      }))
    };
  };

  // Calculate manual selection totals
  const manualCalculations = useMemo(() => {
    const totalValue = Object.entries(selectedItems).reduce((sum, [itemId, quantity]) => {
      const item = components.find(i => i.id === parseInt(itemId));
      return sum + (item ? item.price * quantity : 0);
    }, 0);

    const totalItems = Object.values(selectedItems).reduce((sum, qty) => sum + qty, 0);
    
    const categoryBreakdown = Object.entries(selectedItems).reduce((acc, [itemId, quantity]) => {
      const item = components.find(i => i.id === parseInt(itemId));
      if (item) {
        acc[item.category] = (acc[item.category] || 0) + (item.price * quantity);
      }
      return acc;
    }, {} as {[key: string]: number});

    // Calculate stock warnings
    const stockWarnings = Object.entries(selectedItems).map(([itemId, quantity]) => {
      const item = components.find(i => i.id === parseInt(itemId));
      if (!item) return null;
      
      const remaining = item.quantity - quantity;
      const warningLevel = remaining <= item.minStock ? 'critical' : 
                          remaining <= item.minStock * 2 ? 'warning' : 'ok';
      
      return {
        item,
        quantity,
        remaining,
        warningLevel
      };
    }).filter(Boolean);

    return { totalValue, totalItems, categoryBreakdown, stockWarnings };
  }, [selectedItems, components]);

  // Warehouse analytics
  const warehouseAnalytics = useMemo(() => {
    const totalStockValue = components.reduce((sum, item) => sum + ((item.price || 0) * item.quantity), 0);
    const lowStockItems = components.filter(item => item.quantity <= (item.minStock ?? 0));
    const outOfStockItems = components.filter(item => item.quantity === 0);
    
    const configurationAnalytics = configurations.map(config => {
      const availability = calculateConfigurationAvailability(config);
      return {
        config,
        availability,
        canBuild: availability.maxPossibleBuilds > 0,
        priority: config.priority
      };
    });

    const highPriorityConfigs = configurationAnalytics.filter(a => a.config.priority === 'high');
    const canBuildHighPriority = highPriorityConfigs.filter(a => a.canBuild).length;

    return {
      totalStockValue,
      lowStockItems,
      outOfStockItems,
      configurationAnalytics,
      highPriorityConfigs,
      canBuildHighPriority,
      totalConfigurations: configurations.length
    };
  }, [components, configurations, reservedQuantities]);

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
    console.log('Saving calculation:', calculation);
  };

  // Function to build configuration: резервирует компоненты (сборка без списания со склада)
  const buildConfiguration = async (config: typeof mockConfigurations[0]) => {
    const availability = calculateConfigurationAvailability(config);
    if (availability.maxPossibleBuilds === 0) {
      alert('Недостаточно компонентов для сборки этой конфигурации');
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
        alert(`Сборка ${availability.maxPossibleBuilds} единиц ${config.name} завершена. Компоненты зарезервированы в конфигурации.`);
      } else {
        alert(res.error || 'Ошибка при сборке конфигурации');
      }
    } catch (error) {
      console.error('Error building configuration:', error);
      alert('Ошибка при сборке конфигурации');
    } finally {
      setIsLoading(false);
    }
  };


  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return <Badge variant="destructive">Высокий</Badge>;
      case 'medium':
        return <Badge variant="secondary" className="bg-yellow-500 text-yellow-900">Средний</Badge>;
      case 'low':
        return <Badge variant="outline">Низкий</Badge>;
      default:
        return null;
    }
  };

  // Function to download warehouse report as Excel
  const downloadWarehouseReport = () => {
    // Prepare data for Excel
    const excelData = components.map(item => ({
      'Наименование': item.name,
      'Категория': item.category,
      'Количество (шт.)': item.quantity,
      'Расположение': item.location,
      'Цена (₽)': item.price || 0,
      'Общая стоимость (₽)': (item.price || 0) * item.quantity,
      'Последнее обновление': item.lastUpdated || 'Не указано'
    }));
    
    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 30 }, // Наименование
      { wch: 20 }, // Категория
      { wch: 15 }, // Количество
      { wch: 20 }, // Расположение
      { wch: 15 }, // Цена
      { wch: 20 }, // Общая стоимость
      { wch: 20 }  // Последнее обновление
    ];
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Отчет по складу');
    
    // Generate and download file
    const fileName = `warehouse_report_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

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

              <TabsContent value="scrap" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <XCircle className="h-5 w-5" />
                      Списанные товары
                    </CardTitle>
                    <CardDescription>
                      Отчет о списанных товарах с возможностью скачивания в Excel
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {scrappedItems.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <XCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>Нет списанных товаров</p>
                      </div>
                    ) : (
                      <>
                        <div className="rounded-lg border">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b bg-muted/50">
                                <th className="p-3 text-left font-medium">Товар</th>
                                <th className="p-3 text-left font-medium">Когда списано</th>
                                <th className="p-3 text-left font-medium">Откуда</th>
                                <th className="p-3 text-right font-medium">Количество</th>
                              </tr>
                            </thead>
                            <tbody>
                              {scrappedItems.map((item, index) => (
                                <tr key={index} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                                  <td className="p-3">{item.componentName}</td>
                                  <td className="p-3 text-muted-foreground">
                                    {new Date(item.scrappedAt).toLocaleString('ru-RU')}
                                  </td>
                                  <td className="p-3 text-muted-foreground">{item.location}</td>
                                  <td className="p-3 text-right font-medium">{item.quantity} шт.</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        
                        {/*
                          Кнопка «Очистить список» убрана: списания — часть
                          журнала, из которого выводятся остатки, и удаление
                          записей рассогласовало бы склад. Ошибочное списание
                          исправляется обратной операцией, а не забыванием.
                        */}
                        <div className="flex gap-2">
                          <Button
                            className="flex-1 transition-all duration-200 hover:scale-105"
                            onClick={() => {
                              // Download Excel report
                              const excelData = scrappedItems.map(item => ({
                                'Товар': item.componentName,
                                'Когда списано': new Date(item.scrappedAt).toLocaleString('ru-RU'),
                                'Откуда': item.location,
                                'Количество (шт.)': item.quantity
                              }));
                              
                              const wb = XLSX.utils.book_new();
                              const ws = XLSX.utils.json_to_sheet(excelData);
                              
                              ws['!cols'] = [
                                { wch: 30 },
                                { wch: 20 },
                                { wch: 20 },
                                { wch: 15 }
                              ];
                              
                              XLSX.utils.book_append_sheet(wb, ws, 'Списания');
                              const fileName = `scrapped_items_${new Date().toISOString().split('T')[0]}.xlsx`;
                              XLSX.writeFile(wb, fileName);
                            }}
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            Скачать отчет Excel
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="analytics" className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Анализ запасов</CardTitle>
                      <CardDescription>Критические компоненты и рекомендации</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-3">Компоненты с низким запасом</h4>
                        <div className="space-y-2">
                          {warehouseAnalytics.lowStockItems.map(item => (
                            <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                              <div>
                                <ItemLink 
                                  itemId={item.id} 
                                  itemName={item.name} 
                                  variant="ghost" 
                                  size="sm"
                                  className="font-medium"
                                />
                                <div className="text-sm text-muted-foreground">
                                  {item.category} • {item.location}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-medium text-red-600">{item.quantity} шт.</div>
                                <div className="text-sm text-muted-foreground">мин: {item.minStock}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <Separator />

                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-medium">Отсутствующие компоненты</h4>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="transition-all duration-200 hover:scale-105"
                              onClick={() => {
                                // Export to Excel
                                const excelData = warehouseAnalytics.outOfStockItems.map((item: any) => ({
                                  'Компонент': item.name,
                                  'Категория': item.category,
                                  'Расположение': item.location,
                                  'Мин. запас': item.minStock ?? 0,
                                  'Текущее кол-во (шт.)': item.quantity
                                }));
                                const wb = XLSX.utils.book_new();
                                const ws = XLSX.utils.json_to_sheet(excelData);
                                ws['!cols'] = [
                                  { wch: 30 },
                                  { wch: 20 },
                                  { wch: 20 },
                                  { wch: 12 },
                                  { wch: 18 }
                                ];
                                XLSX.utils.book_append_sheet(wb, ws, 'Отсутствующие');
                                const fileName = `out_of_stock_${new Date().toISOString().split('T')[0]}.xlsx`;
                                XLSX.writeFile(wb, fileName);
                              }}
                            >
                              <FileText className="h-4 w-4 mr-2" />
                              Экспорт Excel
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="transition-all duration-200 hover:scale-105"
                              onClick={() => setShowDetailedAnalytics(prev => !prev)}
                            >
                              {showDetailedAnalytics ? 'Свернуть' : 'Развернуть'}
                            </Button>
                          </div>
                        </div>
                        {showDetailedAnalytics && (
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {warehouseAnalytics.outOfStockItems.map((item: any) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between p-3 border rounded-lg bg-red-50 border-red-200 text-red-900"
                              >
                                <div>
                                  <ItemLink 
                                    itemId={item.id} 
                                    itemName={item.name} 
                                    variant="ghost" 
                                    size="sm"
                                    className="font-medium"
                                  />
                                  <div className="text-sm text-red-700/90">
                                    {item.category} • {item.location}
                                  </div>
                                </div>
                                <Badge variant="destructive" className="shrink-0">Нет в наличии</Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Приоритетные конфигурации</CardTitle>
                      <CardDescription>Статус высокоприоритетных сборок</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-4 bg-primary/5 rounded-lg">
                          <Target className="h-8 w-8 text-primary mx-auto mb-2" />
                          <div className="text-2xl font-bold">{warehouseAnalytics.highPriorityConfigs.length}</div>
                          <div className="text-sm text-muted-foreground">Всего высокоприоритетных</div>
                        </div>
                        <div className="text-center p-4 bg-green-50 rounded-lg">
                          <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
                          <div className="text-2xl font-bold text-green-600">{warehouseAnalytics.canBuildHighPriority}</div>
                          <div className="text-sm text-muted-foreground">Можно собрать</div>
                        </div>
                      </div>

                      <Separator />

                      <div>
                        <h4 className="font-medium mb-3">Детализация</h4>
                        <div className="space-y-2">
                          {warehouseAnalytics.highPriorityConfigs.map(({ config, availability }) => (
                            <div key={config.id} className="flex items-center justify-between p-2 border rounded">
                              <div>
                                <div className="font-medium">{config.name}</div>
                                <div className="text-sm text-muted-foreground">
                                  {availability.availableCount}/{availability.totalCount} компонентов
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-medium">{availability.maxPossibleBuilds}</div>
                                <div className="text-sm text-muted-foreground">можно собрать</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>


                 {/* Planning Statistics Section */}
                 {showPlanningStats && (
                   <Card>
                     <CardHeader>
                       <CardTitle>Статистика планирования</CardTitle>
                       <CardDescription>Детальная статистика по использованию компонентов и сборке конфигураций</CardDescription>
                     </CardHeader>
                     <CardContent>
                       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                         <div className="text-center p-4 bg-blue-50 rounded-lg">
                           <TrendingDown className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                           <div className="text-2xl font-bold text-blue-600">{warehouseStats.totalScrapped || 0}</div>
                           <div className="text-sm text-muted-foreground">Списано компонентов</div>
                         </div>
                         <div className="text-center p-4 bg-green-50 rounded-lg">
                           <TrendingUp className="h-8 w-8 text-green-600 mx-auto mb-2" />
                           <div className="text-2xl font-bold text-green-600">{warehouseStats.totalBuilds || 0}</div>
                           <div className="text-sm text-muted-foreground">Собрано конфигураций</div>
                         </div>
                         <div className="text-center p-4 bg-purple-50 rounded-lg">
                           <Package className="h-8 w-8 text-purple-600 mx-auto mb-2" />
                           <div className="text-2xl font-bold text-purple-600">{warehouseStats.totalComponents || 0}</div>
                           <div className="text-sm text-muted-foreground">Всего компонентов</div>
                         </div>
                         <div className="text-center p-4 bg-orange-50 rounded-lg">
                           <Banknote className="h-8 w-8 text-orange-600 mx-auto mb-2" />
                           <div className="text-2xl font-bold text-orange-600">{formatCurrency(warehouseStats.totalValue || 0)}</div>
                           <div className="text-sm text-muted-foreground">Общая стоимость</div>
                         </div>
                       </div>
                       
                       <div className="flex justify-end gap-2 mb-4">
                         <Button 
                           size="sm" 
                           variant="outline" 
                           onClick={downloadWarehouseReport}
                           className="transition-all duration-200 hover:scale-105"
                         >
                           <FileText className="h-4 w-4 mr-2" />
                           Скачать отчет Excel
                         </Button>
                       </div>
                     </CardContent>
                   </Card>
                 )}

                 {/* Enhanced Analytics Section */}
                 <Card>
                   <CardHeader>
                     <div className="flex items-center justify-between">
                       <div>
                         <CardTitle>Детальная аналитика склада</CardTitle>
                         <CardDescription>Подробный анализ производительности и эффективности</CardDescription>
                       </div>
                       <Button
                         variant="outline"
                         size="sm"
                         onClick={() => setShowDetailedAnalytics(!showDetailedAnalytics)}
                       >
                         {showDetailedAnalytics ? 'Свернуть' : 'Развернуть'}
                       </Button>
                     </div>
                   </CardHeader>
                   {showDetailedAnalytics && (
                     <CardContent className="space-y-6">
                       {/* Stock Turnover Analysis */}
                       <div>
                         <h4 className="font-medium mb-3">Оборачиваемость запасов</h4>
                         <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                           <div className="text-center p-3 bg-blue-50 rounded-lg">
                             <div className="text-lg font-bold text-blue-600">12.5</div>
                             <div className="text-sm text-muted-foreground">Средняя оборачиваемость</div>
                           </div>
                           <div className="text-center p-3 bg-green-50 rounded-lg">
                             <div className="text-lg font-bold text-green-600">85%</div>
                             <div className="text-sm text-muted-foreground">Эффективность склада</div>
                           </div>
                           <div className="text-center p-3 bg-purple-50 rounded-lg">
                             <div className="text-lg font-bold text-purple-600">3.2</div>
                             <div className="text-sm text-muted-foreground">Дней до пополнения</div>
                           </div>
                           <div className="text-center p-3 bg-orange-50 rounded-lg">
                             <div className="text-lg font-bold text-orange-600">92%</div>
                             <div className="text-sm text-muted-foreground">Точность инвентаризации</div>
                           </div>
                         </div>
                       </div>

                       <Separator />

                       {/* Category Performance */}
                       <div>
                         <h4 className="font-medium mb-3">Производительность по категориям</h4>
                         <div className="space-y-3">
                           {categories.map(category => {
                             const categoryItems = components.filter(item => item.category === category);
                             const totalValue = categoryItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                             const avgStock = categoryItems.length > 0 ? categoryItems.reduce((sum, item) => sum + item.quantity, 0) / categoryItems.length : 0;
                             
                             return (
                               <div key={category} className="flex items-center justify-between p-3 border rounded-lg">
                                 <div className="flex items-center gap-3">
                                   <Badge variant="secondary">{category}</Badge>
                                   <span className="text-sm text-muted-foreground">
                                     {categoryItems.length} компонентов
                                   </span>
                                 </div>
                                 <div className="flex items-center gap-4 text-sm">
                                   <span>Стоимость: {totalValue.toLocaleString()}₽</span>
                                   <span>Средний запас: {Math.round(avgStock)} шт.</span>
                                 </div>
                               </div>
                             );
                           })}
                         </div>
                       </div>

                       <Separator />

                       {/* Configuration Efficiency */}
                       <div>
                         <h4 className="font-medium mb-3">Эффективность конфигураций</h4>
                         <div className="space-y-3">
                           {configurations.map(config => {
                             const availability = calculateConfigurationAvailability(config);
                             const efficiency = availability.totalCount > 0 ? (availability.availableCount / availability.totalCount) * 100 : 0;
                             
                             return (
                               <div key={config.id} className="flex items-center justify-between p-3 border rounded-lg">
                                 <div className="flex items-center gap-3">
                                   <span className="font-medium">{config.name}</span>
                                   {getPriorityBadge(config.priority)}
                                 </div>
                                 <div className="flex items-center gap-4">
                                   <div className="text-center">
                                     <div className="text-sm font-medium">{efficiency.toFixed(1)}%</div>
                                     <div className="text-xs text-muted-foreground">Доступность</div>
                                   </div>
                                   <div className="text-center">
                                     <div className="text-sm font-medium">{availability.maxPossibleBuilds}</div>
                                     <div className="text-xs text-muted-foreground">Можно собрать</div>
                                   </div>
                                   <div className="text-center">
                                     <div className="text-sm font-medium">{(config.totalValue * availability.maxPossibleBuilds).toLocaleString()}₽</div>
                                     <div className="text-xs text-muted-foreground">Потенциальная выручка</div>
                                   </div>
                                 </div>
                               </div>
                             );
                           })}
                         </div>
                       </div>

                       <Separator />

                       {/* Predictive Analytics */}
                       <div>
                         <h4 className="font-medium mb-3">Прогнозная аналитика</h4>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <div className="p-4 border rounded-lg">
                             <h5 className="font-medium mb-2">Прогноз спроса</h5>
                             <div className="space-y-2 text-sm">
                               <div className="flex justify-between">
                                 <span>Следующие 7 дней:</span>
                                 <span className="font-medium">+15%</span>
                               </div>
                               <div className="flex justify-between">
                                 <span>Следующие 30 дней:</span>
                                 <span className="font-medium">+8%</span>
                               </div>
                               <div className="flex justify-between">
                                 <span>Следующие 90 дней:</span>
                                 <span className="font-medium">+22%</span>
                               </div>
                             </div>
                           </div>
                           <div className="p-4 border rounded-lg">
                             <h5 className="font-medium mb-2">Рекомендации по запасам</h5>
                             <div className="space-y-2 text-sm">
                               <div className="flex justify-between">
                                 <span>Увеличить запасы:</span>
                                 <span className="font-medium text-green-600">CPU, RAM</span>
                               </div>
                               <div className="flex justify-between">
                                 <span>Снизить запасы:</span>
                                 <span className="font-medium text-red-600">Кабели</span>
                               </div>
                               <div className="flex justify-between">
                                 <span>Оптимизировать:</span>
                                 <span className="font-medium text-blue-600">Видеокарты</span>
                               </div>
                             </div>
                           </div>
                         </div>
                       </div>
                     </CardContent>
                   )}
                 </Card>
              </TabsContent>

            </Tabs>
          </main>
        </div>
      </div>

    </div>
  );
};

export default Calculator;