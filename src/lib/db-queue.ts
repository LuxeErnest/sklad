interface QueuedOperation {
  id: string;
  operation: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  priority: number;
  timestamp: number;
}

class DatabaseOperationQueue {
  private queue: QueuedOperation[] = [];
  private processing = false;
  private maxConcurrent = 1; // SQLite doesn't handle concurrent writes well
  private currentOperations = 0;

  async addOperation<T>(
    operation: () => Promise<T>,
    priority: number = 0
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const queuedOp: QueuedOperation = {
        id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        operation,
        resolve,
        reject,
        priority,
        timestamp: Date.now()
      };

      // Insert operation in priority order
      const insertIndex = this.queue.findIndex(op => op.priority < priority);
      if (insertIndex === -1) {
        this.queue.push(queuedOp);
      } else {
        this.queue.splice(insertIndex, 0, queuedOp);
      }

      console.log(`📝 Operation queued: ${queuedOp.id} (priority: ${priority}, queue size: ${this.queue.length})`);
      
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing || this.currentOperations >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    console.log(`🔄 Processing queue (${this.queue.length} operations pending)`);

    while (this.queue.length > 0 && this.currentOperations < this.maxConcurrent) {
      const operation = this.queue.shift();
      if (!operation) break;

      this.currentOperations++;
      console.log(`⚡ Executing operation: ${operation.id}`);

      try {
        const result = await operation.operation();
        operation.resolve(result);
        console.log(`✅ Operation completed: ${operation.id}`);
      } catch (error) {
        console.error(`❌ Operation failed: ${operation.id}`, error);
        operation.reject(error);
      } finally {
        this.currentOperations--;
        // Minimal delay to avoid SQLite busy without blocking mass add
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    this.processing = false;

    if (this.queue.length > 0) {
      setTimeout(() => this.processQueue(), 20);
    }
  }

  getQueueStats() {
    return {
      queueLength: this.queue.length,
      currentOperations: this.currentOperations,
      maxConcurrent: this.maxConcurrent,
      processing: this.processing
    };
  }

  clearQueue() {
    console.log(`🧹 Clearing ${this.queue.length} queued operations`);
    this.queue.forEach(op => {
      op.reject(new Error('Operation cancelled - queue cleared'));
    });
    this.queue = [];
  }

  // Wait for all operations to complete
  async waitForCompletion(): Promise<void> {
    return new Promise((resolve) => {
      const checkCompletion = () => {
        if (this.queue.length === 0 && this.currentOperations === 0 && !this.processing) {
          resolve();
        } else {
          setTimeout(checkCompletion, 50);
        }
      };
      checkCompletion();
    });
  }
}

export const dbQueue = new DatabaseOperationQueue();
