import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import { FilterBar } from "@/components/inventory/FilterBar";
import InventoryTable, { InventoryItem } from "@/components/inventory/InventoryTable";
import AddItemDialog, { type AddItemPrefill } from "@/components/inventory/AddItemDialog";
import { ItemBriefInfo } from "@/components/inventory/ItemBriefInfo";
import UniversalBackground from "@/components/UniversalBackground";
import Seo from "@/components/seo/Seo";
import { useMemo, useState, useEffect, useCallback } from "react";

import { upsertComponent, createCategory, setComponentTags, addComponentGroup, setComponentBarcode } from "@/lib/db";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/services/errorHandler";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { BarcodeScanner } from "@/components/barcode/BarcodeScanner";
import { BarcodeLinkDialog } from "@/components/barcode/BarcodeLinkDialog";
import { useApp } from "@/contexts/AppContext";

function categoryNamesWithDescendants(tree: { name: string; children: { name: string; children: unknown[] }[] }[], selectedName: string | null): string[] | null {
  if (!selectedName) return null;
  const collect = (node: { name: string; children: unknown[] }): string[] => {
    const names = [node.name];
    (node.children || []).forEach((c: unknown) => names.push(...collect(c as { name: string; children: unknown[] })));
    return names;
  };
  const find = (nodes: { name: string; children: unknown[] }[]): string[] | null => {
    for (const n of nodes) {
      if (n.name === selectedName) return collect(n);
      const inChild = find((n.children || []) as { name: string; children: unknown[] }[]);
      if (inChild) return inChild;
    }
    return null;
  };
  const names = find(tree as { name: string; children: unknown[] }[]);
  return names && names.length ? names : [selectedName];
}

const Index = () => {
  const { items, categories, categoryTree, tags, refreshItems, assembledConfigurations } = useApp();
  const [addingItem, setAddingItem] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  const warehouseItems = useMemo((): InventoryItem[] => {
    const components: InventoryItem[] = (items || []).map((i) => ({ ...i, itemType: "component" as const }));
    const configRows: InventoryItem[] = (assembledConfigurations || []).map((c) => ({
      // Отрицательный идентификатор отличает собранную конфигурацию от позиции
      // номенклатуры: в списке склада они лежат вперемешку.
      id: -c.configurationId,
      name: c.name,
      quantity: c.quantity,
      category: c.category,
      location: c.location,
      // Остальные поля строки склада к конфигурации неприменимы.
      categoryId: null,
      unit: "шт",
      price: null,
      minStock: 0,
      barcode: null,
      description: null,
      url: null,
      archivedAt: null,
      updatedAt: "",
      locations: [],
      tags: [],
      itemType: "configuration" as const,
      configurationId: c.configurationId,
    }));
    return [...components, ...configRows];
  }, [items, assembledConfigurations]);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);

  // Сканирование ведёт в окно добавления: и для известного товара, и для
  // неизвестного человек делает одно и то же — указывает сколько и куда.
  // Разница лишь в том, что известное подставляется само.
  const [addPrefill, setAddPrefill] = useState<AddItemPrefill | null>(null);

  const openAddWithPrefill = useCallback((prefill: AddItemPrefill | null) => {
    setAddPrefill(prefill);
    setShowAddDialog(true);
    setShowBarcodeScanner(false);
  }, []);

  const onItemFound = useCallback((item: InventoryItem) => {
    openAddWithPrefill({
      existingItemId: item.id,
      name: item.name,
      category: item.category,
      price: item.price ?? null,
      description: item.description ?? null,
      barcode: item.barcode ?? null,
    });
  }, [openAddWithPrefill]);

  // Незнакомый код — ещё не повод заводить новую позицию: товар может быть
  // давно на складе, просто без штрихкода. Поэтому сначала предлагаем найти
  // его и привязать код, и лишь потом — создать новую карточку.
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);

  const onItemNotFound = useCallback((barcode: string) => {
    setPendingBarcode(barcode);
    setShowBarcodeScanner(false);
  }, []);

  const handleLinkBarcode = useCallback(async (item: InventoryItem) => {
    const barcode = pendingBarcode;
    if (!barcode) return;
    setPendingBarcode(null);
    try {
      await setComponentBarcode(item.id, barcode);
      await refreshItems();
      toast({
        title: "Штрихкод привязан",
        description: `${barcode} → ${item.name}. Дальше сканирование будет вести сюда`,
      });
      // Сразу продолжаем тем же, чем закончилось бы обычное сканирование:
      // человек указывает, сколько поступило и куда.
      openAddWithPrefill({
        existingItemId: item.id,
        name: item.name,
        category: item.category,
        price: item.price ?? null,
        description: item.description ?? null,
        barcode,
      });
    } catch (error) {
      toast({
        title: "Не удалось привязать штрихкод",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  }, [pendingBarcode, openAddWithPrefill, refreshItems]);

  const handleCreateNewFromBarcode = useCallback(() => {
    const barcode = pendingBarcode;
    setPendingBarcode(null);
    openAddWithPrefill({ barcode: barcode ?? undefined });
  }, [pendingBarcode, openAddWithPrefill]);

  const { handleBarcodeScan } = useBarcodeScanner({
    onItemFound,
    onItemNotFound,
  });

  // Listen for the custom event to open add dialog
  useEffect(() => {
    const handleOpenAddDialog = () => {
      setShowAddDialog(true);
    };

    const handleSelectItem = (e: CustomEvent) => {
      const itemId = e.detail?.itemId;
      if (itemId != null) {
        const item = warehouseItems.find((i) => i.id === itemId);
        if (item) setSelectedItem(item);
      }
    };

    // Handle URL hash for direct item selection
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith("#item-")) {
        const idStr = hash.replace("#item-", "");
        const itemId = parseInt(idStr, 10);
        if (!Number.isNaN(itemId)) {
          const item = warehouseItems.find((i) => i.id === itemId);
          if (item) setSelectedItem(item);
        }
      }
    };

    window.addEventListener('openAddDialog', handleOpenAddDialog);
    window.addEventListener('selectItem', handleSelectItem as EventListener);
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // Check on mount

    return () => {
      window.removeEventListener('openAddDialog', handleOpenAddDialog);
      window.removeEventListener('selectItem', handleSelectItem as EventListener);
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [items, warehouseItems]);

  const categoryFilterNames = category ? categoryNamesWithDescendants(categoryTree, category) : null;

  const summary = selectedItem ? 
    { name: selectedItem.name, quantity: selectedItem.quantity, location: selectedItem.location, category: selectedItem.category } :
    { name: "Выбранный продукт", quantity: 85, location: "Склад А-12", category: category ?? "Все" };

  const handleAddItem = async (newItem: Omit<InventoryItem, 'id'>, tagIds?: number[]) => {
    if (addingItem) return;
    setAddingItem(true);
    let step = "сохранение товара в базу";
    try {
      // Если штрихкод опознан, позиция уже есть: нужно оприходовать
      // количество на склад, а не заводить вторую такую же карточку.
      const id = addPrefill?.existingItemId
        ? await addComponentGroup({
            componentId: addPrefill.existingItemId,
            name: "Поступление по штрихкоду",
            location: newItem.location,
            quantity: newItem.quantity,
            price: newItem.price ?? undefined,
          }).then(() => addPrefill.existingItemId!)
        : await upsertComponent({
            name: newItem.name,
            category: newItem.category,
            location: newItem.location,
            quantity: newItem.quantity,
            price: newItem.price,
            minStock: newItem.minStock,
            barcode: newItem.barcode ?? undefined,
            description: newItem.description,
            url: newItem.url,
            imageUrl: newItem.imageUrl,
          });
      step = "назначение тегов";
      if (id && tagIds?.length) {
        await setComponentTags(id, tagIds);
      }
      step = "обновление списка";
      window.dispatchEvent(new CustomEvent('componentsUpdated'));
      await refreshItems();
      toast({
        title: "Товар добавлен",
        description: `Товар "${newItem.name}" успешно добавлен`,
      });
    } catch (error) {
      const msg = getErrorMessage(error);
      console.error(`[Склад] Ошибка при добавлении товара (этап: ${step}):`, error);
      if (import.meta.env.DEV && error instanceof Error && error.stack) {
        console.error("[Склад] Stack:", error.stack);
      }
      toast({
        title: "Ошибка добавления товара",
        description: `Этап «${step}»: ${msg}`,
        variant: "destructive",
      });
      throw error;
    } finally {
      setAddingItem(false);
    }
  };

  const handleAddCategory = async (newCategory: string) => {
    try {
      await createCategory(newCategory.trim(), null);
      await refreshItems();
      toast({
        title: "Категория добавлена",
        description: `Категория "${newCategory}" создана`,
      });
    } catch (error) {
      console.error('❌ Error creating category:', error);
      toast({
        title: "Ошибка",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen relative">
      <Seo title="Склад компонентов — учет и конфигурации" description="Учет склада компонентов: поиск, фильтры, конфигурации. Быстро и красиво." canonical="/" />

      <div className="absolute inset-0 -z-10">
        <UniversalBackground />
      </div>

      <div className="grid grid-cols-[auto_1fr]">
        <Sidebar />
        <div className="min-h-screen flex flex-col">
          <TopBar 
            search={search} 
            onSearch={setSearch} 
            summary={summary}
            onBarcodeScan={() => setShowBarcodeScanner(true)}
            tags={tags}
          />
          <main className="container mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[1fr_450px] gap-6">
            <section aria-labelledby="inventory-title" className="space-y-3">
              <h1 id="inventory-title" className="sr-only">Список компонентов</h1>
              <FilterBar
                categoryTree={categoryTree}
                category={category}
                onCategory={(v) => setCategory(v)}
              />
              <InventoryTable 
                items={warehouseItems} 
                search={search} 
                categoryFilterNames={categoryFilterNames}
                selectedItem={selectedItem}
                onSelectItem={setSelectedItem}
              />
            </section>
            <aside aria-label="Информация о товаре">
              <ItemBriefInfo item={selectedItem} />
            </aside>
          </main>
        </div>
      </div>

      <AddItemDialog
        open={showAddDialog}
        onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) setAddPrefill(null);
        }}
        categories={categories}
        tags={tags}
        onAddItem={handleAddItem}
        onAddCategory={handleAddCategory}
        prefill={addPrefill}
      />

      <BarcodeScanner
        open={showBarcodeScanner}
        onOpenChange={setShowBarcodeScanner}
        onScan={handleBarcodeScan}
      />

      <BarcodeLinkDialog
        open={pendingBarcode !== null}
        onOpenChange={(open) => !open && setPendingBarcode(null)}
        barcode={pendingBarcode ?? ""}
        items={items}
        onLink={handleLinkBarcode}
        onCreateNew={handleCreateNewFromBarcode}
      />
    </div>
  );
};

export default Index;
