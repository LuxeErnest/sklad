/**
 * Приведение ошибок к тексту для пользователя.
 *
 * Разбор кодов и английских строк SQLite отсюда убран: сообщения приходят из
 * Rust уже подготовленными для человека — «Недостаточно X на складе Y: есть N,
 * требуется M», «Запись связана с другими данными». Прежние таблицы разбирали
 * строки вроде `database is locked` и `cannot start a transaction`, которых
 * больше не бывает: пул, очередь и блокировки исчезли вместе с переносом слоя
 * данных в Rust.
 */

/**
 * Извлекает текст ошибки из любого значения.
 *
 * Нужно потому, что ошибка может прийти как Error, как строка из команды Tauri
 * или как объект неизвестной формы.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message?.trim() || "Неизвестная ошибка";
  if (typeof error === "string" && error.trim()) return error.trim();

  const o = error as Record<string, unknown>;
  if (o && typeof o === "object") {
    const msg = o.message ?? o.msg ?? o.error ?? o.reason ?? o.detail;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
    if (typeof msg === "object" && msg !== null && typeof (msg as { message?: string }).message === "string") {
      return (msg as { message: string }).message.trim();
    }
    try {
      const s = JSON.stringify(error);
      if (s && s !== "{}" && s.length < 500) return s;
    } catch {
      // Объект с циклическими ссылками — ниже сработает запасной вариант
    }
  }

  const fallback = String(error);
  return fallback && fallback !== "[object Object]" ? fallback : "Неизвестная ошибка";
}

/** Логирует ошибку с указанием места и возвращает текст для показа. */
export function logAndFormatError(error: unknown, context?: string): string {
  const message = getErrorMessage(error);
  console.error(`Ошибка${context ? ` (${context})` : ""}:`, error);
  return message;
}

/**
 * Текст ошибки для формы редактирования.
 *
 * Слишком длинное сообщение в поле формы читать неудобно, поэтому для таких
 * случаев подставляется короткое.
 */
export function formatItemUpdateError(error: unknown): { message: string; userMessage: string } {
  const message = getErrorMessage(error);
  return {
    message,
    userMessage:
      message.length > 120 ? "Не удалось сохранить изменения. Попробуйте ещё раз." : message,
  };
}
