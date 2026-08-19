/**
 * Настройки интерфейса.
 *
 * Это предпочтения одного человека за одним компьютером, а не данные склада,
 * поэтому они живут в localStorage, а не в базе: в резервную копию им попадать
 * незачем, и переносить их между машинами тоже не нужно.
 *
 * Раньше переключатели на странице настроек хранились в useState самой
 * страницы: они возвращались к исходному значению при переходе на другой экран
 * и ни на что не влияли.
 */

import { useCallback, useEffect, useState } from "react";

const KEY = "sklad_preferences";

export interface Preferences {
  /**
   * Показывать сообщения об успешных действиях.
   *
   * Сообщения об ошибках этой настройке не подчиняются: скрыть от человека, что
   * действие не выполнилось, — не предпочтение, а потеря.
   */
  successToasts: boolean;
}

const DEFAULTS: Preferences = {
  successToasts: true,
};

function read(): Preferences {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

let current: Preferences = read();
const listeners = new Set<(value: Preferences) => void>();

/** Текущее значение — для мест вне React, например для показа сообщений. */
export function preferences(): Preferences {
  return current;
}

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
  current = { ...current, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Хранилище может быть недоступно — настройка тогда живёт до перезапуска.
  }
  listeners.forEach((listener) => listener(current));
}

/** Настройка вместе со способом её изменить — как обычный useState. */
export function usePreference<K extends keyof Preferences>(
  key: K
): [Preferences[K], (value: Preferences[K]) => void] {
  const [value, setValue] = useState<Preferences[K]>(current[key]);

  useEffect(() => {
    const listener = (next: Preferences) => setValue(next[key]);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [key]);

  const update = useCallback((next: Preferences[K]) => setPreference(key, next), [key]);
  return [value, update];
}
