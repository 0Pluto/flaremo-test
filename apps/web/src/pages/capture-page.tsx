import {
  CAPTURE_MAX_DURATION_MS,
  CAPTURE_MAX_TEXT,
} from "@flaremo/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import { Loader2Icon, Mic, Square } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";
import { createMemo, getCaptureStatus, updateMemo } from "@/api";
import { authClient } from "@/auth-client";
import {
  CaptureButton,
  CapturePauseButton,
  type CaptureButtonState,
} from "@/components/capture/capture-button";
import { CaptureTranscribing } from "@/components/capture/capture-transcribing";
import { CaptureWaveform } from "@/components/capture/capture-waveform";
import { SubpageHeader } from "@/components/subpage-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import {
  CaptureController,
  captureIsActive,
} from "@/lib/audio-capture/controller";
import {
  CaptureDraftStore,
  captureDraftId,
  type LocalCapture,
  loadCapture,
  newLocalCapture,
} from "@/lib/audio-capture/local-session";
import { openMicrophone, type Microphone } from "@/lib/audio-capture/microphone";
import { createCaptureAudioSink } from "@/lib/audio-capture/encoder";
import {
  transcribeCapturedAudio,
  type BatchProgress,
} from "@/lib/audio-capture/batch";
import type { CaptureState } from "@/lib/audio-capture/types";
import { CaptureTranscriptAccumulator } from "@/lib/audio-capture/transcript";
import { vibrate } from "@/lib/haptics";
import { cn } from "@/lib/utils";

export function CapturePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const userId = session.data?.user.id ?? "";
  const draftId = useMemo(() => captureDraftId(userId), [userId]);
  const store = useMemo(() => new CaptureDraftStore(draftId), [draftId]);
  const status = useQuery({
    queryKey: ["capture-status", userId],
    queryFn: getCaptureStatus,
    staleTime: 30_000,
    retry: false,
  });
  const [controller] = useState(
    () =>
      new CaptureController({
        // The page keeps the live microphone handle for the waveform while
        // the controller owns its lifecycle (start/stop/dispose).
        microphone: async (onFrame, signal, interrupt) => {
          const mic = await openMicrophone(onFrame, signal, interrupt);
          micRef.current = mic;
          return mic;
        },
        status: getCaptureStatus,
        socket: () =>
          new WebSocket(
            `${location.origin.replace(/^http/, "ws")}/api/app/capture/ws`,
          ),
        // Batch ASR (rollout §3.3): used only when /status reports a batch
        // provider; the controller decides the mode per session.
        batch: {
          createSink: () => createCaptureAudioSink(),
          transcribe: (audio, input) =>
            transcribeCapturedAudio(audio, {
              language: input.language,
              startedAtMs: input.startedAtMs,
              onProgress: input.onProgress,
              signal: input.signal,
            }),
        },
      }),
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  const [local, setLocal] = useState(newLocalCapture);
  const [recovery, setRecovery] = useState<LocalCapture | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [review, setReview] = useState(false);
  // True for one beat when the live log hands over to the review form, so the
  // log can fade out instead of vanishing in a ternary hard cut (§2.3).
  const [logLeaving, setLogLeaving] = useState(false);
  // P2 wires batch-mode ASR here (rollout §2.3/§3.3); the skeleton style
  // ships now.
  const transcribing = snapshot.state === "transcribing";
  const transcribeProgress: BatchProgress | null = snapshot.transcribing;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [draftError, setDraftError] = useState(false);
  const [cleanupError, setCleanupError] = useState(false);
  const [now, setNow] = useState(Date.now());
  const savingRef = useRef(false);
  const savedRef = useRef(false);
  const savedMemoRef = useRef<Awaited<ReturnType<typeof createMemo>> | null>(
    null,
  );
  const submittedMemoRef = useRef<Parameters<typeof createMemo>[0] | null>(
    null,
  );
  const localRef = useRef(local);
  localRef.current = local;
  const transcript = useRef(new CaptureTranscriptAccumulator());
  const micRef = useRef<Microphone | null>(null);
  const getWaveform = useCallback(
    () => micRef.current?.getWaveform?.() ?? null,
    [],
  );
  const tail = useRef<HTMLDivElement>(null);
  const active = captureIsActive(snapshot.state);
  // Batch transcription keeps the session unsaved until it resolves; leaving
  // mid-flight cancels the attempt instead of losing it silently.
  const unsaved =
    active ||
    snapshot.state === "transcribing" ||
    review ||
    Boolean(recovery);
  const blocker = useBlocker({
    disabled: !unsaved,
    enableBeforeUnload: true,
    shouldBlockFn: () => !savedRef.current,
    withResolver: true,
  });
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadCapture(draftId).then((value) => {
      if (!cancelled) {
        if (value) store.markRecovered();
        setRecovery(value);
        setLoaded(true);
      }
    });
    const hidden = () => {
      if (document.hidden) controller.interrupt();
    };
    const pageHide = () => {
      controller.interrupt();
      controller.dispose();
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", pageHide);
    return () => {
      cancelled = true;
      controller.dispose();
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", pageHide);
      if (!savedRef.current && !savedMemoRef.current && localRef.current.text)
        void store.save(localRef.current).catch(() => undefined);
    };
  }, [controller, draftId, store]);

  useEffect(() => {
    if (!snapshot.startedAt) return;
    const text = transcript.current.sync(
      snapshot.sentences,
      snapshot.startedAt,
      snapshot.sentenceVersion,
    );
    setLocal((value) =>
      mergeCaptureSnapshot(
        value,
        text,
        snapshot.startedAt,
        snapshot.stoppedAt,
        snapshot.gap,
      ),
    );
    if (snapshot.state === "review") setReview(true);
  }, [
    snapshot.gap,
    snapshot.sentences,
    snapshot.sentenceVersion,
    snapshot.startedAt,
    snapshot.state,
    snapshot.stoppedAt,
  ]);

  useEffect(() => {
    if (!loaded || savedRef.current || (!local.text && !review)) return;
    const timer = window.setTimeout(
      () => {
        void store
          .save(local)
          .then((ok) => setDraftError(!ok))
          .catch(() => setDraftError(true));
      },
      review ? 250 : 500,
    );
    return () => window.clearTimeout(timer);
  }, [local, loaded, review, store]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  useEffect(() => {
    if (!snapshot.microphoneActive || !navigator.wakeLock) return;
    let cancelled = false;
    let lock: WakeLockSentinel | undefined;
    void navigator.wakeLock
      .request("screen")
      .then((value) => {
        if (cancelled) void value.release();
        else lock = value;
      })
      .catch(() =>
        toast.warning(t("capture.wakeLockFailed"), { duration: 6000 }),
      );
    return () => {
      cancelled = true;
      void lock?.release();
    };
  }, [snapshot.microphoneActive, t]);
  useEffect(() => {
    if (snapshot.partial || snapshot.sentenceVersion)
      tail.current?.scrollIntoView({ block: "nearest" });
  }, [snapshot.partial, snapshot.sentenceVersion]);

  // Recording → review: fade the live log out (animate-fade reversed, 140ms
  // ≤ the 320ms entrance budget) while the review form rises in.
  const previousStateRef = useRef<CaptureState>("idle");
  useEffect(() => {
    const wasActive = captureIsActive(previousStateRef.current);
    previousStateRef.current = snapshot.state;
    if (snapshot.state !== "review" || !wasActive) return;
    setLogLeaving(true);
    const timer = window.setTimeout(() => setLogLeaving(false), 160);
    return () => window.clearTimeout(timer);
  }, [snapshot.state]);

  const start = () => {
    vibrate(5);
    savedRef.current = false;
    setReview(false);
    setSaveError(false);
    setCleanupError(false);
    savedMemoRef.current = null;
    submittedMemoRef.current = null;
    transcript.current.reset();
    setLocal(newLocalCapture());
    void controller.start();
  };
  // Page-level Enter drives start/stop/resume while the page owns focus.
  // Space is deliberately unbound (scroll conflict); fields and buttons keep
  // their native Enter behavior, and open dialogs win.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLButtonElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      )
        return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      const state = controller.getSnapshot().state;
      if (state === "recording") {
        event.preventDefault();
        vibrate(5);
        void controller.stop();
      } else if (state === "paused") {
        event.preventDefault();
        controller.resume();
      } else if (
        (state === "idle" || state === "error") &&
        loaded &&
        status.data?.available
      ) {
        event.preventDefault();
        start();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [controller, loaded, start, status.data?.available]);
  const discard = async () => {
    const cleared = await store.clear();
    if (!cleared) {
      setDraftError(true);
      return;
    }
    savedRef.current = true;
    savedMemoRef.current = null;
    submittedMemoRef.current = null;
    transcript.current.reset();
    controller.reset();
    setReview(false);
    setRecovery(null);
    setLocal(newLocalCapture());
    setSaveError(false);
    setDraftError(false);
    setCleanupError(false);
  };
  const save = async () => {
    if (savingRef.current || !local.text.trim()) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(false);
    try {
      let memo = savedMemoRef.current;
      if (!memo) {
        const content = `# ${t("capture.title")}\n\n${t("capture.recordedAt")}: ${new Date(local.startedAt).toLocaleString()}\n\n${t("capture.duration")}: ${formatDuration(local.duration)}\n\n${local.gap ? `${t("capture.gap")}\n\n` : ""}---\n\n${local.text.trim()}`;
        const input: Parameters<typeof createMemo>[0] = {
          content,
          visibility: local.visibility,
          source: "voice",
          payload: {
            tags: Array.from(new Set(["voice", ...local.tags])),
            client_id: local.clientId,
          },
        };
        const previousInput = submittedMemoRef.current;
        submittedMemoRef.current = input;
        memo = await createOrReconcileCaptureMemo(input, previousInput);
        savedMemoRef.current = memo;
      }
      const cleared = await store.clear();
      if (!cleared) {
        setCleanupError(true);
        return;
      }
      savedRef.current = true;
      setDraftError(false);
      setCleanupError(false);
      vibrate(10);
      toast.success(t("capture.saveSucceeded"));
      await Promise.all(
        ["memos", "memo-stats", "tag-hierarchy"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
      await navigate({ to: "/memo/$memoId", params: { memoId: memo.id } });
    } catch {
      setSaveError(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const stopAndLeave = async () => {
    if (blocker.status !== "blocked" || leaving) return;
    const proceed = blocker.proceed;
    if (controller.getSnapshot().state === "transcribing")
      controller.cancelTranscription();
    const wasActive = captureIsActive(controller.getSnapshot().state);
    setLeaving(true);
    try {
      if (wasActive) {
        await controller.stop();
        if (captureIsActive(controller.getSnapshot().state)) {
          await new Promise<void>((resolve) => {
            const unsubscribe = controller.subscribe(() => {
              if (!captureIsActive(controller.getSnapshot().state)) {
                unsubscribe();
                resolve();
              }
            });
          });
        }
      }
      const finalSnapshot = controller.getSnapshot();
      const text = finalSnapshot.startedAt
        ? transcript.current.sync(
            finalSnapshot.sentences,
            finalSnapshot.startedAt,
          )
        : localRef.current.text;
      const value = wasActive
        ? mergeCaptureSnapshot(
            localRef.current,
            text,
            finalSnapshot.startedAt,
            finalSnapshot.stoppedAt,
            finalSnapshot.gap,
          )
        : localRef.current;
      localRef.current = value;
      if (value.text) {
        const persisted = await store.save(value).catch(() => false);
        setDraftError(!persisted);
        if (!persisted) {
          // Stay on the page so the author can retry saving or copy the
          // transcript; navigating away now would silently lose it.
          savedRef.current = false;
          return;
        }
        savedRef.current = true;
      } else {
        savedRef.current = true;
      }
      proceed();
    } finally {
      setLeaving(false);
    }
  };
  const elapsed =
    active && snapshot.startedAt
      ? Math.max(
          0,
          Math.floor(((snapshot.stoppedAt ?? now) - snapshot.startedAt) / 1000),
        )
      : local.duration;
  const nearLimit = elapsed * 1000 >= CAPTURE_MAX_DURATION_MS - 5 * 60_000;
  const statusText =
    snapshot.state === "requesting_permission"
      ? t("capture.requestingPermission")
      : snapshot.state === "connecting"
        ? t("capture.connecting")
        : snapshot.state === "reconnecting"
          ? t("capture.reconnecting")
          : snapshot.state === "stopping"
            ? t("capture.stopping")
            : snapshot.state === "paused"
              ? t("capture.paused")
              : snapshot.state === "recording"
                ? t("capture.recording")
                : snapshot.state === "transcribing"
                  ? t("capture.transcribing")
                  : t("capture.description");
  const buttonState: CaptureButtonState =
    snapshot.state === "recording" || snapshot.state === "stopping"
      ? "recording"
      : snapshot.state === "paused"
        ? "paused"
        : snapshot.state === "idle" ||
            snapshot.state === "error" ||
            snapshot.state === "review"
          ? "idle"
          : "connecting";
  const bigButtonDisabled =
    buttonState === "connecting"
      ? true
      : buttonState === "idle"
        ? !loaded || !status.data?.available
        : snapshot.state === "stopping" ||
          snapshot.state === "reconnecting" ||
          snapshot.state === "transcribing";

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 bg-background px-4 py-6 sm:px-6">
      <AlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open && !leaving && blocker.status === "blocked")
            blocker.reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("capture.leaveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(active ? "capture.leaveRecording" : "capture.leaveUnsaved")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leaving}>
              {t(active ? "capture.continueRecording" : "common.cancel")}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={leaving}
              onClick={() => void stopAndLeave()}
            >
              {t(
                leaving
                  ? "capture.stopping"
                  : active
                    ? "capture.stopAndLeave"
                    : "capture.leavePage",
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <SubpageHeader title={t(review ? "capture.review" : "capture.title")} />
      <p className="-mt-3 text-sm text-muted-foreground">
        {t("capture.foreground")}
      </p>
      {draftError && (
        <p role="alert" className="rounded-lg border p-3 text-sm">
          {t("capture.draftUnavailable")}
        </p>
      )}
      {snapshot.error && (
        <div role="alert" className="space-y-3 rounded-lg border p-3 text-sm">
          <p>{t(`capture.${snapshot.error}`)}</p>
          {snapshot.error === "transcribeFailed" && !saving && (
            <Button variant="outline" size="sm" onClick={() => controller.retryTranscription()}>
              {t("capture.retryTranscription")}
            </Button>
          )}
        </div>
      )}
      {(snapshot.gap || local.gap) && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("capture.gap")}
        </p>
      )}
      {recovery && (
        <section className="space-y-3 rounded-xl border bg-card p-5">
          <h2 className="font-medium">{t("capture.recovery")}</h2>
          <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
            {recovery.text}
          </p>
          <div className="flex gap-3">
            <Button
              variant="brand"
              onClick={() => {
                setLocal(recovery);
                setReview(true);
                setRecovery(null);
              }}
            >
              {t("capture.restore")}
            </Button>
            <DiscardButton onDiscard={discard} />
          </div>
        </section>
      )}
      {!recovery && (
        <>
          <div className="rounded-xl border bg-card p-5">
            <div
              role="timer"
              className="font-mono text-3xl tabular-nums"
              aria-label={t("capture.duration")}
            >
              {formatDuration(elapsed)}
            </div>
            {!review && (
              <p
                role="status"
                aria-live="polite"
                className={`mt-3 flex items-center gap-2 text-sm ${
                  snapshot.state === "recording"
                    ? "font-medium text-primary"
                    : "text-muted-foreground"
                }`}
              >
                {snapshot.microphoneActive && (
                  <span
                    aria-hidden
                    className="relative flex size-5 shrink-0 items-center justify-center"
                  >
                    <span className="absolute size-5 rounded-full bg-primary/20 motion-safe:animate-ping" />
                    <Mic className="relative size-3.5" strokeWidth={2.5} />
                  </span>
                )}
                {statusText}
              </p>
            )}
            {snapshot.microphoneActive && !review && (
              <div className="mt-3">
                <CaptureWaveform
                  active={snapshot.microphoneActive}
                  getWaveform={getWaveform}
                  label={t("capture.waveform")}
                />
              </div>
            )}
            {elapsed > 0 && (
              <div
                role="progressbar"
                aria-label={t("capture.duration")}
                aria-valuemin={0}
                aria-valuemax={CAPTURE_MAX_DURATION_MS / 1000}
                aria-valuenow={Math.min(
                  elapsed,
                  CAPTURE_MAX_DURATION_MS / 1000,
                )}
                className="mt-4 h-1 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className={`h-full rounded-full ${
                    nearLimit ? "bg-destructive" : "bg-primary"
                  }`}
                  style={{
                    width: `${Math.min(
                      100,
                      ((elapsed * 1000) / CAPTURE_MAX_DURATION_MS) * 100,
                    )}%`,
                  }}
                />
              </div>
            )}
            {!review && nearLimit && (
              <p role="status" className="mt-3 text-sm text-destructive">
                {t("capture.nearLimit")}
              </p>
            )}
          </div>
          {review && (
            <div className="space-y-6 motion-safe:animate-rise">
              <label className="flex flex-col gap-2 text-sm font-medium">
                {t("capture.transcript")}
                <textarea
                  aria-label={t("capture.transcript")}
                  className="min-h-72 w-full resize-y rounded-xl border bg-card p-4 text-base leading-relaxed font-normal"
                  maxLength={CAPTURE_MAX_TEXT}
                  value={local.text}
                  disabled={saving || cleanupError}
                  onChange={(event) =>
                    setLocal((value) => ({
                      ...value,
                      text: event.target.value,
                    }))
                  }
                />
                <span className="text-xs font-normal text-muted-foreground">
                  {t("capture.charsUsed", {
                    count: local.text.length.toLocaleString(),
                    max: CAPTURE_MAX_TEXT.toLocaleString(),
                  })}
                </span>
              </label>
              <label className="flex flex-col gap-2 text-sm">
                {t("capture.tags")}
                <input
                  className="rounded-lg border bg-card p-3 text-base"
                  value={local.tags.join(", ")}
                  disabled={saving || cleanupError}
                  onChange={(event) =>
                    setLocal((value) => ({
                      ...value,
                      tags: event.target.value
                        .split(",")
                        .map((tag) => tag.trim().replace(/^#/, "").slice(0, 64))
                        .slice(0, 20),
                    }))
                  }
                />
              </label>
              <label className="flex flex-col gap-2 text-sm">
                {t("capture.visibility")}
                <select
                  className="rounded-lg border bg-card p-3 text-base"
                  value={local.visibility}
                  disabled={saving || cleanupError}
                  onChange={(event) =>
                    setLocal((value) => ({
                      ...value,
                      visibility:
                        event.target.value === "public" ? "public" : "private",
                    }))
                  }
                >
                  <option value="private">{t("capture.private")}</option>
                  <option value="public">{t("capture.public")}</option>
                </select>
              </label>
              {saveError && <p role="alert">{t("capture.saveFailed")}</p>}
              {cleanupError && <p role="alert">{t("capture.cleanupFailed")}</p>}
              <div className="flex gap-3">
                {!cleanupError && (
                  <DiscardButton onDiscard={discard} disabled={saving} />
                )}
                <Button
                  className="flex-1"
                  variant="brand"
                  size="lg"
                  disabled={saving || !local.text.trim()}
                  onClick={() => void save()}
                >
                  {saving && (
                    <Loader2Icon
                      className="animate-spin"
                      data-icon="inline-start"
                    />
                  )}
                  {t(
                    saving
                      ? "capture.saving"
                      : cleanupError
                        ? "capture.retryCleanup"
                        : "capture.save",
                  )}
                </Button>
              </div>
            </div>
          )}
          {(!review || logLeaving) && (
            <>
              <div
                role="log"
                aria-label={t("capture.transcript")}
                aria-live="off"
                className={cn(
                  "max-h-[45dvh] min-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border bg-card p-4 text-base leading-relaxed",
                  review &&
                    logLeaving &&
                    "motion-safe:animate-fade [animation-direction:reverse]",
                )}
              >
                {snapshot.sentences.length > 100 && (
                  <p className="text-sm text-muted-foreground">
                    {t("capture.recentSentences")}
                  </p>
                )}
                {snapshot.sentences.slice(-100).map((sentence) => (
                  <p className="mb-3 motion-safe:animate-rise" key={sentence.id}>
                    {sentence.text}
                  </p>
                ))}
                <p className="text-muted-foreground/70 motion-safe:animate-partial-pulse">
                  {snapshot.partial ||
                    (!snapshot.sentences.length ? t("capture.empty") : "")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("capture.charsUsed", {
                    count: (local.text.length + snapshot.partial.length).toLocaleString(),
                    max: CAPTURE_MAX_TEXT.toLocaleString(),
                  })}
                </p>
                <div ref={tail} />
              </div>
              {transcribing && (
                <div className="space-y-3">
                  <CaptureTranscribing
                    label={
                      transcribeProgress && transcribeProgress.total > 1
                        ? t("capture.transcribingCount", {
                            done: transcribeProgress.done,
                            total: transcribeProgress.total,
                          })
                        : t("capture.transcribing")
                    }
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => controller.cancelTranscription()}
                  >
                    {t("capture.cancelTranscribing")}
                  </Button>
                </div>
              )}
            </>
          )}
          {!review && (
            <>
              <p aria-live="polite" className="sr-only">
                {snapshot.sentences.at(-1)?.text ?? ""}
              </p>
              <div className="flex items-center justify-center gap-3">
                {snapshot.state === "recording" && (
                  <CapturePauseButton
                    onPaused={() => {
                      vibrate(5);
                      controller.pause();
                    }}
                    label={t("capture.pause")}
                  />
                )}
                {snapshot.state === "paused" && (
                  <Button
                    variant="destructive"
                    size="icon"
                    className="size-12 rounded-full text-destructive"
                    aria-label={t("capture.stop")}
                    onClick={() => {
                      vibrate(5);
                      void controller.stop();
                    }}
                  >
                    <Square className="fill-current" />
                  </Button>
                )}
                <CaptureButton
                  state={buttonState}
                  disabled={bigButtonDisabled}
                  onStart={start}
                  onStop={() => {
                    vibrate(5);
                    void controller.stop();
                  }}
                  onResume={() => controller.resume()}
                  startLabel={t("capture.start")}
                  stopLabel={t("capture.stop")}
                  resumeLabel={t("capture.resume")}
                />
              </div>
              {status.isError && !status.data ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <p role="status">{t("list.errorDescription")}</p>
                  <Button
                    disabled={status.isFetching}
                    onClick={() => void status.refetch()}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {t("common.retry")}
                  </Button>
                </div>
              ) : !status.isPending && !status.data?.available ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {t("capture.unavailable")}
                </p>
              ) : null}
            </>
          )}
        </>
      )}
    </main>
  );
}

function mergeCaptureSnapshot(
  value: LocalCapture,
  text: string,
  startedAt: number | null,
  stoppedAt: number | null,
  gap: boolean,
): LocalCapture {
  if (!startedAt) return value;
  return {
    ...value,
    text,
    startedAt,
    duration: Math.max(
      0,
      Math.floor(((stoppedAt ?? Date.now()) - startedAt) / 1000),
    ),
    gap,
  };
}

async function createOrReconcileCaptureMemo(
  input: Parameters<typeof createMemo>[0],
  previousInput: Parameters<typeof createMemo>[0] | null,
) {
  const memo = await createMemo(input);
  if (captureMemoMatchesInput(memo, input)) return memo;

  // A create response can be lost after D1 commits. A retry then returns the
  // row for the same client_id. Reconcile only when that row still matches
  // the exact previous attempt, so another tab's edit is never overwritten.
  if (
    memo.payload.client_id !== input.payload?.client_id ||
    !previousInput ||
    !captureMemoMatchesInput(memo, previousInput)
  ) {
    throw new Error("Capture memo changed after its initial save");
  }
  const desiredTags = normalizedCaptureTags(input);
  return updateMemo(memo.id, {
    content: input.content,
    visibility: input.visibility,
    payload: {
      ...memo.payload,
      ...input.payload,
      tags: desiredTags,
    },
  });
}

function captureMemoMatchesInput(
  memo: Awaited<ReturnType<typeof createMemo>>,
  input: Parameters<typeof createMemo>[0],
) {
  const desiredTags = normalizedCaptureTags(input);
  const currentTags = Array.from(new Set(memo.payload.tags ?? [])).sort();
  return (
    memo.content === input.content &&
    memo.visibility === input.visibility &&
    desiredTags.length === currentTags.length &&
    desiredTags.every((tag, index) => tag === currentTags[index])
  );
}

function normalizedCaptureTags(input: Parameters<typeof createMemo>[0]) {
  return Array.from(new Set(input.payload?.tags ?? [])).sort();
}

function DiscardButton({
  onDiscard,
  disabled = false,
}: {
  onDiscard: () => Promise<void>;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button variant="outline" disabled={disabled}>
            {t("capture.discard")}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("capture.discard")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("capture.discardConfirm")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => void onDiscard()}
          >
            {t("capture.discard")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
function formatDuration(totalSeconds: number) {
  return [
    Math.floor(totalSeconds / 3600),
    Math.floor((totalSeconds % 3600) / 60),
    Math.floor(totalSeconds % 60),
  ]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}
