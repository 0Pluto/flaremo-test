import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/i18n";

type UseClipboardOptions = {
  timeout?: number;
  successMessage?: string;
  errorMessage?: string;
};

export function useClipboard(options: UseClipboardOptions = {}) {
  const { timeout = 2000, successMessage, errorMessage } = options;
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success(successMessage ?? t("toast.linkCopied"));
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), timeout);
        return true;
      } catch {
        toast.error(errorMessage ?? t("share.copyFailed"));
        return false;
      }
    },
    [timeout, successMessage, errorMessage, t],
  );

  return { copied, copy };
}
