import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Separator } from "@/components/ui/separator";
import { TabsContent } from "@/components/ui/tabs";
import {
  Banknote,
  CheckCircle,
  FileText,
  Package,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { exportRowsToXlsx, datedFileName } from "@/lib/exportXlsx";
import { ItemLink } from "@/components/common/ItemLink";
import { WarehouseReports } from "./WarehouseReports";
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
  showOutOfStockList: boolean;
  setShowOutOfStockList: Dispatch<SetStateAction<boolean>>;
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
  showOutOfStockList,
  setShowOutOfStockList,
  getPriorityBadge,
}: AnalyticsTabProps) => {
  const downloadWarehouseReport = () =>
    exportRowsToXlsx(
      components.map((item) => ({
        'Наименование': item.name,
        'Категория': item.category,
        'Количество (шт.)': item.quantity,
        'Расположение': item.location,
        'Цена (₽)': item.price || 0,
        'Общая стоимость (₽)': (item.price || 0) * item.quantity,
        'Последнее обновление': item.lastUpdated || 'Не указано',
      })),
      {
        fileName: datedFileName('warehouse_report'),
        sheetName: 'Отчет по складу',
        widths: [30, 20, 15, 20, 15, 20, 20],
      }
    );

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
                  onClick={() =>
                    exportRowsToXlsx(
                      warehouseAnalytics.outOfStockItems.map((item) => ({
                        'Компонент': item.name,
                        'Категория': item.category,
                        'Расположение': item.location,
                        'Мин. запас': item.minStock ?? 0,
                        'Текущее кол-во (шт.)': item.quantity,
                      })),
                      {
                        fileName: datedFileName('out_of_stock'),
                        sheetName: 'Отсутствующие',
                        widths: [30, 20, 20, 12, 18],
                      }
                    )
                  }
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Экспорт Excel
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="transition-all duration-200 hover:scale-105"
                  onClick={() => setShowOutOfStockList(prev => !prev)}
                >
                  {showOutOfStockList ? 'Свернуть' : 'Развернуть'}
                </Button>
              </div>
            </div>
            {showOutOfStockList && (
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

      {/*
        Раньше здесь был раздел «Приоритетные конфигурации». Приоритета нет в
        модели данных вообще: страница присваивала каждой сборке «medium», а
        отбор искал «high» — счётчики стояли на нуле, а «Детализация» была
        пуста всегда. Показываем то, что действительно посчитано: сколько
        сборок собирается из наличного запаса.
      */}
      <Card>
        <CardHeader>
          <CardTitle>Что можно собрать</CardTitle>
          <CardDescription>Из того, что есть на складах прямо сейчас</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-primary/5 rounded-lg">
              <Target className="h-8 w-8 text-primary mx-auto mb-2" />
              <div className="text-2xl font-bold">{warehouseAnalytics.totalConfigurations}</div>
              <div className="text-sm text-muted-foreground">Всего конфигураций</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
              <div className="text-2xl font-bold text-green-600">{warehouseAnalytics.canBuildCount}</div>
              <div className="text-sm text-muted-foreground">Собирается хотя бы одна</div>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            {warehouseAnalytics.configurationAnalytics.map(({ config, availability }) => (
              <div key={config.id} className="flex items-center justify-between gap-2 p-2 border rounded">
                <div className="min-w-0">
                  <div className="font-medium truncate">{config.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {availability.availableCount} из {availability.totalCount} компонентов в наличии
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-medium">{availability.maxPossibleBuilds}</div>
                  <div className="text-sm text-muted-foreground">можно собрать</div>
                </div>
              </div>
            ))}
            {warehouseAnalytics.configurationAnalytics.length === 0 && (
              <p className="text-sm text-muted-foreground">Конфигураций пока нет</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>


     {/* Planning Statistics Section */}
     {/*
       Карточка показывается всегда. Раньше она была за флагом showPlanningStats,
       который создавался со значением false и никогда не менялся: переключить
       его было нечем, а значит и увидеть карточку — тоже. Вместе с ней была
       недостижима единственная кнопка выгрузки отчёта по складу в Excel.
     */}
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

    <WarehouseReports />
  </TabsContent>
  );
};
