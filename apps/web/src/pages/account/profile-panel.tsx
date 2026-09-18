import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { TranslationKey, TranslationParams } from "@/i18n";

type ProfilePanelProps = {
  currentUsername: string;
  error: string | null;
  isPending: boolean;
  /** Absolute expiry of the viewer's reader seat (ISO string), or null when not a reader / no expiry. */
  readerExpiry?: string | null;
  setUsername: (value: string) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  username: string;
  onSubmit: () => Promise<void>;
};

export function ProfilePanel({
  currentUsername,
  error,
  isPending,
  readerExpiry,
  setUsername,
  t,
  username,
  onSubmit,
}: ProfilePanelProps) {
  const [open, setOpen] = useState(false);
  const wasPending = useRef(false);

  // Close only after a successful save: pending -> idle with no error.
  useEffect(() => {
    if (wasPending.current && !isPending && !error) setOpen(false);
    wasPending.current = isPending;
  }, [isPending, error]);

  const expiryDate = readerExpiry ? new Date(readerExpiry) : null;
  const expiryLabel =
    expiryDate && !Number.isNaN(expiryDate.getTime())
      ? expiryDate.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("auth.profileTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-sm">
            {currentUsername || "—"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("auth.usernameHandle")}
          </p>
          {expiryLabel && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("account.readerUntil", { date: expiryLabel })}
            </p>
          )}
        </div>
        <Button
          size="sm"
          type="button"
          variant="outline"
          onClick={() => setOpen(true)}
        >
          {t("common.edit")}
        </Button>
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("auth.profileTitle")}</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void onSubmit();
            }}
          >
            <label
              className="flex flex-col gap-1.5 text-sm font-medium"
              htmlFor="account-username"
            >
              {t("auth.usernameHandle")}
              <Input
                autoCapitalize="none"
                autoComplete="username"
                disabled={isPending}
                id="account-username"
                maxLength={30}
                minLength={3}
                pattern="[A-Za-z0-9_]+"
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            {error && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                disabled={isPending}
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button disabled={isPending} type="submit">
                {isPending ? t("auth.saving") : t("auth.saveUsername")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
