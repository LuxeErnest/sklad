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

  // Глобальный обработчик для быстрого ввода штрихкода
  useEffect(() => {
    let barcodeBuffer = "";
    let lastKeyTime = Date.now();

    const handleKeyPress = (e: KeyboardEvent) => {
      // Игнорируем если фокус в input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      const now = Date.now();
      
      // Если прошло больше 500ms с последнего символа, сбрасываем буфер
      if (now - lastKeyTime > 500) {
        barcodeBuffer = "";
      }

      lastKeyTime = now;

      // Добавляем символ в буфер
      if (e.key.length === 1 && /[0-9a-zA-Z]/.test(e.key)) {
        barcodeBuffer += e.key;
      }

      // Если нажат Enter и буфер не пустой, ищем товар
      if (e.key === 'Enter' && barcodeBuffer.length >= 3) {
        e.preventDefault();
        scanRef.current(barcodeBuffer);
        barcodeBuffer = "";
      }
    };

    window.addEventListener('keypress', handleKeyPress);
    return () => window.removeEventListener('keypress', handleKeyPress);
  }, []);

  return {
    scannedItem,
    isDialogOpen,
    setIsDialogOpen,
    handleBarcodeScan,
    searchByBarcode,
  };
};
