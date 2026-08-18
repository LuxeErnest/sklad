import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getCategoriesTree, createCategory, updateCategory, deleteCategory } from "@/lib/db";
import type { CategoryNode } from "@/lib/db";
import { FolderTree, Plus, Pencil, Trash2, ChevronRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/services/errorHandler";

interface CategoriesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCategoryName: string;
  onSelect: (categoryName: string) => void;
  onDeleted?: () => void | Promise<void>;
}

export function CategoriesModal({
  open,
  onOpenChange,
  currentCategoryName,
  onSelect,
  onDeleted,
}: CategoriesModalProps) {
  const [tree, setTree] = useState<CategoryNode[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    if (open) getCategoriesTree().then(setTree).catch(() => setTree([]));
  }, [open]);

  const toggleExpand = (id: number) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    const n = newName.trim();
    if (!n) return;
    try {
      await createCategory(n, newParentId);
      setNewName("");
      setNewParentId(null);
      const next = await getCategoriesTree();
      setTree(next);
      toast({ title: "Категория создана" });
    } catch (e) {
      toast({ title: "Ошибка", description: getErrorMessage(e), variant: "destructive" });
    }
  };

  const handleUpdate = async () => {
    if (editingId == null) return;
    const n = editName.trim();
    if (!n) return;
    try {
      await updateCategory(editingId, n);
      setEditingId(null);
      setEditName("");
      const next = await getCategoriesTree();
      setTree(next);
      toast({ title: "Категория обновлена" });
    } catch (e) {
      toast({ title: "Ошибка", description: getErrorMessage(e), variant: "destructive" });
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Удалить категорию «${name}»? Изделия будут переназначены в «Без категории».`)) return;
    try {
      await deleteCategory(id, "Без категории");
      const next = await getCategoriesTree();
      setTree(next);
      await onDeleted?.();
      toast({ title: "Категория удалена" });
    } catch (e) {
      toast({ title: "Ошибка", description: getErrorMessage(e), variant: "destructive" });
    }
  };

  const renderNode = (node: CategoryNode, depth: number) => (
    <div key={node.id} className="space-y-1">
      <div
        className="flex items-center gap-1 py-1 rounded hover:bg-accent/50"
        style={{ paddingLeft: depth * 16 }}
      >
        <button
          type="button"
          onClick={() => toggleExpand(node.id)}
          className="p-0.5"
        >
          {node.children.length > 0 ? (
            <ChevronRight className={`h-4 w-4 transition-transform ${expanded.has(node.id) ? "rotate-90" : ""}`} />
          ) : (
            <span className="w-4 inline-block" />
          )}
        </button>
        {editingId === node.id ? (
          <div className="flex items-center gap-2 flex-1">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="h-8 flex-1"
              autoFocus
            />
            <Button size="sm" onClick={handleUpdate}>Сохр.</Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditName(""); }}>Отмена</Button>
          </div>
        ) : (
          <>
            <button
              type="button"
              className={`flex-1 text-left font-medium ${currentCategoryName === node.name ? "text-primary" : ""}`}
              onClick={() => onSelect(node.name)}
            >
              {node.name}
            </button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditingId(node.id); setEditName(node.name); }}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(node.id, node.name)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </>
        )}
      </div>
      {node.children.length > 0 && expanded.has(node.id) && (
        <div>{node.children.map((c) => renderNode(c, depth + 1))}</div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            Категории
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[300px] pr-2">
          {tree.map((n) => renderNode(n, 0))}
        </ScrollArea>
        <div className="space-y-2 border-t pt-3">
          <Label>Новая категория</Label>
          <div className="flex gap-2">
            <Input
              placeholder="Название"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
