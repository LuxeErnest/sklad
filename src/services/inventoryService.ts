/**
 * Сервис для работы с инвентарем
 * Централизует бизнес-логику работы с товарами
 */

import { getComponents, upsertComponent, archiveComponent, restoreComponent, getComponentGroups, scrapFromLocation, scrapAllFromAllLocations } from "@/lib/db";
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
    await upsertComponent({
      id: itemId,
      ...updates,
      quantity: newQuantity,
    } as any);

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

/**
 * Загружает все товары с обработкой ошибок
 */
export async function loadInventoryItems(): Promise<InventoryItem[]> {
  try {
    const rows = await getComponents();
    if (rows && Array.isArray(rows)) {
      return rows as InventoryItem[];
    }
    return [];
  } catch (error) {
    console.error('❌ Error loading inventory items:', error);
    return [];
  }
}

/**
 * Убирает товар из оборота, сохраняя историю.
 *
 * Физического удаления здесь нет намеренно: перемещения, поставки, списания и
 * документы ссылаются на товар, и их потеря означала бы потерю учётных данных.
 * Безвозвратное удаление доступно отдельно, из архива в настройках.
 */
export async function archiveItem(itemId: number): Promise<boolean> {
  try {
    await archiveComponent(itemId);
    return true;
  } catch (error) {
    console.error('❌ Ошибка архивирования изделия:', error);
    return false;
  }
}

export async function restoreItem(itemId: number): Promise<boolean> {
  try {
    await restoreComponent(itemId);
    return true;
  } catch (error) {
    console.error('❌ Ошибка восстановления изделия:', error);
    return false;
  }
}
