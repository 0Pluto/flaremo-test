import {
  getAudioCompressionEnabled,
  getImageCompressionEnabled,
} from "./upload-settings";

/**
 * Best-effort client-side transcode before upload
 * (docs/image-compression-design.md, docs/audio-compression-research.md).
 * Compression is decoration, never a contract: every failure path returns
 * the original file untouched, and a transcode that does not actually shrink
 * the payload is discarded.
 */

const MIN_COMPRESSIBLE_IMAGE_BYTES = 100 * 1024;
const MAX_LONG_EDGE = 2560;
// iOS Safari silently fails (blank canvas) above this area; stay below it.
const MAX_CANVAS_AREA = 16_000_000;
const WEBP_QUALITY = 0.82;

const SKIP_IMAGE_TYPES = new Set([
  "image/gif", // canvas drops animation frames
  "image/svg+xml", // rasterizing destroys the vector
  "image/webp", // already the target format
  "image/avif", // already more efficient than WebP
]);

/** Uncompressed/lossless audio is worth transcoding; lossy sources are not. */
const LOSSLESS_AUDIO_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
  "audio/flac",
  "audio/x-flac",
  "audio/aiff",
  "audio/x-aiff",
]);

const LOSSLESS_AUDIO_EXTENSIONS = /\.(wav|wave|aif|aiff|aifc|flac)$/;

const AUDIO_SAMPLE_RATE = 48_000; // Opus-native; decodeAudioData resamples here
const AUDIO_FRAME_SAMPLES = 960; // 20 ms at 48 kHz
const AUDIO_BITRATE_STEREO_KBPS = 96;
const AUDIO_BITRATE_MONO_KBPS = 32;

function withExtension(name: string, extension: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.${extension}`;
}

export function shouldCompressImage(file: File): boolean {
  const type = file.type.toLowerCase();
  if (!type.startsWith("image/")) return false;
  if (SKIP_IMAGE_TYPES.has(type)) return false;
  if (file.size < MIN_COMPRESSIBLE_IMAGE_BYTES) return false;
  return true;
}

export function shouldCompressAudio(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type === "") {
    // Some pickers hand over extension-only files.
    return LOSSLESS_AUDIO_EXTENSIONS.test(file.name.toLowerCase());
  }
  return LOSSLESS_AUDIO_TYPES.has(type);
}

function supportsWebpEncode(): boolean {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

type DrawableSource = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

async function decodeOriented(file: File): Promise<DrawableSource> {
  try {
    // <img> is the EXIF-safe decode path: every modern browser bakes the
    // orientation in when an <img> is drawn to canvas.
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    // decode() can fail where createImageBitmap still succeeds (e.g. some
    // Workers/legacy contexts); orientation support there is best-effort.
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }
}

function sourceDimensions(source: DrawableSource): {
  width: number;
  height: number;
} {
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    return { width: source.width, height: source.height };
  }
  const image = source as HTMLImageElement;
  return {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  };
}

function drawScaled(
  source: DrawableSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): HTMLCanvasElement | null {
  let current: DrawableSource = source;
  let currentWidth = sourceWidth;
  let currentHeight = sourceHeight;

  // Step down by halves for quality. Every intermediate canvas must stay
  // under the iOS area limit; past that, jump straight to the final size —
  // the source (bitmap/img) itself has no canvas limit.
  while (currentWidth > targetWidth * 2 && currentHeight > targetHeight * 2) {
    const nextWidth = Math.max(targetWidth, Math.floor(currentWidth / 2));
    const nextHeight = Math.max(targetHeight, Math.floor(currentHeight / 2));
    if (nextWidth * nextHeight > MAX_CANVAS_AREA) break;
    const canvas = document.createElement("canvas");
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.drawImage(
      current,
      0,
      0,
      currentWidth,
      currentHeight,
      0,
      0,
      nextWidth,
      nextHeight,
    );
    current = canvas;
    currentWidth = nextWidth;
    currentHeight = nextHeight;
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.drawImage(
    current,
    0,
    0,
    currentWidth,
    currentHeight,
    0,
    0,
    targetWidth,
    targetHeight,
  );
  return canvas;
}

function canvasToWebpBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), "image/webp", WEBP_QUALITY);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Returns a WebP File, or null when the input should be uploaded as-is
 * (skip rules, unsupported browser, encode failure, or no size win).
 */
export async function compressImage(file: File): Promise<File | null> {
  if (!shouldCompressImage(file)) return null;
  if (!supportsWebpEncode()) return null;
  try {
    const source = await decodeOriented(file);
    const { width, height } = sourceDimensions(source);
    if (!width || !height) return null;
    const scale = Math.min(1, MAX_LONG_EDGE / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = drawScaled(source, width, height, targetWidth, targetHeight);
    if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
      source.close();
    }
    if (!canvas) return null;
    const blob = await canvasToWebpBlob(canvas);
    if (!blob || blob.size >= file.size) return null;
    return new File([blob], withExtension(file.name, "webp"), {
      type: "image/webp",
    });
  } catch {
    return null;
  }
}

/**
 * Returns an Ogg Opus File, or null when the input should be uploaded as-is
 * (lossy sources, decode/encode failure, or no size win).
 */
export async function compressAudio(file: File): Promise<File | null> {
  if (!shouldCompressAudio(file)) return null;
  try {
    const buffer = await new OfflineAudioContext(
      1,
      1,
      AUDIO_SAMPLE_RATE,
    ).decodeAudioData(await file.arrayBuffer());
    const channels = Math.min(2, Math.max(1, buffer.numberOfChannels));
    const channelData: Float32Array[] = [];
    for (let index = 0; index < channels; index += 1) {
      channelData.push(buffer.getChannelData(index));
    }

    const { default: createOpus } = await import("@audio/encode-opus");
    const encoder = await createOpus({
      sampleRate: AUDIO_SAMPLE_RATE,
      channels,
      bitrate:
        channels === 2 ? AUDIO_BITRATE_STEREO_KBPS : AUDIO_BITRATE_MONO_KBPS,
      application: channels === 2 ? "audio" : "voip",
    });
    const chunks: BlobPart[] = [];
    try {
      for (
        let offset = 0;
        offset < buffer.length;
        offset += AUDIO_FRAME_SAMPLES
      ) {
        const end = Math.min(offset + AUDIO_FRAME_SAMPLES, buffer.length);
        // Copy out: BlobPart typing aside, the copy detaches each chunk from
        // any buffer the encoder might hand back.
        chunks.push(
          new Uint8Array(
            encoder.encode(
              channelData.map((data) => data.subarray(offset, end)),
            ),
          ),
        );
      }
      chunks.push(new Uint8Array(encoder.flush()));
    } finally {
      encoder.free();
    }

    const blob = new Blob(chunks, { type: "audio/ogg" });
    if (blob.size >= file.size) return null;
    return new File([blob], withExtension(file.name, "ogg"), {
      type: "audio/ogg",
    });
  } catch {
    return null;
  }
}

/**
 * The single hook-in for uploadAttachment: consults the settings switches
 * and returns the file to actually upload. Never throws; every branch
 * degrades to the input file.
 */
export async function prepareUploadFile(file: File): Promise<File> {
  let current = file;
  if (getImageCompressionEnabled()) {
    current = (await compressImage(current)) ?? current;
  }
  if (getAudioCompressionEnabled()) {
    current = (await compressAudio(current)) ?? current;
  }
  return current;
}
