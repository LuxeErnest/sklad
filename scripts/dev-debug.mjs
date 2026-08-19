#!/usr/bin/env node
/**
 * Запуск приложения с открытым портом отладки WebView2.
 *
 * Переменная окружения задаётся здесь, а не в строке npm-скрипта: на Windows
 * такая запись не работает без дополнительной зависимости, а ради одной
 * переменной её тащить незачем.
 *
 * После запуска приложение можно расспрашивать: npm run app -- text
 */

import { spawn } from "node:child_process";

const port = process.env.DEBUG_PORT ?? "9222";

const child = spawn("npm", ["run", "tauri", "dev"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  },
});

console.log(`Порт отладки: ${port}. Запросы к приложению: npm run app -- text`);

child.on("exit", (code) => process.exit(code ?? 0));
