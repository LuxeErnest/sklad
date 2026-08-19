import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle, XCircle, HardDrive, AlertTriangle, Activity } from "lucide-react";
import { useState, useEffect } from "react";
import { getDatabaseHealth } from "@/lib/db";
import { toast } from "@/hooks/use-toast";

export const StatusCard = () => {
  const [status, setStatus] = useState<'healthy' | 'error' | 'browser_mode' | 'loading'>('loading');
  const [message, setMessage] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const health = await getDatabaseHealth();
      setStatus(health.status);
      setMessage(health.message);
    } catch (error) {
      setStatus('error');
      setMessage('Не удалось получить статус');
      console.error('Failed to load status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = () => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'browser_mode':
        return <HardDrive className="h-5 w-5 text-blue-500" />;
      default:
        return <Activity className="h-5 w-5 text-muted-foreground animate-pulse" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'healthy':
        return 'Работает нормально';
      case 'error':
        return 'Ошибка';
      case 'browser_mode':
        return 'Режим браузера';
      default:
        return 'Загрузка...';
    }
  };

  const getStatusColor = (): React.ComponentProps<typeof Badge>["variant"] => {
    switch (status) {
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

  return (
    <Card className="border-dashed">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base">Статус</CardTitle>
        <CardDescription>Состояние системы</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <Badge variant={getStatusColor()}>
              {getStatusText()}
            </Badge>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={loadStatus}
            disabled={loading}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        {message && (
          <p className="text-xs text-muted-foreground">{message}</p>
        )}
      </CardContent>
    </Card>
  );
};
