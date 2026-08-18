import React, { Component, ErrorInfo, ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Copy, ChevronLeft, Home, RefreshCw } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorStack: string | null;
  previousPath: string | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    errorStack: null,
    previousPath: null,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    // Сохраняем предыдущий путь перед ошибкой
    const previousPath = sessionStorage.getItem('previousPath') || document.referrer || '/';
    
    return { 
      hasError: true, 
      error,
      errorStack: error.stack || null,
      previousPath,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("❌ ErrorBoundary caught an error:", error, errorInfo);
    
    // Сохраняем информацию об ошибке в localStorage для отладки
    try {
      const errorData = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        path: window.location.pathname,
        userAgent: navigator.userAgent,
      };
      localStorage.setItem('lastError', JSON.stringify(errorData));
    } catch (e) {
      console.error('Failed to save error to localStorage:', e);
    }

    // Вызываем callback, если он предоставлен
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    this.setState({ errorInfo });
  }

  // Маршрут живёт в хеше (HashRouter), поэтому путь берётся оттуда, а не из
  // pathname: в собранном приложении pathname указывает на файл, а не на экран.
  private static currentRoute() {
    return window.location.hash.replace(/^#/, '') || '/';
  }

  componentDidMount() {
    sessionStorage.setItem('previousPath', ErrorBoundary.currentRoute());
  }

  componentDidUpdate() {
    if (!this.state.hasError) {
      sessionStorage.setItem('previousPath', ErrorBoundary.currentRoute());
    }
  }

  private handleReset = () => {
    this.setState({ 
      hasError: false, 
      error: null,
      errorInfo: null,
      errorStack: null,
      showDetails: false,
    });
  };

  /**
   * Возврат без перезагрузки приложения.
   *
   * Раньше здесь присваивался location.href, то есть страница загружалась
   * заново со всеми потерями. Смена хеша меняет только маршрут, а сброс
   * состояния снимает экран ошибки.
   */
  private handleGoBack = () => {
    const previous = this.state.previousPath;
    if (previous && previous !== ErrorBoundary.currentRoute()) {
      window.location.hash = previous.startsWith('#') ? previous : `#${previous}`;
    } else if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.hash = '#/';
    }
    this.handleReset();
  };

  private handleGoHome = () => {
    window.location.hash = '#/';
    this.handleReset();
  };

  private handleCopyError = async () => {
    const errorText = `Ошибка: ${this.state.error?.message || 'Неизвестная ошибка'}\n\n` +
      `Стек ошибки:\n${this.state.errorStack || 'Недоступен'}\n\n` +
      `Информация о компоненте:\n${this.state.errorInfo?.componentStack || 'Недоступна'}\n\n` +
      `Путь: ${window.location.pathname}\n` +
      `Время: ${new Date().toLocaleString('ru-RU')}`;
    
    try {
      await navigator.clipboard.writeText(errorText);
      alert('Информация об ошибке скопирована в буфер обмена');
    } catch (e) {
      // Fallback для старых браузеров
      const textArea = document.createElement('textarea');
      textArea.value = errorText;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        alert('Информация об ошибке скопирована в буфер обмена');
      } catch (err) {
        console.error('Failed to copy:', err);
      }
      document.body.removeChild(textArea);
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <CardTitle>Произошла ошибка</CardTitle>
              </div>
              <CardDescription>
                При загрузке страницы произошла ошибка. Вы можете вернуться на предыдущую вкладку или попробовать исправить проблему.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Основное сообщение об ошибке */}
              {this.state.error && (
                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md">
                  <p className="text-sm font-semibold text-destructive mb-2">
                    Сообщение об ошибке:
                  </p>
                  <p className="text-sm font-mono text-foreground break-words">
                    {this.state.error.message || 'Неизвестная ошибка'}
                  </p>
                </div>
              )}

              {/* Детальная информация (сворачиваемая) */}
              <Collapsible open={this.state.showDetails} onOpenChange={(open) => this.setState({ showDetails: open })}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full">
                    {this.state.showDetails ? 'Скрыть' : 'Показать'} детальную информацию
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="p-4 bg-muted rounded-md space-y-3">
                    {this.state.errorStack && (
                      <div>
                        <p className="text-xs font-semibold mb-1">Стек ошибки:</p>
                        <pre className="text-xs font-mono bg-background p-2 rounded overflow-auto max-h-40">
                          {this.state.errorStack}
                        </pre>
                      </div>
                    )}
                    {this.state.errorInfo?.componentStack && (
                      <div>
                        <p className="text-xs font-semibold mb-1">Информация о компоненте:</p>
                        <pre className="text-xs font-mono bg-background p-2 rounded overflow-auto max-h-40">
                          {this.state.errorInfo.componentStack}
                        </pre>
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      <p><strong>Путь:</strong> {window.location.pathname}</p>
                      <p><strong>Время:</strong> {new Date().toLocaleString('ru-RU')}</p>
                      {this.state.previousPath && (
                        <p><strong>Предыдущий путь:</strong> {this.state.previousPath}</p>
                      )}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Кнопки действий */}
              <div className="flex flex-wrap gap-2">
                <Button 
                  onClick={this.handleGoBack} 
                  variant="outline"
                  className="flex-1 min-w-[140px]"
                >
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Назад
                </Button>
                <Button 
                  onClick={this.handleReset} 
                  variant="outline"
                  className="flex-1 min-w-[140px]"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Попробовать снова
                </Button>
                <Button 
                  onClick={this.handleCopyError}
                  variant="outline"
                  className="flex-1 min-w-[140px]"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Копировать ошибку
                </Button>
                <Button 
                  onClick={this.handleGoHome}
                  className="flex-1 min-w-[140px]"
                >
                  <Home className="h-4 w-4 mr-2" />
                  На главную
                </Button>
              </div>

              {/* Подсказка */}
              <div className="p-3 bg-muted rounded-md">
                <p className="text-xs text-muted-foreground">
                  💡 <strong>Совет:</strong> Если ошибка повторяется, скопируйте информацию об ошибке и обратитесь к разработчику. 
                  Информация также сохранена в localStorage для отладки.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
