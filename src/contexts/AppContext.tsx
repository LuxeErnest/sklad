import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { InventoryItem } from "@/components/inventory/InventoryTable";
import { initDb, getComponents, getComponentTagsMap, getCategoriesTree, getReservedQuantities, getTotalAssembledCount, getConfigurations, getAssembledCounts } from "@/lib/db";
import type { CategoryNode } from "@/lib/db";
import { toast } from "@/hooks/use-toast";

interface AppContextType {
  // Data
  items: InventoryItem[];
  categories: string[];
  categoryTree: CategoryNode[];
  tags: { id: number; name: string }[];
  loading: boolean;
  /** Зарезервировано в собранных конфигурациях (componentId -> количество) */
  reservedQuantities: Record<number, number>;
  /** Общее количество собранных единиц конфигураций */
  totalAssembledCount: number;
  /** Собранные конфигурации для отображения на складе (категория, расположение) */
  assembledConfigurations: { configurationId: number; name: string; quantity: number; category: string; location: string }[];
  
  // Actions
  refreshItems: () => Promise<void>;
  getItemById: (id: number) => InventoryItem | undefined;
  getItemByBarcode: (barcode: string) => InventoryItem | undefined;
  
  // Navigation helpers
  navigateToItem: (itemId: number) => void;
  navigateToEdit: (itemId?: number) => void;
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
  const out: string[] = [];
  nodes.forEach((n) => {
    out.push(n.name);
    if (n.children.length) out.push(...flattenCategoryNames(n.children));
  });
  return out;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [tags, setTags] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [reservedQuantities, setReservedQuantities] = useState<Record<number, number>>({});
  const [totalAssembledCount, setTotalAssembledCount] = useState(0);
  const [assembledConfigurations, setAssembledConfigurations] = useState<{ configurationId: number; name: string; quantity: number; category: string; location: string }[]>([]);

  const refreshItems = useCallback(async () => {
    try {
      setLoading(true);
      await initDb();
      const [rows, tagsMap, tagsList, tree, reserved, totalAssembled, configs, assembledCounts] = await Promise.all([
        getComponents(),
        getComponentTagsMap().catch(() => ({})),
        import("@/lib/db").then((m) => m.getTags()).catch(() => []),
        getCategoriesTree().catch(() => []),
        getReservedQuantities().catch(() => ({})),
        getTotalAssembledCount().catch(() => 0),
        getConfigurations().catch(() => []),
        getAssembledCounts().catch(() => []),
      ]);
      setReservedQuantities(reserved ?? {});
      setTotalAssembledCount(totalAssembled ?? 0);
      const countMap: Record<number, number> = {};
      (assembledCounts || []).forEach((r: { configurationId: number; quantity: number }) => {
        countMap[r.configurationId] = r.quantity;
      });
      const configList = (configs || []) as { id: number; name: string; category?: string; location?: string }[];
      const forWarehouse = configList
        .filter((c) => (countMap[c.id] ?? 0) > 0)
        .map((c) => ({
          configurationId: c.id,
          name: c.name,
          quantity: countMap[c.id] ?? 0,
          category: (c.category && c.category.trim()) || "Конфигурации",
          location: (c.location && c.location.trim()) || "—",
        }));
      setAssembledConfigurations(forWarehouse);
      
      const flatCategories = tree?.length ? flattenCategoryNames(tree) : [];
      setCategoryTree(tree?.length ? tree : []);
      if (rows && Array.isArray(rows)) {
        const withTags = (rows as InventoryItem[]).map((r) => ({
          ...r,
          tags: tagsMap[r.id] || [],
        }));
        setItems(withTags);
        setTags(tagsList || []);
        const fromItems = Array.from(new Set(withTags.map((r) => r.category).filter(Boolean)));
        const fromConfigs = forWarehouse.map((c) => c.category).filter(Boolean);
        setCategories([...new Set([...flatCategories, ...fromItems, ...fromConfigs])]);
        if ((!tree || tree.length === 0) && fromItems.length > 0) {
          setCategoryTree(fromItems.map((name, i) => ({ id: i + 1, name, parentId: null, children: [] })));
        }
      } else {
        setItems([]);
        setCategories([...new Set([...flatCategories, ...forWarehouse.map((c) => c.category)])]);
      }
    } catch (error) {
      console.error('❌ Error loading components:', error);
      setItems([]);
      setCategories([]);
      toast({
        title: "Ошибка загрузки",
        description: "Не удалось загрузить данные",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const getItemById = useCallback((id: number): InventoryItem | undefined => {
    return items.find(item => item.id === id);
  }, [items]);

  const getItemByBarcode = useCallback((barcode: string): InventoryItem | undefined => {
    return items.find(item => item.barcode && item.barcode.toLowerCase() === barcode.toLowerCase());
  }, [items]);

  // Переходы внутри приложения.
  //
  // Раньше здесь был window.location.href — полная перезагрузка страницы с
  // потерей всего состояния React и повторной загрузкой данных. Так было
  // сделано вынужденно: контекст стоял выше роутера, и useNavigate был
  // недоступен. Порядок провайдеров исправлен, поэтому переходы стали обычной
  // сменой маршрута.
  const navigateToItem = useCallback((itemId: number) => {
    navigate("/");
    // Выбор строки происходит уже после отрисовки списка.
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent("selectItem", { detail: { itemId } }));
    });
  }, [navigate]);

  const navigateToEdit = useCallback((itemId?: number) => {
    navigate(itemId ? `/edit?itemId=${itemId}` : "/edit");
  }, [navigate]);

  const navigateToAdd = useCallback(() => {
    if (location.pathname !== "/") navigate("/");
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent("openAddDialog"));
    });
  }, [navigate, location.pathname]);

  const navigateToDocuments = useCallback((itemId?: number) => {
    navigate(itemId ? `/documents?itemId=${itemId}` : "/documents");
  }, [navigate]);

  const navigateToConfigurations = useCallback((configId?: number) => {
    navigate(configId ? `/configurations?configId=${configId}` : "/configurations");
  }, [navigate]);

  // Initial load
  useEffect(() => {
    refreshItems();
  }, [refreshItems]);

  // Listen for update events (debounced to avoid overload on mass add)
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const handleComponentsUpdated = async () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        timeoutId = null;
        try {
          const { waitForQueueCompletion } = await import('@/lib/db');
          await waitForQueueCompletion();
        } catch {}
        await new Promise((r) => setTimeout(r, 150));
        await refreshItems();
      }, 400);
    };

    const handleConfigurationsUpdated = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        timeoutId = null;
        refreshItems();
      }, 300);
    };
    window.addEventListener('componentsUpdated', handleComponentsUpdated);
    window.addEventListener('configurationsUpdated', handleConfigurationsUpdated);
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener('componentsUpdated', handleComponentsUpdated);
      window.removeEventListener('configurationsUpdated', handleConfigurationsUpdated);
    };
  }, [refreshItems]);

  const value: AppContextType = {
    items,
    categories,
    categoryTree,
    tags,
    loading,
    reservedQuantities,
    totalAssembledCount,
    assembledConfigurations,
    refreshItems,
    getItemById,
    getItemByBarcode,
    navigateToItem,
    navigateToEdit,
    navigateToAdd,
    navigateToDocuments,
    navigateToConfigurations,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
