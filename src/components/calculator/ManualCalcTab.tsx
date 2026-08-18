import type { Dispatch, SetStateAction } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { TabsContent } from "@/components/ui/tabs";
import { AlertTriangle, Banknote, Copy, Package, Save, Search, Target, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ItemLink } from "@/components/common/ItemLink";
import type { ManualTotals, StockItem } from "@/lib/calculator";

interface ManualCalcTabProps {
  components: StockItem[];
  filteredComponents: StockItem[];
  categories: string[];
  selectedItems: Record<number, number>;
  manualCalculations: ManualTotals;
  search: string;
  setSearch: (value: string) => void;
  selectedCategory: string;
  setSelectedCategory: (value: string) => void;
  updateQuantity: (itemId: number, quantity: number) => void;
  clearSelections: () => void;
  saveCalculation: () => void;
  setShowDetailedAnalytics: Dispatch<SetStateAction<boolean>>;
}

/**
 * Вкладка ручного расчёта: набор позиций и итоги по нему.
 *
 * Вынесена из Calculator.tsx вместе с остальными вкладками — расчёты живут
 * в lib/calculator.ts, здесь только разметка.
 */
export const ManualCalcTab = ({
  components,
  filteredComponents,
  categories,
  selectedItems,
  manualCalculations,
  search,
  setSearch,
  selectedCategory,
  setSelectedCategory,
  updateQuantity,
  clearSelections,
  saveCalculation,
  setShowDetailedAnalytics,
}: ManualCalcTabProps) => (
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
                      {item.quantity <= (item.minStock ?? 0) && (
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
                    <div className="font-medium">{(quantity * (item.price ?? 0)).toLocaleString()}₽</div>
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
);
