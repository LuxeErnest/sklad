import React, { createContext, useContext, useEffect, useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { InventoryItem } from "@/components/inventory/InventoryTable";
import {
  getComponents,
  getCategoriesTree,
  getConfigurations,
  getTags,
} from "@/lib/db";
import type { CategoryNode } from "@/lib/db";
import { queryKeys } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";

interface AssembledConfiguration {
  configurationId: number;
  name: string;
  quantity: number;
  category: string;
  location: string;
}

interface AppContextType {
  // Данные
  items: InventoryItem[];
  categories: string[];
  categoryTree: CategoryNode[];
  tags: { id: number; name: string }[];
  loading: boolean;
  /** Общее количество собранных единиц конфигураций */
  totalAssembledCount: number;
  /** Собранные конфигурации для отображения на складе */
  assembledConfigurations: AssembledConfiguration[];

  // Действия
  refreshItems: () => Promise<void>;
  getItemById: (id: number) => InventoryItem | undefined;
  getItemByBarcode: (barcode: string) => InventoryItem | undefined;

  // Переходы
  navigateToItem: (itemId: number) => void;
  navigateToAdd: () => void;
  navigateToDocuments: (itemId?: number) => void;
  navigateToConfigurations: (configId?: number) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within AppProvider");
  }
  return context;
};

interface AppProviderProps {
  children: React.ReactNode;
}

function flattenCategoryNames(nodes: CategoryNode[]): string[] {
  return nodes.flatMap((n) => [n.name, ...flattenCategoryNames(n.children)]);
}

/**
 * Общие данные приложения.
 *
 * Загрузка держится на react-query, а не на ручном состоянии: каждый запрос
 * живёт сам по себе, повторные обращения дедуплицируются, а после записи
 * сбрасываются только затронутые ключи. Раньше здесь было ручное состояние и
 * подписка на события DOM, которая после любого изменения ждала 400 мс, потом
 * завершения очереди, потом ещё 150 мс — и перечитывала вообще всё.
 *
 * Вызов initDb отсюда убран: схему и миграции выполняет Rust при запуске, а
 * прежний код дёргал инициализацию при каждом обновлении списка — то есть на
 * каждое изменение количества выполнял шестнадцать CREATE TABLE и проверки схемы.
 */
export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const itemsQuery = useQuery({
    queryKey: queryKeys.items,
    queryFn: getComponents,
  });
  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories,
    queryFn: getCategoriesTree,
  });
  const tagsQuery = useQuery({
    queryKey: queryKeys.tags,
    queryFn: getTags,
  });
  const configurationsQuery = useQuery({
    queryKey: queryKeys.configurations,
    queryFn: getConfigurations,
  });

  const failure = itemsQuery.error ?? categoriesQuery.error ?? configurationsQuery.error;
  useEffect(() => {
    if (!failure) return;
    console.error("Не удалось загрузить данные:", failure);
    toast({
      title: "Ошибка загрузки",
      description: String(failure),
      variant: "destructive",
    });
  }, [failure]);

  const items = useMemo(() => (itemsQuery.data ?? []) as InventoryItem[], [itemsQuery.data]);
  const categoryTree = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);

  const assembledConfigurations = useMemo<AssembledConfiguration[]>(
    () =>
      (configurationsQuery.data ?? [])
        .filter((c) => (c.assembled ?? 0) > 0)
        .map((c) => ({
          configurationId: c.id,
          name: c.name,
          quantity: c.assembled ?? 0,
          category: c.category?.trim() || "Конфигурации",
          location: c.location?.trim() || "—",
        })),
    [configurationsQuery.data]
  );

  const totalAssembledCount = useMemo(
    () => assembledConfigurations.reduce((sum, c) => sum + c.quantity, 0),
    [assembledConfigurations]
  );

  const categories = useMemo(() => {
    const fromTree = flattenCategoryNames(categoryTree);
    const fromItems = items.map((i) => i.category).filter(Boolean) as string[];
    const fromConfigs = assembledConfigurations.map((c) => c.category);
    return [...new Set([...fromTree, ...fromItems, ...fromConfigs])];
  }, [categoryTree, items, assembledConfigurations]);

  /**
   * Принудительное обновление — для мест, где обновление запрашивают явно.
   *
   * Сбрасываются только те запросы, которые держит этот контекст. Раньше здесь
   * стоял invalidateQueries без ключа, то есть «перечитать вообще всё»: после
   * каждой записи список склада уезжал по IPC второй раз, хотя notify в слое
   * данных уже сбросил ровно то, что изменилось. На двадцати тысячах позиций
   * один такой лишний проход — это восемь мегабайт JSON.
   */
  const refreshItems = useCallback(async () => {
    await Promise.all(
      [queryKeys.items, queryKeys.categories, queryKeys.tags, queryKeys.configurations].map(
        (queryKey) => queryClient.invalidateQueries({ queryKey })
      )
    );
  }, [queryClient]);

  const getItemById = useCallback(
    (id: number) => items.find((item) => item.id === id),
    [items]
  );

  const getItemByBarcode = useCallback(
    (barcode: string) =>
      items.find((item) => item.barcode && item.barcode.toLowerCase() === barcode.toLowerCase()),
    [items]
  );

  // Переходы внутри приложения.
  //
  // Раньше здесь был window.location.href — полная перезагрузка документа с
  // потерей состояния. Так было сделано вынужденно: контекст стоял выше роутера,
  // и useNavigate был недоступен. Порядок провайдеров исправлен.
  const navigateToItem = useCallback(
    (itemId: number) => {
      navigate("/");
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent("selectItem", { detail: { itemId } }));
      });
    },
    [navigate]
  );

  const navigateToAdd = useCallback(() => {
    if (location.pathname !== "/") navigate("/");
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent("openAddDialog"));
    });
  }, [navigate, location.pathname]);

  const navigateToDocuments = useCallback(
    (itemId?: number) => navigate(itemId ? `/documents?itemId=${itemId}` : "/documents"),
    [navigate]
  );

  const navigateToConfigurations = useCallback(
    (configId?: number) =>
      navigate(configId ? `/configurations?configId=${configId}` : "/configurations"),
    [navigate]
  );

  const value: AppContextType = {
    items,
    categories,
    categoryTree,
    tags: tagsQuery.data ?? [],
    loading: itemsQuery.isLoading || categoriesQuery.isLoading,
    totalAssembledCount,
    assembledConfigurations,
    refreshItems,
    getItemById,
    getItemByBarcode,
    navigateToItem,
    navigateToAdd,
    navigateToDocuments,
    navigateToConfigurations,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
