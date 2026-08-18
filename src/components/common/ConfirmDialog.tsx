import { useCallback, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmOptions {
  title: string;
  description?: string;
  /** Надпись на подтверждающей кнопке. По умолчанию «Подтвердить». */
  confirmLabel?: string;
  /** Красная кнопка для необратимых действий. */
  destructive?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

/**
 * Подтверждение действия без блокировки окна.
 *
 * Заменяет нативный `confirm`: в webview он останавливает весь интерфейс и
 * выглядит чужеродно. Вызов остаётся таким же по форме — `await confirm(...)`
 * возвращает да или нет, — поэтому места вызова почти не меняются.
 *
 * ```tsx
 * const { confirm, dialog } = useConfirm();
 * if (!(await confirm({ title: "Удалить?" }))) return;
 * // ...в разметке: {dialog}
 * ```
 */
export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    []
  );

  const settle = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
  };

  const dialog = (
    <AlertDialog open={!!pending} onOpenChange={(open) => !open && settle(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
          {pending?.description && (
            <AlertDialogDescription>{pending.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>Отмена</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => settle(true)}
            className={pending?.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
          >
            {pending?.confirmLabel ?? "Подтвердить"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, dialog };
}
