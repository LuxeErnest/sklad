import { Button } from "@/components/ui/button";
import { Package, ExternalLink } from "lucide-react";
import { useApp } from "@/contexts/AppContext";


interface ItemLinkProps {
  itemId: number;
  itemName?: string;
  variant?: "default" | "outline" | "ghost" | "link";
  size?: "sm" | "default" | "lg";
  showIcon?: boolean;
  className?: string;
}

export const ItemLink = ({ 
  itemId, 
  itemName, 
  variant = "link",
  size = "sm",
  showIcon = true,
  className 
}: ItemLinkProps) => {
  const { getItemById, navigateToItem } = useApp();
  const item = getItemById(itemId);
  const displayName = itemName || item?.name || `Товар #${itemId}`;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigateToItem(itemId);
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      className={className}
    >
      {showIcon && <Package className="h-3 w-3 mr-1" />}
      {displayName}
      <ExternalLink className="h-3 w-3 ml-1" />
    </Button>
  );
};
