import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  compressAudio,
  compressImage,
  prepareUploadFile,
  shouldCompressAudio,
  shouldCompressImage,
} from "./upload-compression";
import {
  getAudioCompressionEnabled,
  getImageCompressionEnabled,
  setAudioCompressionEnabled,
  setImageCompressionEnabled,
} from "./upload-settings";

const opusMock = vi.hoisted(() => ({
  state: { encodeCalls: 0, flushCalls: 0, freeCalls: 0 },
}));

vi.mock("@audio/encode-opus", () => ({
  default: async () => ({
    encode: () => {
      opusMock.state.encodeCalls += 1;
      return new Uint8Array(4);
    },
    flush: () => {
      opusMock.state.flushCalls += 1;
      return new Uint8Array(4);
    },
    free: () => {
      opusMock.state.freeCalls += 1;
    },
  }),
}));

const localStorageStore = new Map<string, string>();

beforeEach(() => {
  localStorageStore.clear();
  opusMock.state.encodeCalls = 0;
  opusMock.state.flushCalls = 0;
  opusMock.state.freeCalls = 0;
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => localStorageStore.get(key) ?? null,
    setItem: (key: string, value: string) => {
      localStorageStore.set(key, value);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("upload settings", () => {
  it("defaults both switches to on", () => {
    expect(getImageCompressionEnabled()).toBe(true);
    expect(getAudioCompressionEnabled()).toBe(true);
  });

  it("round-trips the switches independently", () => {
    setImageCompressionEnabled(false);
    expect(getImageCompressionEnabled()).toBe(false);
    expect(getAudioCompressionEnabled()).toBe(true);
    setAudioCompressionEnabled(false);
    expect(getAudioCompressionEnabled()).toBe(false);
    expect(localStorageStore.get("flaremo.upload.image-compression")).toBe("0");
  });
});

describe("shouldCompressImage", () => {
  it("accepts png/jpeg above the size floor", () => {
    expect(
      shouldCompressImage(
        new File([new Uint8Array(150_000)], "a.png", { type: "image/png" }),
      ),
    ).toBe(true);
    expect(
      shouldCompressImage(
        new File([new Uint8Array(150_000)], "a.jpg", { type: "image/jpeg" }),
      ),
    ).toBe(true);
  });

  it("skips small files, animation/vector/already-compressed types and non-images", () => {
    const big = (type: string, name = "a") =>
      new File([new Uint8Array(150_000)], name, { type });
    expect(
      shouldCompressImage(
        new File([new Uint8Array(50_000)], "small.png", { type: "image/png" }),
      ),
    ).toBe(false);
    expect(shouldCompressImage(big("image/gif"))).toBe(false);
    expect(shouldCompressImage(big("image/svg+xml"))).toBe(false);
    expect(shouldCompressImage(big("image/webp"))).toBe(false);
    expect(shouldCompressImage(big("image/avif"))).toBe(false);
    expect(shouldCompressImage(big("text/plain"))).toBe(false);
    expect(
      shouldCompressImage(
        new File([new Uint8Array(150_000)], "a", { type: "" }),
      ),
    ).toBe(false);
  });
});

describe("shouldCompressAudio", () => {
  it("accepts uncompressed and lossless sources", () => {
    expect(
      shouldCompressAudio(
        new File([new Uint8Array(1)], "a.wav", { type: "audio/wav" }),
      ),
    ).toBe(true);
    expect(
      shouldCompressAudio(
        new File([new Uint8Array(1)], "a.wav", { type: "audio/x-wav" }),
      ),
    ).toBe(true);
    expect(
      shouldCompressAudio(
        new File([new Uint8Array(1)], "a.flac", { type: "audio/flac" }),
      ),
    ).toBe(true);
    expect(
      shouldCompressAudio(
        new File([new Uint8Array(1)], "a.aiff", { type: "audio/aiff" }),
      ),
    ).toBe(true);
  });

  it("skips lossy sources regardless of size", () => {
    const file = new File([new Uint8Array(10_000_000)], "a.mp3", {
      type: "audio/mpeg",
    });
    expect(shouldCompressAudio(file)).toBe(false);
    expect(
      shouldCompressAudio(
        new File([new Uint8Array(1)], "a.m4a", { type: "audio/mp4" }),
      ),
    ).toBe(false);
    expect(
      shouldCompressAudio(
        new File([new Uint8Array(1)], "a.ogg", { type: "audio/ogg" }),
      ),
    ).toBe(false);
    expect(
      shouldCompressAudio(
        new File([new Uint8Array(1)], "a.opus", { type: "audio/opus" }),
      ),
    ).toBe(false);
    expect(
      shouldCompressAudio(
        new File([new Uint8Array(1)], "a.webm", { type: "audio/webm" }),
      ),
    ).toBe(false);
  });

  it("falls back to the extension when the type is empty", () => {
    expect(
      shouldCompressAudio(
        new File([new Uint8Array(1)], "clip.flac", { type: "" }),
      ),
    ).toBe(true);
    expect(
      shouldCompressAudio(
        new File([new Uint8Array(1)], "clip.wav", { type: "" }),
      ),
    ).toBe(true);
    expect(
      shouldCompressAudio(
        new File([new Uint8Array(1)], "song.mp3", { type: "" }),
      ),
    ).toBe(false);
    expect(
      shouldCompressAudio(
        new File([new Uint8Array(1)], "note.txt", { type: "" }),
      ),
    ).toBe(false);
  });
});

describe("compressImage", () => {
  function stubCanvas(
    options: { webpSupported?: boolean; blob?: Blob | null } = {},
  ) {
    const {
      webpSupported = true,
      blob = new Blob([new Uint8Array(50_000)], { type: "image/webp" }),
    } = options;
    const created: { width: number; height: number }[] = [];
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:mock",
      revokeObjectURL: () => {},
    });
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        decode = async () => {};
        naturalWidth = 4000;
        naturalHeight = 3000;
      },
    );
    vi.stubGlobal("document", {
      createElement: (tag: string) => {
        if (tag !== "canvas") throw new Error(`unexpected element: ${tag}`);
        const canvas = {
          width: 0,
          height: 0,
          getContext: () => ({
            imageSmoothingEnabled: false,
            drawImage: () => {},
          }),
          toBlob: (callback: (blob: Blob | null) => void) => callback(blob),
          toDataURL: (type?: string) =>
            type === "image/webp" && webpSupported
              ? "data:image/webp,ok"
              : "data:image/png,ok",
        };
        created.push(canvas);
        return canvas;
      },
    });
    return created;
  }

  it("transcodes to a .webp File capped at the long edge", async () => {
    const created = stubCanvas();
    const result = await compressImage(
      new File([new Uint8Array(200_000)], "photo.png", { type: "image/png" }),
    );
    expect(result).not.toBeNull();
    expect(result?.name).toBe("photo.webp");
    expect(result?.type).toBe("image/webp");
    expect(result?.size).toBe(50_000);
    // One 1x1 canvas for the webp support probe plus the output canvas.
    expect(created).toHaveLength(2);
    const output = created[created.length - 1];
    expect(output.width).toBe(2560);
    expect(output.height).toBe(1920);
  });

  it("returns null when the encode would not shrink the file", async () => {
    stubCanvas({
      blob: new Blob([new Uint8Array(300_000)], { type: "image/webp" }),
    });
    expect(
      await compressImage(
        new File([new Uint8Array(200_000)], "photo.png", { type: "image/png" }),
      ),
    ).toBeNull();
  });

  it("returns null when the browser cannot encode webp", async () => {
    stubCanvas({ webpSupported: false });
    const bitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", bitmap);
    expect(
      await compressImage(
        new File([new Uint8Array(200_000)], "photo.png", { type: "image/png" }),
      ),
    ).toBeNull();
    expect(bitmap).not.toHaveBeenCalled();
  });

  it("falls back to createImageBitmap when <img> decode fails", async () => {
    const created = stubCanvas();
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        decode = async () => {
          throw new Error("decode unsupported");
        };
      },
    );
    vi.stubGlobal("createImageBitmap", async () => ({
      width: 4000,
      height: 3000,
      close: () => {},
    }));
    const result = await compressImage(
      new File([new Uint8Array(200_000)], "photo.jpg", { type: "image/jpeg" }),
    );
    expect(result?.name).toBe("photo.webp");
    const output = created[created.length - 1];
    expect(output.width).toBe(2560);
    expect(output.height).toBe(1920);
  });
});

describe("compressAudio", () => {
  function stubDecode(buffer: { numberOfChannels: number; length: number }) {
    const channels = Array.from(
      { length: buffer.numberOfChannels },
      () => new Float32Array(buffer.length),
    );
    vi.stubGlobal(
      "OfflineAudioContext",
      class {
        decodeAudioData = async () => ({
          numberOfChannels: buffer.numberOfChannels,
          sampleRate: 48_000,
          length: buffer.length,
          getChannelData: (index: number) => channels[index],
        });
      },
    );
  }

  it("transcodes wav to a .ogg File and frames the encoder at 20 ms", async () => {
    stubDecode({ numberOfChannels: 2, length: 1920 });
    const result = await compressAudio(
      new File([new Uint8Array(5_000)], "clip.wav", { type: "audio/wav" }),
    );
    expect(result).not.toBeNull();
    expect(result?.name).toBe("clip.ogg");
    expect(result?.type).toBe("audio/ogg");
    expect(opusMock.state.encodeCalls).toBe(2);
    expect(opusMock.state.flushCalls).toBe(1);
    expect(opusMock.state.freeCalls).toBe(1);
  });

  it("returns null when the transcode would not shrink the file", async () => {
    stubDecode({ numberOfChannels: 1, length: 960 });
    expect(
      await compressAudio(
        new File([new Uint8Array(5)], "clip.wav", { type: "audio/wav" }),
      ),
    ).toBeNull();
  });

  it("returns null when decoding fails", async () => {
    vi.stubGlobal(
      "OfflineAudioContext",
      class {
        decodeAudioData = async () => {
          throw new Error("unsupported codec");
        };
      },
    );
    expect(
      await compressAudio(
        new File([new Uint8Array(5_000)], "clip.wav", { type: "audio/wav" }),
      ),
    ).toBeNull();
  });
});

describe("prepareUploadFile", () => {
  it("passes the file through untouched when both switches are off", async () => {
    setImageCompressionEnabled(false);
    setAudioCompressionEnabled(false);
    const file = new File([new Uint8Array(10)], "a.txt", {
      type: "text/plain",
    });
    expect(await prepareUploadFile(file)).toBe(file);
  });

  it("passes the file through untouched when nothing matches the skip rules", async () => {
    const file = new File([new Uint8Array(10)], "a.txt", {
      type: "text/plain",
    });
    expect(await prepareUploadFile(file)).toBe(file);
  });

  it("feeds compressed output to the next stage, never the other way round", async () => {
    // A tiny png matches no compressor (below the size floor): identity.
    const file = new File([new Uint8Array(10)], "a.png", { type: "image/png" });
    expect(await prepareUploadFile(file)).toBe(file);
  });
});
