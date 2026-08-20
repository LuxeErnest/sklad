/**
 * Типы, сгенерированные из Rust.
 *
 * Файлы в этой папке создаёт ts-rs при `cargo test` — править их руками
 * бессмысленно, они перезаписываются. Смысл в том, что описание данных
 * существует в одном месте: раньше те же структуры дублировались вручную в
 * db.ts, и любое изменение в Rust оставляло фронтенд с устаревшим типом,
 * о чём компилятор молчал.
 */

export type { ItemView } from "./ItemView";
export type { ItemInput } from "./ItemInput";
export type { StockAtLocation } from "./StockAtLocation";
export type { LocationView } from "./LocationView";
export type { CategoryView } from "./CategoryView";
export type { TagView } from "./TagView";
export type { OperationLineView } from "./OperationLineView";
export type { OperationInput } from "./OperationInput";
export type { OperationLineInput } from "./OperationLineInput";
export type { ConfigurationView } from "./ConfigurationView";
export type { ConfigurationComponent } from "./ConfigurationComponent";
export type { ConfigurationInput } from "./ConfigurationInput";
export type { ConfigurationComponentInput } from "./ConfigurationComponentInput";
export type { DocumentView } from "./DocumentView";
export type { DocumentInput } from "./DocumentInput";
export type { WarehouseStatistics } from "./WarehouseStatistics";
export type { IntegrityReport } from "./IntegrityReport";
export type { StockDrift } from "./StockDrift";
export type { MovementByKind } from "./MovementByKind";
export type { LocationValue } from "./LocationValue";
export type { DeadStockItem } from "./DeadStockItem";
export type { ItemId } from "./ItemId";
export type { LocationId } from "./LocationId";
export type { ConfigurationId } from "./ConfigurationId";
export type { OperationId } from "./OperationId";
export type { Quantity } from "./Quantity";
