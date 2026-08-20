/**
 * Расчёты для страницы статистики.
 *
 * Вынесены из Calculator.tsx: это чистые функции без React, их можно читать,
 * менять и покрывать тестами отдельно от разметки. Страница была на 1389 строк,
 * и расчёты в ней перемешивались с версткой четырёх вкладок.
 */

export type AvailabilityStatus = "available" | "partial" | "unavailable" | "missing";

export interface StockItem {
  id: number;
  name: string;
  category: string;
  /** Место с наибольшим остатком — интерфейс местами показывает одно. */
  location?: string | null;
  quantity: number;
  price?: number | null;
  minStock?: number | null;
}

export interface RecipeComponent {
  componentId: number;
  quantity: number;
  name: string;
}

export interface AvailabilityItem extends RecipeComponent {
  available: number;
  required: number;
  status: AvailabilityStatus;
  /** Сколько изделий можно собрать, если смотреть только на этот компонент. */
  maxBuilds: number;
  stockComponent: StockItem | null;
}

export interface ConfigurationAvailability {
  items: AvailabilityItem[];
  maxPossibleBuilds: number;
  allAvailable: boolean;
  anyAvailable: boolean;
  noneAvailable: boolean;
  availableCount: number;
  totalCount: number;
  totalValue: number;
  remainingComponents: (AvailabilityItem & { remaining: number })[];
}

/**
 * Указатель «идентификатор позиции → позиция» для одного и того же списка.
 *
 * Расчёт вызывается по разу на конфигурацию, а внутри искал компонент перебором
 * всего склада — то есть работа росла как произведение числа конфигураций на
 * число позиций. Указатель строится один раз на список и переиспользуется, пока
 * список тот же: WeakMap отпускает его вместе с самим списком.
 */
const stockIndexCache = new WeakMap<StockItem[], Map<number, StockItem>>();

function stockIndex(stock: StockItem[]): Map<number, StockItem> {
  const cached = stockIndexCache.get(stock);
  if (cached) return cached;
  const index = new Map(stock.map((item) => [item.id, item]));
  stockIndexCache.set(stock, index);
  return index;
}

/**
 * Считает, из чего и сколько можно собрать.
 *
 * Доступным считается весь остаток на складах. Вычитания «зарезервированного»
 * здесь больше нет: при сборке компоненты списываются, а не занимаются,
 * поэтому занятого количества не существует.
 */
export function calculateConfigurationAvailability(
  config: { components: RecipeComponent[]; totalValue?: number },
  stock: StockItem[]
): ConfigurationAvailability {
  const index = stockIndex(stock);
  const items: AvailabilityItem[] = config.components.map((comp) => {
    const stockComponent = index.get(comp.componentId) ?? null;
    if (!stockComponent) {
      return {
        ...comp,
        available: 0,
        required: comp.quantity,
        status: "missing",
        maxBuilds: 0,
        stockComponent: null,
      };
    }

    const available = stockComponent.quantity;
    const required = comp.quantity;
    return {
      ...comp,
      available,
      required,
      status: available >= required ? "available" : available > 0 ? "partial" : "unavailable",
      maxBuilds: Math.floor(available / Math.max(required, 1)),
      stockComponent,
    };
  });

  const maxPossibleBuilds = items.length > 0 ? Math.min(...items.map((i) => i.maxBuilds)) : 0;

  return {
    items,
    maxPossibleBuilds: Math.max(maxPossibleBuilds, 0),
    // Пустой состав отдельно оговорён: `[].every()` истинно, поэтому раньше
    // конфигурация без компонентов считалась и «полностью доступной», и
    // «недоступной» сразу — в сводке она попадала в две графы из трёх.
    // Собрать из ничего нельзя, поэтому такая конфигурация недоступна.
    allAvailable: items.length > 0 && items.every((i) => i.status === "available"),
    anyAvailable: items.some((i) => i.status === "available"),
    noneAvailable: items.length === 0 || items.every((i) => i.status === "unavailable"),
    availableCount: items.filter((i) => i.status === "available").length,
    totalCount: items.length,
    totalValue: (config.totalValue ?? 0) * Math.max(maxPossibleBuilds, 0),
    remainingComponents: items.map((i) => ({
      ...i,
      remaining: i.available - i.required * Math.max(maxPossibleBuilds, 0),
    })),
  };
}

export interface StockWarning {
  item: StockItem;
  quantity: number;
  remaining: number;
  warningLevel: "critical" | "warning" | "ok";
}

export interface ManualTotals {
  totalValue: number;
  totalItems: number;
  categoryBreakdown: Record<string, number>;
  stockWarnings: StockWarning[];
}

/** Итоги по вручную набранной корзине позиций. */
export function calculateManualTotals(
  selected: Record<number, number>,
  stock: StockItem[]
): ManualTotals {
  const index = stockIndex(stock);
  const entries = Object.entries(selected).map(([id, quantity]) => ({
    item: index.get(parseInt(id, 10)),
    quantity,
  }));

  const totalValue = entries.reduce(
    (sum, { item, quantity }) => sum + (item?.price ?? 0) * quantity,
    0
  );
  const totalItems = entries.reduce((sum, { quantity }) => sum + quantity, 0);

  const categoryBreakdown = entries.reduce<Record<string, number>>((acc, { item, quantity }) => {
    if (item) acc[item.category] = (acc[item.category] || 0) + quantity;
    return acc;
  }, {});

  const stockWarnings = entries
    .filter((e): e is { item: StockItem; quantity: number } => Boolean(e.item))
    .map(({ item, quantity }) => {
      const remaining = item.quantity - quantity;
      const min = item.minStock ?? 0;
      return {
        item,
        quantity,
        remaining,
        warningLevel:
          remaining <= min ? "critical" : remaining <= min * 2 ? "warning" : "ok",
      } as StockWarning;
    });

  return { totalValue, totalItems, categoryBreakdown, stockWarnings };
}

export interface WarehouseAnalytics {
  totalStockValue: number;
  /**
   * Остаток опустился до минимума или ниже.
   *
   * Минимум должен быть задан: при нуле условие «остаток ≤ минимума» означало
   * бы «остаток ≤ 0», то есть повторяло бы список отсутствующих. Именно так и
   * было — обе карточки показывали одно и то же число.
   */
  lowStockItems: StockItem[];
  outOfStockItems: StockItem[];
  configurationAnalytics: {
    config: { id: number; name: string; components: RecipeComponent[] };
    availability: ConfigurationAvailability;
    canBuild: boolean;
  }[];
  /** Сколько конфигураций собирается из того, что есть на складах. */
  canBuildCount: number;
  totalConfigurations: number;
}

/** Сводка по складу: стоимость, дефицит и что из конфигураций собирается. */
export function calculateWarehouseAnalytics(
  stock: StockItem[],
  configurations: {
    id: number;
    name: string;
    components: RecipeComponent[];
    totalValue?: number;
  }[]
): WarehouseAnalytics {
  const configurationAnalytics = configurations.map((config) => {
    const availability = calculateConfigurationAvailability(config, stock);
    return {
      config,
      availability,
      canBuild: availability.maxPossibleBuilds > 0,
    };
  });

  return {
    totalStockValue: stock.reduce((sum, i) => sum + (i.price ?? 0) * i.quantity, 0),
    lowStockItems: stock.filter(
      (i) => (i.minStock ?? 0) > 0 && i.quantity <= (i.minStock ?? 0)
    ),
    outOfStockItems: stock.filter((i) => i.quantity === 0),
    configurationAnalytics,
    canBuildCount: configurationAnalytics.filter((a) => a.canBuild).length,
    totalConfigurations: configurations.length,
  };
}
