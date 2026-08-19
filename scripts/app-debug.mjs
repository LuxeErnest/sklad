#!/usr/bin/env node
/**
 * Отладка запущенного приложения через протокол WebView2.
 *
 * Tauri не Electron, и обычные драйверы браузера к нему не подключаются. Зато
 * WebView2 умеет отдавать отладочный порт: если запустить приложение с
 * переменной WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222,
 * к нему можно подключиться по тому же протоколу, что и к Chrome.
 *
 * Запуск:
 *   npm run dev:debug        — приложение с открытым портом отладки
 *   npm run app -- <команда> — работа с уже запущенным приложением
 *
 * Команды:
 *   text                     весь видимый текст страницы
 *   route <путь>             перейти на экран, например: route /journal
 *   eval "<js>"              выполнить выражение (await поддерживается)
 *                            выражение должно быть в ОДНУ строку: перенос
 *                            теряется при передаче аргумента через npm.
 *                            Несколько инструкций — тогда нужен явный return.
 *                            Аргументы, начинающиеся со слеша, Git Bash
 *                            превращает в пути: такие вызовы делать из
 *                            PowerShell или через node напрямую.
 *   shot [файл]              снимок экрана в PNG
 *   errors [секунды]         следить за ошибками консоли
 *   tabs                     список вкладок и переключение по индексу
 *   click <индекс>           клик по вкладке настоящими событиями мыши
 *
 * Почему клик именно так: вкладки сделаны на Radix, они слушают события
 * указателя, а вызов .click() из скрипта их не переключает — на этом я уже
 * один раз ошибся и решил, что вкладки сломаны.
 */

import { writeFileSync } from "node:fs";

const PORT = process.env.DEBUG_PORT ?? 9222;
const HOST = `http://127.0.0.1:${PORT}`;
const DEV_URL = process.env.DEV_URL ?? "http://localhost:8080";

async function connect() {
  let targets;
  try {
    targets = await (await fetch(`${HOST}/json/list`)).json();
  } catch {
    console.error(
      `Приложение не отвечает на порту ${PORT}.\n` +
        `Запустите его так:  npm run dev:debug`
    );
    process.exit(1);
  }
  const page = targets.find((t) => t.type === "page");
  if (!page) {
    console.error("Открытая страница не найдена");
    process.exit(1);
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const events = [];

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
      return;
    }
    if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type)) {
      events.push(
        `[${msg.params.type}] ` +
          msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(" ")
      );
    }
    if (msg.method === "Runtime.exceptionThrown") {
      events.push("[исключение] " + (msg.params.exceptionDetails.exception?.description ?? ""));
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const i = ++id;
      pending.set(i, resolve);
      ws.send(JSON.stringify({ id: i, method, params }));
    });

  await new Promise((resolve) => (ws.onopen = resolve));
  await send("Runtime.enable");
  await send("Page.enable");

  /** Выполняет выражение и возвращает значение либо текст ошибки. */
  const evaluate = async (expression) => {
    const { result } = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result?.exceptionDetails) {
      return "ОШИБКА: " + (result.exceptionDetails.exception?.description ?? "");
    }
    return result?.result?.value;
  };

  return { send, evaluate, events, close: () => ws.close() };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const [command, ...args] = process.argv.slice(2);
const app = await connect();

switch (command) {
  case "text": {
    console.log(await app.evaluate("document.body.innerText"));
    break;
  }

  case "route": {
    // Git Bash на Windows превращает аргумент вида /journal в путь
    // C:/Program Files/Git/journal. Поэтому берём только последнюю часть и
    // принимаем маршрут как со слешем, так и без него.
    const raw = args[0] ?? "/";
    const path = "/" + raw.replace(/^.*[/\\]/, "");
    // Маршруты живут в хеше (HashRouter), поэтому переход — это смена хеша.
    await app.send("Page.navigate", { url: `${DEV_URL}/#${path}` });
    await wait(Number(args[1] ?? 6000));
    console.log("адрес:", await app.evaluate("location.href"));
    console.log(await app.evaluate("document.body.innerText.slice(0, 800)"));
    break;
  }

  case "eval": {
    // Выражение оборачивается в асинхронную функцию, а значит без return оно
    // ничего не отдаёт. Раньше это молча приводило к «undefined», и было не
    // отличить «выражение вернуло undefined» от «я забыл return». Поэтому
    // сначала пробуем как выражение, и только если оно не разобралось —
    // как набор инструкций.
    const source = args.join(" ");
    const looksLikeStatements = /return|;/.test(source);
    let value;
    if (!looksLikeStatements) {
      value = await app.evaluate(`(async () => (${source}))()`);
    } else {
      value = await app.evaluate(`(async () => { ${source} })()`);
      if (value === undefined && !/return/.test(source)) {
        console.error("подсказка: в выражении нет return, поэтому вернулось undefined");
      }
    }
    console.log(typeof value === "object" ? JSON.stringify(value, null, 2) : value);
    break;
  }

  case "shot": {
    const file = args[0] ?? "screenshot.png";
    const { result } = await app.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(file, Buffer.from(result.data, "base64"));
    console.log("сохранено:", file);
    break;
  }

  case "errors": {
    const seconds = Number(args[0] ?? 10);
    console.log(`слежу за консолью ${seconds} с…`);
    await wait(seconds * 1000);
    console.log(app.events.length ? app.events.join("\n") : "ошибок и предупреждений нет");
    break;
  }

  case "tabs": {
    console.log(
      await app.evaluate(
        `[...document.querySelectorAll('[role=tab]')]
          .map((t, i) => i + ': ' + t.textContent.trim() +
            (t.getAttribute('aria-selected') === 'true' ? ' [активна]' : ''))
          .join('\\n')`
      )
    );
    break;
  }

  case "click": {
    const index = Number(args[0] ?? 0);
    const boxes = JSON.parse(
      await app.evaluate(
        `JSON.stringify([...document.querySelectorAll('[role=tab]')].map(t => {
           const r = t.getBoundingClientRect();
           return { label: t.textContent.trim(), x: r.x + r.width / 2, y: r.y + r.height / 2 };
         }))`
      )
    );
    const box = boxes[index];
    if (!box) {
      console.error(`Вкладки №${index} нет. Доступно: ${boxes.length}`);
      break;
    }
    for (const type of ["mousePressed", "mouseReleased"]) {
      await app.send("Input.dispatchMouseEvent", {
        type,
        x: box.x,
        y: box.y,
        button: "left",
        clickCount: 1,
      });
    }
    await wait(1500);
    console.log(
      "активна:",
      await app.evaluate(
        `[...document.querySelectorAll('[role=tab]')]
          .find(t => t.getAttribute('aria-selected') === 'true')?.textContent.trim()`
      )
    );
    break;
  }

  default:
    console.log(
      [
        "Команды:",
        "  text              весь видимый текст страницы",
        "  route <путь>      перейти на экран (route /journal)",
        '  eval "<js>"       выполнить выражение, await поддерживается',
        "  shot [файл]       снимок экрана",
        "  errors [секунды]  следить за ошибками консоли",
        "  tabs              список вкладок",
        "  click <индекс>    клик по вкладке настоящими событиями мыши",
        "",
        "Приложение должно быть запущено через npm run dev:debug",
      ].join("\n")
    );
}

app.close();
