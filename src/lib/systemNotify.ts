/**
 * Уведомления в центр уведомлений Windows.
 *
 * Всплывающее окно внутри приложения видно, только пока приложение на переднем
 * плане. Сообщение о том, что операция прошла, человек должен увидеть и тогда,
 * когда смотрит в другое окно, — поэтому сообщения об успехе уходят туда же,
 * куда и остальные системные оповещения.
 *
 * Сообщения об ошибках здесь не участвуют: их показывает само приложение, сразу
 * и на месте. Ошибку нельзя откладывать до того момента, когда человек заглянет
 * в центр уведомлений.
 */

/** Разрешение спрашивается один раз за запуск, а не на каждое сообщение. */
let разрешение: Promise<boolean> | null = null;

async function разрешеноЛи(): Promise<boolean> {
  if (!разрешение) {
    разрешение = (async () => {
      try {
        const { isPermissionGranted, requestPermission } = await import(
          "@tauri-apps/plugin-notification"
        );
        if (await isPermissionGranted()) return true;
        return (await requestPermission()) === "granted";
      } catch {
        // Вне приложения (например, в браузере) плагина нет — это не ошибка.
        return false;
      }
    })();
  }
  return разрешение;
}

/**
 * Отправляет системное уведомление.
 *
 * Ничего не бросает: неудача с оповещением не должна ломать действие, которое
 * человек только что успешно выполнил.
 */
export async function notifySystem(title: string, body?: string): Promise<boolean> {
  try {
    if (!(await разрешеноЛи())) return false;
    const { sendNotification } = await import("@tauri-apps/plugin-notification");
    sendNotification({ title, body });
    return true;
  } catch {
    return false;
  }
}
