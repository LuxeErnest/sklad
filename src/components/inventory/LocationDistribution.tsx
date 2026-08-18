import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "@/hooks/use-toast";
import {
  Plus,
  Package,
  MapPin,
  Calendar,
  ChevronDown,
  ChevronRight,
  ArrowDown,
  Truck,
  Factory,
  Warehouse,
  DollarSign,
  Edit,
  ArrowRight,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { getComponentPaths, addComponentPath, getComponentGroups } from "@/lib/db";

// Форма строки журнала. Поля приходят из базы, где отсутствующее значение —
// это null, а не undefined, а вид операции задаётся строкой.
interface PathStep {
  id: number;
  componentId: number;
  stepOrder: number;
  stepName: string;
  stepDescription?: string | null;
  stepLocation?: string | null;
  stepQuantity?: number | null;
  stepPrice?: number | null;
  stepDate: string;
  stepType: string;
  fromLocation?: string | null;
  toLocation?: string | null;
  kind?: string;
}

interface GroupRecord {
  id: number;
  componentId: number;
  name: string;
  location: string;
  quantity: number;
  price?: number | null;
  createdAt: string;
  updatedAt: string;
}

interface LocationDistributionProps {
  componentId: number;
  componentName: string;
}

const stepTypeIcons = {
  purchase: Package,
  transfer: Truck,
  sale: ShoppingCart,
  scrap: Trash2,
  processing: ShoppingCart, // Продажа/обработка
  storage: Warehouse, // Хранение
};

const stepTypeColors = {
  purchase: "bg-green-100 text-green-800",
  transfer: "bg-blue-100 text-blue-800", 
  sale: "bg-orange-100 text-orange-800",
  scrap: "bg-red-100 text-red-800",
  processing: "bg-orange-100 text-orange-800",
  storage: "bg-purple-100 text-purple-800",
};

export const LocationDistribution = ({ componentId, componentName }: LocationDistributionProps) => {
  const [paths, setPaths] = useState<PathStep[]>([]);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [newStep, setNewStep] = useState({
    stepName: "",
    stepDescription: "",
    stepLocation: "",
    stepQuantity: "",
    stepPrice: "",
    stepType: "transfer" as "purchase" | "transfer" | "sale" | "scrap",
    sourceLocation: "",
    sourceQuantity: ""
  });

  useEffect(() => {
    loadData();
  }, [componentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    try {
      console.log('🔄 Loading data for componentId:', componentId);
      
      if (!componentId || componentId <= 0) {
        console.warn('⚠️ Invalid componentId:', componentId);
        setPaths([]);
        setGroups([]);
        return;
      }
      
      // Случайная задержка раньше разводила одновременные обращения к базе:
      // соединение было одно, и параллельные запросы упирались друг в друга.
      // Доступ сериализует Rust, поэтому ждать больше незачем.
      const [pathsData, groupsData] = await Promise.all([
        getComponentPaths(componentId).catch(err => {
          console.error('❌ Error loading paths:', err);
          return [];
        }),
        getComponentGroups(componentId).catch(err => {
          console.error('❌ Error loading groups:', err);
          return [];
        })
      ]);
      
      console.log('✅ Loaded paths:', pathsData);
      console.log('✅ Loaded groups:', groupsData);
      
      // Validate and set data
      setPaths(Array.isArray(pathsData) ? pathsData : []);
      setGroups(Array.isArray(groupsData) ? groupsData : []);
    } catch (error) {
      console.error('❌ Error loading data:', error);
      // Set empty arrays to prevent rendering errors
      setPaths([]);
      setGroups([]);
      toast({
        title: "Ошибка загрузки",
        description: "Не удалось загрузить данные о распределении товара",
        variant: "destructive",
      });
    }
  };

  const handleAddStep = async () => {
    if (newStep.stepType === "transfer") {
      // Validation for transfer
      if (!newStep.stepName.trim() || !newStep.sourceLocation || !newStep.sourceQuantity || !newStep.stepLocation) {
        toast({
          title: "Ошибка",
          description: "Заполните все обязательные поля для перемещения",
          variant: "destructive",
        });
        return;
      }

      const sourceGroup = groups.find(g => g.location === newStep.sourceLocation);
      if (!sourceGroup) {
        toast({
          title: "Ошибка",
          description: "Склад-источник не найден",
          variant: "destructive",
        });
        return;
      }

      const transferQuantity = parseInt(newStep.sourceQuantity);
      if (transferQuantity > sourceGroup.quantity) {
        toast({
          title: "Ошибка",
          description: `Недостаточно товара на складе. Доступно: ${sourceGroup.quantity} шт.`,
          variant: "destructive",
        });
        return;
      }

      try {
        // Одна операция перемещения делает всё: снимает с источника и
        // добавляет получателю в одной транзакции.
        //
        // Раньше здесь после создания этапа остатки правились вручную —
        // отдельными вызовами на списание с источника и зачисление получателю.
        // С журналом операций это привело бы к двойному движению: сначала его
        // выполнила бы сама операция, потом ещё раз эти правки.
        await addComponentPath({
          componentId,
          stepName: newStep.stepName,
          stepDescription: newStep.stepDescription || undefined,
          fromLocation: newStep.sourceLocation,
          stepLocation: newStep.stepLocation,
          stepQuantity: transferQuantity,
          stepPrice: newStep.stepPrice ? parseFloat(newStep.stepPrice) : sourceGroup.price ?? undefined,
          stepType: 'transfer'
        });

        toast({
          title: "Перемещение выполнено",
          description: `Перемещено ${transferQuantity} шт. из ${newStep.sourceLocation} на ${newStep.stepLocation}`,
        });
      } catch (error) {
        console.error('❌ Error adding transfer:', error);
        toast({
          title: "Ошибка",
          description: "Не удалось выполнить перемещение",
          variant: "destructive",
        });
        return;
      }
    } else {
      // Regular operation (purchase, processing, storage)
      if (!newStep.stepName.trim() || !newStep.stepLocation.trim() || !newStep.stepQuantity) {
        toast({
          title: "Ошибка",
          description: "Заполните все обязательные поля",
          variant: "destructive",
        });
        return;
      }

      try {
        await addComponentPath({
          componentId,
          stepName: newStep.stepName,
          stepDescription: newStep.stepDescription || undefined,
          stepLocation: newStep.stepLocation,
          stepQuantity: parseInt(newStep.stepQuantity),
          stepPrice: newStep.stepPrice ? parseFloat(newStep.stepPrice) : undefined,
          stepType: newStep.stepType === 'sale' ? 'processing' : newStep.stepType === 'scrap' ? 'storage' : newStep.stepType
        });

        toast({
          title: "Запись добавлена",
          description: "Новая запись успешно добавлена",
        });
      } catch (error) {
        console.error('❌ Error adding step:', error);
        toast({
          title: "Ошибка",
          description: "Не удалось добавить запись",
          variant: "destructive",
        });
        return;
      }
    }

    // Reset form and reload data
    setNewStep({
      stepName: "",
      stepDescription: "",
      stepLocation: "",
      stepQuantity: "",
      stepPrice: "",
      stepType: "transfer",
      sourceLocation: "",
      sourceQuantity: ""
    });
    setShowAddDialog(false);

    // Wait a bit for the database to update
    await new Promise(resolve => setTimeout(resolve, 100));
    await loadData();
  };

  const toggleGroup = (groupId: number) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const getPathsForGroup = (group: GroupRecord) => {
    return paths.filter(path => 
      path.stepLocation === group.location && 
      (path.stepPrice === group.price || (path.stepPrice === null && group.price === null))
    ).sort((a, b) => a.stepOrder - b.stepOrder);
  };

  const totalQuantity = groups.reduce((sum, g) => sum + g.quantity, 0);
  const totalValue = groups.reduce((sum, g) => sum + (g.quantity * (g.price || 0)), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Распределение по складам: {componentName}
        </CardTitle>
        <CardDescription>
          Количество товара на разных складах и история перемещений
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold">{groups.length}</div>
            <div className="text-sm text-muted-foreground">Складов</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{totalQuantity}</div>
            <div className="text-sm text-muted-foreground">Всего шт.</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{totalValue.toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2})}₽</div>
            <div className="text-sm text-muted-foreground">Общая стоимость</div>
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Нет записей о распределении</p>
            <p className="text-sm">Добавьте первую запись о перемещении товара</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => {
              const groupPaths = getPathsForGroup(group);
              const isExpanded = expandedGroups.has(group.id);
              
              return (
                <Card key={group.id} className="overflow-hidden">
                  <div 
                    className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleGroup(group.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <MapPin className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-lg">{group.location}</div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Package className="h-4 w-4" />
                              {group.quantity} шт.
                            </span>
                            {group.price && (
                              <span className="flex items-center gap-1">
                                <DollarSign className="h-4 w-4" />
                                {group.price.toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2})}₽/шт.
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {new Date(group.updatedAt).toLocaleDateString('ru-RU')}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {groupPaths.length} {groupPaths.length === 1 ? 'этап' : 'этапов'}
                        </Badge>
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </div>
                    </div>
                  </div>
                  
                  <Collapsible open={isExpanded} onOpenChange={() => toggleGroup(group.id)}>
                    <CollapsibleContent>
                      <div className="px-4 pb-4 border-t bg-muted/20">
                        <div className="pt-4 space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium text-sm text-muted-foreground">История перемещений</h4>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setNewStep(prev => ({
                                  ...prev,
                                  sourceLocation: group.location,
                                  sourceQuantity: group.quantity.toString(),
                                  stepType: "transfer"
                                }));
                                setShowAddDialog(true);
                              }}
                              className="text-xs"
                            >
                              <ArrowRight className="h-3 w-3 mr-1" />
                              Продолжить путь
                            </Button>
                          </div>
                          
                          <div className="space-y-3">
                            {groupPaths.length === 0 ? (
                              <p className="text-xs text-muted-foreground text-center py-2">Нет записей о перемещениях</p>
                            ) : (
                              groupPaths.map((step, stepIndex) => {
                                // Безопасная проверка типа этапа
                                const stepType = (step.stepType === 'purchase' || step.stepType === 'transfer' || step.stepType === 'sale' || step.stepType === 'scrap' || step.stepType === 'processing' || step.stepType === 'storage') 
                                  ? step.stepType 
                                  : 'transfer';
                                const IconComponent = stepTypeIcons[stepType] || Package;
                                const stepColor = stepTypeColors[stepType] || stepTypeColors.transfer;
                                const isLast = stepIndex === groupPaths.length - 1;

                                return (
                                  <div key={step.id || stepIndex} className="relative">
                                    <div className="flex items-start gap-4">
                                      <div className="flex flex-col items-center">
                                        <div className={`p-2 rounded-full ${stepColor}`}>
                                          <IconComponent className="h-4 w-4" />
                                        </div>
                                        {!isLast && (
                                          <div className="w-0.5 h-6 bg-border mt-1"></div>
                                        )}
                                      </div>

                                      <div className="flex-1 space-y-1">
                                        <div className="flex items-center justify-between">
                                          <h5 className="font-medium text-sm">{step.stepName || 'Без названия'}</h5>
                                          <Badge variant="secondary" className={`text-xs ${stepColor}`}>
                                            {stepType === 'purchase' && 'Закупка'}
                                            {stepType === 'transfer' && 'Передача'}
                                            {(stepType === 'sale' || stepType === 'processing') && 'Продажа'}
                                            {(stepType === 'scrap' || stepType === 'storage') && 'Списание'}
                                          </Badge>
                                        </div>

                                        {step.stepDescription && (
                                          <p className="text-xs text-muted-foreground">{step.stepDescription}</p>
                                        )}

                                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                          {step.stepLocation && (
                                            <div className="flex items-center gap-1">
                                              <MapPin className="h-3 w-3" />
                                              {step.stepLocation}
                                            </div>
                                          )}
                                          {step.stepQuantity && (
                                            <div className="flex items-center gap-1">
                                              <Package className="h-3 w-3" />
                                              {step.stepQuantity} шт.
                                            </div>
                                          )}
                                          {step.stepPrice && (
                                            <div className="flex items-center gap-1">
                                              <DollarSign className="h-3 w-3" />
                                              {typeof step.stepPrice === 'number' 
                                                ? step.stepPrice.toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2}) 
                                                : step.stepPrice}₽/шт.
                                            </div>
                                          )}
                                          {step.stepDate && (
                                            <div className="flex items-center gap-1">
                                              <Calendar className="h-3 w-3" />
                                              {new Date(step.stepDate).toLocaleDateString('ru-RU')}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              );
            })}
          </div>
        )}

        <Separator />

        <Button
          onClick={() => setShowAddDialog(true)}
          className="w-full"
          variant="outline"
        >
          <Plus className="h-4 w-4 mr-2" />
          Добавить запись о перемещении
        </Button>
      </CardContent>

      {/* Dialog for adding new record */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Добавить запись о перемещении</DialogTitle>
            <DialogDescription>
              Укажите информацию о перемещении товара между складами
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Operation Type */}
            <div className="space-y-2">
              <Label htmlFor="stepType">Тип операции *</Label>
              <Select 
                value={newStep.stepType} 
                onValueChange={(value: string) => setNewStep(prev => ({ ...prev, stepType: value as "purchase" | "transfer" | "sale" | "scrap" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchase">Закупка (новое поступление)</SelectItem>
                  <SelectItem value="transfer">Перемещение между складами</SelectItem>
                  <SelectItem value="sale">Продажа</SelectItem>
                  <SelectItem value="scrap">Списание</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Source and Destination for Transfer */}
            {newStep.stepType === "transfer" && (
              <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                <h4 className="font-medium">Перемещение между складами</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="sourceLocation">Из склада *</Label>
                    <Select 
                      value={newStep.sourceLocation} 
                      onValueChange={(value) => setNewStep(prev => ({ ...prev, sourceLocation: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите склад-источник" />
                      </SelectTrigger>
                      <SelectContent>
                        {groups.map((group) => (
                          <SelectItem key={group.id} value={group.location}>
                            {group.location} ({group.quantity} шт.)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="sourceQuantity">Количество для перемещения *</Label>
                    <Input
                      id="sourceQuantity"
                      type="number"
                      min="1"
                      value={newStep.sourceQuantity}
                      onChange={(e) => setNewStep(prev => ({ ...prev, sourceQuantity: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                </div>
                
                <div className="flex items-center justify-center">
                  <ArrowDown className="h-6 w-6 text-muted-foreground" />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="stepLocation">На склад *</Label>
                  <Input
                    id="stepLocation"
                    value={newStep.stepLocation}
                    onChange={(e) => setNewStep(prev => ({ ...prev, stepLocation: e.target.value }))}
                    placeholder="Например: Склад А-12"
                  />
                </div>
              </div>
            )}

            {/* Regular fields for non-transfer operations */}
            {newStep.stepType !== "transfer" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="stepLocation">Местоположение (склад) *</Label>
                  <Input
                    id="stepLocation"
                    value={newStep.stepLocation}
                    onChange={(e) => setNewStep(prev => ({ ...prev, stepLocation: e.target.value }))}
                    placeholder="Например: Склад А-12"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="stepQuantity">Количество *</Label>
                    <Input
                      id="stepQuantity"
                      type="number"
                      min="1"
                      value={newStep.stepQuantity}
                      onChange={(e) => setNewStep(prev => ({ ...prev, stepQuantity: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="stepPrice">Цена за штуку</Label>
                    <Input
                      id="stepPrice"
                      type="number"
                      min="0"
                      step="0.01"
                      value={newStep.stepPrice}
                      onChange={(e) => setNewStep(prev => ({ ...prev, stepPrice: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Common fields */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="stepName">Название операции *</Label>
                <Input
                  id="stepName"
                  value={newStep.stepName}
                  onChange={(e) => setNewStep(prev => ({ ...prev, stepName: e.target.value }))}
                  placeholder="Например: Перемещение на склад А-12"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="stepDescription">Описание (опционально)</Label>
                <Textarea
                  id="stepDescription"
                  value={newStep.stepDescription}
                  onChange={(e) => setNewStep(prev => ({ ...prev, stepDescription: e.target.value }))}
                  placeholder="Дополнительная информация об операции"
                  rows={3}
                />
              </div>
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Отмена
            </Button>
            <Button onClick={handleAddStep}>
              Добавить запись
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};