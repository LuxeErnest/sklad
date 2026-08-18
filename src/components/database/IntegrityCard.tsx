import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, AlertTriangle, Stethoscope, Wrench } from "lucide-react";
import { useState } from "react";
import { checkIntegrity, repairIntegrity, type IntegrityReport } from "@/lib/db";
import { toast } from "@/hooks/use-toast";

export const IntegrityCard = () => {
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRepair, setConfirmRepair] = useState(false);

  const problemCount = report
    ? report.quantityMismatches.length +
      report.missingLocations.length +
      report.duplicateGroupComponents.length +
      report.foreignKeyViolations
    : 0;

  const handleCheck = async () => {
    setBusy(true);
    try {
      const result = await checkIntegrity();
      setReport(result);
    } catch (error) {
      console.error("Проверка целостности не удалась:", error);
      toast({
        title: "Проверка не удалась",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRepair = async () => {
    setConfirmRepair(false);
    setBusy(true);
    try {
      const result = await repairIntegrity();
      const parts = [
        result.quantitiesFixed ? `остатков выровнено: ${result.quantitiesFixed}` : "",
        result.locationsCreated ? `мест хранения создано: ${result.locationsCreated}` : "",
        result.duplicatesMerged ? `дублей схлопнуто: ${result.duplicatesMerged}` : "",
      ].filter(Boolean);
      toast({
        title: "Починка выполнена",
        description: parts.length ? parts.join(", ") : "Изменений не потребовалось",
      });
      setReport(await checkIntegrity());
    } catch (error) {
      console.error("Починка не удалась:", error);
      toast({
        title: "Починка не удалась",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card className="border-dashed">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Stethoscope className="h-4 w-4" />
            Целостность данных
          </CardTitle>
          <CardDescription>Сверка остатков с местами хранения</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-3">
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCheck} disabled={busy} className="flex-1">
              Проверить
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmRepair(true)}
              disabled={busy || !report || problemCount === 0}
              className="flex-1"
            >
              <Wrench className="h-3 w-3 mr-2" />
              Починить
            </Button>
          </div>

          {report && problemCount === 0 && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Расхождений не найдено
            </p>
          )}

          {report && problemCount > 0 && (
            <div className="space-y-2 text-sm">
              {report.quantityMismatches.length > 0 && (
                <div>
                  <p className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Остаток не сходится с местами хранения
                  </p>
                  <div className="mt-1 space-y-0.5">
                    {report.quantityMismatches.map((m) => (
                      <p key={m.id} className="text-xs text-muted-foreground">
                        «{m.name}»: общий {m.total}, по местам {m.byLocation}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {report.missingLocations.length > 0 && (
                <div>
                  <p className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Остаток без места хранения
                  </p>
                  <div className="mt-1 space-y-0.5">
                    {report.missingLocations.map((m) => (
                      <p key={m.id} className="text-xs text-muted-foreground">
                        «{m.name}»: {m.quantity} шт.
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {report.duplicateGroupComponents.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Группы-дубли у товаров:{" "}
                  <Badge variant="outline">{report.duplicateGroupComponents.length}</Badge>
                </p>
              )}

              {report.foreignKeyViolations > 0 && (
                <p className="text-xs text-destructive">
                  Нарушений внешних ключей: {report.foreignKeyViolations} — автоматически не
                  чинится
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmRepair} onOpenChange={setConfirmRepair}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Выровнять учёт?</AlertDialogTitle>
            <AlertDialogDescription>
              Общий остаток товара будет приведён к сумме по местам хранения — источником
              правды считается распределение по складам. Товару с остатком, но без мест
              хранения, будет заведено место по его текущему расположению: количество не
              обнуляется. Группы-дубли схлопнутся с суммированием количества.
              <br />
              <br />
              Перед починкой имеет смысл создать резервную копию.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleRepair}>Починить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
