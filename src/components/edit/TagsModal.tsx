import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getTags, getComponentTagIds, setComponentTags, createTag } from "@/lib/db";
import { Tag, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/services/errorHandler";

interface TagsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  componentId: number | null;
  onSaved?: () => void;
}

export function TagsModal({ open, onOpenChange, componentId, onSaved }: TagsModalProps) {
  const [allTags, setAllTags] = useState<{ id: number; name: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (open) {
      getTags().then(setAllTags).catch(() => setAllTags([]));
      if (componentId) {
        getComponentTagIds(componentId).then(setSelectedIds).catch(() => setSelectedIds([]));
      } else setSelectedIds([]);
    }
  }, [open, componentId]);

  const filteredTags = filter.trim()
    ? allTags.filter((t) => t.name.toLowerCase().includes(filter.toLowerCase()))
    : allTags;

  const toggle = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleCreateAndAdd = async () => {
    const n = newTagName.trim();
    if (!n) return;
    try {
      const id = await createTag(n);
      setAllTags((prev) => [...prev.filter((t) => t.id !== id), { id, name: n }]);
      setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      setNewTagName("");
      toast({ title: "Тег создан" });
    } catch (e) {
      toast({ title: "Ошибка", description: getErrorMessage(e), variant: "destructive" });
    }
  };

  const handleSave = async () => {
    if (componentId == null) return;
    try {
      await setComponentTags(componentId, selectedIds);
      onSaved?.();
      onOpenChange(false);
      toast({ title: "Теги сохранены" });
    } catch (e) {
      toast({ title: "Ошибка", description: getErrorMessage(e), variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Теги изделия
          </DialogTitle>
        </DialogHeader>
        {componentId == null ? (
          <p className="text-sm text-muted-foreground">Сначала выберите изделие для редактирования.</p>
        ) : (
          <>
            <Input
              placeholder="Поиск тега..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <ScrollArea className="max-h-[200px]">
              <div className="flex flex-wrap gap-2 py-2">
                {filteredTags.map((t) => (
                  <Badge
                    key={t.id}
                    variant={selectedIds.includes(t.id) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggle(t.id)}
                  >
                    {t.name}
                  </Badge>
                ))}
              </div>
            </ScrollArea>
            <div className="flex gap-2">
              <Input
                placeholder="Новый тег"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateAndAdd()}
              />
              <Button size="sm" onClick={handleCreateAndAdd} disabled={!newTagName.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
              <Button onClick={handleSave}>Сохранить</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
