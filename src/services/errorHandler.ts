/**
 * Централизованная обработка ошибок
 */

export interface AppError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Извлекает текст ошибки из любого значения (Error, объект с message, строка).
 * Нужно для собранного приложения, где ошибки могут приходить в разном виде.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message?.trim() || 'Неизвестная ошибка';
  if (typeof error === 'string' && error.trim()) return error.trim();
  const o = error as Record<string, unknown>;
  if (o && typeof o === 'object') {
    const msg = o.message ?? o.msg ?? o.error ?? o.reason ?? o.detail;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
    if (typeof msg === 'object' && msg !== null && typeof (msg as { message?: string }).message === 'string') {
      return ((msg as { message: string }).message).trim();
    }
    try {
      const s = JSON.stringify(error);
      if (s && s !== '{}' && s.length < 500) return s;
    } catch {
      // ignore
    }
  }
  const fallback = String(error);
  return fallback && fallback !== '[object Object]' ? fallback : 'Неизвестная ошибка';
}

export class InventoryError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'InventoryError';
  }
}

/**
 * Обрабатывает ошибки базы данных
 */
export function handleDatabaseError(error: unknown): AppError {
  if (error instanceof Error) {
    // Проверяем на специфичные ошибки SQLite
    if (error.message.includes('database is locked')) {
      return {
        code: 'DB_LOCKED',
        message: 'База данных заблокирована. Попробуйте позже.',
        details: error
      };
    }
    
    if (error.message.includes('no such table')) {
      return {
        code: 'DB_TABLE_MISSING',
        message: 'Таблица не найдена. Возможно, требуется инициализация базы данных.',
        details: error
      };
    }
    
    if (error.message.includes('UNIQUE constraint')) {
      return {
        code: 'DB_UNIQUE_CONSTRAINT',
        message: 'Нарушение уникальности данных.',
        details: error
      };
    }
    
    return {
      code: 'DB_ERROR',
      message: error.message || 'Ошибка базы данных',
      details: error
    };
  }
  
  const message = getErrorMessage(error);
  return {
    code: 'UNKNOWN_ERROR',
    message: message || 'Неизвестная ошибка',
    details: error
  };
}

/**
 * Обрабатывает ошибки валидации
 */
export function handleValidationError(field: string, value: unknown): AppError {
  return {
    code: 'VALIDATION_ERROR',
    message: `Ошибка валидации поля "${field}"`,
    details: { field, value }
  };
}

/**
 * Логирует ошибку в консоль и возвращает понятное сообщение для пользователя
 */
export function logAndFormatError(error: unknown, context?: string): string {
  const appError = handleDatabaseError(error);
  
  console.error(`❌ Error${context ? ` in ${context}` : ''}:`, {
    code: appError.code,
    message: appError.message,
    details: appError.details
  });
  
  // Для известных кодов — понятное сообщение; для остальных (в т.ч. DB_ERROR, UNKNOWN_ERROR) — реальный текст ошибки
  const userMessages: Record<string, string> = {
    'DB_LOCKED': 'База данных временно недоступна. Попробуйте через несколько секунд.',
    'DB_TABLE_MISSING': 'Ошибка структуры базы данных. Обратитесь к администратору.',
    'DB_UNIQUE_CONSTRAINT': 'Такая запись уже существует.',
    'VALIDATION_ERROR': 'Проверьте правильность введенных данных.',
  };
  const formatted = userMessages[appError.code];
  return formatted ?? appError.message;
}

/** Маппинг технических ошибок в понятные сообщения для пользователя */
const USER_ERROR_MESSAGES: Record<string, string> = {
  "database is locked": "База данных временно недоступна. Подождите 2–3 секунды и попробуйте снова.",
  "cannot start a transaction within a transaction": "Ошибка при записи данных. Попробуйте ещё раз.",
  "cannot commit": "Ошибка при сохранении. Попробуйте ещё раз.",
  "no transaction is active": "Ошибка при сохранении. Попробуйте ещё раз.",
  "no such table": "Ошибка структуры базы данных. Перезапустите приложение.",
  "UNIQUE constraint": "Такая запись уже существует. Проверьте уникальные поля.",
  "Validation failed": "Проверьте заполнение обязательных полей (название, категория, расположение, количество).",
};

/**
 * Форматирует ошибку обновления изделия: техническое сообщение + понятное пользователю
 */
export function formatItemUpdateError(error: unknown): { message: string; userMessage: string } {
  const raw = getErrorMessage(error);
  const lower = raw.toLowerCase();

  for (const [key, userMsg] of Object.entries(USER_ERROR_MESSAGES)) {
    if (lower.includes(key.toLowerCase())) {
      return { message: raw, userMessage: userMsg };
    }
  }

  if (lower.includes("error returned from database")) {
    if (lower.includes("locked")) {
      return { message: raw, userMessage: "База данных занята. Подождите и попробуйте снова." };
    }
    if (lower.includes("transaction")) {
      return { message: raw, userMessage: "Ошибка при сохранении. Попробуйте ещё раз." };
    }
  }

  return {
    message: raw,
    userMessage: raw.length > 120 ? "Не удалось сохранить изменения. Попробуйте ещё раз." : raw,
  };
}
