import { dbPool } from './db-pool';

// Database configuration and management
export interface DatabaseConfig {
  type: 'sqlite' | 'external';
  path?: string; // For SQLite
  connectionString?: string; // For external DB
  name: string;
}

// Default configuration
const DEFAULT_CONFIG: DatabaseConfig = {
  type: 'sqlite',
  path: 'app.db', // Will be in app data directory
  name: 'SkladDB'
};

// Configuration management
class DatabaseConfigManager {
  private config: DatabaseConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): DatabaseConfig {
    try {
      // Try to load from localStorage first
      const saved = localStorage.getItem('sklad_db_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch (error) {
      console.warn('Failed to load DB config from localStorage:', error);
    }
    
    return DEFAULT_CONFIG;
  }

  public getConfig(): DatabaseConfig {
    return this.config;
  }

  public updateConfig(newConfig: Partial<DatabaseConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();
  }

  private saveConfig(): void {
    try {
      localStorage.setItem('sklad_db_config', JSON.stringify(this.config));
    } catch (error) {
      console.warn('Failed to save DB config to localStorage:', error);
    }
  }

  public getDatabasePath(): string {
    if (this.config.type === 'sqlite') {
      return this.config.path || 'app.db';
    }
    throw new Error('External database not implemented yet');
  }

  public isExternal(): boolean {
    return this.config.type === 'external';
  }
}

export const dbConfig = new DatabaseConfigManager();

// Database migration utilities
export class DatabaseMigration {
  private static VERSION = 1;

  public static async checkAndMigrate(): Promise<void> {
    try {
      const currentVersion = await this.getCurrentVersion();
      if (currentVersion < this.VERSION) {
        console.log(`🔄 Migrating database from version ${currentVersion} to ${this.VERSION}`);
        await this.migrate(currentVersion, this.VERSION);
        await this.setVersion(this.VERSION);
        console.log('✅ Database migration completed');
      }
    } catch (error) {
      console.error('❌ Database migration failed:', error);
      throw error;
    }
  }

  private static async getCurrentVersion(): Promise<number> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke('get_db_version') as number;
      return result || 0;
    } catch {
      return 0;
    }
  }

  private static async setVersion(version: number): Promise<void> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('set_db_version', { version });
    } catch (error) {
      console.warn('Failed to set DB version:', error);
    }
  }

  private static async migrate(fromVersion: number, toVersion: number): Promise<void> {
    // Future migration logic will go here
    console.log(`Migration from ${fromVersion} to ${toVersion} - no changes needed`);
  }
}

export interface BackupInfo {
  name: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
}

// Database backup and restore utilities
export class DatabaseBackup {
  /**
   * Создаёт резервную копию через `VACUUM INTO`.
   *
   * Копировать файл базы средствами файловой системы нельзя: в режиме WAL
   * часть данных находится в `app.db-wal`, и копия одного `app.db` окажется
   * неполной. `VACUUM INTO` делает согласованный снимок силами самой SQLite.
   */
  public static async createBackup(): Promise<string> {
    const { invoke } = await import('@tauri-apps/api/core');
    const backupPath = await invoke<string>('prepare_backup_path');

    await dbPool.executeWithConnection(async (db) => {
      await db.execute('VACUUM INTO ?', [backupPath]);
    });

    await invoke('record_backup', { path: backupPath });
    console.log(`✅ Резервная копия создана: ${backupPath}`);
    return backupPath;
  }

  public static async listBackups(): Promise<BackupInfo[]> {
    const { invoke } = await import('@tauri-apps/api/core');
    const rows = await invoke<Array<{
      name: string; path: string; size_bytes: number; created_at: string;
    }>>('list_backups');
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
   * Соединение закрывается до подмены файла, иначе открытые дескрипторы и
   * журнал WAL перетрут восстановленные данные. Перезапуск обязателен: после
   * подмены файла все живущие в памяти соединения и кэши недостоверны.
   */
  public static async restoreBackup(backupPath: string): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/core');

    try {
      await dbPool.closeAll();
    } catch (error) {
      console.warn('Не удалось закрыть соединение перед восстановлением:', error);
    }

    await invoke('restore_db_backup', { backupPath });
    console.log(`✅ База восстановлена из: ${backupPath}`);
    await invoke('restart_app');
  }

  /** Путь к файлу базы — для отображения в настройках. */
  public static async getDatabasePath(): Promise<string> {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string>('get_db_path');
  }
}
