export type CaptureState =
  | "idle"
  | "requesting_permission"
  | "connecting"
  | "recording"
  | "paused"
  | "reconnecting"
  | "stopping"
  | "review"
  | "error";

import type { CaptureSentenceEvent } from "@flaremo/contracts";

export type CaptureSentence = Omit<CaptureSentenceEvent, "type">;
