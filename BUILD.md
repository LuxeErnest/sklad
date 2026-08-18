# Инструкция по сборке проекта

## Быстрая сборка

### 1. Сборка только фронтенда (веб-версия)

```bash
npm run build
```

Результат: папка `dist/` с собранными файлами

---

### 2. Полная сборка Tauri приложения

**Важно:** Для сборки Tauri приложения нужен установленный Rust.

#### Шаг 1: Проверка Rust

```powershell
# Проверьте, установлен ли Rust
cargo --version
```

Если Rust не установлен:
- Скачайте и установите с https://rustup.rs/
- Или выполните: `winget install Rustlang.Rustup`

#### Шаг 2: Добавление Cargo в PATH (если нужно)

Если `cargo` не найден, добавьте в PATH для текущей сессии:

```powershell
$env:PATH += ";$env:USERPROFILE\.cargo\bin"
```

#### Шаг 3: Сборка приложения

```bash
npm run tauri build
```

Эта команда:
1. Соберет фронтенд (`npm run build`)
2. Скомпилирует Rust код
3. Создаст исполняемый файл и установщики

**Результат:**
- Исполняемый файл: `src-tauri\target\release\app.exe`
- MSI установщик: `src-tauri\target\release\bundle\msi\Sklad_1.0.0_x64_en-US.msi`
- NSIS установщик: `src-tauri\target\release\bundle\nsis\Sklad_1.0.0_x64-setup.exe`

---

## Дополнительные команды

### Development режим (с hot reload)

```bash
npm run tauri dev
```

### Только фронтенд в dev режиме

```bash
npm run dev
```

### Проверка кода (линтер)

```bash
npm run lint
```

---

## Решение проблем

### Проблема: "cargo: program not found"

**Решение:**
1. Установите Rust с https://rustup.rs/
2. Перезапустите терминал
3. Или добавьте в PATH: `$env:PATH += ";$env:USERPROFILE\.cargo\bin"`

### Проблема: Долгая первая сборка

**Причина:** Rust компилирует все зависимости в первый раз  
**Решение:** Это нормально, последующие сборки будут быстрее

### Проблема: Ошибки компиляции Rust

**Решение:**
1. Обновите Rust: `rustup update`
2. Проверьте версию: `rustc --version` (нужна 1.70+)
3. Очистите кэш: `cd src-tauri && cargo clean`

---

## Оптимизация сборки

### Быстрая сборка (без оптимизаций, для тестирования)

```bash
cd src-tauri
cargo build
```

### Release сборка (оптимизированная, для распространения)

```bash
cd src-tauri
cargo build --release
```

Или через npm:
```bash
npm run tauri build
```

---

## Структура результатов сборки

```
src-tauri/
  target/
    release/
      app.exe                    # Исполняемый файл
      bundle/
        msi/
          Sklad_1.0.0_x64_en-US.msi    # Windows Installer
        nsis/
          Sklad_1.0.0_x64-setup.exe    # NSIS установщик
```

---

## Автоматизация сборки

### Скрипт для быстрой сборки (PowerShell)

Создайте файл `build.ps1`:

```powershell
# Добавляем Cargo в PATH
$env:PATH += ";$env:USERPROFILE\.cargo\bin"

# Проверяем наличие cargo
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Host "Ошибка: Rust не установлен. Установите с https://rustup.rs/" -ForegroundColor Red
    exit 1
}

# Собираем проект
Write-Host "Начинаем сборку..." -ForegroundColor Green
npm run tauri build

if ($LASTEXITCODE -eq 0) {
    Write-Host "Сборка завершена успешно!" -ForegroundColor Green
} else {
    Write-Host "Ошибка при сборке!" -ForegroundColor Red
}
```

Запуск:
```powershell
.\build.ps1
```
