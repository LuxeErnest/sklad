import { QueryClient } from "@tanstack/react-query";

/**
 * Общий клиент запросов.
 *
 * Вынесен из App.tsx отдельным модулем, чтобы слой данных мог сбрасывать кэш
 * сразу после записи. Раньше вместо этого была самодельная шина на событиях DOM
 * с дебаунсом в 400 мс, ожиданием очереди и ещё одной паузой в 150 мс — около
 * полусекунды задержки после каждого действия. Очереди больше нет, а сброс
 * нужных ключей происходит мгновенно.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Данные лежат в локальной базе рядом с приложением: перезапрашивать их
      // при возврате фокуса в окно незачем.
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 30_000,
    },
  },
});

/** Ключи запросов. Собраны в одном месте, чтобы сброс не расходился с чтением. */
export const queryKeys = {
  items: ["items"] as const,
  archivedItems: ["items", "archived"] as const,
  locations: ["locations"] as const,
  categories: ["categories"] as const,
  tags: ["tags"] as const,
  configurations: ["configurations"] as const,
  documents: ["documents"] as const,
  operations: ["operations"] as const,
  statistics: ["statistics"] as const,
};
