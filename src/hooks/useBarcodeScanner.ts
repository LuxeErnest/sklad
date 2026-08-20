import { useState, useEffect, useCallback, useRef } from "react";
import { getComponents } from "@/lib/db";
import { InventoryItem } from "@/components/inventory/InventoryTable";
import { toast } from "@/hooks/use-toast";

export interface UseBarcodeScannerOptions {
  /** Штрихкод опознан: товар уже заведён. */
  onItemFound?: (item: InventoryItem) => void;
  /** Штрихкод неизвестен: товара с таким кодом на складе нет. */
  onItemNotFound?: (barcode: string) => void;
}

export const useBarcodeScanner = (options?: UseBarcodeScannerOptions) => {
  const [scannedItem, setScannedItem] = useState<InventoryItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const onItemFound = options?.onItemFound;
  const onItemNotFound = options?.onItemNotFound;

  const searchByBarcode = useCallback(async (barcode: string): Promise<InventoryItem | null> => {
    try {
      const components = await getComponents();
      const item = (components as InventoryItem[]).find(
        (c) => c.barcode && c.barcode.toLowerCase() === barcode.toLowerCase()
      );
      return item || null;
    } catch (error) {
      console.error('Error searching by barcode:', error);
      return null;
    }
  }, []);

  const handleBarcodeScan = useCallback(async (barcode: string) => {
    if (!barcode.trim()) {
      toast({
        title: "Ошибка",
        description: "Штрихкод не может быть пустым",
        variant: "destructive",
      });
      return;
    }

    const item = await searchByBarcode(barcode.trim());
    
    if (item) {
      setScannedItem(item);
      if (onItemFound) {
        onItemFound(item);
      } else {
        setIsDialogOpen(true);
      }
      toast({
        title: "Штрихкод опознан",
        description: `${item.name} — укажите, сколько поступило и куда`,
      });
    } else if (onItemNotFound) {
      // Неизвестный штрихкод — это не ошибка, а повод завести новую позицию:
      // код подставляется в форму, остальное человек заполняет сам.
      onItemNotFound(barcode);
      toast({
        title: "Новый штрихкод",
        description: "Такого товара ещё нет — заполните карточку",
      });
    } else {
      toast({
        title: "Товар не найден",
        description: `Товар со штрихкодом "${barcode}" не найден`,
        variant: "destructive",
      });
    }
  }, [searchByBarcode, onItemFound, onItemNotFound]);

  // Обработчик держим в ссылке: перехватчик клавиатуры вешается один раз, и
  // без этого он навсегда запомнил бы версию с первого рендера — то есть
  // сканирование продолжало бы вызывать устаревшие onItemFound/onItemNotFound.
  const scanRef = useRef(handleBarcodeScan);
  useEffect(() => {
    scanRef.current = handleBarcodeScan;
  }, [handleBarcodeScan]);

  /**
   * Сканер как клавиатура.
   *
   * Ручной сканер печатает код и завершает его переводом строки — то есть для
   * окна выглядит обычным набором с клавиатуры. Поэтому кнопку нажимать не
   * нужно: достаточно отсканировать, находясь на любом экране. Кнопка остаётся
   * для случая, когда кода под рукой нет и его вводят вручную.
   *
   * От набора руками сканер отличается скоростью: символы приходят через
   * единицы миллисекунд, человек так не печатает. Без этой проверки несколько
   * цифр и Enter, набранные мимо поля ввода, выглядели бы как сканирование.
   *
   * Слушается keydown, а не keypress: keypress объявлен устаревшим и для части
   * клавиш в разных движках не срабатывает вовсе.
   */
  useEffect(() => {
    /** Наибольший промежуток между символами, при котором это ещё сканер. */
    const MAX_GAP_MS = 50;
    /** Короче этого код не бывает — иначе сработает случайный набор. */
    const MIN_LENGTH = 4;

    let buffer = "";
    let lastKeyAt = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Если фокус в поле ввода, символы уходят туда — это обычный набор, и
      // перехватывать его нельзя: человек может печатать в поиске.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;

      const now = performance.now();
      const gap = now - lastKeyAt;
      lastKeyAt = now;

      if (e.key === "Enter") {
        const code = buffer;
        buffer = "";
        if (code.length >= MIN_LENGTH) {
          e.preventDefault();
          scanRef.current(code);
        }
        return;
      }

      if (e.key.length === 1 && /[0-9A-Za-z]/.test(e.key)) {
        // Пауза больше порога — начало нового кода, а не продолжение прежнего.
        buffer = gap > MAX_GAP_MS ? e.key : buffer + e.key;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return {
    scannedItem,
    isDialogOpen,
    setIsDialogOpen,
    handleBarcodeScan,
    searchByBarcode,
  };
};
