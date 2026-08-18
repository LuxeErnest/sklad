import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import UniversalBackground from "@/components/UniversalBackground";
import Seo from "@/components/seo/Seo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Settings, Database, Bell, Shield, Palette, Save } from "lucide-react";
import { useState } from "react";
import { StatusCard } from "@/components/database/StatusCard";
import { ConnectionPoolCard } from "@/components/database/ConnectionPoolCard";
import { CacheCard } from "@/components/database/CacheCard";
import { BackupCard } from "@/components/database/BackupCard";
import { ArchiveCard } from "@/components/database/ArchiveCard";
import { IntegrityCard } from "@/components/database/IntegrityCard";

const SettingsPage = () => {
  const [search, setSearch] = useState("");
  const [notifications, setNotifications] = useState(true);
  const [autoSave, setAutoSave] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  const summary = { 
    name: "Настройки", 
    quantity: 0, 
    location: "Система", 
    category: "Конфигурация" 
  };

  return (
    <div className="min-h-screen relative">
      <Seo 
        title="Настройки — конфигурация системы"
        description="Настройки системы управления складом. Конфигурация уведомлений, внешнего вида и безопасности."
        canonical="/settings"
      />

      <div className="absolute inset-0 -z-10">
        <UniversalBackground />
      </div>

      <div className="grid grid-cols-[auto_1fr]">
        <Sidebar />
        <div className="min-h-screen flex flex-col">
          <TopBar search={search} onSearch={setSearch} summary={summary} />
          
          <main className="container mx-auto px-4 py-6 space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <Settings className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold">Настройки</h1>
                <p className="text-muted-foreground">Конфигурация системы управления складом</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Общие настройки */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Общие настройки
                  </CardTitle>
                  <CardDescription>Основные параметры системы</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Автосохранение</Label>
                      <p className="text-sm text-muted-foreground">
                        Автоматически сохранять изменения
                      </p>
                    </div>
                    <Switch
                      checked={autoSave}
                      onCheckedChange={setAutoSave}
                    />
                  </div>
                  
                  <Separator />
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Уведомления</Label>
                      <p className="text-sm text-muted-foreground">
                        Получать уведомления о событиях
                      </p>
                    </div>
                    <Switch
                      checked={notifications}
                      onCheckedChange={setNotifications}
                    />
                  </div>
                  
                  <Separator />
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Темная тема</Label>
                      <p className="text-sm text-muted-foreground">
                        Использовать темную тему интерфейса
                      </p>
                    </div>
                    <Switch
                      checked={darkMode}
                      onCheckedChange={setDarkMode}
                    />
                  </div>
                </CardContent>
              </Card>


              {/* Настройки безопасности */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Безопасность
                  </CardTitle>
                  <CardDescription>Настройки безопасности и доступа</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="session-timeout">Таймаут сессии (минуты)</Label>
                    <Input
                      id="session-timeout"
                      type="number"
                      placeholder="30"
                      defaultValue="30"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="max-login-attempts">Максимум попыток входа</Label>
                    <Input
                      id="max-login-attempts"
                      type="number"
                      placeholder="5"
                      defaultValue="5"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Двухфакторная аутентификация</Label>
                      <p className="text-sm text-muted-foreground">
                        Требовать 2FA для входа
                      </p>
                    </div>
                    <Switch />
                  </div>
                  
                  <Button variant="outline" className="w-full">
                    Изменить пароль
                  </Button>
                </CardContent>
              </Card>

              {/* Настройки уведомлений */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    Уведомления
                  </CardTitle>
                  <CardDescription>Настройки уведомлений и оповещений</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Низкий запас</Label>
                      <p className="text-sm text-muted-foreground">
                        Уведомления о низком количестве
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Новые поставки</Label>
                      <p className="text-sm text-muted-foreground">
                        Уведомления о новых поставках
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Отчеты</Label>
                      <p className="text-sm text-muted-foreground">
                        Еженедельные отчеты по email
                      </p>
                    </div>
                    <Switch />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email">Email для уведомлений</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@company.com"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Database Management */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Управление базой данных
                </CardTitle>
                <CardDescription>
                  База данных: быстрые действия и настройки
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Grid 3x3 согласно макету */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* 1. Статус */}
                  <StatusCard />

                  {/* 2. Пул соединений */}
                  <ConnectionPoolCard />

                  {/* 3. Кэш */}
                  <CacheCard />

                  {/* 4. Резервные копии */}
                  <BackupCard />

                  {/* 5. Архив изделий */}
                  <ArchiveCard />

                  {/* 6. Целостность данных */}
                  <IntegrityCard />

                  {/* 7. Изменить местоположение БД */}
                  {/*
                    Убраны три неработавшие карточки:
                    — «Изменить местоположение БД»: писала путь в localStorage, но
                      db-pool.ts открывает захардкоженный 'app.db' и настройку не читает;
                    — «Внешняя база (сервер)»: сохраняла строку подключения, которую
                      никто не использует, а getDatabasePath() для type='external'
                      бросает 'External database not implemented yet';
                    — «Дополнить базу»: вызывала команду merge_sqlite_into_current,
                      которой в Rust не существует, то есть падала всегда.
                    Вернуть их имеет смысл вместе с реальной реализацией в Фазе 2.
                  */}
                </div>
              </CardContent>
            </Card>

            {/* Кнопки действий */}
            <div className="flex justify-end gap-4">
              <Button variant="outline" className="transition-all duration-200 hover:scale-105">
                Сбросить настройки
              </Button>
              <Button className="transition-all duration-200 hover:scale-105">
                <Save className="h-4 w-4 mr-2" />
                Сохранить все настройки
              </Button>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
