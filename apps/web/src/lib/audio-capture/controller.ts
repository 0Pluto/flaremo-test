import {
  CAPTURE_MAX_DURATION_MS,
  CAPTURE_MAX_TEXT,
  captureServerMessageSchema,
} from "@flaremo/contracts";
import type { Microphone } from "./microphone";
import type { CaptureSentence, CaptureState } from "./types";
import type { CapturedAudio, CaptureAudioSink } from "./encoder";

// While the session has no live socket (first connect or reconnect), frames
// are buffered so speech over the gap still reaches the new session. 16 kHz
// mono s16le is ~32 KB/s, so this cap holds about a minute of audio; older
// frames are dropped once it is exceeded.
const CAPTURE_PENDING_BYTES = 2_000_000;
export type CaptureError =
  | "permissionDenied"
  | "noMicrophone"
  | "microphoneBusy"
  | "interrupted"
  | "unavailable"
  | "connectionFailed"
  | "finishFailed"
  | "limitReached"
  | "transcribeFailed";
export type CaptureSnapshot = {
  state: CaptureState;
  sentences: CaptureSentence[];
  sentenceVersion: number;
  partial: string;
  startedAt: number | null;
  stoppedAt: number | null;
  microphoneActive: boolean;
  error: CaptureError | null;
  gap: boolean;
  /** Batch mode progress while state is "transcribing" (rollout §3.3). */
  transcribing: { done: number; total: number } | null;
};
export type CaptureDependencies = {
  microphone: (
    onFrame: (frame: ArrayBuffer) => void,
    signal: AbortSignal,
    interrupt: () => void,
  ) => Promise<Microphone>;
  status: () => Promise<{
    available: boolean;
    kind?: "streaming" | "batch" | null;
  }>;
  socket: () => WebSocket;
  /** Batch ASR (MiniMax): encode locally, then record-then-transcribe. */
  batch?: {
    createSink: () => Promise<CaptureAudioSink>;
    transcribe: (
      audio: CapturedAudio,
      input: {
        language: string;
        startedAtMs: number;
        onProgress: (progress: { done: number; total: number }) => void;
        signal: AbortSignal;
      },
    ) => Promise<CaptureSentence[]>;
  };
};
export function captureIsActive(state: CaptureState) {
  return [
    "requesting_permission",
    "connecting",
    "recording",
    "paused",
    "reconnecting",
    "stopping",
  ].includes(state);
}
export class CaptureController {
  private readonly deps: CaptureDependencies;
  private snapshot: CaptureSnapshot = {
    state: "idle",
    sentences: [],
    sentenceVersion: 0,
    partial: "",
    startedAt: null,
    stoppedAt: null,
    microphoneActive: false,
    error: null,
    gap: false,
    transcribing: null,
  };
  private readonly listeners = new Set<() => void>();
  private readonly ids = new Set<string>();
  private textLength = 0;
  private abort: AbortController | undefined;
  private mic: Microphone | undefined;
  private socket: WebSocket | undefined;
  private ready = false;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private lastMessage = 0;
  private lastAudio = 0;
  private pendingFrames: ArrayBuffer[] = [];
  private pendingBytes = 0;
  // D1 (voice-capture-rollout §2.4): a user pause must survive a reconnect
  // (the socket can silently drop while paused), so it lives outside the
  // published state.
  private paused = false;
  // Batch mode (rollout §3.3): the sink taps the same zero-filled frame
  // stream while it is being created, and the recording clock starts with
  // the first encoded frame so transcript timestamps stay wall-clock true.
  private batchSink: CaptureAudioSink | undefined;
  private batchSinkPromise: Promise<CaptureAudioSink | null> | undefined;
  private batchBuffering = false;
  private batchMode = false;
  private batchStartedAt: number | null = null;
  private batchTimer: ReturnType<typeof setInterval> | undefined;
  private transcribeAbort: AbortController | undefined;
  // Kept after a failed attempt so the user can retry the transcription
  // without re-recording (rollout §3.3 error path).
  private batchAudio: CapturedAudio | undefined;
  constructor(deps: CaptureDependencies) {
    this.deps = deps;
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<CaptureSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  async start() {
    if (this.snapshot.state !== "idle" && this.snapshot.state !== "error")
      return;
    this.dispose();
    this.ids.clear();
    this.textLength = 0;
    this.retry = 0;
    this.pendingFrames = [];
    this.pendingBytes = 0;
    this.paused = false;
    this.batchMode = false;
    this.batchSink = undefined;
    this.batchStartedAt = null;
    this.batchAudio = undefined;
    this.batchBuffering = Boolean(this.deps.batch);
    this.batchSinkPromise = this.deps.batch
      ? this.deps.batch.createSink().catch(() => null)
      : undefined;
    const abort = new AbortController();
    this.abort = abort;
    this.update({
      state: "requesting_permission",
      sentences: [],
      sentenceVersion: 0,
      partial: "",
      startedAt: null,
      stoppedAt: null,
      microphoneActive: false,
      error: null,
      gap: false,
      transcribing: null,
    });
    try {
      const mic = await this.deps.microphone(
        (frame) => {
          if (!abort.signal.aborted) this.audio(frame);
        },
        abort.signal,
        () => {
          if (!abort.signal.aborted) this.interrupt();
        },
      );
      if (abort.signal.aborted) {
        mic.dispose();
        return;
      }
      this.mic = mic;
      this.lastAudio = Date.now();
      // The batch sink must exist before the first frame arrives, so its
      // creation starts with the session; the mic handle is already live.
      if (this.batchSinkPromise) {
        this.batchSink = (await this.batchSinkPromise) ?? undefined;
        this.batchBuffering = false;
        if (abort.signal.aborted) {
          this.batchSink?.dispose();
          this.batchSink = undefined;
          return;
        }
        const buffered = this.pendingFrames;
        this.pendingFrames = [];
        this.pendingBytes = 0;
        for (const frame of buffered) this.pushToSink(frame);
      }
      this.update({
        microphoneActive: true,
        state: "connecting",
        // The recording clock starts only after the provider confirms that
        // audio can be accepted. Permission and connection time are setup.
        startedAt: null,
      });
      await this.connect(abort);
    } catch (error) {
      if (abort.signal.aborted) return;
      const name = error instanceof Error ? error.name : "";
      this.end(
        name === "NotAllowedError"
          ? "permissionDenied"
          : name === "NotFoundError"
            ? "noMicrophone"
            : name === "NotReadableError"
              ? "microphoneBusy"
              : "interrupted",
      );
    }
  }
  private async connect(abort: AbortController) {
    const statusDeadline = setTimeout(
      () => this.end("connectionFailed"),
      10_000,
    );
    this.timer = statusDeadline;
    try {
      const status = await this.deps.status();
      clearTimeout(statusDeadline);
      if (abort.signal.aborted || this.snapshot.state === "stopping") return;
      if (!status.available) return this.end("unavailable");
      // Batch mode (rollout §3.3): no socket; frames feed the local encoder
      // and the provider is only contacted after Stop.
      if (status.kind === "batch") {
        if (!this.deps.batch || !this.batchSink)
          return this.end("unavailable");
        this.batchMode = true;
        this.update({
          state: "recording",
          startedAt: this.batchStartedAt ?? Date.now(),
        });
        this.batchTimer = setInterval(() => {
          const startedAt = this.snapshot.startedAt;
          if (
            startedAt !== null &&
            Date.now() - startedAt >= CAPTURE_MAX_DURATION_MS
          )
            void this.stop("limitReached");
        }, 5_000);
        return;
      }
      // Streaming confirmed: the unused batch sink is dropped.
      this.batchBuffering = false;
      this.batchSink?.dispose();
      this.batchSink = undefined;
      const socket = this.deps.socket();
      this.socket = socket;
      this.ready = false;
      this.timer = setTimeout(() => {
        if (this.socket === socket) this.lost(socket);
      }, 30_000);
      socket.onopen = () => {
        if (this.socket !== socket || abort.signal.aborted) return;
        socket.send(
          JSON.stringify({
            type: "start",
            sampleRate: 16000,
            encoding: "pcm_s16le",
            language: "auto",
          }),
        );
      };
      socket.onmessage = (event) => {
        if (this.socket !== socket || abort.signal.aborted) return;
        try {
          if (typeof event.data !== "string" || event.data.length > 128_000)
            throw new Error("Invalid response");
          const message = captureServerMessageSchema.parse(
            JSON.parse(event.data),
          );
          this.lastMessage = Date.now();
          if (message.type === "ready") {
            if (
              this.snapshot.state !== "connecting" &&
              this.snapshot.state !== "reconnecting"
            )
              return;
            clearTimeout(this.timer);
            this.ready = true;
            this.lastAudio = Date.now();
            this.flush(socket);
            // Preserve the session's original start across reconnects so the
            // recorded start time and the total-duration cap stay truthful.
            this.update({
              state: this.paused ? "paused" : "recording",
              startedAt: this.snapshot.startedAt ?? Date.now(),
            });
            this.heartbeat = setInterval(() => {
              if (Date.now() - this.lastAudio > 10_000) return this.interrupt();
              if (
                Date.now() - (this.snapshot.startedAt ?? Date.now()) >=
                CAPTURE_MAX_DURATION_MS
              ) {
                void this.stop("limitReached");
                return;
              }
              if (Date.now() - this.lastMessage > 15_000)
                return this.lost(socket);
              if (socket.readyState === 1)
                socket.send(JSON.stringify({ type: "ping" }));
            }, 5_000);
          } else if (message.type === "sentence") this.sentence(message);
          else if (message.type === "finished") {
            if (this.snapshot.state === "stopping") this.end();
            else this.lost(socket);
          } else if (message.type === "error") {
            if (
              message.code === "SESSION_EXPIRED" ||
              message.code === "INVALID_MESSAGE"
            )
              this.end("connectionFailed");
            else if (message.code === "LIMIT_REACHED") this.end("limitReached");
            else if (
              message.code === "ASR_UPSTREAM_FAILED" &&
              message.retryable === false
            )
              this.end("connectionFailed");
            else this.lost(socket);
          }
        } catch {
          this.end("connectionFailed");
        }
      };
      socket.onclose = () => this.lost(socket);
      socket.onerror = () => this.lost(socket);
    } catch {
      clearTimeout(statusDeadline);
      if (!abort.signal.aborted) this.end("connectionFailed");
    }
  }
  private audio(frame: ArrayBuffer) {
    this.lastAudio = Date.now();
    // Batch mode taps the same frame stream; paused frames are zero-filled
    // exactly like the streaming path so the provider never receives (or
    // transcribes) speech from a paused segment (D1).
    if (this.batchMode || (this.batchBuffering && this.deps.batch)) {
      const payload = this.paused ? new ArrayBuffer(frame.byteLength) : frame;
      if (this.batchBuffering || !this.batchSink) this.buffer(payload);
      else this.pushToSink(payload);
      return;
    }
    if (
      !this.ready ||
      (this.snapshot.state !== "recording" &&
        this.snapshot.state !== "paused" &&
        this.snapshot.state !== "stopping")
    ) {
      if (
        this.snapshot.state === "connecting" ||
        this.snapshot.state === "reconnecting"
      )
        // A pause survives reconnects, so silence — not captured speech —
        // must be buffered while paused even without a live socket.
        this.buffer(
          this.paused ? new ArrayBuffer(frame.byteLength) : frame,
        );
      return;
    }
    const socket = this.socket;
    if (socket?.readyState !== 1) return;
    // While paused the user's speech must neither reach the ASR provider
    // (no transcript, no billed speech) nor break the audio timeline: the
    // frame cadence continues with zero-filled PCM so server-side timestamps
    // keep matching wall-clock time, and resuming stays gap-free (D1).
    const payload =
      this.snapshot.state === "paused"
        ? new ArrayBuffer(frame.byteLength)
        : frame;
    if (socket.bufferedAmount + payload.byteLength > 64_000)
      return this.lost(socket);
    try {
      socket.send(payload);
    } catch {
      this.lost(socket);
    }
  }
  private buffer(frame: ArrayBuffer) {
    this.pendingFrames.push(frame);
    this.pendingBytes += frame.byteLength;
    while (
      this.pendingBytes > CAPTURE_PENDING_BYTES &&
      this.pendingFrames.length > 1
    ) {
      const oldest = this.pendingFrames[0];
      if (!oldest) break;
      this.pendingBytes -= oldest.byteLength;
      this.pendingFrames.shift();
    }
  }
  private flush(socket: WebSocket) {
    const frames = this.pendingFrames;
    this.pendingFrames = [];
    this.pendingBytes = 0;
    for (const frame of frames) {
      if (socket.readyState !== 1) return this.lost(socket);
      if (socket.bufferedAmount + frame.byteLength > 64_000)
        return this.lost(socket);
      try {
        socket.send(frame);
      } catch {
        return this.lost(socket);
      }
    }
  }
  private sentence(sentence: CaptureSentence) {
    if (this.ids.has(sentence.id)) return;
    if (!sentence.final) {
      this.update({ partial: sentence.text });
      return;
    }
    if (
      this.textLength + sentence.text.length + 20 > CAPTURE_MAX_TEXT ||
      this.ids.size >= 4000
    ) {
      void this.stop("limitReached");
      return;
    }
    this.ids.add(sentence.id);
    this.textLength += sentence.text.length + 20;
    this.snapshot.sentences.push(sentence);
    this.update({
      sentenceVersion: this.snapshot.sentenceVersion + 1,
      partial: "",
    });
  }
  private closeSocket() {
    clearTimeout(this.timer);
    clearInterval(this.heartbeat);
    this.ready = false;
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      try {
        socket.close();
      } catch {
        /* Closed. */
      }
    }
  }
  private lost(socket: WebSocket) {
    if (this.socket !== socket) return;
    if (this.snapshot.state === "stopping") return this.end("finishFailed");
    this.closeSocket();
    const abort = this.abort;
    if (!abort || abort.signal.aborted) return;
    if (this.retry >= 6) return this.end("connectionFailed");
    const delay = [1000, 2000, 4000, 8000, 15000, 15000][this.retry++];
    this.update({ state: "reconnecting", gap: true, partial: "" });
    this.timer = setTimeout(() => {
      void this.connect(abort);
    }, delay);
  }
  /** User-intent pause: only between live recording and resuming (D1). */
  pause() {
    if (this.snapshot.state !== "recording" || this.paused) return;
    this.paused = true;
    this.update({ state: "paused", partial: "" });
  }
  resume() {
    if (!this.paused || this.snapshot.state !== "paused") return;
    this.paused = false;
    // A socket lost while paused reconnects without leaving the paused state;
    // if it is somehow gone anyway, fall back to the reconnect path.
    this.update({
      state: this.ready ? "recording" : "reconnecting",
    });
  }
  async stop(error: CaptureError | null = null) {
    if (
      !captureIsActive(this.snapshot.state) ||
      this.snapshot.state === "stopping"
    )
      return;
    this.update({
      state: "stopping",
      error,
      stoppedAt: Date.now(),
      microphoneActive: false,
    });
    clearTimeout(this.timer);
    clearInterval(this.heartbeat);
    const mic = this.mic;
    this.mic = undefined;
    // A pending permission grant must not reopen recording after Stop.
    if (!mic) {
      this.end(error);
      return;
    }
    try {
      await mic.stop();
    } catch {
      mic.dispose();
    }
    if (this.getSnapshot().state !== "stopping") return;
    if (this.batchMode) {
      clearInterval(this.batchTimer);
      this.batchTimer = undefined;
      await this.transcribeBatch(error);
      return;
    }
    if (this.ready && this.socket?.readyState === 1) {
      this.timer = setTimeout(() => this.end("finishFailed"), 12_000);
      try {
        this.socket.send(JSON.stringify({ type: "stop" }));
      } catch {
        this.end("finishFailed");
      }
    } else this.end(error);
  }
  interrupt() {
    if (captureIsActive(this.snapshot.state)) void this.stop("interrupted");
  }
  /** User exit while the batch transcription is in flight (rollout §3.3):
   * the attempt is abandoned; the session returns to review with whatever
   * text exists so it can be typed or discarded (no partial batch results). */
  cancelTranscription() {
    if (this.snapshot.state !== "transcribing") return;
    const signal = this.transcribeAbort;
    this.transcribeAbort = undefined;
    signal?.abort();
    // The attempt was abandoned by user intent: no retry offer afterwards.
    this.batchAudio = undefined;
    this.update({ state: "review", transcribing: null, partial: "" });
  }
  /** Retry after a failed batch transcription (rollout §3.3): the encoded
   * audio of the finished recording is re-uploaded as-is. */
  retryTranscription() {
    if (this.snapshot.state !== "review") return;
    const audio = this.batchAudio;
    const startedAt = this.snapshot.startedAt;
    if (!audio || startedAt === null) return;
    void this.runTranscribe(audio, startedAt, null);
  }
  private pushToSink(frame: ArrayBuffer) {
    // The recording clock starts with the first encoded frame, keeping the
    // millisecond timeline aligned with wall-clock time.
    if (this.batchStartedAt === null) this.batchStartedAt = Date.now();
    try {
      this.batchSink?.push(frame);
    } catch {
      this.end("transcribeFailed");
    }
  }
  private async transcribeBatch(stopError: CaptureError | null) {
    const sink = this.batchSink;
    this.batchSink = undefined;
    const batch = this.deps.batch;
    const startedAt = this.snapshot.startedAt;
    if (!sink || !batch || startedAt === null) return this.end(stopError);
    let audio: CapturedAudio;
    try {
      audio = await sink.finalize();
    } catch {
      return this.end("transcribeFailed");
    } finally {
      sink.dispose();
    }
    this.batchAudio = audio;
    await this.runTranscribe(audio, startedAt, stopError);
  }
  private async runTranscribe(
    audio: CapturedAudio,
    startedAt: number,
    stopError: CaptureError | null,
  ) {
    const batch = this.deps.batch;
    if (!batch) return this.end(stopError);
    if (!audio.slices.length) return this.end(stopError);
    this.update({ state: "transcribing", partial: "", error: stopError });
    const signal = new AbortController();
    this.transcribeAbort = signal;
    try {
      const sentences = await batch.transcribe(audio, {
        language: "zh",
        startedAtMs: startedAt,
        onProgress: (transcribing) => {
          if (this.snapshot.state === "transcribing" && this.transcribeAbort === signal)
            this.update({ transcribing });
        },
        signal: signal.signal,
      });
      if (this.transcribeAbort !== signal) return; // Cancelled by the user.
      this.acceptBatch(sentences);
      this.batchAudio = undefined;
      this.end();
    } catch {
      if (this.transcribeAbort !== signal) return;
      this.end("transcribeFailed");
    } finally {
      if (this.transcribeAbort === signal) this.transcribeAbort = undefined;
    }
  }
  private acceptBatch(sentences: CaptureSentence[]) {
    let added = 0;
    for (const sentence of sentences) {
      if (this.ids.has(sentence.id)) continue;
      if (
        this.textLength + sentence.text.length + 20 > CAPTURE_MAX_TEXT ||
        this.ids.size >= 4000
      )
        break;
      this.ids.add(sentence.id);
      this.textLength += sentence.text.length + 20;
      this.snapshot.sentences.push(sentence);
      added++;
    }
    if (added)
      this.update({
        sentenceVersion: this.snapshot.sentenceVersion + 1,
        partial: "",
      });
  }
  private end(error: CaptureError | null = this.snapshot.error) {
    this.dispose();
    this.pendingFrames = [];
    this.pendingBytes = 0;
    this.paused = false;
    this.batchBuffering = false;
    this.batchMode = false;
    this.update({
      state:
        this.snapshot.startedAt !== null || this.snapshot.sentences.length
          ? "review"
          : error
            ? "error"
            : "idle",
      error,
      microphoneActive: false,
      partial: "",
      stoppedAt: this.snapshot.stoppedAt ?? Date.now(),
      transcribing: null,
    });
  }
  reset() {
    this.dispose();
    this.paused = false;
    this.batchAudio = undefined;
    this.update({
      state: "idle",
      sentences: [],
      sentenceVersion: 0,
      partial: "",
      startedAt: null,
      stoppedAt: null,
      microphoneActive: false,
      error: null,
      gap: false,
      transcribing: null,
    });
  }
  dispose = () => {
    this.abort?.abort();
    this.mic?.dispose();
    this.mic = undefined;
    this.closeSocket();
    clearInterval(this.batchTimer);
    this.batchTimer = undefined;
    this.transcribeAbort?.abort();
    this.transcribeAbort = undefined;
    this.batchSink?.dispose();
    this.batchSink = undefined;
  };
}
