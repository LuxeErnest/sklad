import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { TabsContent } from "@/components/ui/tabs";
import {
  AlertTriangle, Banknote, BarChart3, CheckCircle, FileText, Package,
  Target, TrendingDown, TrendingUp, XCircle,
} from "lucide-react";
import * as XLSX from "xlsx";
import { ItemLink } from "@/components/common/ItemLink";
import { formatCurrency } from "@/lib/utils";
import type {
  ConfigurationAvailability,
  RecipeComponent,
  StockItem,
  WarehouseAnalytics,
} from "@/lib/calculator";

/** Конфигурация в объёме, который нужен аналитике. */
export interface AnalyticsConfiguration {
  id: number;
  name: string;
  components: RecipeComponent[];
  totalValue?: number;
  priority?: string;
}

interface AnalyticsTabProps {
  warehouseAnalytics: WarehouseAnalytics;
  components: (StockItem & { lastUpdated?: string })[];
  categories: string[];
  configurations: AnalyticsConfiguration[];
  warehouseStats: Record<string, number | undefined>;
  calculateConfigurationAvailability: (config: AnalyticsConfiguration) => ConfigurationAvailability;
  showDetailedAnalytics: boolean;
  setShowDetailedAnalytics: Dispatch<SetStateAction<boolean>>;
  showPlanningStats: boolean;
  getPriorityBadge: (priority: string) => ReactNode;
}

/**
 * Вкладка аналитики страницы статистики.
 *
 * Вынесена из Calculator.tsx: страница была на 1389 строк, и разметка четырёх
 * вкладок перемешивалась с расчётами. Сами расчёты живут в lib/calculator.ts.
 */
export const AnalyticsTab = ({
  warehouseAnalytics,
  components,
  categories,
  configurations,
  warehouseStats,
  calculateConfigurationAvailability,
  showDetailedAnalytics,
  setShowDetailedAnalytics,
  showPlanningStats,
  getPriorityBadge,
}: AnalyticsTabProps) => {
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

  return (
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
                    const excelData = warehouseAnalytics.outOfStockItems.map((item) => ({
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
                {warehouseAnalytics.outOfStockItems.map((item) => (
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
                 const totalValue = categoryItems.reduce((sum, item) => sum + ((item.price ?? 0) * item.quantity), 0);
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
               {configurations.map((config) => {
                 const availability = calculateConfigurationAvailability(config);
                 const efficiency = availability.totalCount > 0 ? (availability.availableCount / availability.totalCount) * 100 : 0;
                 
                 return (
                   <div key={config.id} className="flex items-center justify-between p-3 border rounded-lg">
                     <div className="flex items-center gap-3">
                       <span className="font-medium">{config.name}</span>
                       {getPriorityBadge(config.priority ?? "medium")}
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
                         <div className="text-sm font-medium">{((config.totalValue ?? 0) * availability.maxPossibleBuilds).toLocaleString()}₽</div>
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
  );
};
