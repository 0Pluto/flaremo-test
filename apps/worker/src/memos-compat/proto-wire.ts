/**
 * Wire-level primitives shared by the Memos compatibility codecs.
 *
 * The upstream request/response messages are encoded and decoded through the
 * generated @bufbuild/protobuf runtime in memos-generated/ (see
 * memos-protobuf.ts). Only the transports that the generated runtime does not
 * cover remain hand-written here: the Connect/gRPC/gRPC-Web unary framing,
 * the base64 helpers used by the framed transports, the google.rpc.Status
 * body writer used for Connect binary errors, and the tiny field-1 reader
 * for FlareMo's historical GetSharedMemo request. The wire format produced
 * and accepted here is part of the Memos client contract — one byte changed
 * here is a compatibility regression, so treat edits as wire-format changes.
 */

export type ProtoMessage = Record<string, unknown>;

export class ProtoCodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtoCodecError";
  }
}

export class ProtoWriter {
  private readonly chunks: Uint8Array[] = [];

  string(field: number, value: string) {
    if (!value) return this;
    return this.bytes(field, new TextEncoder().encode(value));
  }

  bytes(field: number, value: Uint8Array) {
    this.tag(field, 2);
    this.varint(value.length);
    this.chunks.push(value);
    return this;
  }

  int32(field: number, value: number | undefined) {
    if (value === undefined || !Number.isFinite(value) || value === 0)
      return this;
    this.tag(field, 0);
    this.varint(Math.trunc(value));
    return this;
  }

  finish() {
    const length = this.chunks.reduce(
      (total, chunk) => total + chunk.length,
      0,
    );
    const output = new Uint8Array(length);
    let offset = 0;
    for (const chunk of this.chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    return output;
  }

  private tag(field: number, wire: number) {
    this.varint((field << 3) | wire);
  }

  private varint(value: bigint | number) {
    let current = typeof value === "bigint" ? value : BigInt(value);
    if (current < 0n) current = BigInt.asUintN(64, current);
    while (current > 127n) {
      this.chunks.push(Uint8Array.of(Number((current & 127n) | 128n)));
      current >>= 7n;
    }
    this.chunks.push(Uint8Array.of(Number(current)));
  }
}

export class ProtoReader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}

  get done() {
    return this.offset >= this.bytes.length;
  }

  tag(): [number, number] {
    const value = this.varintRaw();
    return [Number(value >> 3n), Number(value & 7n)];
  }

  string(wire: number) {
    return new TextDecoder().decode(this.bytesValue(wire));
  }

  bytesValue(wire: number) {
    if (wire !== 2) throw new ProtoCodecError("Expected protobuf bytes");
    const length = Number(this.varintRaw());
    if (
      !Number.isSafeInteger(length) ||
      length < 0 ||
      this.offset + length > this.bytes.length
    ) {
      throw new ProtoCodecError("Invalid protobuf length-delimited field");
    }
    const value = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  skip(wire: number) {
    if (wire === 0) this.varintRaw();
    else if (wire === 1) this.offset += 8;
    else if (wire === 2) this.offset += Number(this.varintRaw());
    else if (wire === 5) this.offset += 4;
    else throw new ProtoCodecError(`Unsupported protobuf wire type: ${wire}`);
    if (this.offset > this.bytes.length)
      throw new ProtoCodecError("Truncated protobuf field");
  }

  varintRaw() {
    let value = 0n;
    let shift = 0n;
    while (this.offset < this.bytes.length) {
      const byte = this.bytes[this.offset++] ?? 0;
      value |= BigInt(byte & 127) << shift;
      if ((byte & 128) === 0) return value;
      shift += 7n;
      if (shift > 63n) throw new ProtoCodecError("Protobuf varint is too long");
    }
    throw new ProtoCodecError("Truncated protobuf varint");
  }
}

export function decodeGrpcUnaryFrame(input: Uint8Array) {
  if (input.length < 5) throw new ProtoCodecError("Truncated gRPC frame");
  const flags = input[0] ?? 255;
  if (flags !== 0)
    throw new ProtoCodecError("Compressed gRPC frames are unsupported");
  const length = new DataView(
    input.buffer,
    input.byteOffset,
    input.byteLength,
  ).getUint32(1);
  if (length !== input.length - 5)
    throw new ProtoCodecError("Expected one unary gRPC frame");
  return input.subarray(5);
}

export function encodeGrpcUnaryFrame(payload: Uint8Array) {
  const frame = new Uint8Array(payload.length + 5);
  frame[0] = 0;
  new DataView(frame.buffer).setUint32(1, payload.length);
  frame.set(payload, 5);
  return frame;
}

export function decodeGrpcWebUnaryResponse(input: Uint8Array) {
  let offset = 0;
  let data: Uint8Array | undefined;
  while (offset < input.length) {
    if (input.length - offset < 5) {
      throw new ProtoCodecError("Truncated gRPC-Web frame");
    }
    const flags = input[offset] ?? 255;
    const length = new DataView(
      input.buffer,
      input.byteOffset + offset,
      input.byteLength - offset,
    ).getUint32(1);
    offset += 5;
    if (length > input.length - offset) {
      throw new ProtoCodecError("Truncated gRPC-Web frame payload");
    }
    const payload = input.subarray(offset, offset + length);
    offset += length;

    if (flags === 0) {
      if (data) throw new ProtoCodecError("Expected one gRPC-Web data frame");
      data = payload;
      continue;
    }
    if ((flags & 0x80) !== 0) continue;
    throw new ProtoCodecError("Unsupported gRPC-Web frame flags");
  }
  return data ?? new Uint8Array();
}

export function encodeGrpcWebResponse(payload: Uint8Array, code: number) {
  return concatBytes(
    encodeGrpcWebFrame(0, payload),
    encodeGrpcWebTrailerFrame(code),
  );
}

export function encodeGrpcWebTrailerFrame(code: number, message?: string) {
  const lines = [`grpc-status: ${code}`];
  if (message) lines.push(`grpc-message: ${encodeURIComponent(message)}`);
  const payload = new TextEncoder().encode(`${lines.join("\r\n")}\r\n`);
  return encodeGrpcWebFrame(0x80, payload);
}

export function encodeGrpcWebFrame(flags: number, payload: Uint8Array) {
  const frame = new Uint8Array(payload.length + 5);
  frame[0] = flags;
  new DataView(frame.buffer).setUint32(1, payload.length);
  frame.set(payload, 5);
  return frame;
}

export function concatBytes(...values: Uint8Array[]) {
  const output = new Uint8Array(
    values.reduce((length, value) => length + value.length, 0),
  );
  let offset = 0;
  for (const value of values) {
    output.set(value, offset);
    offset += value.length;
  }
  return output;
}

export function decodeBase64(input: Uint8Array) {
  const binary = atob(new TextDecoder().decode(input).trim());
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function encodeBase64(input: Uint8Array) {
  let binary = "";
  for (const byte of input) binary += String.fromCharCode(byte);
  return btoa(binary);
}
