import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import UniversalBackground from "@/components/UniversalBackground";
import Seo from "@/components/seo/Seo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollText, ArrowRight, ArrowDownToLine, ArrowUpFromLine, RefreshCw } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { getLocations, getLocationJournal, getOperations } from "@/lib/db";

interface JournalLine {
  id: number;
  kind: string;
  performedAt: string;
  performedBy: string | null;
  note: string | null;
  itemId: number;
  itemName: string;
  fromLocation: string | null;
  toLocation: string | null;
  quantity: number;
}

interface LocationRow {
  id: number;
  name: string;
  itemCount: number;
  totalQuantity: number;
}

const KIND_LABELS: Record<string, string> = {
  receipt: "Поступление",
  transfer: "Перемещение",
  writeoff: "Списание",
  assembly: "Сборка",
  disassembly: "Разборка",
  correction: "Корректировка",
};

const KIND_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  receipt: "default",
  transfer: "secondary",
  writeoff: "destructive",
  assembly: "secondary",
  disassembly: "secondary",
  correction: "outline",
};

const ALL = "all";

/**
 * Журнал складских операций.
 *
 * Ради этого экрана журнал и был перенесён с изделий на склады: маршрут на
 * каждую отдельную штуку не имеет смысла, когда в партии тысяча единиц, а вот
 * «что происходило у этого склада» — имеет.
 */
const Journal = () => {
  const [search, setSearch] = useState("");
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [locationId, setLocationId] = useState<string>(ALL);
  const [lines, setLines] = useState<JournalLine[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getLocations()
      .then(setLocations)
      .catch((error) => console.error("Не удалось загрузить места хранения:", error));
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const rows =
        locationId === ALL
          ? await getOperations(undefined, 500)
          : await getLocationJournal(Number(locationId), 500);
      setLines(rows as JournalLine[]);
    } catch (error) {
      console.error("Не удалось загрузить журнал:", error);
      setLines([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const onUpdate = () => load();
    window.addEventListener("componentsUpdated", onUpdate);
    return () => window.removeEventListener("componentsUpdated", onUpdate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return lines;
    return lines.filter(
      (l) =>
        l.itemName.toLowerCase().includes(needle) ||
        (l.note || "").toLowerCase().includes(needle) ||
        (l.fromLocation || "").toLowerCase().includes(needle) ||
        (l.toLocation || "").toLowerCase().includes(needle)
    );
  }, [lines, search]);

  const current = locations.find((l) => String(l.id) === locationId);

  const summary = {
    name: current ? current.name : "Все склады",
    quantity: visible.length,
    location: "Журнал",
    category: "Операции",
  };

  /** Направление движения относительно выбранного склада. */
  const direction = (line: JournalLine) => {
    if (locationId === ALL) {
      if (line.fromLocation && line.toLocation) return "move";
      return line.toLocation ? "in" : "out";
    }
    const name = current?.name;
    if (line.toLocation === name && line.fromLocation === name) return "move";
    return line.toLocation === name ? "in" : "out";
  };

  return (
    <div className="min-h-screen relative">
      <Seo
        title="Журнал склада — движение товаров"
        description="Маршрутный лист склада: поступления, перемещения, списания и сборки."
        canonical="/journal"
      />

      <div className="absolute inset-0 -z-10">
        <UniversalBackground />
      </div>

      <div className="grid grid-cols-[auto_1fr]">
        <Sidebar />
        <div className="min-h-screen flex flex-col">
          <TopBar search={search} onSearch={setSearch} summary={summary} />

          <main className="container mx-auto px-4 py-6 space-y-6">
            <div className="flex items-center gap-3">
              <ScrollText className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold">Журнал склада</h1>
                <p className="text-muted-foreground">
                  Что приходило, уходило и перемещалось
                </p>
              </div>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
                <div>
                  <CardTitle>
                    {current ? `Склад «${current.name}»` : "Все склады"}
                  </CardTitle>
                  <CardDescription>
                    {current
                      ? `Сейчас на складе: ${current.totalQuantity} шт. по ${current.itemCount} позициям`
                      : "Все операции по всем местам хранения"}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={locationId} onValueChange={setLocationId}>
                    <SelectTrigger className="w-56">
                      <SelectValue placeholder="Выберите склад" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Все склады</SelectItem>
                      {locations.map((l) => (
                        <SelectItem key={l.id} value={String(l.id)}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" onClick={load} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {visible.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground">
                    {loading ? "Загрузка…" : "Операций не найдено"}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-40">Когда</TableHead>
                          <TableHead className="w-36">Тип</TableHead>
                          <TableHead>Изделие</TableHead>
                          <TableHead className="w-56">Движение</TableHead>
                          <TableHead className="w-24 text-right">Кол-во</TableHead>
                          <TableHead>Примечание</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visible.map((line) => {
                          const dir = direction(line);
                          return (
                            <TableRow key={line.id}>
                              <TableCell className="text-muted-foreground text-sm">
                                {new Date(line.performedAt).toLocaleString("ru-RU")}
                              </TableCell>
                              <TableCell>
                                <Badge variant={KIND_VARIANTS[line.kind] ?? "outline"}>
                                  {KIND_LABELS[line.kind] ?? line.kind}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-medium">{line.itemName}</TableCell>
                              <TableCell className="text-sm">
                                <span className="inline-flex items-center gap-1.5">
                                  {dir === "in" && (
                                    <ArrowDownToLine className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                  )}
                                  {dir === "out" && (
                                    <ArrowUpFromLine className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                  )}
                                  {dir === "move" && (
                                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  )}
                                  <span className="text-muted-foreground">
                                    {line.fromLocation ?? "—"}
                                  </span>
                                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="text-muted-foreground">
                                    {line.toLocation ?? "—"}
                                  </span>
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {line.quantity} шт.
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {line.note ?? ""}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </main>
        </div>
      </div>
    </div>
  );
};

export default Journal;
