/**
 * Сервис для работы с инвентарем
 * Централизует бизнес-логику работы с товарами
 */

import { upsertComponent } from "@/lib/db";
import { InventoryItem } from "@/components/inventory/InventoryTable";
import { formatItemUpdateError } from "@/services/errorHandler";

export interface UpdateItemResult {
  success: boolean;
  error?: string;
  /** Краткое описание для пользователя */
  userMessage?: string;
}

/** Результат валидации перед обновлением */
function validateItemUpdate(
  itemId: number,
  updates: Partial<InventoryItem> & { barcode?: string }
): { valid: boolean; error?: string } {
  if (!itemId || itemId <= 0) {
    return { valid: false, error: "Неверный идентификатор изделия" };
  }
  const name = (updates.name ?? "").trim();
  if (!name) {
    return { valid: false, error: "Укажите название изделия" };
  }
  const category = (updates.category ?? "").trim();
  if (!category) {
    return { valid: false, error: "Укажите категорию" };
  }
  const location = (updates.location ?? "").trim();
  if (!location) {
    return { valid: false, error: "Укажите расположение (склад)" };
  }
  const qty = updates.quantity;
  if (typeof qty !== "number" || qty < 0 || !Number.isFinite(qty)) {
    return { valid: false, error: "Количество должно быть неотрицательным числом" };
  }
  const price = updates.price;
  if (price !== undefined && price !== null && (typeof price !== "number" || price < 0 || !Number.isFinite(price))) {
    return { valid: false, error: "Цена должна быть неотрицательным числом" };
  }
  return { valid: true };
}

/**
 * Обновляет параметры изделия (название, количество, склад, цену и т.д.).
 *
 * Уменьшение количества здесь считается исправлением данных, а не списанием, и
 * записей в scrapped_items не создаёт. Для списания есть отдельное действие.
 */
export async function updateItem(
  itemId: number,
  newQuantity: number,
  updates: Partial<InventoryItem> & { barcode?: string }
): Promise<UpdateItemResult> {
  const validation = validateItemUpdate(itemId, { ...updates, quantity: newQuantity });
  if (!validation.valid) {
    return { success: false, error: validation.error, userMessage: validation.error };
  }

  try {
    // Поля перечисляются явно: карточка склада несёт и то, что к сохранению
    // отношения не имеет — остатки по местам, теги, признак конфигурации.
    await upsertComponent({
      id: itemId,
      name: updates.name ?? "",
      category: updates.category,
      location: updates.location,
      quantity: newQuantity,
      price: updates.price,
      minStock: updates.minStock,
      barcode: updates.barcode,
      description: updates.description,
      url: updates.url,
    });

    return {
      success: true,
      userMessage: "Изделие успешно обновлено",
    };
  } catch (error) {
    const { message, userMessage } = formatItemUpdateError(error);
    console.error("❌ Ошибка обновления изделия:", error);
    return {
      success: false,
      error: message,
      userMessage: userMessage || message,
    };
  }
}
