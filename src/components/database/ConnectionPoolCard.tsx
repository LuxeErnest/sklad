import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { RefreshCw, Zap } from "lucide-react";
import { useState, useEffect } from "react";
import { getDatabaseHealth } from "@/lib/db";

export const ConnectionPoolCard = () => {
  const [poolStats, setPoolStats] = useState<{
    totalConnections: number;
    availableConnections: number;
    activeConnections: number;
    maxConnections: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const loadStats = async () => {
    setLoading(true);
    try {
      const health = await getDatabaseHealth();
      setPoolStats(health.poolStats);
    } catch (error) {
      console.error('Failed to load pool stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!poolStats) {
    return (
      <Card className="border-dashed">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base">Пул соединений</CardTitle>
          <CardDescription>Управление подключениями</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <p className="text-xs text-muted-foreground">Недоступно в режиме браузера</p>
        </CardContent>
      </Card>
    );
  }

  const usagePercent = (poolStats.activeConnections / poolStats.maxConnections) * 100;

  return (
    <Card className="border-dashed">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4" />
          Пул соединений
        </CardTitle>
        <CardDescription>Управление подключениями</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Активных:</span>
            <span className="font-medium">{poolStats.activeConnections} / {poolStats.maxConnections}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Доступных:</span>
            <span className="font-medium">{poolStats.availableConnections}</span>
          </div>
          <Progress value={usagePercent} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Использование</span>
            <span>{Math.round(usagePercent)}%</span>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={loadStats}
          disabled={loading}
          className="w-full"
        >
          <RefreshCw className={`h-3 w-3 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </Button>
      </CardContent>
    </Card>
  );
};
