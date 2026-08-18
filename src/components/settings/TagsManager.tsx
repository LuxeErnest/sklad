import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getTags, createTag, updateTag, deleteTag } from "@/lib/db";
import { Tag, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function TagsManager() {
  const [tags, setTags] = useState<{ id: number; name: string }[]>([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const load = async () => {
    const list = await getTags();
    setTags(list || []);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    const n = newName.trim();
    if (!n) return;
    try {
      await createTag(n);
      setNewName("");
      await load();
      toast({ title: "Тег создан", description: n });
    } catch (e) {
      toast({
        title: "Ошибка",
        description: e instanceof Error ? e.message : "Не удалось создать тег",
        variant: "destructive",
      });
    }
  };

  const handleUpdate = async (id: number) => {
    const n = editName.trim();
    if (!n) return;
    try {
      await updateTag(id, n);
      setEditingId(null);
      setEditName("");
      await load();
      toast({ title: "Тег обновлён" });
    } catch (e) {
      toast({
        title: "Ошибка",
        description: e instanceof Error ? e.message : "Не удалось обновить",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Удалить тег «${name}»?`)) return;
    try {
      await deleteTag(id);
      await load();
      toast({ title: "Тег удалён" });
    } catch (e) {
      toast({
        title: "Ошибка",
        description: e instanceof Error ? e.message : "Не удалось удалить",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="h-5 w-5" />
          Теги товаров
        </CardTitle>
        <CardDescription>
          Создание, редактирование и удаление тегов для классификации товаров
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Новый тег"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <Button onClick={handleCreate} size="sm">
            <Plus className="h-4 w-4" /> Создать
          </Button>
        </div>
        <ul className="space-y-2">
          {tags.map((t) => (
            <li key={t.id} className="flex items-center gap-2">
              {editingId === t.id ? (
                <>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1"
                    autoFocus
                  />
                  <Button size="sm" onClick={() => handleUpdate(t.id)}>
                    Сохранить
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditName(""); }}>
                    Отмена
                  </Button>
                </>
              ) : (
                <>
                  <Badge variant="secondary">{t.name}</Badge>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditingId(t.id); setEditName(t.name); }}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(t.id, t.name)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
        {tags.length === 0 && <p className="text-sm text-muted-foreground">Нет тегов. Создайте первый.</p>}
      </CardContent>
    </Card>
  );
}
