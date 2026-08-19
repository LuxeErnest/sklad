import { useParams, useNavigate } from "react-router-dom";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import UniversalBackground from "@/components/UniversalBackground";
import Seo from "@/components/seo/Seo";
import { useApp } from "@/contexts/AppContext";
import { ProductCardFull } from "@/components/inventory/ProductCardFull";
import type { InventoryItem } from "@/components/inventory/InventoryTable";
import { useState } from "react";

const ProductCardPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { items, categories, refreshItems, getItemById } = useApp();
  const [search, setSearch] = useState("");

  const itemId = id ? parseInt(id, 10) : NaN;
  const item = Number.isFinite(itemId) ? getItemById(itemId) : undefined;

  const handleUpdateItem = async (itemId: number, updates: Partial<InventoryItem>) => {
    const { upsertComponent } = await import("@/lib/db");
    await upsertComponent({
      id: itemId,
      name: updates.name ?? "",
      category: updates.category,
      location: updates.location,
      quantity: updates.quantity,
      price: updates.price,
      minStock: updates.minStock,
      barcode: updates.barcode ?? undefined,
      description: updates.description,
      url: updates.url,
    });
    await refreshItems();
  };

  const summary = item
    ? { name: item.name, quantity: item.quantity, location: item.location, category: item.category }
    : { name: "Карточка изделия", quantity: 0, location: "-", category: "-" };

  if (!Number.isFinite(itemId)) {
    return (
      <div className="min-h-screen relative">
        <div className="absolute inset-0 -z-10">
          <UniversalBackground />
        </div>
        <div className="grid grid-cols-[auto_1fr]">
          <Sidebar />
          <div className="min-h-screen flex flex-col items-center justify-center p-8">
            <p className="text-muted-foreground">Неверный идентификатор изделия</p>
            <button
              onClick={() => navigate("/")}
              className="mt-4 text-primary hover:underline"
            >
              Вернуться на главную
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen relative">
        <div className="absolute inset-0 -z-10">
          <UniversalBackground />
        </div>
        <div className="grid grid-cols-[auto_1fr]">
          <Sidebar />
          <div className="min-h-screen flex flex-col">
            <TopBar search={search} onSearch={setSearch} summary={summary} />
            <main className="container mx-auto px-4 py-6 flex flex-col items-center justify-center flex-1">
              <p className="text-muted-foreground">Загрузка изделия…</p>
              <button
                onClick={() => navigate("/")}
                className="mt-4 text-primary hover:underline"
              >
                Вернуться на главную
              </button>
            </main>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      <Seo
        title={`${item.name} — Карточка изделия`}
        description={item.description || `Карточка изделия: ${item.name}`}
      />
      <div className="absolute inset-0 -z-10">
        <UniversalBackground />
      </div>
      <div className="grid grid-cols-[auto_1fr]">
        <Sidebar />
        <div className="min-h-screen flex flex-col">
          <TopBar search={search} onSearch={setSearch} summary={summary} />
          <main className="container mx-auto px-4 py-6 max-w-4xl">
            <ProductCardFull
              item={item}
              categories={categories}
              onUpdateItem={handleUpdateItem}
              onBack={() => navigate("/")}
              onRefresh={refreshItems}
            />
          </main>
        </div>
      </div>
    </div>
  );
};

export default ProductCardPage;
