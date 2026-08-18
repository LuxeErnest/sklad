/**
 * Резервное копирование.
 *
 * Прежний файл содержал ещё менеджер настроек базы и «систему миграций».
 * Настройки хранились в localStorage и ни на что не влияли: путь к базе был
 * захардкожен в пуле. Миграции печатали «no changes needed» и ничего не
 * делали. И то и другое убрано: путь и версия схемы теперь целиком в Rust,
 * миграции идут по `user_version`.
 */

import { invoke } from "@tauri-apps/api/core";

export interface BackupInfo {
  name: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
}

export class DatabaseBackup {
  /**
   * Создаёт резервную копию.
   *
   * Снимок делается через `VACUUM INTO` на стороне Rust: копировать файл базы
   * средствами файловой системы нельзя, потому что в режиме WAL часть данных
   * находится в отдельном журнале и копия одного файла оказалась бы неполной.
   */
  public static async createBackup(): Promise<string> {
    const path = await invoke<string>("create_backup");
    console.log(`✅ Резервная копия создана: ${path}`);
    return path;
  }

  public static async listBackups(): Promise<BackupInfo[]> {
    const rows = await invoke<
      { name: string; path: string; size_bytes: number; created_at: string }[]
    >("list_backups");
    return (rows || []).map((r) => ({
      name: r.name,
      path: r.path,
      sizeBytes: r.size_bytes,
      createdAt: r.created_at,
    }));
  }

  /**
   * Восстанавливает базу и перезапускает приложение.
   *
   * Перезапуск обязателен: после подмены файла открытое соединение и всё, что
   * прочитано в память, уже недостоверны.
   */
  public static async restoreBackup(backupPath: string): Promise<void> {
    await invoke("restore_db_backup", { backupPath });
    await invoke("restart_app");
  }

  public static async getDatabasePath(): Promise<string> {
    return await invoke<string>("get_db_path");
  }
}
