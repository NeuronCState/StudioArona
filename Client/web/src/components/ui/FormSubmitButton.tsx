/**
 * FormSubmitButton — React 19 useFormStatus 驱动的提交按钮。
 *
 * 自动读取父级 <form action={...}> 的 pending 状态，
 * 无需每个 form 手动传 isPending prop。
 *
 * Usage:
 *   <form action={formAction}>
 *     <input name="title" />
 *     <FormSubmitButton>保存</FormSubmitButton>
 *   </form>
 */
import { type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Spinner } from "@javis/ui-kit";

interface FormSubmitButtonProps {
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function FormSubmitButton({
  children,
  disabled,
  className,
}: FormSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={
        className ??
        "inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 disabled:opacity-60"
      }
    >
      {pending ? <Spinner size="sm" /> : children}
    </button>
  );
}
