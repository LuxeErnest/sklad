import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Package, MapPin, DollarSign, Calendar, ExternalLink, Edit, X } from "lucide-react";
import { InventoryItem } from "@/components/inventory/InventoryTable";
import { ItemEditPanel } from "@/components/inventory/ItemEditPanel";

interface BarcodeItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItem | null;
  categories: string[];
  onUpdateItem: (id: number, updates: Partial<InventoryItem>) => void;
}

export const BarcodeItemDialog = ({ 
  open, 
  onOpenChange, 
  item, 
  categories,
  onUpdateItem 
}: BarcodeItemDialogProps) => {
  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Товар найден по штрихкоду
          </DialogTitle>
          <DialogDescription>
            {item.barcode && `Штрихкод: ${item.barcode}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Quick info */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
            <div>
              <div className="text-sm text-muted-foreground">Название</div>
              <div className="font-semibold text-lg">{item.name}</div>
              <Badge variant="secondary" className="mt-1">{item.category}</Badge>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Количество:</span>
                <span className="font-medium">{item.quantity} шт.</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Расположение:</span>
                <span className="font-medium">{item.location}</span>
              </div>
              {item.price && (
                <div className="flex items-center gap-2 text-sm">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Цена:</span>
                  <span className="font-medium">{item.price.toFixed(2)}₽/шт.</span>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Edit panel */}
          <ItemEditPanel
            item={item}
            categories={categories}
            onUpdateItem={onUpdateItem}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
