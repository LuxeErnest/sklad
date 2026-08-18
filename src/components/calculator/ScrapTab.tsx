import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TabsContent } from "@/components/ui/tabs";
import { FileText, Trash2, XCircle } from "lucide-react";
import * as XLSX from "xlsx";

interface ScrapRecord {
  id: number;
  componentName: string;
  quantity: number;
  scrappedAt: string;
  location?: string | null;
  reason?: string | null;
}

interface ScrapTabProps {
  scrappedItems: ScrapRecord[];
}

/**
 * Вкладка списаний.
 *
 * Кнопка очистки списка отсюда убрана раньше: списания — часть журнала, из
 * которого выводятся остатки, и удаление записей рассогласовало бы склад.
 */
export const ScrapTab = ({ scrappedItems }: ScrapTabProps) => (
  <TabsContent value="scrap" className="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <XCircle className="h-5 w-5" />
          Списанные товары
        </CardTitle>
        <CardDescription>
          Отчет о списанных товарах с возможностью скачивания в Excel
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {scrappedItems.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <XCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Нет списанных товаров</p>
          </div>
        ) : (
          <>
            <div className="rounded-lg border">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left font-medium">Товар</th>
                    <th className="p-3 text-left font-medium">Когда списано</th>
                    <th className="p-3 text-left font-medium">Откуда</th>
                    <th className="p-3 text-right font-medium">Количество</th>
                  </tr>
                </thead>
                <tbody>
                  {scrappedItems.map((item, index) => (
                    <tr key={index} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-3">{item.componentName}</td>
                      <td className="p-3 text-muted-foreground">
                        {new Date(item.scrappedAt).toLocaleString('ru-RU')}
                      </td>
                      <td className="p-3 text-muted-foreground">{item.location}</td>
                      <td className="p-3 text-right font-medium">{item.quantity} шт.</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/*
              Кнопка «Очистить список» убрана: списания — часть
              журнала, из которого выводятся остатки, и удаление
              записей рассогласовало бы склад. Ошибочное списание
              исправляется обратной операцией, а не забыванием.
            */}
            <div className="flex gap-2">
              <Button
                className="flex-1 transition-all duration-200 hover:scale-105"
                onClick={() => {
                  // Download Excel report
                  const excelData = scrappedItems.map(item => ({
                    'Товар': item.componentName,
                    'Когда списано': new Date(item.scrappedAt).toLocaleString('ru-RU'),
                    'Откуда': item.location,
                    'Количество (шт.)': item.quantity
                  }));
                  
                  const wb = XLSX.utils.book_new();
                  const ws = XLSX.utils.json_to_sheet(excelData);
                  
                  ws['!cols'] = [
                    { wch: 30 },
                    { wch: 20 },
                    { wch: 20 },
                    { wch: 15 }
                  ];
                  
                  XLSX.utils.book_append_sheet(wb, ws, 'Списания');
                  const fileName = `scrapped_items_${new Date().toISOString().split('T')[0]}.xlsx`;
                  XLSX.writeFile(wb, fileName);
                }}
              >
                <FileText className="h-4 w-4 mr-2" />
                Скачать отчет Excel
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  </TabsContent>
);
