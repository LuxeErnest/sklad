/**
 * Глобальная обработка ошибок для приложения
 */

interface ErrorData {
  message: string;
  stack?: string;
  timestamp: string;
  path: string;
  userAgent: string;
}

export const saveErrorToStorage = (
  error: Error | string,
  additionalInfo?: Record<string, unknown>
) => {
  try {
    const errorData: ErrorData = {
      message: typeof error === 'string' ? error : error.message,
      stack: typeof error === 'string' ? undefined : error.stack,
      timestamp: new Date().toISOString(),
      path: window.location.pathname,
      userAgent: navigator.userAgent,
      ...additionalInfo,
    };
    
    localStorage.setItem('lastError', JSON.stringify(errorData));
    
    // Сохраняем историю ошибок (последние 10)
    const errorHistory = JSON.parse(localStorage.getItem('errorHistory') || '[]');
    errorHistory.unshift(errorData);
    if (errorHistory.length > 10) {
      errorHistory.pop();
    }
    localStorage.setItem('errorHistory', JSON.stringify(errorHistory));
  } catch (e) {
    console.error('Failed to save error to localStorage:', e);
  }
};

export const getLastError = (): ErrorData | null => {
  try {
    const errorData = localStorage.getItem('lastError');
    return errorData ? JSON.parse(errorData) : null;
  } catch (e) {
    console.error('Failed to read error from localStorage:', e);
    return null;
  }
};

export const clearErrorHistory = () => {
  try {
    localStorage.removeItem('lastError');
    localStorage.removeItem('errorHistory');
  } catch (e) {
    console.error('Failed to clear error history:', e);
  }
};

// Глобальный обработчик необработанных ошибок
export const setupGlobalErrorHandlers = () => {
  // Обработчик необработанных ошибок JavaScript
  window.addEventListener('error', (event) => {
    console.error('❌ Global error handler:', event.error || event.message);
    if (event.error) {
      saveErrorToStorage(event.error, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    }
  });

  // Обработчик необработанных промисов
  window.addEventListener('unhandledrejection', (event) => {
    console.error('❌ Unhandled promise rejection:', event.reason);
    const error = event.reason instanceof Error 
      ? event.reason 
      : new Error(String(event.reason));
    saveErrorToStorage(error, {
      type: 'unhandledRejection',
    });
  });

  // Проверка на черный экран (если DOM не рендерится)
  setTimeout(() => {
    const body = document.body;
    if (body && body.children.length === 0) {
      console.warn('⚠️ Possible black screen detected - no content rendered');
      const lastError = getLastError();
      if (lastError) {
        console.error('Last error before black screen:', lastError);
      }
    }
  }, 2000);
};
