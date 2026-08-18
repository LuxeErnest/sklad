import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Edit, FileText, Package, ExternalLink } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { InventoryItem } from "@/components/inventory/InventoryTable";

interface QuickActionsProps {
  item: InventoryItem;
  onEdit?: () => void;
  onViewDocuments?: () => void;
  className?: string;
}

export const QuickActions = ({ item, onEdit, onViewDocuments, className }: QuickActionsProps) => {
  const { navigateToItem, navigateToEdit, navigateToDocuments } = useApp();

  const handleEdit = () => {
    if (onEdit) {
      onEdit();
    } else {
      navigateToEdit(item.id);
    }
  };

  const handleViewDocuments = () => {
    if (onViewDocuments) {
      onViewDocuments();
    } else {
      navigateToDocuments(item.id);
    }
  };

  const handleViewItem = () => {
    navigateToItem(item.id);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={className}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleViewItem}>
          <Package className="h-4 w-4 mr-2" />
          Просмотреть товар
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleEdit}>
          <Edit className="h-4 w-4 mr-2" />
          Редактировать
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleViewDocuments}>
          <FileText className="h-4 w-4 mr-2" />
          Документы
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
