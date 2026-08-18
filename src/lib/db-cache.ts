interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class DatabaseCache {
  private cache = new Map<string, CacheItem<any>>();
  private defaultTTL = 5 * 60 * 1000; // 5 minutes

  set<T>(key: string, data: T, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL
    });
  }

  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;

    // Check if expired
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.data as T;
  }

  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  invalidateComponent(componentId: number): void {
    this.invalidate(`component_${componentId}`);
    this.invalidate('components_list');
  }

  // Cache key generators
  static getComponentsKey(): string {
    return 'components_list';
  }

  static getComponentKey(id: number): string {
    return `component_${id}`;
  }

  static getComponentPathsKey(id: number): string {
    return `component_${id}_paths`;
  }

  static getComponentGroupsKey(id: number): string {
    return `component_${id}_groups`;
  }

  static getConfigurationsKey(): string {
    return 'configurations_list';
  }

  static getDocumentsKey(): string {
    return 'documents_list';
  }

  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

export const dbCache = new DatabaseCache();
export { DatabaseCache };


