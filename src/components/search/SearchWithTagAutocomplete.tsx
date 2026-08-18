import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface SearchWithTagAutocompleteProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  tags: { id: number; name: string }[];
  "aria-label"?: string;
  className?: string;
}

export function SearchWithTagAutocomplete({
  value,
  onChange,
  placeholder = "Поиск по названию, описанию, #тегу",
  tags,
  "aria-label": ariaLabel = "Поиск",
  className,
}: SearchWithTagAutocompleteProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [cursor, setCursor] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const hashMatch = (() => {
    const i = value.lastIndexOf("#");
    if (i === -1) return null;
    const after = value.slice(i + 1).toLowerCase();
    return { prefix: value.slice(0, i + 1), after };
  })();

  const suggestions = hashMatch
    ? tags.filter((t) => t.name.toLowerCase().includes(hashMatch.after)).slice(0, 8)
    : [];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setCursor(0);
    setShowSuggestions(suggestions.length > 0);
  }, [value, suggestions.length]);

  const applySuggestion = (tagName: string) => {
    if (!hashMatch) return;
    const rest = value.slice(value.lastIndexOf("#") + 1).trim();
    const newVal = hashMatch.prefix + tagName + (rest && rest !== tagName ? " " : "");
    onChange(newVal);
    setShowSuggestions(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (c + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (c - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" && suggestions[cursor]) {
      e.preventDefault();
      applySuggestion(suggestions[cursor].name);
    } else if (e.key === "Escape") setShowSuggestions(false);
  };

  return (
    <div ref={wrapperRef} className="relative flex-1">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-60 pointer-events-none" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={(className || "") + " pl-10"}
      />
      {showSuggestions && suggestions.length > 0 && (
        <ul
          className="absolute z-50 mt-1 w-full rounded-md border bg-popover py-1 text-sm shadow-lg"
          role="listbox"
        >
          {suggestions.map((t, i) => (
            <li
              key={t.id}
              role="option"
              aria-selected={i === cursor}
              className={`cursor-pointer px-3 py-2 ${i === cursor ? "bg-accent" : ""}`}
              onMouseEnter={() => setCursor(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                applySuggestion(t.name);
              }}
            >
              #{t.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
