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
  Wrench, 
  Plus, 
  Save, 
  Copy, 
  Trash2, 
  Package, 
  DollarSign, 
  Calculator, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Search,
  Filter,
  Settings,
  BarChart3,
  Info,
  Zap,
  Target,
  ShoppingCart,
  Download,
  Upload,
  Eye,
  Edit3,
  Star,
  Clock,
  Users,
  TrendingUp,
  Shield,
  Palette,
  Layers,
  Cpu,
  HardDrive,
  Monitor,
  Mouse,
  Keyboard,
  Headphones,
  Snowflake,
  Cable
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";

// Enhanced component data with more details
const enhancedComponents = [
  { 
    id: 1, 
    name: "SSD Samsung 970 EVO Plus 1TB", 
    quantity: 12, 
    category: "Накопители", 
    subcategory: "SSD",
    location: "Склад А-12", 
    price: 150, 
    minStock: 2,
    specs: { capacity: "1TB", interface: "NVMe", readSpeed: "3500 MB/s", writeSpeed: "3300 MB/s" },
    compatibility: ["Intel", "AMD"],
    image: "💾",
    rating: 4.8,
    reviews: 156
  },
  { 
    id: 2, 
    name: "DDR4 Kingston Fury 16GB 3200MHz", 
    quantity: 34, 
    category: "Память", 
    subcategory: "RAM",
    location: "Склад B-02", 
    price: 80, 
    minStock: 5,
    specs: { capacity: "16GB", type: "DDR4", speed: "3200MHz", latency: "CL16" },
    compatibility: ["Intel", "AMD"],
    image: "🧠",
    rating: 4.6,
    reviews: 89
  },
  { 
    id: 3, 
    name: "AMD Ryzen 7 5800X", 
    quantity: 5, 
    category: "Процессоры", 
    subcategory: "CPU",
    location: "Склад А-03", 
    price: 300, 
    minStock: 1,
    specs: { cores: 8, threads: 16, baseClock: "3.8 GHz", boostClock: "4.7 GHz", socket: "AM4" },
    compatibility: ["AMD"],
    image: "⚡",
    rating: 4.9,
    reviews: 234
  },
  { 
    id: 4, 
    name: "SATA кабель 6Gb/s", 
    quantity: 120, 
    category: "Кабели", 
    subcategory: "SATA",
    location: "Склад C-01", 
    price: 5, 
    minStock: 10,
    specs: { type: "SATA III", speed: "6Gb/s", length: "50cm" },
    compatibility: ["Universal"],
    image: "🔌",
    rating: 4.2,
    reviews: 45
  },
  { 
    id: 5, 
    name: "MSI MPG B550 GAMING EDGE", 
    quantity: 8, 
    category: "Платы", 
    subcategory: "Motherboard",
    location: "Склад А-05", 
    price: 200, 
    minStock: 2,
    specs: { chipset: "B550", socket: "AM4", formFactor: "ATX", memorySlots: 4 },
    compatibility: ["AMD"],
    image: "🔧",
    rating: 4.7,
    reviews: 123
  },
  { 
    id: 6, 
    name: "Seasonic Focus GX-650", 
    quantity: 15, 
    category: "Питание", 
    subcategory: "PSU",
    location: "Склад B-08", 
    price: 120, 
    minStock: 3,
    specs: { power: "650W", efficiency: "80+ Gold", modular: "Semi-modular" },
    compatibility: ["Universal"],
    image: "⚡",
    rating: 4.8,
    reviews: 167
  },
  { 
    id: 7, 
    name: "NVIDIA RTX 4060 Ti 8GB", 
    quantity: 3, 
    category: "Видеокарты", 
    subcategory: "GPU",
    location: "Склад А-07", 
    price: 450, 
    minStock: 1,
    specs: { memory: "8GB GDDR6", boostClock: "2.54 GHz", tdp: "160W" },
    compatibility: ["Intel", "AMD"],
    image: "🎮",
    rating: 4.9,
    reviews: 298
  },
  { 
    id: 8, 
    name: "NZXT H510 Flow", 
    quantity: 20, 
    category: "Корпуса", 
    subcategory: "Case",
    location: "Склад C-03", 
    price: 80, 
    minStock: 5,
    specs: { formFactor: "ATX", fans: 2, usbPorts: 2 },
    compatibility: ["Universal"],
    image: "🏠",
    rating: 4.5,
    reviews: 78
  },
  { 
    id: 9, 
    name: "Noctua NH-D15", 
    quantity: 7, 
    category: "Охлаждение", 
    subcategory: "CPU Cooler",
    location: "Склад B-10", 
    price: 95, 
    minStock: 2,
    specs: { height: "165mm", fans: 2, noise: "24.6 dB" },
    compatibility: ["Intel", "AMD"],
    image: "❄️",
    rating: 4.9,
    reviews: 189
  },
  { 
    id: 10, 
    name: "Logitech G Pro X", 
    quantity: 25, 
    category: "Периферия", 
    subcategory: "Headset",
    location: "Склад D-05", 
    price: 180, 
    minStock: 3,
    specs: { type: "Wireless", battery: "20h", weight: "320g" },
    compatibility: ["Universal"],
    image: "🎧",
    rating: 4.7,
    reviews: 156
  }
];

// Enhanced configuration templates
const configurationTemplates = [
  {
    id: 1,
    name: "Игровой ПК Премиум",
    description: "Мощная игровая система для современных игр",
    difficulty: "expert",
    estimatedTime: "2-3 часа",
    targetAudience: "Геймеры",
    components: [
      { componentId: 3, quantity: 1, name: "AMD Ryzen 7 5800X" },
      { componentId: 5, quantity: 1, name: "MSI MPG B550 GAMING EDGE" },
      { componentId: 2, quantity: 2, name: "DDR4 Kingston Fury 16GB 3200MHz" },
      { componentId: 1, quantity: 1, name: "SSD Samsung 970 EVO Plus 1TB" },
      { componentId: 6, quantity: 1, name: "Seasonic Focus GX-650" },
      { componentId: 7, quantity: 1, name: "NVIDIA RTX 4060 Ti 8GB" },
      { componentId: 8, quantity: 1, name: "NZXT H510 Flow" },
      { componentId: 9, quantity: 1, name: "Noctua NH-D15" },
    ],
    totalValue: 1615,
    totalItems: 8,
    createdAt: "2025-08-01",
    tags: ["gaming", "premium", "performance"],
    estimatedPerformance: {
      gaming: "Ultra 1440p",
      productivity: "Professional",
      futureProof: "3-4 years"
    }
  },
  {
    id: 2,
    name: "Офисный ПК Эконом",
    description: "Надежная система для офисных задач",
    difficulty: "beginner",
    estimatedTime: "1-1.5 часа",
    targetAudience: "Офисные работники",
    components: [
      { componentId: 3, quantity: 1, name: "AMD Ryzen 7 5800X" },
      { componentId: 5, quantity: 1, name: "MSI MPG B550 GAMING EDGE" },
      { componentId: 2, quantity: 1, name: "DDR4 Kingston Fury 16GB 3200MHz" },
      { componentId: 1, quantity: 1, name: "SSD Samsung 970 EVO Plus 1TB" },
      { componentId: 6, quantity: 1, name: "Seasonic Focus GX-650" },
      { componentId: 8, quantity: 1, name: "NZXT H510 Flow" },
    ],
    totalValue: 1080,
    totalItems: 6,
    createdAt: "2025-08-05",
    tags: ["office", "budget", "reliable"],
    estimatedPerformance: {
      gaming: "Casual 1080p",
      productivity: "Office",
      futureProof: "2-3 years"
    }
  },
  {
    id: 3,
    name: "Серверная сборка",
    description: "Производительная система для серверных задач",
    difficulty: "expert",
    estimatedTime: "3-4 часа",
    targetAudience: "IT специалисты",
    components: [
      { componentId: 3, quantity: 2, name: "AMD Ryzen 7 5800X" },
      { componentId: 5, quantity: 1, name: "MSI MPG B550 GAMING EDGE" },
      { componentId: 2, quantity: 4, name: "DDR4 Kingston Fury 16GB 3200MHz" },
      { componentId: 1, quantity: 2, name: "SSD Samsung 970 EVO Plus 1TB" },
      { componentId: 6, quantity: 1, name: "Seasonic Focus GX-650" },
      { componentId: 9, quantity: 2, name: "Noctua NH-D15" },
    ],
    totalValue: 1860,
    totalItems: 10,
    createdAt: "2025-08-10",
    tags: ["server", "professional", "high-performance"],
    estimatedPerformance: {
      gaming: "Not applicable",
      productivity: "Enterprise",
      futureProof: "5+ years"
    }
  }
];

const Configurator = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 2000]);
  const [activeTab, setActiveTab] = useState("templates");
  const [selectedTemplate, setSelectedTemplate] = useState<typeof configurationTemplates[0] | null>(null);
  const [customConfiguration, setCustomConfiguration] = useState<{[key: number]: number}>({});
  const [configurationName, setConfigurationName] = useState("");
  const [configurationDescription, setConfigurationDescription] = useState("");
  const [showCompatibilityWarnings, setShowCompatibilityWarnings] = useState(true);

  const categories = useMemo(() => Array.from(new Set(enhancedComponents.map(item => item.category))), []);
  const subcategories = useMemo(() => {
    if (selectedCategory === "all") {
      return Array.from(new Set(enhancedComponents.map(item => item.subcategory)));
    }
    return Array.from(new Set(enhancedComponents.filter(item => item.category === selectedCategory).map(item => item.subcategory)));
  }, [selectedCategory]);

  const filteredComponents = useMemo(() => {
    return enhancedComponents.filter(item => {
      const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
      const matchCategory = selectedCategory === "all" || item.category === selectedCategory;
      const matchSubcategory = selectedSubcategory === "all" || item.subcategory === selectedSubcategory;
      const matchPrice = item.price >= priceRange[0] && item.price <= priceRange[1];
      
      return matchSearch && matchCategory && matchSubcategory && matchPrice;
    });
  }, [search, selectedCategory, selectedSubcategory, priceRange]);

  const filteredTemplates = useMemo(() => {
    return configurationTemplates.filter(template => {
      const matchSearch = !search || template.name.toLowerCase().includes(search.toLowerCase());
      const matchDifficulty = difficultyFilter === "all" || template.difficulty === difficultyFilter;
      
      return matchSearch && matchDifficulty;
    });
  }, [search, difficultyFilter]);

  // Calculate configuration totals
  const calculateConfigurationTotals = useCallback((components: {[key: number]: number}) => {
    let totalValue = 0;
    let totalItems = 0;
    let compatibilityIssues = 0;
    
    const selectedComponents = Object.entries(components).map(([componentId, quantity]) => {
      const component = enhancedComponents.find(c => c.id === parseInt(componentId));
      if (component) {
        totalValue += component.price * quantity;
        totalItems += quantity;
      }
      return component;
    }).filter(Boolean);

    // Check compatibility
    const cpu = selectedComponents.find(c => c?.category === "Процессоры");
    const motherboard = selectedComponents.find(c => c?.category === "Платы");
    
    if (cpu && motherboard && cpu.compatibility !== motherboard.compatibility) {
      compatibilityIssues++;
    }

    return { totalValue, totalItems, compatibilityIssues, selectedComponents };
  }, []);

  const customTotals = useMemo(() => calculateConfigurationTotals(customConfiguration), [customConfiguration, calculateConfigurationTotals]);

  // Check stock availability
  const checkStockAvailability = useCallback((components: {[key: number]: number}) => {
    const availability = Object.entries(components).map(([componentId, quantity]) => {
      const component = enhancedComponents.find(c => c.id === parseInt(componentId));
      if (!component) return { componentId: parseInt(componentId), available: 0, required: quantity, status: 'missing' as const };
      
      const available = component.quantity;
      const required = quantity;
      const status = available >= required ? 'available' : available > 0 ? 'partial' : 'unavailable' as const;
      
      return {
        componentId: parseInt(componentId),
        available,
        required,
        status,
        component
      };
    });

    const maxPossibleBuilds = Math.min(...availability.map(item => Math.floor(item.available / item.required)));
    const allAvailable = availability.every(item => item.status === 'available');

    return {
      items: availability,
      maxPossibleBuilds: maxPossibleBuilds > 0 ? maxPossibleBuilds : 0,
      allAvailable,
      availableCount: availability.filter(item => item.status === 'available').length,
      totalCount: availability.length
    };
  }, []);

  const stockAvailability = useMemo(() => checkStockAvailability(customConfiguration), [customConfiguration, checkStockAvailability]);

  const addComponent = (componentId: number, quantity: number = 1) => {
    setCustomConfiguration(prev => ({
      ...prev,
      [componentId]: (prev[componentId] || 0) + quantity
    }));
  };

  const removeComponent = (componentId: number) => {
    const newConfig = { ...customConfiguration };
    delete newConfig[componentId];
    setCustomConfiguration(newConfig);
  };

  const updateComponentQuantity = (componentId: number, quantity: number) => {
    if (quantity <= 0) {
      removeComponent(componentId);
    } else {
      setCustomConfiguration(prev => ({ ...prev, [componentId]: quantity }));
    }
  };

  const loadTemplate = (template: typeof configurationTemplates[0]) => {
    const templateComponents: {[key: number]: number} = {};
    template.components.forEach(comp => {
      templateComponents[comp.componentId] = comp.quantity;
    });
    
    setCustomConfiguration(templateComponents);
    setConfigurationName(template.name);
    setConfigurationDescription(template.description);
    setActiveTab("custom");
  };

  const saveConfiguration = () => {
    if (!configurationName.trim()) {
      alert("Пожалуйста, введите название конфигурации");
      return;
    }

    const configuration = {
      id: Date.now(),
      name: configurationName,
      description: configurationDescription,
      components: Object.entries(customConfiguration).map(([componentId, quantity]) => {
        const component = enhancedComponents.find(c => c.id === parseInt(componentId));
        return {
          componentId: parseInt(componentId),
          quantity,
          name: component?.name || ""
        };
      }),
      totalValue: customTotals.totalValue,
      totalItems: customTotals.totalItems,
      createdAt: new Date().toISOString().split('T')[0],
      difficulty: "custom",
      estimatedTime: "1-2 часа",
      targetAudience: "Пользовательская",
      tags: ["custom"],
      estimatedPerformance: {
        gaming: "Custom",
        productivity: "Custom",
        futureProof: "Custom"
      }
    };

    console.log('Saving configuration:', configuration);
    alert('Конфигурация сохранена!');
  };

  const getDifficultyBadge = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner':
        return <Badge variant="default" className="bg-green-500">Начинающий</Badge>;
      case 'intermediate':
        return <Badge variant="secondary" className="bg-blue-500 text-white">Средний</Badge>;
      case 'expert':
        return <Badge variant="destructive">Эксперт</Badge>;
      default:
        return <Badge variant="outline">Пользовательская</Badge>;
    }
  };

  const getCompatibilityIcon = (status: 'available' | 'partial' | 'unavailable' | 'missing') => {
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
    name: "Конфигуратор", 
    quantity: filteredTemplates.length, 
    location: "Сборка", 
    category: "Системы" 
  };

  return (
    <div className="min-h-screen relative">
      <Seo 
        title="Конфигуратор систем — создание сборок"
        description="Продвинутый конфигуратор для создания компьютерных систем с проверкой совместимости и оптимизацией."
        canonical="/configurator"
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
              <Wrench className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold">Конфигуратор систем</h1>
                <p className="text-muted-foreground">Создание и настройка компьютерных систем с проверкой совместимости</p>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="templates" className="flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  Шаблоны
                </TabsTrigger>
                <TabsTrigger value="custom" className="flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  Своя сборка
                </TabsTrigger>
                <TabsTrigger value="components" className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Компоненты
                </TabsTrigger>
              </TabsList>

              <TabsContent value="templates" className="space-y-6">
                <div className="flex gap-4 mb-4">
                  <div className="flex-1">
                    <Label htmlFor="template-search">Поиск шаблонов</Label>
                    <Input
                      id="template-search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Найти шаблон..."
                    />
                  </div>
                  <div className="w-48">
                    <Label htmlFor="difficulty-filter">Сложность</Label>
                    <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Все уровни</SelectItem>
                        <SelectItem value="beginner">Начинающий</SelectItem>
                        <SelectItem value="intermediate">Средний</SelectItem>
                        <SelectItem value="expert">Эксперт</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {filteredTemplates.map(template => (
                    <Card key={template.id} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => loadTemplate(template)}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              {template.name}
                              {getDifficultyBadge(template.difficulty)}
                            </CardTitle>
                            <CardDescription>{template.description}</CardDescription>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-primary">
                              {template.totalValue.toLocaleString()}₽
                            </div>
                            <div className="text-sm text-muted-foreground">стоимость</div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div className="p-2 bg-primary/5 rounded">
                            <div className="text-sm font-medium">{template.estimatedTime}</div>
                            <div className="text-xs text-muted-foreground">Время сборки</div>
                          </div>
                          <div className="p-2 bg-primary/5 rounded">
                            <div className="text-sm font-medium">{template.targetAudience}</div>
                            <div className="text-xs text-muted-foreground">Целевая аудитория</div>
                          </div>
                          <div className="p-2 bg-primary/5 rounded">
                            <div className="text-sm font-medium">{template.totalItems}</div>
                            <div className="text-xs text-muted-foreground">Компонентов</div>
                          </div>
                        </div>

                        <div>
                          <h4 className="font-medium mb-2">Ожидаемая производительность</h4>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span>Игры:</span>
                              <span className="font-medium">{template.estimatedPerformance.gaming}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Работа:</span>
                              <span className="font-medium">{template.estimatedPerformance.productivity}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Актуальность:</span>
                              <span className="font-medium">{template.estimatedPerformance.futureProof}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button size="sm" className="flex-1" onClick={(e) => { e.stopPropagation(); loadTemplate(template); }}>
                            <Eye className="h-4 w-4 mr-2" />
                            Использовать
                          </Button>
                          <Button size="sm" variant="outline">
                            <Info className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="custom" className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
                  {/* Component Selection */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Выбор компонентов</CardTitle>
                      <CardDescription>Выберите компоненты для своей сборки</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <Label htmlFor="component-search">Поиск компонентов</Label>
                          <Input
                            id="component-search"
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
                          <div key={item.id} className="border rounded-lg p-4 hover:bg-accent/50 transition-colors">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-2xl">{item.image}</span>
                                  <div>
                                    <h4 className="font-medium">{item.name}</h4>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                      <span>{item.category} • {item.subcategory}</span>
                                      <span>В наличии: {item.quantity} шт.</span>
                                      <span className="font-medium">{item.price}₽/шт.</span>
                                      <div className="flex items-center gap-1">
                                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                        <span>{item.rating}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => addComponent(item.id)}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Configuration Summary */}
                  <div className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle>Ваша сборка</CardTitle>
                        <CardDescription>Сводка по выбранным компонентам</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="text-center p-4 bg-primary/5 rounded-lg">
                            <DollarSign className="h-8 w-8 text-primary mx-auto mb-2" />
                            <div className="text-2xl font-bold">{customTotals.totalValue.toLocaleString()}₽</div>
                            <div className="text-sm text-muted-foreground">Общая стоимость</div>
                          </div>
                          <div className="text-center p-4 bg-primary/5 rounded-lg">
                            <Package className="h-8 w-8 text-primary mx-auto mb-2" />
                            <div className="text-2xl font-bold">{customTotals.totalItems}</div>
                            <div className="text-sm text-muted-foreground">Компонентов</div>
                          </div>
                        </div>

                        {customTotals.compatibilityIssues > 0 && showCompatibilityWarnings && (
                          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <div className="flex items-center gap-2 text-yellow-800">
                              <AlertTriangle className="h-4 w-4" />
                              <span className="font-medium">Проблемы совместимости</span>
                            </div>
                            <p className="text-sm text-yellow-700 mt-1">
                              Обнаружено {customTotals.compatibilityIssues} проблем с совместимостью компонентов
                            </p>
                          </div>
                        )}

                        <div>
                          <h4 className="font-medium mb-3">Выбранные компоненты</h4>
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {Object.entries(customConfiguration).map(([itemId, quantity]) => {
                              const item = enhancedComponents.find(i => i.id === parseInt(itemId));
                              if (!item) return null;
                              return (
                                <div key={itemId} className="flex items-center justify-between p-2 border rounded">
                                  <div className="flex items-center gap-2">
                                    <span>{item.image}</span>
                                    <div>
                                      <div className="font-medium text-sm">{item.name}</div>
                                      <div className="text-xs text-muted-foreground">{quantity} × {item.price}₽</div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Input
                                      type="number"
                                      min="1"
                                      max={item.quantity}
                                      value={quantity}
                                      onChange={(e) => updateComponentQuantity(item.id, parseInt(e.target.value) || 0)}
                                      className="w-16 h-8"
                                    />
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => removeComponent(item.id)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <Label htmlFor="config-name">Название сборки</Label>
                            <Input
                              id="config-name"
                              value={configurationName}
                              onChange={(e) => setConfigurationName(e.target.value)}
                              placeholder="Моя игровая сборка"
                            />
                          </div>
                          <div>
                            <Label htmlFor="config-description">Описание</Label>
                            <Input
                              id="config-description"
                              value={configurationDescription}
                              onChange={(e) => setConfigurationDescription(e.target.value)}
                              placeholder="Описание назначения сборки"
                            />
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button 
                            className="flex-1" 
                            onClick={saveConfiguration}
                            disabled={Object.keys(customConfiguration).length === 0 || !configurationName.trim()}
                          >
                            <Save className="h-4 w-4 mr-2" />
                            Сохранить сборку
                          </Button>
                          <Button 
                            variant="outline"
                            onClick={() => setCustomConfiguration({})}
                          >
                            Очистить
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Stock Availability */}
                    {Object.keys(customConfiguration).length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle>Доступность на складе</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm">Можно собрать:</span>
                              <Badge variant={stockAvailability.maxPossibleBuilds > 0 ? "default" : "destructive"}>
                                {stockAvailability.maxPossibleBuilds} единиц
                              </Badge>
                            </div>
                            <Progress value={(stockAvailability.availableCount / stockAvailability.totalCount) * 100} className="h-2" />
                            <div className="text-xs text-muted-foreground">
                              {stockAvailability.availableCount} из {stockAvailability.totalCount} компонентов доступны
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="components" className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Component Categories */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Категории компонентов</CardTitle>
                      <CardDescription>Обзор по категориям</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {categories.map(category => {
                          const categoryItems = enhancedComponents.filter(item => item.category === category);
                          const totalValue = categoryItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                          const totalItems = categoryItems.reduce((sum, item) => sum + item.quantity, 0);
                          
                          return (
                            <div key={category} className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                                  {category === "Процессоры" && <Cpu className="h-5 w-5 text-primary" />}
                                  {category === "Память" && <Package className="h-5 w-5 text-primary" />}
                                  {category === "Накопители" && <HardDrive className="h-5 w-5 text-primary" />}
                                  {category === "Платы" && <Layers className="h-5 w-5 text-primary" />}
                                  {category === "Видеокарты" && <Monitor className="h-5 w-5 text-primary" />}
                                  {category === "Питание" && <Zap className="h-5 w-5 text-primary" />}
                                  {category === "Корпуса" && <Package className="h-5 w-5 text-primary" />}
                                  {category === "Охлаждение" && <Snowflake className="h-5 w-5 text-primary" />}
                                  {category === "Периферия" && <Mouse className="h-5 w-5 text-primary" />}
                                  {category === "Кабели" && <Cable className="h-5 w-5 text-primary" />}
                                </div>
                                <div>
                                  <div className="font-medium">{category}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {categoryItems.length} типов • {totalItems} шт.
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-medium">{totalValue.toLocaleString()}₽</div>
                                <div className="text-sm text-muted-foreground">стоимость</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Component Statistics */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Статистика компонентов</CardTitle>
                      <CardDescription>Общая информация о складе</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-4 bg-primary/5 rounded-lg">
                          <Package className="h-8 w-8 text-primary mx-auto mb-2" />
                          <div className="text-2xl font-bold">{enhancedComponents.length}</div>
                          <div className="text-sm text-muted-foreground">Типов компонентов</div>
                        </div>
                        <div className="text-center p-4 bg-green-50 rounded-lg">
                          <TrendingUp className="h-8 w-8 text-green-600 mx-auto mb-2" />
                          <div className="text-2xl font-bold text-green-600">
                            {enhancedComponents.reduce((sum, item) => sum + item.quantity, 0)}
                          </div>
                          <div className="text-sm text-muted-foreground">Всего единиц</div>
                        </div>
                      </div>
                      
                      <Separator className="my-4" />
                      
                      <div>
                        <h4 className="font-medium mb-3">Топ компонентов по рейтингу</h4>
                        <div className="space-y-2">
                          {enhancedComponents
                            .sort((a, b) => b.rating - a.rating)
                            .slice(0, 5)
                            .map(component => (
                              <div key={component.id} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                  <span>{component.image}</span>
                                  <span>{component.name}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                  <span>{component.rating}</span>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
    </div>
  );
};

export default Configurator;
