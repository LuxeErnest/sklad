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
    ? report.stockDrift.length +
      report.negativeStock +
      report.orphanOperations +
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
      toast({
        title: "Починка выполнена",
        description: result.quantitiesFixed
          ? `Остатков приведено к журналу: ${result.quantitiesFixed}`
          : "Изменений не потребовалось",
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
          <CardDescription>Сверка остатков с журналом операций</CardDescription>
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
              {report.stockDrift.length > 0 && (
                <div>
                  <p className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Остаток не сходится с журналом операций
                  </p>
                  <div className="mt-1 space-y-0.5">
                    {report.stockDrift.map((d) => (
                      <p
                        key={`${d.itemId}-${d.locationId}`}
                        className="text-xs text-muted-foreground"
                      >
                        «{d.itemName}» на «{d.location}»: остаток {d.stockQuantity}, по журналу{" "}
                        {d.journalQuantity}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {report.negativeStock > 0 && (
                <p className="text-xs text-destructive">
                  Отрицательных остатков: <Badge variant="outline">{report.negativeStock}</Badge>
                </p>
              )}

              {report.orphanOperations > 0 && (
                <p className="text-xs text-muted-foreground">
                  Операций без строк: <Badge variant="outline">{report.orphanOperations}</Badge>
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
              Остатки будут приведены к сумме по журналу операций. Первичен именно журнал:
              каждая его строка объясняет, почему количество изменилось, тогда как подгонка
              журнала под остатки означала бы придумывание событий, которых не было.
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
