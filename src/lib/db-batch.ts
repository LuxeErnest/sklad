interface BatchOperation {
  id: string;
  operation: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

interface BatchConfig {
  maxBatchSize: number;
  maxWaitTime: number; // milliseconds
  priority: number;
}

class DatabaseBatchProcessor {
  private batches = new Map<string, BatchOperation[]>();
  private timers = new Map<string, NodeJS.Timeout>();
  private configs = new Map<string, BatchConfig>();

  constructor() {
    // Configure different batch types
    this.configs.set('components', {
      maxBatchSize: 10,
      maxWaitTime: 100,
      priority: 1
    });

    this.configs.set('paths', {
      maxBatchSize: 20,
      maxWaitTime: 50,
      priority: 2
    });

    this.configs.set('groups', {
      maxBatchSize: 20,
      maxWaitTime: 50,
      priority: 2
    });
  }

  async addToBatch<T>(
    batchType: string,
    operation: () => Promise<T>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const config = this.configs.get(batchType) || {
        maxBatchSize: 10,
        maxWaitTime: 100,
        priority: 0
      };

      const operationId = `${batchType}_${Date.now()}_${Math.random()}`;
      const batchOperation: BatchOperation = {
        id: operationId,
        operation,
        resolve,
        reject
      };

      // Initialize batch if needed
      if (!this.batches.has(batchType)) {
        this.batches.set(batchType, []);
      }

      const batch = this.batches.get(batchType)!;
      batch.push(batchOperation);

      // Process batch if it's full
      if (batch.length >= config.maxBatchSize) {
        this.processBatch(batchType);
        return;
      }

      // Set timer for batch processing
      if (!this.timers.has(batchType)) {
        const timer = setTimeout(() => {
          this.processBatch(batchType);
        }, config.maxWaitTime);
        
        this.timers.set(batchType, timer);
      }
    });
  }

  private async processBatch(batchType: string) {
    const batch = this.batches.get(batchType);
    if (!batch || batch.length === 0) return;

    // Clear timer
    const timer = this.timers.get(batchType);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(batchType);
    }

    // Clear batch
    this.batches.delete(batchType);

    console.log(`🔄 Processing batch ${batchType} with ${batch.length} operations`);

    // Execute operations in parallel
    const promises = batch.map(async (op) => {
      try {
        const result = await op.operation();
        op.resolve(result);
        return { success: true, id: op.id };
      } catch (error) {
        op.reject(error);
        return { success: false, id: op.id, error };
      }
    });

    const results = await Promise.allSettled(promises);
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    
    console.log(`✅ Batch ${batchType} completed: ${successCount}/${batch.length} successful`);
  }

  // Flush all pending batches
  async flushAll() {
    const batchTypes = Array.from(this.batches.keys());
    console.log(`🔄 Flushing ${batchTypes.length} pending batches`);
    await Promise.all(batchTypes.map(type => this.processBatch(type)));
  }

  // Force flush a specific batch type
  async flushBatch(batchType: string) {
    if (this.batches.has(batchType)) {
      await this.processBatch(batchType);
    }
  }

  getStats() {
    const stats: Record<string, number> = {};
    for (const [type, batch] of this.batches.entries()) {
      stats[type] = batch.length;
    }
    return stats;
  }

  // Clear all pending operations (emergency reset)
  clearAll() {
    console.log('🧹 Clearing all pending batch operations');
    for (const [type, batch] of this.batches.entries()) {
      batch.forEach(op => {
        op.reject(new Error('Batch operation cancelled'));
      });
    }
    this.batches.clear();
    
    // Clear all timers
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}

export const batchProcessor = new DatabaseBatchProcessor();


