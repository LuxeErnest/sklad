import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Выбор из списка с поиском по нему.
 *
 * Обычный выпадающий список годится, пока вариантов десяток. Категорий и
 * складов со временем становится больше, и листать их глазами перестаёт
 * работать — поэтому сверху поле ввода, отсеивающее список по мере набора.
 *
 * Сделан вручную, а не поверх Radix Select: тот перехватывает нажатия клавиш
 * для собственного быстрого перехода по первым буквам и мешает вводу.
 */

export interface SelectOption {
  value: string;
  /** Что видно в списке. Для вложенных категорий — путь через «/». */
  label: string;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  /** Первый пункт, сбрасывающий выбор: «Все категории», «Все склады». */
  emptyLabel: string;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  emptyLabel,
  placeholder = "Поиск",
  ariaLabel,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Пункт сброса всегда первый и не отсеивается: он не выбор, а отказ от него.
  const rows = useMemo<SelectOption[]>(
    () => [{ value: "", label: emptyLabel }, ...filtered],
    [filtered, emptyLabel]
  );

  const selectedLabel = value ? options.find((o) => o.value === value)?.label ?? value : emptyLabel;

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      // Поле поиска получает фокус сразу: список открывают, чтобы искать.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const choose = (option: SelectOption) => {
    onChange(option.value === "" ? null : option.value);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (c + 1) % Math.max(rows.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (c - 1 + rows.length) % Math.max(rows.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (rows[cursor]) choose(rows[cursor]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-4 w-4 opacity-50 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCursor(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul role="listbox" className="max-h-64 overflow-auto py-1">
            {rows.map((option, index) => {
              const active = index === cursor;
              const selected = option.value === (value ?? "");
              return (
                <li key={option.value || "__all__"} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => choose(option)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm",
                      active && "bg-accent text-accent-foreground"
                    )}
                  >
                    <span className="truncate">{option.label}</span>
                    {selected && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && query.trim() && (
              <li className="px-3 py-2 text-sm text-muted-foreground">Ничего не найдено</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default SearchableSelect;
