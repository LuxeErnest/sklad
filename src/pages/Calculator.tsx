import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import UniversalBackground from "@/components/UniversalBackground";
import Seo from "@/components/seo/Seo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calculator as CalcIcon, Banknote, Package, BarChart3, AlertTriangle, XCircle } from "lucide-react";
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
import { AnalyticsTab } from "@/components/calculator/AnalyticsTab";
import { ScrapTab } from "@/components/calculator/ScrapTab";
import { ManualCalcTab } from "@/components/calculator/ManualCalcTab";

// Empty arrays for clean start
const mockComponents: any[] = [];
const mockConfigurations: any[] = [];

const Calculator = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedItems, setSelectedItems] = useState<{[key: number]: number}>({});
  const [activeTab, setActiveTab] = useState("analytics");
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


              <ManualCalcTab
                components={components as StockItem[]}
                filteredComponents={filteredComponents as StockItem[]}
                categories={categories}
                selectedItems={selectedItems}
                manualCalculations={manualCalculations}
                search={search}
                setSearch={setSearch}
                selectedCategory={selectedCategory}
                setSelectedCategory={setSelectedCategory}
                updateQuantity={updateQuantity}
                clearSelections={clearSelections}
                saveCalculation={saveCalculation}
                setShowDetailedAnalytics={setShowDetailedAnalytics}
              />

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