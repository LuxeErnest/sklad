import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import { FilterBar } from "@/components/inventory/FilterBar";
import InventoryTable, { InventoryItem } from "@/components/inventory/InventoryTable";
import AddItemDialog from "@/components/inventory/AddItemDialog";
import ItemEditPanel from "@/components/inventory/ItemEditPanel";
import BackgroundGlow from "@/components/common/BackgroundGlow";
import Seo from "@/components/seo/Seo";
import { useMemo, useState, useEffect } from "react";
import { initDb, upsertComponent, getComponents } from "@/lib/db";

const mock: InventoryItem[] = [
  { id: 1, name: "SSD 1TB", quantity: 12, category: "Накопители", location: "Склад А-12", lastUpdated: "2025-08-01" },
  { id: 2, name: "DDR4 16GB", quantity: 34, category: "Память", location: "Склад B-02", lastUpdated: "2025-08-05" },
  { id: 3, name: "CPU Ryzen 7", quantity: 5, category: "Процессоры", location: "Склад А-03", lastUpdated: "2025-08-07" },
  { id: 4, name: "SATA кабель", quantity: 120, category: "Кабели", location: "Склад C-01", lastUpdated: "2025-08-10" },
];

const Index = () => {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [items, setItems] = useState<InventoryItem[]>(mock);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

  // Listen for the custom event to open add dialog
  useEffect(() => {
    (async () => {
      await initDb();
      try {
        const rows = await getComponents();
        if (rows && Array.isArray(rows) && rows.length > 0) {
          setItems(rows as any);
          setCategories(Array.from(new Set((rows as any[]).map((r) => r.category))));
        } else {
          setCategories(Array.from(new Set(mock.map((m) => m.category))));
        }
      } catch (e) {
        setCategories(Array.from(new Set(mock.map((m) => m.category))));
      }
    })();
    const handleOpenAddDialog = () => {
      setShowAddDialog(true);
    };

    window.addEventListener('openAddDialog', handleOpenAddDialog);

    return () => {
      window.removeEventListener('openAddDialog', handleOpenAddDialog);
    };
  }, []);

  const summary = selectedItem ? 
    { name: selectedItem.name, quantity: selectedItem.quantity, location: selectedItem.location, category: selectedItem.category } :
    { name: "Выбранный продукт", quantity: 85, location: "Склад А-12", category: category ?? "Все" };

  const handleAddItem = async (newItem: Omit<InventoryItem, 'id'>) => {
    const id = await upsertComponent(newItem as any);
    setItems(prev => [...prev, { ...newItem, id } as any]);
    if (newItem.category && !categories.includes(newItem.category)) {
      setCategories(prev => [...prev, newItem.category]);
    }
  };

  const handleAddCategory = (newCategory: string) => {
    if (!categories.includes(newCategory)) {
      setCategories(prev => [...prev, newCategory]);
    }
  };

  const handleUpdateItem = (id: number, updates: Partial<InventoryItem>) => {
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, ...updates, lastUpdated: new Date().toISOString().split('T')[0] } : item
    ));
    // Update selected item if it was the one being edited
    if (selectedItem?.id === id) {
      setSelectedItem(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  return (
    <div className="min-h-screen relative">
      <Seo title="Склад компонентов — учет и конфигурации" description="Учет склада компонентов: поиск, фильтры, конфигурации. Быстро и красиво." canonical="/" />

      <div className="absolute inset-0 -z-10">
        <BackgroundGlow />
      </div>

      <div className="grid grid-cols-[auto_1fr]">
        <Sidebar />
        <div className="min-h-screen flex flex-col">
          <TopBar search={search} onSearch={setSearch} summary={summary} />
          <main className="container mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
            <section aria-labelledby="inventory-title" className="space-y-3">
              <h1 id="inventory-title" className="sr-only">Список компонентов</h1>
              <FilterBar categories={categories} category={category} onCategory={(v) => setCategory(v)} />
              <InventoryTable 
                items={items} 
                search={search} 
                categoryFilter={category}
                selectedItem={selectedItem}
                onSelectItem={setSelectedItem}
              />
            </section>
            <aside aria-label="Панель редактирования">
              <ItemEditPanel 
                item={selectedItem}
                categories={categories}
                onUpdateItem={handleUpdateItem}
              />
            </aside>
          </main>
        </div>
      </div>

      <AddItemDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        categories={categories}
        onAddItem={handleAddItem}
        onAddCategory={handleAddCategory}
      />
    </div>
  );
};

export default Index;
