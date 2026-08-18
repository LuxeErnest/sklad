import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, HardDrive, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { getDatabaseHealth, clearAllCache } from "@/lib/db";
import { toast } from "@/hooks/use-toast";

export const CacheCard = () => {
  const [cacheStats, setCacheStats] = useState<{
    size: number;
    keys: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const loadStats = async () => {
    setLoading(true);
    try {
      const health = await getDatabaseHealth();
      setCacheStats(health.cacheStats);
    } catch (error) {
      console.error('Failed to load cache stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClearCache = async () => {
    try {
      clearAllCache();
      await loadStats();
      toast({
        title: "Кэш очищен",
        description: "Все кэшированные данные удалены",
      });
    } catch (error) {
      console.error('Failed to clear cache:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось очистить кэш",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="border-dashed">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <HardDrive className="h-4 w-4" />
          Кэш
        </CardTitle>
        <CardDescription>Управление кэшем</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Записей:</span>
            <span className="font-medium">{cacheStats?.size || 0}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Ключей:</span>
            <span className="font-medium">{cacheStats?.keys.length || 0}</span>
          </div>
          {cacheStats && cacheStats.keys.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {cacheStats.keys.slice(0, 3).map((key, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {key.length > 15 ? key.substring(0, 15) + '...' : key}
                </Badge>
              ))}
              {cacheStats.keys.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{cacheStats.keys.length - 3}
                </Badge>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={loadStats}
            disabled={loading}
            className="flex-1"
          >
            <RefreshCw className={`h-3 w-3 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Обновить
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleClearCache}
            className="flex-1"
          >
            <Trash2 className="h-3 w-3 mr-2" />
            Очистить
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
