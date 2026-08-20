/**
 * Доступ к данным.
 *
 * Здесь больше нет ни SQL, ни пула соединений, ни очереди, ни мьютекса, ни
 * ретраев — всё это переехало в Rust, где соединение одно и им владеет язык.
 * Остались тонкие обёртки над командами: имена и формы данных сохранены, чтобы
 * страницы не пришлось переписывать целиком.
 *
 * Главное смысловое изменение: количество больше не поле, которое можно
 * присвоить. Остаток меняется только регистрацией операции, и у каждого
 * изменения есть строка в журнале.
 */

import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type {
  ConfigurationView,
  DocumentView,
  IntegrityReport,
  ItemView,
  LocationView,
  OperationLineView,
  WarehouseStatistics,
  MovementByKind,
  LocationValue,
  DeadStockItem,
} from "@/lib/generated";

// Типы приходят из Rust: описание данных существует в одном месте, и
// расхождение между слоем данных и интерфейсом становится ошибкой сборки,
// а не тихой неожиданностью во время работы.
export type {
  ConfigurationView,
  DocumentView,
  IntegrityReport,
  ItemView,
  LocationView,
  OperationLineView,
  StockAtLocation,
} from "@/lib/generated";
import { queryClient, queryKeys } from "@/lib/queryClient";

/**
 * Адрес изображения для показа в окне.
 *
 * В базе лежит путь к файлу на диске, а окну нужен адрес: обычный путь оно не
 * загрузит. Ссылки, введённые вручную, остаются как есть.
 */
function imageSrc(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^(https?:|data:)/i.test(path)) return path;
  return convertFileSrc(path);
}

// ---------- Типы, которые ждёт интерфейс ----------

export interface CategoryNode {
  id: number;
  name: string;
  parentId: number | null;
  children: CategoryNode[];
}


// ---------- Служебное ----------

/**
 * Сообщает интерфейсу, что данные изменились.
 *
 * Сбрасывает соответствующие ключи в кэше запросов и дополнительно рассылает
 * прежние события DOM — на них ещё подписаны отдельные карточки. Раньше события
 * были единственным механизмом, и подписчик в контексте ждал 400 мс дебаунса
 * плюс 150 мс паузы, прежде чем перечитать вообще всё.
 */
function notify(...events: string[]) {
  const keys: Record<string, readonly (readonly unknown[])[]> = {
    componentsUpdated: [
      queryKeys.items,
      queryKeys.archivedItems,
      queryKeys.locations,
      queryKeys.operations,
      queryKeys.statistics,
      queryKeys.configurations,
    ],
    configurationsUpdated: [queryKeys.configurations, queryKeys.items, queryKeys.statistics],
    documentsUpdated: [queryKeys.documents],
  };

  for (const name of events) {
    for (const key of keys[name] ?? []) {
      queryClient.invalidateQueries({ queryKey: key });
    }
    try {
      window.dispatchEvent(new CustomEvent(name));
    } catch {
      /* вне окна браузера события не нужны */
    }
  }
}

/**
 * Приводит позицию к виду, который ожидают существующие страницы.
 *
 * `lastUpdated` и `imageUrl` остались от прежней схемы; поддерживаем их, чтобы
 * не переписывать разметку ради переименования полей.
 */
function toLegacyItem(item: ItemView) {
  return {
    ...item,
    category: item.category ?? "Без категории",
    location: item.location ?? "",
    lastUpdated: (item.updatedAt || "").split("T")[0],
    imageUrl: imageSrc(item.imagePath),
    minStock: item.minStock,
  };
}

/** Ищет место хранения по названию, при необходимости заводит новое. */
async function locationIdByName(name: string, create = true): Promise<number> {
  const wanted = (name || "").trim();
  if (!wanted) throw new Error("Не указано место хранения");
  const locations = await invoke<LocationView[]>("list_locations");
  const found = locations.find((l) => l.name.toLowerCase() === wanted.toLowerCase());
  if (found) return found.id;
  if (!create) throw new Error(`Место хранения «${wanted}» не найдено`);
  return await invoke<number>("create_location", { name: wanted });
}

// ---------- Номенклатура ----------

async function defaultLocationId(): Promise<number> {
  const locations = await invoke<LocationView[]>("list_locations");
  if (locations.length === 0) return await invoke<number>("create_location", { name: "Основной склад" });
  return locations[0].id;
}


export async function getComponents() {
  const items = await invoke<ItemView[]>("list_items");
  return items.map(toLegacyItem);
}

export async function getArchivedComponents() {
  const items = await invoke<ItemView[]>("list_archived_items");
  return items.map(toLegacyItem);
}

/** Что можно задать при сохранении карточки изделия. */
export interface SaveComponentInput {
  id?: number;
  name: string;
  category?: string;
  /** Место, куда приходуется количество: нужно только при изменении остатка. */
  location?: string;
  quantity?: number;
  price?: number | null;
  minStock?: number;
  barcode?: string;
  description?: string | null;
  url?: string | null;
  imageUrl?: string | null;
  imageBase64?: string | null;
}

/**
 * Сохраняет карточку изделия.
 *
 * Свойства позиции пишутся напрямую, а количество — только через операцию:
 * для новой позиции это поступление, для существующей — корректировка.
 * Раньше правка карточки присваивала остаток и попутно создавала запись о
 * списании, из-за чего исправление опечатки попадало в отчёт по выбытию.
 */
export async function upsertComponent(c: SaveComponentInput) {
  // Загруженный файл сначала кладётся на диск, и в карточку идёт путь к нему.
  // Раньше содержимое оставалось в форме и никуда не отправлялось: человек
  // видел предпросмотр и сообщение «файл успешно загружен», сохранял карточку,
  // а изображение молча пропадало.
  const imagePath = c.imageBase64
    ? await invoke<string>("save_item_image", { dataBase64: c.imageBase64 })
    : (c.imageUrl ?? undefined);

  const id = await invoke<number>("save_item", {
    input: {
      id: c.id,
      name: c.name,
      category: c.category,
      price: c.price ?? undefined,
      minStock: c.minStock,
      barcode: c.barcode,
      description: c.description,
      url: c.url,
      imagePath,
    },
  });

  // Для новой позиции с указанным количеством сразу регистрируем поступление —
  // иначе изделие появилось бы на складе без объяснения, откуда оно взялось.
  if (!c.id && c.quantity && c.quantity > 0 && c.location) {
    const locationId = await locationIdByName(c.location);
    await invoke("register_operation", {
      input: {
        kind: "receipt",
        performedBy: "Пользователь",
        note: "Первичное оприходование",
        lines: [{ itemId: id, toLocationId: locationId, quantity: c.quantity, unitPrice: c.price ?? undefined }],
      },
    });
  }

  // У существующей позиции изменение количества в карточке оформляется
  // корректировкой. Молча присвоить новое число нельзя: остаток обязан
  // выводиться из журнала, иначе сверка перестанет иметь смысл. При этом и
  // списанием такая правка не является — это исправление учёта.
  if (c.id && c.quantity !== undefined) {
    const groups = await getComponentGroups(c.id);
    const current = groups.reduce((sum, g) => sum + g.quantity, 0);
    const delta = c.quantity - current;
    if (delta !== 0) {
      const locationId = c.location
        ? await locationIdByName(c.location)
        : groups[0]?.id ?? (await defaultLocationId());
      await invoke("register_operation", {
        input: {
          kind: "correction",
          performedBy: "Пользователь",
          note: `Корректировка при редактировании карточки (было ${current}, стало ${c.quantity})`,
          lines: [{
            itemId: c.id,
            fromLocationId: delta < 0 ? locationId : null,
            toLocationId: delta > 0 ? locationId : null,
            quantity: Math.abs(delta),
          }],
        },
      });
    }
  }

  notify("componentsUpdated");
  return id;
}

/**
 * Привязывает штрихкод к уже заведённой позиции.
 *
 * Отдельная команда, а не сохранение карточки: то переписывает её целиком, и
 * вызов с одним лишь штрихкодом стёр бы категорию, цену и описание.
 *
 * Пустая строка отвязывает код — на случай ошибочной привязки.
 */
export async function setComponentBarcode(componentId: number, barcode: string) {
  await invoke("set_item_barcode", { itemId: componentId, barcode });
  notify("componentsUpdated");
}

export async function archiveComponent(id: number) {
  await invoke("archive_item", { itemId: id });
  notify("componentsUpdated");
}

export async function restoreComponent(id: number) {
  await invoke("restore_item", { itemId: id });
  notify("componentsUpdated");
}

export async function getComponentReferenceCounts(id: number): Promise<Record<string, number>> {
  return await invoke("item_reference_counts", { itemId: id });
}

export async function deleteComponentPermanently(id: number) {
  await invoke("delete_item", { itemId: id });
  notify("componentsUpdated", "documentsUpdated");
}

// ---------- Места хранения ----------

export async function getLocations() {
  return await invoke<LocationView[]>("list_locations");
}

export async function renameLocation(locationId: number, name: string) {
  await invoke("rename_location", { locationId, name });
  notify("componentsUpdated");
}

/** Объединяет два места хранения: остатки складываются, журнал переписывается. */
export async function mergeLocations(sourceId: number, targetId: number) {
  await invoke("merge_locations", { sourceId, targetId });
  notify("componentsUpdated");
}

/**
 * Остатки по местам хранения.
 *
 * Прежнее название «группы» осталось от схемы, где место и цена вместе
 * образовывали ключ хранения. Теперь ключ — только место, поэтому дублей
 * по построению не бывает.
 */
export async function getComponentGroups(componentId: number) {
  const items = await invoke<ItemView[]>("list_items");
  const item = items.find((i) => i.id === componentId);
  return (item?.locations ?? []).map((entry) => ({
    id: entry.locationId,
    componentId,
    name: entry.location,
    location: entry.location,
    quantity: entry.quantity,
    price: item?.price ?? null,
    createdAt: item?.updatedAt ?? "",
    updatedAt: item?.updatedAt ?? "",
  }));
}

// ---------- Журнал ----------

function toLegacyPath(line: OperationLineView, index: number) {
  const kindNames: Record<string, string> = {
    receipt: "Поступление",
    transfer: "Перемещение",
    writeoff: "Списание",
    assembly: "Сборка",
    disassembly: "Разборка",
    correction: "Корректировка",
  };
  return {
    id: line.id,
    componentId: line.itemId,
    stepOrder: index + 1,
    stepName: line.note || kindNames[line.kind] || line.kind,
    stepDescription: line.note,
    stepLocation: line.toLocation ?? line.fromLocation ?? "",
    stepQuantity: line.quantity,
    stepPrice: line.unitPrice,
    stepDate: line.performedAt,
    stepType: line.kind === "transfer" ? "transfer" : line.kind === "writeoff" ? "scrap" : "storage",
    fromLocation: line.fromLocation,
    toLocation: line.toLocation,
    kind: line.kind,
  };
}

export async function getComponentPaths(componentId: number) {
  const lines = await invoke<OperationLineView[]>("item_history", { itemId: componentId });
  return lines.map(toLegacyPath);
}

/**
 * Последнее, что происходило с изделием.
 *
 * История приходит от новых записей к старым, поэтому нужна первая строка.
 * Null означает, что движений не было вовсе, — такое бывает у позиций,
 * заведённых без оприходования.
 */
export async function getLastMovement(componentId: number): Promise<OperationLineView | null> {
  const lines = await invoke<OperationLineView[]>("item_history", { itemId: componentId });
  return lines[0] ?? null;
}

/** Маршрутный лист склада: всё, что приходило к нему и уходило от него. */
export async function getLocationJournal(locationId: number, limit = 500) {
  return await invoke<OperationLineView[]>("location_journal", { locationId, limit });
}

/** Общий журнал; при указании типа — только операции этого вида. */
export async function getOperations(kind?: string, limit = 500) {
  return await invoke<OperationLineView[]>("list_operations", { kind: kind ?? null, limit });
}

export async function getComponentUsageHistory(componentId?: number) {
  const lines = componentId
    ? await invoke<OperationLineView[]>("item_history", { itemId: componentId })
    : await invoke<OperationLineView[]>("list_operations", { kind: null, limit: 500 });
  return lines.map((l) => ({
    id: l.id,
    componentId: l.itemId,
    componentName: l.itemName,
    quantity: l.quantity,
    operationType: l.kind,
    notes: l.note,
    createdAt: l.performedAt,
  }));
}

/**
 * Добавляет этап перемещения.
 *
 * Если указано, откуда именно, получается перемещение; иначе — поступление.
 * Прежняя версия попутно заводила «группу» отдельным вызовом и упиралась в
 * единственное соединение пула: несколько секунд ожидания и молчаливый отказ.
 */
export async function addComponentPath(payload: {
  componentId: number;
  stepName: string;
  stepDescription?: string;
  stepLocation?: string;
  stepQuantity?: number;
  stepPrice?: number;
  stepType: string;
  fromLocation?: string;
}) {
  if (!payload.stepLocation || !payload.stepQuantity || payload.stepQuantity <= 0) {
    throw new Error("Для этапа нужно указать место хранения и количество");
  }
  const toLocationId = await locationIdByName(payload.stepLocation);
  const fromLocationId = payload.fromLocation
    ? await locationIdByName(payload.fromLocation, false)
    : null;

  const id = await invoke<number>("register_operation", {
    input: {
      kind: fromLocationId ? "transfer" : "receipt",
      performedBy: "Пользователь",
      note: payload.stepName || payload.stepDescription,
      lines: [{
        itemId: payload.componentId,
        fromLocationId,
        toLocationId,
        quantity: payload.stepQuantity,
        unitPrice: payload.stepPrice,
      }],
    },
  });
  notify("componentsUpdated");
  return id;
}

/** Оприходование на место хранения. */
export async function addComponentGroup(payload: {
  componentId: number; name?: string; location: string; quantity: number; price?: number;
}) {
  const toLocationId = await locationIdByName(payload.location);
  const id = await invoke<number>("register_operation", {
    input: {
      kind: "receipt",
      performedBy: "Пользователь",
      note: payload.name || "Оприходование",
      lines: [{
        itemId: payload.componentId,
        toLocationId,
        quantity: payload.quantity,
        unitPrice: payload.price,
      }],
    },
  });
  notify("componentsUpdated");
  return id;
}

// ---------- Списание ----------

export async function scrapFromLocation(
  componentId: number,
  location: string,
  quantity: number,
  reason?: string
) {
  const fromLocationId = await locationIdByName(location, false);
  await invoke("register_operation", {
    input: {
      kind: "writeoff",
      performedBy: "Пользователь",
      note: reason?.trim() || `Списание со склада «${location}»`,
      lines: [{ itemId: componentId, fromLocationId, quantity }],
    },
  });
  notify("componentsUpdated");
  return quantity;
}

export async function scrapAllFromAllLocations(componentId: number, reason?: string) {
  const groups = await getComponentGroups(componentId);
  const lines = groups
    .filter((g) => g.quantity > 0)
    .map((g) => ({ itemId: componentId, fromLocationId: g.id, quantity: g.quantity }));
  if (lines.length === 0) return;
  await invoke("register_operation", {
    input: {
      kind: "writeoff",
      performedBy: "Пользователь",
      note: reason?.trim() || "Полное списание со всех складов",
      lines,
    },
  });
  notify("componentsUpdated");
}


/** Строка списания в том виде, в каком её показывают отчёты. */
export type ScrappedRow = Awaited<ReturnType<typeof getScrappedItems>>[number];

export async function getScrappedItems() {
  const lines = await invoke<OperationLineView[]>("list_operations", { kind: "writeoff", limit: 500 });
  return lines.map((l) => ({
    id: l.id,
    componentId: l.itemId,
    componentName: l.itemName,
    quantity: l.quantity,
    reason: l.note,
    scrappedAt: l.performedAt,
    scrappedBy: l.performedBy,
    location: l.fromLocation,
    price: l.unitPrice,
  }));
}

/**
 * Списания по одному изделию.
 *
 * Берётся история самого изделия, а не последние пятьсот списаний по всему
 * складу с отбором на месте. Разница не в скорости: при пятистах списаниях по
 * складу более старые списания изделия просто переставали показываться на его
 * карточке, и чем дольше склад работает, тем больше их пропадает. Соседние
 * функции — поставки и перемещения — давно сделаны правильно.
 */
export async function getScrappedItemsByComponentId(componentId: number) {
  const lines = await invoke<OperationLineView[]>("item_history", { itemId: componentId });
  return lines
    .filter((l) => l.kind === "writeoff")
    .map((l) => ({
      id: l.id,
      componentId: l.itemId,
      componentName: l.itemName,
      quantity: l.quantity,
      reason: l.note,
      scrappedAt: l.performedAt,
      scrappedBy: l.performedBy,
      location: l.fromLocation,
      price: l.unitPrice,
    }));
}

export async function getSupplyRecordsByComponentId(componentId: number) {
  const lines = await invoke<OperationLineView[]>("item_history", { itemId: componentId });
  return lines
    .filter((l) => l.kind === "receipt" && l.toLocationId !== null)
    .map((l) => ({
      id: l.id,
      componentId: l.itemId,
      quantity: l.quantity,
      suppliedAt: l.performedAt,
      suppliedBy: l.performedBy,
      location: l.toLocation,
    }));
}

// ---------- Категории ----------

export async function getCategoriesTree(): Promise<CategoryNode[]> {
  const rows = await invoke<{ id: number; name: string; parentId: number | null }[]>(
    "list_categories"
  );
  const byId = new Map<number, CategoryNode>();
  rows.forEach((c) => byId.set(c.id, { ...c, children: [] }));
  byId.forEach((node) => {
    if (node.parentId != null && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    }
  });
  return [...byId.values()].filter((n) => n.parentId == null);
}

export async function createCategory(name: string, parentId: number | null): Promise<number> {
  const id = await invoke<number>("create_category", { name, parentId });
  notify("componentsUpdated");
  return id;
}

export async function updateCategory(id: number, name: string): Promise<void> {
  await invoke("update_category", { categoryId: id, name });
  notify("componentsUpdated");
}

export async function deleteCategory(id: number, _reassignToName?: string | null): Promise<void> {
  await invoke("delete_category", { categoryId: id });
  notify("componentsUpdated");
}

// ---------- Теги ----------

export async function getTags() {
  return await invoke<{ id: number; name: string }[]>("list_tags");
}

export async function createTag(name: string): Promise<number> {
  const id = await invoke<number>("create_tag", { name });
  notify("componentsUpdated");
  return id;
}

/**
 * Превращает названия тегов в их идентификаторы, заводя отсутствующие.
 *
 * Нужно там, где теги вводят строкой через запятую: человек не обязан знать,
 * существует тег или нет.
 */
export async function tagIdsByNames(names: string[]): Promise<number[]> {
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (!wanted.length) return [];
  const existing = await getTags();
  const ids: number[] = [];
  for (const name of wanted) {
    const found = existing.find((t) => t.name.toLowerCase() === name.toLowerCase());
    ids.push(found ? found.id : await createTag(name));
  }
  return ids;
}

export async function updateTag(id: number, name: string): Promise<void> {
  await invoke("update_tag", { tagId: id, name });
  notify("componentsUpdated");
}

export async function deleteTag(id: number): Promise<void> {
  await invoke("delete_tag", { tagId: id });
  notify("componentsUpdated");
}

export async function getComponentTagIds(componentId: number): Promise<number[]> {
  return await invoke("item_tag_ids", { itemId: componentId });
}

export async function setComponentTags(componentId: number, tagIds: number[]): Promise<void> {
  await invoke("set_item_tags", { itemId: componentId, tagIds });
  notify("componentsUpdated");
}

// ---------- Конфигурации ----------

export async function getConfigurations() {
  const rows = await invoke<ConfigurationView[]>("list_configurations");
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    totalValue: c.totalValue,
    totalItems: c.components.reduce((sum, x) => sum + x.quantity, 0),
    createdAt: (c.createdAt || "").split("T")[0],
    // Категория и место берутся у результирующего изделия. Прежде здесь стояли
    // жёсткая строка «Конфигурации» и пустое место — и форма сборки подставляла
    // в свои поля именно их, вместо настоящих значений.
    category: c.resultCategory ?? "",
    location: c.resultLocation ?? "",
    assembled: c.assembled,
    canAssemble: c.canAssemble,
    resultItemId: c.resultItemId,
  }));
}

export async function getConfigurationComponents(configurationId: number) {
  const rows = await invoke<ConfigurationView[]>("list_configurations");
  const config = rows.find((c) => c.id === configurationId);
  return (config?.components ?? []).map((c) => ({
    configurationId,
    componentId: c.itemId,
    quantity: c.quantity,
    name: c.name,
    available: c.available,
  }));
}

export async function getConfigurationsByComponentId(componentId: number) {
  const rows = await invoke<ConfigurationView[]>("list_configurations");
  return rows
    .filter((c) => c.components.some((x) => x.itemId === componentId))
    .map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      totalValue: c.totalValue,
      totalItems: c.components.reduce((s, x) => s + x.quantity, 0),
      quantity: c.components.find((x) => x.itemId === componentId)?.quantity ?? 0,
    }));
}

export async function createConfiguration(payload: {
  id?: number;
  name: string;
  description?: string;
  category?: string;
  components: { componentId: number; quantity: number }[];
}) {
  const id = await invoke<number>("save_configuration", {
    input: {
      id: payload.id,
      name: payload.name,
      description: payload.description,
      category: payload.category,
      components: payload.components.map((c) => ({ itemId: c.componentId, quantity: c.quantity })),
    },
  });
  notify("configurationsUpdated", "componentsUpdated");
  return id;
}

/**
 * Правит конфигурацию.
 *
 * Расположения здесь нет намеренно: у рецепта его быть не может, место
 * появляется у собранных единиц и указывается при сборке. Раньше параметр
 * принимался и молча выбрасывался.
 */
export async function updateConfiguration(
  id: number,
  updates: { name?: string; description?: string; category?: string }
) {
  const existing = await getConfigurationComponents(id);
  await invoke("save_configuration", {
    input: {
      id,
      name: updates.name ?? (await getConfigurations()).find((c) => c.id === id)?.name ?? "",
      description: updates.description,
      category: updates.category,
      components: existing.map((c) => ({ itemId: c.componentId, quantity: c.quantity })),
    },
  });
  notify("configurationsUpdated");
}

export async function deleteConfiguration(id: number) {
  await invoke("delete_configuration", { configurationId: id });
  notify("configurationsUpdated", "componentsUpdated");
}

/** Количество собранных единиц — это остаток результирующей позиции. */
export async function getAssembledCounts() {
  const rows = await invoke<ConfigurationView[]>("list_configurations");
  return rows
    .filter((c) => c.assembled > 0)
    .map((c) => ({ configurationId: c.id, quantity: c.assembled }));
}

export async function assembleConfiguration(payload: {
  configurationId: number; quantity: number; location?: string; builtBy?: string; notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const locationId = payload.location
      ? await locationIdByName(payload.location)
      : await defaultLocationId();
    await invoke("assemble_configuration", {
      configurationId: payload.configurationId,
      quantity: payload.quantity,
      locationId,
    });
    notify("configurationsUpdated", "componentsUpdated");
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function disassembleConfiguration(
  configurationId: number,
  quantity: number,
  location?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const locationId = location ? await locationIdByName(location) : await defaultLocationId();
    await invoke("disassemble_configuration", { configurationId, quantity, locationId });
    notify("configurationsUpdated", "componentsUpdated");
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/** Списание собранного изделия со склада. */
export async function writeOffConfiguration(
  configurationId: number,
  quantity: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const configs = await invoke<ConfigurationView[]>("list_configurations");
    const config = configs.find((c) => c.id === configurationId);
    if (!config) return { success: false, error: "Конфигурация не найдена" };

    const groups = await getComponentGroups(config.resultItemId);
    let remaining = quantity;
    const lines: { itemId: number; fromLocationId: number; quantity: number }[] = [];
    for (const group of groups) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, group.quantity);
      lines.push({ itemId: config.resultItemId, fromLocationId: group.id, quantity: take });
      remaining -= take;
    }
    if (remaining > 0) {
      return { success: false, error: `Собрано меньше, чем списывается: не хватает ${remaining}` };
    }

    await invoke("register_operation", {
      input: {
        kind: "writeoff",
        performedBy: "Пользователь",
        note: `Списание собранного «${config.name}»`,
        configurationId,
        lines,
      },
    });
    notify("configurationsUpdated", "componentsUpdated");
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function getConfigurationBuilds() {
  const lines = await invoke<OperationLineView[]>("list_operations", { kind: "assembly", limit: 200 });
  return lines
    .filter((l) => l.toLocationId !== null)
    .map((l) => ({
      id: l.id,
      configurationId: l.operationId,
      configurationName: l.itemName,
      quantity: l.quantity,
      builtAt: l.performedAt,
      builtBy: l.performedBy,
      notes: l.note,
    }));
}

// ---------- Документы ----------

export async function getDocuments() {
  const docs = await invoke<DocumentView[]>("list_documents");
  return docs.map((d) => ({
    ...d,
    componentIds: d.itemIds,
    sizeBytes: d.sizeBytes,
    type: d.extension ?? "",
    tags: d.tags,
    uploadedAt: (d.uploadedAt || "").split("T")[0],
  }));
}

/**
 * Сохраняет документ.
 *
 * `type` — расширение файла. Раньше оно уходило в поле, названное mime, и Rust
 * пытался вывести из него расширение как из MIME-типа: «xlsx» не подходило ни
 * под одно правило, и файл на диске получал имя «.bin».
 *
 * Теги раньше принимались и молча выбрасывались — хранить их было негде.
 * Названия превращаются в теги: существующие находятся, новых нет — создаются.
 */
export async function addDocument(payload: {
  name: string; type: string; sizeBytes: number; componentIds: number[];
  category: string; description?: string; tags?: string[]; uploadedBy?: string;
  dataBase64: string;
}) {
  const tagIds = payload.tags?.length ? await tagIdsByNames(payload.tags) : [];
  const id = await invoke<number>("add_document", {
    input: {
      name: payload.name,
      dataBase64: payload.dataBase64,
      extension: payload.type,
      category: payload.category,
      description: payload.description,
      uploadedBy: payload.uploadedBy,
      itemIds: payload.componentIds,
      tagIds,
    },
  });
  notify("documentsUpdated");
  return id;
}

export async function deleteDocument(id: number) {
  await invoke("delete_document", { documentId: id });
  notify("documentsUpdated");
}

export async function updateDocumentLinks(documentId: number, componentIds: number[]) {
  await invoke("set_document_items", { documentId, itemIds: componentIds });
  notify("documentsUpdated");
}

/** Содержимое документа в base64 — запрашивается только когда оно нужно. */
export async function readDocument(documentId: number): Promise<string> {
  return await invoke("read_document", { documentId });
}

/** Документы, привязанные к изделию. Содержимое читается отдельно. */
export async function getDocumentsByComponentId(componentId: number) {
  const docs = await invoke<DocumentView[]>("item_documents", { itemId: componentId });
  return docs.map((d) => ({
    id: d.id,
    name: d.name,
    type: d.extension ?? "",
    category: d.category ?? "",
    sizeBytes: d.sizeBytes,
  }));
}

export async function getCertificatesByComponentId(componentId: number) {
  const docs = await invoke<DocumentView[]>("item_documents", { itemId: componentId });
  return docs
    .filter((d) => (d.category || "").toLowerCase().includes("сертификат"))
    .map((d) => ({ id: d.id, name: d.name, type: d.extension ?? "", category: d.category ?? "" }));
}

// ---------- Сводка, целостность, обслуживание ----------

export async function getWarehouseStatistics() {
  // Тип берётся сгенерированный, а не описанный здесь руками: прежнее описание
  // отставало от Rust — в нём не было scrappedUnits, и поле молча терялось.
  const s = await invoke<WarehouseStatistics>("warehouse_statistics");
  return {
    totalComponents: s.totalItems,
    totalValue: s.totalValue,
    lowStockItems: s.lowStockItems,
    outOfStockItems: s.outOfStockItems,
    totalConfigurations: s.totalConfigurations,
    totalBuilds: s.assembledUnits,
    totalScrapped: s.scrappedUnits,
    totalUnits: s.totalUnits,
    totalLocations: s.totalLocations,
    operationsTotal: s.operationsTotal,
  };
}

/** Начало периода в том же виде, в каком время лежит в базе. */
function sinceDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/** Сколько поступило, списано и перемещено за последние N дней. */
export async function getMovementSummary(days: number): Promise<MovementByKind[]> {
  return await invoke("movement_summary", { since: sinceDaysAgo(days) });
}

/** Сколько единиц и на какую сумму лежит на каждом складе. */
export async function getValueByLocation(): Promise<LocationValue[]> {
  return await invoke("value_by_location");
}

/** Что лежит без движения дольше N дней. */
export async function getDeadStock(days: number): Promise<DeadStockItem[]> {
  return await invoke("dead_stock", { before: sinceDaysAgo(days) });
}

export async function checkIntegrity(): Promise<IntegrityReport> {
  return await invoke("check_integrity");
}

export async function repairIntegrity() {
  const fixed = await invoke<number>("repair_integrity");
  notify("componentsUpdated");
  return { quantitiesFixed: fixed, locationsCreated: 0, duplicatesMerged: 0 };
}

export async function getDatabaseHealth() {
  try {
    const stats = await invoke<{ totalItems: number; operationsTotal: number }>(
      "warehouse_statistics"
    );
    return {
      status: "healthy" as const,
      message: `База в порядке: позиций ${stats.totalItems}, операций ${stats.operationsTotal}`,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: `Ошибка базы данных: ${error}`,
      timestamp: new Date().toISOString(),
    };
  }
}

export async function getDatabasePath(): Promise<string> {
  return await invoke("get_db_path");
}

/** Сведения о хранилище: где лежит база, сколько занимает и чем заполнена. */
export async function getDatabaseInfo() {
  return await invoke<{
    path: string;
    sizeBytes: number;
    walBytes: number;
    documentsBytes: number;
    backupsCount: number;
  }>("database_info");
}

// Кэша, очереди и пула больше нет: запросы идут напрямую к локальной базе
// через Rust, а повторные обращения дедуплицирует react-query. Заглушки,
// которые оставались ради удалённых карточек настроек, тоже убраны.

// ---------- Проверка ввода ----------

/** Быстрая проверка на стороне интерфейса; окончательная — в Rust. */
export function validateComponent(data: {
  name?: string; category?: string; location?: string;
  quantity?: number; price?: number; minStock?: number;
}): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data.name?.trim()) errors.push("Название товара обязательно");
  if (data.quantity !== undefined && (!Number.isFinite(data.quantity) || data.quantity < 0)) {
    errors.push("Количество должно быть неотрицательным числом");
  }
  if (data.price != null && (!Number.isFinite(data.price) || data.price < 0)) {
    errors.push("Цена должна быть неотрицательным числом");
  }
  if (data.minStock != null && (!Number.isFinite(data.minStock) || data.minStock < 0)) {
    errors.push("Минимальный запас должен быть неотрицательным числом");
  }
  return { isValid: errors.length === 0, errors };
}
