import Database from "@tauri-apps/plugin-sql";

interface ConnectionPool {
  connections: Database[];
  maxConnections: number;
  availableConnections: Database[];
  activeConnections: Set<Database>;
}

class DatabasePool {
  private pool: ConnectionPool;
  private config: { databasePath: string };
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  constructor(maxConnections = 3) { // Reduced for SQLite
    this.pool = {
      connections: [],
      maxConnections,
      availableConnections: [],
      activeConnections: new Set()
    };
    this.config = { databasePath: 'app.db' };
  }

  async initialize() {
    if (this.isInitialized) {
      return this.initializationPromise;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._doInitialize();
    return this.initializationPromise;
  }

  private async _doInitialize() {
    console.log('🏊 Initializing database connection pool...');
    
    try {
      // Create only one connection for SQLite to avoid locking issues
      const db = await Database.load(`sqlite:${this.config.databasePath}`);
      this.pool.connections.push(db);
      this.pool.availableConnections.push(db);
      
      this.isInitialized = true;
      console.log(`✅ Pool initialized with ${this.pool.connections.length} connection`);
    } catch (error) {
      console.error('❌ Failed to initialize database pool:', error);
      this.initializationPromise = null;
      throw error;
    }
  }

  async acquireConnection(): Promise<Database> {
    // Ensure pool is initialized
    if (!this.isInitialized) {
      await this.initialize();
    }

    // For SQLite, we'll use a single connection with proper locking
    if (this.pool.availableConnections.length === 0) {
      // Wait for connection to become available with exponential backoff
      let attempts = 0;
      let delay = 10;
      while (this.pool.availableConnections.length === 0 && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, delay));
        attempts++;
        delay = Math.min(delay * 1.1, 100); // Exponential backoff with max 100ms
      }

      if (this.pool.availableConnections.length === 0) {
        throw new Error('Database connection not available - too many concurrent operations');
      }
    }

    const connection = this.pool.availableConnections.pop()!;
    this.pool.activeConnections.add(connection);
    return connection;
  }

  releaseConnection(connection: Database) {
    if (this.pool.activeConnections.has(connection)) {
      this.pool.activeConnections.delete(connection);
      this.pool.availableConnections.push(connection);
    }
  }

  async executeWithConnection<T>(
    operation: (db: Database) => Promise<T>
  ): Promise<T> {
    const connection = await this.acquireConnection();
    try {
      return await operation(connection);
    } finally {
      this.releaseConnection(connection);
    }
  }

  /**
   * Закрывает все соединения и сбрасывает пул.
   *
   * Нужно перед подменой файла базы (восстановление из копии): открытые
   * дескрипторы и незакрытый журнал WAL перетрут восстановленные данные.
   */
  async closeAll(): Promise<void> {
    for (const connection of this.pool.connections) {
      try {
        await connection.close();
      } catch (error) {
        console.warn('Не удалось закрыть соединение:', error);
      }
    }
    this.pool.connections = [];
    this.pool.availableConnections = [];
    this.pool.activeConnections.clear();
    this.isInitialized = false;
    this.initializationPromise = null;
  }

  getStats() {
    return {
      totalConnections: this.pool.connections.length,
      availableConnections: this.pool.availableConnections.length,
      activeConnections: this.pool.activeConnections.size,
      maxConnections: this.pool.maxConnections
    };
  }
}

export const dbPool = new DatabasePool(5);


