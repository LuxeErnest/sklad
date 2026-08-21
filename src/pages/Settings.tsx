import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import UniversalBackground from "@/components/UniversalBackground";
import Seo from "@/components/seo/Seo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { Label } from "@/components/ui/label";

import { Switch } from "@/components/ui/switch";
import { Settings, Database } from "lucide-react";
import { useState } from "react";
import { usePreference } from "@/lib/preferences";
import { StatusCard } from "@/components/database/StatusCard";
import { StorageCard } from "@/components/database/StorageCard";
import { BackupCard } from "@/components/database/BackupCard";
import { ArchiveCard } from "@/components/database/ArchiveCard";
import { IntegrityCard } from "@/components/database/IntegrityCard";
import { LocationsCard } from "@/components/database/LocationsCard";

const SettingsPage = () => {
  const [search, setSearch] = useState("");

  // Настройки берутся оттуда, где они на самом деле хранятся: тема — из
  // next-themes, остальное — из настроек интерфейса в localStorage. Раньше все
  // три жили в useState этой страницы: сбрасывались при переходе на другой
  // экран и ни на что не влияли.
  const [successToasts, setSuccessToasts] = usePreference("successToasts");

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

            <div>
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
                      <Label>Уведомления Windows об успешных действиях</Label>
                      <p className="text-sm text-muted-foreground">
                        Подтверждения после сохранения, списания и сборки приходят
                        в центр уведомлений Windows — их видно, даже когда окно
                        свёрнуто. Сообщения об ошибках показываются в приложении
                        всегда и этой настройке не подчиняются.
                      </p>
                    </div>
                    <Switch
                      checked={successToasts}
                      onCheckedChange={setSuccessToasts}
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

                  {/* 2. Хранилище */}
                  <StorageCard />

                  {/* 4. Резервные копии */}
                  <BackupCard />

                  {/* 5. Архив изделий */}
                  <ArchiveCard />

                  {/* 6. Целостность данных */}
                  <IntegrityCard />

                  {/* 7. Места хранения */}
                  <LocationsCard />

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
                    Вернуть их имеет смысл только вместе с настоящей реализацией.
                  */}
                </div>
              </CardContent>
            </Card>

          </main>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
