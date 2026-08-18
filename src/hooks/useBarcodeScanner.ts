import { useState, useEffect, useCallback } from "react";
import { getComponents } from "@/lib/db";
import { InventoryItem } from "@/components/inventory/InventoryTable";
import { toast } from "@/hooks/use-toast";

export interface UseBarcodeScannerOptions {
  /** При находке товара — открыть полную карточку вместо диалога редактирования */
  onItemFound?: (item: InventoryItem) => void;
}

export const useBarcodeScanner = (options?: UseBarcodeScannerOptions) => {
  const [scannedItem, setScannedItem] = useState<InventoryItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const onItemFound = options?.onItemFound;

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
        toast({
          title: "Товар найден",
          description: `Открыта карточка: ${item.name}`,
        });
      } else {
        setIsDialogOpen(true);
        toast({
          title: "Товар найден",
          description: `Найден товар: ${item.name}`,
        });
      }
    } else {
      toast({
        title: "Товар не найден",
        description: `Товар со штрихкодом "${barcode}" не найден в базе данных`,
        variant: "destructive",
      });
    }
  }, [searchByBarcode, onItemFound]);

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
        handleBarcodeScan(barcodeBuffer);
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
