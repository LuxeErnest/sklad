/**
 * Выгрузка таблиц в Excel.
 *
 * Библиотека xlsx подключается только в момент нажатия кнопки, а не при старте
 * приложения. Раньше она импортировалась статически из вкладок статистики, а
 * те — из страницы, а страница — из App: получалось, что 284 кБ разбирались и
 * выполнялись при каждом запуске (около 90 мс) ради возможности, которой
 * пользуются изредка и только на одном экране.
 *
 * Три места выгрузки делали одно и то же разными словами — теперь здесь.
 */

/** Ширина колонок в символах, по порядку следования полей. */
export type ColumnWidths = number[];

/**
 * Значение ячейки. Пустое допускается: расположение и цена в номенклатуре
 * необязательны, и раньше в файл уезжали строки «null» и «undefined» — здесь
 * они превращаются в пустую ячейку.
 */
export type CellValue = string | number | null | undefined;

export async function exportRowsToXlsx(
  rows: Record<string, CellValue>[],
  options: { fileName: string; sheetName: string; widths?: ColumnWidths }
): Promise<void> {
  const XLSX = await import("xlsx");
  const filled = rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value ?? ""]))
  );
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(filled);
  if (options.widths) {
    sheet["!cols"] = options.widths.map((wch) => ({ wch }));
  }
  XLSX.utils.book_append_sheet(workbook, sheet, options.sheetName);
  XLSX.writeFile(workbook, options.fileName);
}

/** Имя файла с датой — общий вид для всех выгрузок. */
export function datedFileName(prefix: string): string {
  return `${prefix}_${new Date().toISOString().split("T")[0]}.xlsx`;
}
