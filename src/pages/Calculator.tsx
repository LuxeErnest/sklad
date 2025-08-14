import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import BackgroundGlow from "@/components/common/BackgroundGlow";
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
  DollarSign, 
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
  Download
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";

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

// Enhanced mock data with more warehouse-relevant information (fallback)
const mockComponents = [
  { id: 1, name: "SSD 1TB", quantity: 12, category: "Накопители", location: "Склад А-12", price: 150, minStock: 2 },
  { id: 2, name: "DDR4 16GB", quantity: 34, category: "Память", location: "Склад B-02", price: 80, minStock: 5 },
  { id: 3, name: "CPU Ryzen 7", quantity: 5, category: "Процессоры", location: "Склад А-03", price: 300, minStock: 1 },
  { id: 4, name: "SATA кабель", quantity: 120, category: "Кабели", location: "Склад C-01", price: 5, minStock: 10 },
  { id: 5, name: "Материнская плата", quantity: 8, category: "Платы", location: "Склад А-05", price: 200, minStock: 2 },
  { id: 6, name: "Блок питания 650W", quantity: 15, category: "Питание", location: "Склад B-08", price: 120, minStock: 3 },
  { id: 7, name: "Видеокарта RTX 4060", quantity: 3, category: "Видеокарты", location: "Склад А-07", price: 450, minStock: 1 },
  { id: 8, name: "Корпус ATX", quantity: 20, category: "Корпуса", location: "Склад C-03", price: 80, minStock: 5 },
];

const mockConfigurations = [
  {
    id: 1,
    name: "Игровой ПК",
    description: "Конфигурация для игрового компьютера",
    priority: "high",
    components: [
      { componentId: 3, quantity: 1, name: "CPU Ryzen 7" },
      { componentId: 5, quantity: 1, name: "Материнская плата" },
      { componentId: 2, quantity: 2, name: "DDR4 16GB" },
      { componentId: 1, quantity: 1, name: "SSD 1TB" },
      { componentId: 6, quantity: 1, name: "Блок питания 650W" },
      { componentId: 7, quantity: 1, name: "Видеокарта RTX 4060" },
      { componentId: 8, quantity: 1, name: "Корпус ATX" },
    ],
    totalValue: 1530,
    totalItems: 8,
    createdAt: "2025-08-01",
  },
  {
    id: 2,
    name: "Офисный ПК",
    description: "Конфигурация для офисного компьютера",
    priority: "medium",
    components: [
      { componentId: 3, quantity: 1, name: "CPU Ryzen 7" },
      { componentId: 5, quantity: 1, name: "Материнская плата" },
      { componentId: 2, quantity: 1, name: "DDR4 16GB" },
      { componentId: 1, quantity: 1, name: "SSD 1TB" },
      { componentId: 6, quantity: 1, name: "Блок питания 650W" },
      { componentId: 8, quantity: 1, name: "Корпус ATX" },
    ],
    totalValue: 1080,
    totalItems: 6,
    createdAt: "2025-08-05",
  },
  {
    id: 3,
    name: "Серверная сборка",
    description: "Конфигурация для сервера",
    priority: "low",
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

const Calculator = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedItems, setSelectedItems] = useState<{[key: number]: number}>({});
  const [activeTab, setActiveTab] = useState("configurations");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [availabilityFilter, setAvailabilityFilter] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [components, setComponents] = useState<any[]>(mockComponents);
  const [configurations, setConfigurations] = useState<any[]>(mockConfigurations);

  // Load data from DB (or localStorage fallback) and compute derived fields
  const loadData = async () => {
    try {
      const { getComponents, getConfigurations, getConfigurationComponents } = await import("@/lib/db");
      const rows = await getComponents();
      if (Array.isArray(rows) && rows.length > 0) {
        setComponents(rows.map((r: any) => ({ ...r, minStock: r.minStock ?? 0 })));
      } else {
        setComponents(mockComponents);
      }

      // Load configurations if any exist in DB; otherwise fallback
      const cfgs = await getConfigurations();
      if (Array.isArray(cfgs) && cfgs.length > 0) {
        const full = [] as any[];
        for (const c of cfgs) {
          const comps = await getConfigurationComponents(c.id);
          const componentsList = comps.map((cc: any) => ({ componentId: cc.componentId, quantity: cc.quantity, name: (rows.find((r: any)=> r.id===cc.componentId)?.name) || "" }));
          const totalItems = componentsList.reduce((s: number, it: any) => s + it.quantity, 0);
          const totalValue = componentsList.reduce((s: number, it: any) => {
            const comp = (rows as any[]).find((r: any) => r.id === it.componentId);
            return s + (comp?.price || 0) * it.quantity;
          }, 0);
          full.push({ ...c, components: componentsList, totalItems, totalValue, priority: "medium" });
        }
        setConfigurations(full);
      } else {
        setConfigurations(mockConfigurations);
      }
    } catch {
      setComponents(mockComponents);
      setConfigurations(mockConfigurations);
    }
  };

  useEffect(() => { loadData(); }, []);

  const categories = useMemo(() => Array.from(new Set(components.map(item => item.category))), [components]);
  
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
      
      const available = stockComponent.quantity;
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
      const item = mockComponents.find(i => i.id === parseInt(itemId));
      return sum + (item ? item.price * quantity : 0);
    }, 0);

    const totalItems = Object.values(selectedItems).reduce((sum, qty) => sum + qty, 0);
    
    const categoryBreakdown = Object.entries(selectedItems).reduce((acc, [itemId, quantity]) => {
      const item = mockComponents.find(i => i.id === parseInt(itemId));
      if (item) {
        acc[item.category] = (acc[item.category] || 0) + (item.price * quantity);
      }
      return acc;
    }, {} as {[key: string]: number});

    // Calculate stock warnings
    const stockWarnings = Object.entries(selectedItems).map(([itemId, quantity]) => {
      const item = mockComponents.find(i => i.id === parseInt(itemId));
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
  }, [selectedItems]);

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
  }, [components, configurations]);

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

  // Function to build configuration with validation
  const buildConfiguration = (config: typeof mockConfigurations[0]) => {
    setIsLoading(true);
    
    try {
      const availability = calculateConfigurationAvailability(config);
      
      if (availability.maxPossibleBuilds === 0) {
        alert('Недостаточно компонентов для сборки этой конфигурации');
        return;
      }
      
      // In a real app, this would update the inventory
      console.log(`Building ${availability.maxPossibleBuilds} units of ${config.name}`);
      alert(`Сборка ${availability.maxPossibleBuilds} единиц ${config.name} начата`);
      
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
        title="Калькулятор склада — анализ и планирование"
        description="Продвинутый калькулятор для анализа склада, расчета конфигураций и планирования закупок."
        canonical="/calculator"
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
              <CalcIcon className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold">Калькулятор склада</h1>
                <p className="text-muted-foreground">Анализ доступности, планирование сборок и управление запасами</p>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-primary" />
                    <div>
                      <div className="text-2xl font-bold">{warehouseAnalytics.totalStockValue.toLocaleString()}₽</div>
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
                <TabsTrigger value="configurations" className="flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Конфигурации
                </TabsTrigger>
                <TabsTrigger value="manual" className="flex items-center gap-2">
                  <CalcIcon className="h-4 w-4" />
                  Ручной расчет
                </TabsTrigger>
                <TabsTrigger value="analytics" className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Аналитика
                </TabsTrigger>
              </TabsList>

              <TabsContent value="configurations" className="space-y-6">
                <div className="flex gap-4 mb-4">
                  <div className="flex-1">
                    <Label htmlFor="config-search">Поиск конфигураций</Label>
                    <Input
                      id="config-search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Найти конфигурацию..."
                    />
                  </div>
                  <div className="w-48">
                    <Label htmlFor="priority-filter">Приоритет</Label>
                    <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                      <SelectTrigger>
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
                  <div className="w-48">
                    <Label htmlFor="availability-filter">Доступность</Label>
                    <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
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
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {filteredConfigurations.map(config => {
                    const availability = calculateConfigurationAvailability(config);
                    const isAvailable = availability.maxPossibleBuilds > 0;
                    
                    // Apply availability filter
                    if (availabilityFilter === "available" && !isAvailable) return null;
                    if (availabilityFilter === "partial" && (isAvailable || availability.noneAvailable)) return null;
                    if (availabilityFilter === "unavailable" && !availability.noneAvailable) return null;

                    return (
                      <Card key={config.id} className="hover:shadow-lg transition-shadow">
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <div>
                              <CardTitle className="flex items-center gap-2">
                                {config.name}
                                {getPriorityBadge(config.priority)}
                              </CardTitle>
                              <CardDescription>{config.description}</CardDescription>
                            </div>
                            <div className="text-right">
                              <div className="text-2xl font-bold text-primary">
                                {availability.maxPossibleBuilds}
                              </div>
                              <div className="text-sm text-muted-foreground">можно собрать</div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="text-center p-3 bg-primary/5 rounded-lg">
                              <div className="text-lg font-bold">{config.totalItems}</div>
                              <div className="text-sm text-muted-foreground">компонентов</div>
                            </div>
                            <div className="text-center p-3 bg-primary/5 rounded-lg">
                              <div className="text-lg font-bold">{(config.totalValue * availability.maxPossibleBuilds).toLocaleString()}₽</div>
                              <div className="text-sm text-muted-foreground">общая стоимость</div>
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">Доступность компонентов</span>
                              <span className="text-sm text-muted-foreground">
                                {availability.availableCount}/{availability.totalCount}
                              </span>
                            </div>
                            <Progress value={(availability.availableCount / availability.totalCount) * 100} className="h-2" />
                          </div>

                          <div className="space-y-2">
                            {availability.items.slice(0, 3).map((item, index) => (
                              <div key={index} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                  {getAvailabilityIcon(item.status)}
                                  <span>{item.name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary">{item.required} шт.</Badge>
                                  <span className="text-muted-foreground">
                                    {item.available}/{item.required}
                                  </span>
                                </div>
                              </div>
                            ))}
                            {availability.items.length > 3 && (
                              <div className="text-sm text-muted-foreground text-center">
                                +{availability.items.length - 3} еще
                              </div>
                            )}
                          </div>

                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              className="flex-1" 
                              disabled={!isAvailable || isLoading}
                              onClick={() => buildConfiguration(config)}
                            >
                              <ShoppingCart className="h-4 w-4 mr-2" />
                              {isLoading ? 'Сборка...' : 'Собрать'}
                            </Button>
                            <Button size="sm" variant="outline">
                              <Info className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
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
                                <h4 className="font-medium">{item.name}</h4>
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
                            <DollarSign className="h-8 w-8 text-primary mx-auto mb-2" />
                            <div className="text-2xl font-bold">{manualCalculations.totalValue.toLocaleString()}₽</div>
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
                                    <span>{warning.item.name}</span>
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
                              const item = mockComponents.find(i => i.id === parseInt(itemId));
                              if (!item) return null;
                              return (
                                <div key={itemId} className="flex justify-between items-center text-sm">
                                  <div>
                                    <div className="font-medium">{item.name}</div>
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
                            className="flex-1" 
                            onClick={clearSelections}
                            variant="outline"
                          >
                            Очистить
                          </Button>
                          <Button 
                            className="flex-1"
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
                                <div className="font-medium">{item.name}</div>
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
                        <h4 className="font-medium mb-3">Отсутствующие компоненты</h4>
                        <div className="space-y-2">
                          {warehouseAnalytics.outOfStockItems.map(item => (
                            <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg bg-red-50">
                              <div>
                                <div className="font-medium">{item.name}</div>
                                <div className="text-sm text-muted-foreground">
                                  {item.category} • {item.location}
                                </div>
                              </div>
                              <Badge variant="destructive">Нет в наличии</Badge>
                            </div>
                          ))}
                        </div>
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

                                 <Card>
                   <CardHeader>
                     <CardTitle>Рекомендации по закупкам</CardTitle>
                     <CardDescription>Автоматические рекомендации на основе анализа</CardDescription>
                   </CardHeader>
                   <CardContent>
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                       <div className="p-4 border rounded-lg">
                         <div className="flex items-center gap-2 mb-2">
                           <AlertTriangle className="h-5 w-5 text-yellow-500" />
                           <h4 className="font-medium">Срочные закупки</h4>
                         </div>
                         <p className="text-sm text-muted-foreground mb-3">
                           Компоненты, которые нужно закупить в первую очередь
                         </p>
                         <Button size="sm" variant="outline" className="w-full">
                           <Download className="h-4 w-4 mr-2" />
                           Скачать список
                         </Button>
                       </div>

                       <div className="p-4 border rounded-lg">
                         <div className="flex items-center gap-2 mb-2">
                           <Target className="h-5 w-5 text-blue-500" />
                           <h4 className="font-medium">Планирование</h4>
                         </div>
                         <p className="text-sm text-muted-foreground mb-3">
                           Рекомендации по планированию закупок на месяц
                         </p>
                         <Button size="sm" variant="outline" className="w-full">
                           <BarChart3 className="h-4 w-4 mr-2" />
                           Показать план
                         </Button>
                       </div>

                       <div className="p-4 border rounded-lg">
                         <div className="flex items-center gap-2 mb-2">
                           <Zap className="h-5 w-5 text-green-500" />
                           <h4 className="font-medium">Оптимизация</h4>
                         </div>
                         <p className="text-sm text-muted-foreground mb-3">
                           Предложения по оптимизации складских запасов
                         </p>
                         <Button size="sm" variant="outline" className="w-full">
                           <Settings className="h-4 w-4 mr-2" />
                           Настроить
                         </Button>
                       </div>
                     </div>
                   </CardContent>
                 </Card>

                 {/* Enhanced Analytics Section */}
                 <Card>
                   <CardHeader>
                     <CardTitle>Детальная аналитика склада</CardTitle>
                     <CardDescription>Подробный анализ производительности и эффективности</CardDescription>
                   </CardHeader>
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
                           const categoryItems = mockComponents.filter(item => item.category === category);
                           const totalValue = categoryItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                           const avgStock = categoryItems.reduce((sum, item) => sum + item.quantity, 0) / categoryItems.length;
                           
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
                         {mockConfigurations.map(config => {
                           const availability = calculateConfigurationAvailability(config);
                           const efficiency = (availability.availableCount / availability.totalCount) * 100;
                           
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