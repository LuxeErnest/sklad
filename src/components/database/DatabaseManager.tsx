import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { 
  Database, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Activity,
  HardDrive,
  Clock,
  Zap
} from "lucide-react";
import { 
  getDatabaseHealth, 
  clearAllCache, 
  getCacheStats, 
  emergencyReset,
  refreshComponents,
  refreshConfigurations,
  refreshDocuments,
  getQueueStats,
  waitForQueueCompletion
} from "@/lib/db";

interface DatabaseHealth {
  status: 'healthy' | 'error' | 'browser_mode';
  message: string;
  poolStats: {
    totalConnections: number;
    availableConnections: number;
    activeConnections: number;
    maxConnections: number;
  } | null;
  cacheStats: {
    size: number;
    keys: string[];
  };
  batchStats: Record<string, number>;
  queueStats: {
    queueLength: number;
    currentOperations: number;
    maxConcurrent: number;
    processing: boolean;
  };
  timestamp: string;
}

export const DatabaseManager = () => {
  const [health, setHealth] = useState<DatabaseHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadHealth = async () => {
    setLoading(true);
    try {
      const healthData = await getDatabaseHealth();
      const queueStats = getQueueStats();
      setHealth({
        ...healthData,
        queueStats
      });
    } catch (error) {
      console.error('Failed to load database health:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить состояние базы данных",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refreshComponents(),
        refreshConfigurations(),
        refreshDocuments()
      ]);
      
      await loadHealth();
      
      toast({
        title: "Данные обновлены",
        description: "Все данные успешно обновлены из базы данных",
      });
    } catch (error) {
      console.error('Failed to refresh data:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось обновить данные",
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleClearCache = async () => {
    try {
      clearAllCache();
      await loadHealth();
      
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

  const handleEmergencyReset = async () => {
    try {
      const success = await emergencyReset();
      if (success) {
        await loadHealth();
        toast({
          title: "Экстренный сброс выполнен",
          description: "Все операции сброшены, система восстановлена",
        });
      } else {
        throw new Error('Emergency reset failed');
      }
    } catch (error) {
      console.error('Emergency reset failed:', error);
      toast({
        title: "Ошибка",
        description: "Экстренный сброс не удался",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    loadHealth();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = () => {
    if (!health) return <Activity className="h-5 w-5 text-muted-foreground" />;
    
    switch (health.status) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'browser_mode':
        return <HardDrive className="h-5 w-5 text-blue-500" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getStatusColor = () => {
    if (!health) return 'secondary';
    
    switch (health.status) {
      case 'healthy':
        return 'default';
      case 'error':
        return 'destructive';
      case 'browser_mode':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getStatusText = () => {
    if (!health) return 'Загрузка...';
    
    switch (health.status) {
      case 'healthy':
        return 'Работает нормально';
      case 'error':
        return 'Ошибка';
      case 'browser_mode':
        return 'Режим браузера';
      default:
        return 'Неизвестно';
    }
  };

  if (loading && !health) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Состояние базы данных
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Загрузка...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Состояние базы данных
          </CardTitle>
          <CardDescription>
            Мониторинг состояния базы данных и производительности
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusIcon()}
              <span className="font-medium">Статус:</span>
              <Badge variant={getStatusColor() as any}>
                {getStatusText()}
              </Badge>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={loadHealth}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Обновить
            </Button>
          </div>

          {health && (
            <>
              <p className="text-sm text-muted-foreground">{health.message}</p>
              
              <Separator />
              
              {/* Pool Stats */}
              {health.poolStats && (
                <div className="space-y-2">
                  <h4 className="font-medium flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Пул соединений
                  </h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Всего соединений:</span>
                      <span className="ml-2 font-medium">{health.poolStats.totalConnections}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Активных:</span>
                      <span className="ml-2 font-medium">{health.poolStats.activeConnections}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Доступных:</span>
                      <span className="ml-2 font-medium">{health.poolStats.availableConnections}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Максимум:</span>
                      <span className="ml-2 font-medium">{health.poolStats.maxConnections}</span>
                    </div>
                  </div>
                  
                  {/* Connection usage progress */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Использование соединений</span>
                      <span>{Math.round((health.poolStats.activeConnections / health.poolStats.maxConnections) * 100)}%</span>
                    </div>
                    <Progress 
                      value={(health.poolStats.activeConnections / health.poolStats.maxConnections) * 100} 
                      className="h-2"
                    />
                  </div>
                </div>
              )}
              
              <Separator />
              
              {/* Cache Stats */}
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <HardDrive className="h-4 w-4" />
                  Кэш
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Записей в кэше:</span>
                    <span className="ml-2 font-medium">{health.cacheStats.size}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Ключей:</span>
                    <span className="ml-2 font-medium">{health.cacheStats.keys.length}</span>
                  </div>
                </div>
                
                {health.cacheStats.keys.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Ключи кэша:</span>
                    <div className="flex flex-wrap gap-1">
                      {health.cacheStats.keys.slice(0, 10).map((key, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {key}
                        </Badge>
                      ))}
                      {health.cacheStats.keys.length > 10 && (
                        <Badge variant="outline" className="text-xs">
                          +{health.cacheStats.keys.length - 10} еще
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <Separator />
              
              {/* Queue Stats */}
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Очередь операций
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">В очереди:</span>
                    <span className="ml-2 font-medium">{health.queueStats.queueLength}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Выполняется:</span>
                    <span className="ml-2 font-medium">{health.queueStats.currentOperations}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Максимум:</span>
                    <span className="ml-2 font-medium">{health.queueStats.maxConcurrent}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Обработка:</span>
                    <span className="ml-2 font-medium">{health.queueStats.processing ? 'Да' : 'Нет'}</span>
                  </div>
                </div>
                
                {/* Queue progress */}
                {health.queueStats.queueLength > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Загрузка очереди</span>
                      <span>{Math.round((health.queueStats.currentOperations / health.queueStats.maxConcurrent) * 100)}%</span>
                    </div>
                    <Progress 
                      value={(health.queueStats.currentOperations / health.queueStats.maxConcurrent) * 100} 
                      className="h-2"
                    />
                  </div>
                )}
              </div>
              
              <Separator />
              
              {/* Batch Stats */}
              {Object.keys(health.batchStats).length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Пакетные операции
                  </h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {Object.entries(health.batchStats).map(([type, count]) => (
                      <div key={type}>
                        <span className="text-muted-foreground capitalize">{type}:</span>
                        <span className="ml-2 font-medium">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <Separator />
              
              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="transition-all duration-200 hover:scale-105"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                  Обновить данные
                </Button>
                
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleClearCache}
                  className="transition-all duration-200 hover:scale-105"
                >
                  <HardDrive className="h-4 w-4 mr-2" />
                  Очистить кэш
                </Button>
                
                {health.queueStats.queueLength > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await waitForQueueCompletion();
                        await loadHealth();
                        toast({
                          title: "Очередь завершена",
                          description: "Все операции в очереди выполнены",
                        });
                      } catch (error) {
                        console.error('Failed to wait for queue completion:', error);
                        toast({
                          title: "Ошибка",
                          description: "Не удалось дождаться завершения очереди",
                          variant: "destructive",
                        });
                      }
                    }}
                    className="transition-all duration-200 hover:scale-105"
                  >
                    <Clock className="h-4 w-4 mr-2" />
                    Дождаться завершения
                  </Button>
                )}
                
                {health.status === 'error' && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleEmergencyReset}
                    className="transition-all duration-200 hover:scale-105"
                  >
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Экстренный сброс
                  </Button>
                )}
              </div>
              
              <div className="text-xs text-muted-foreground">
                Последнее обновление: {new Date(health.timestamp).toLocaleString('ru-RU')}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DatabaseManager;