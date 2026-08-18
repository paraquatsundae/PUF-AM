/**
 * Freenet native WS encoding — the bincode `ClientRequest` `fdev` speaks.
 *
 * `@freenetorg/freenet-stdlib` PUT uses flatbuffers and hangs on 0.2.11x.
 * `fdev network execute put` succeeds because it connects with
 * `encodingProtocol=native` and serializes `ClientRequest` with bincode 1
 * (little-endian, fixint). This file is that frame, in the browser.
 *
 * Layout locked against freenet-stdlib 0.8.5 / fdev 0.3.287.
 */

import {
  blake3Bytes,
  packContractInstanceId,
  packParametersFromBlob,
  unpackContractWasm,
} from './freenet02-pack-id.ts';

const CLIENT_REQUEST_CONTRACT_OP = 1;
const CLIENT_REQUEST_AUTHENTICATE = 3;
const CLIENT_REQUEST_CLOSE = 5;
const CONTRACT_REQUEST_PUT = 0;
const CONTRACT_REQUEST_UPDATE = 1;
const CONTRACT_CONTAINER_WASM = 0;
const CONTRACT_WASM_API_V1 = 0;
const UPDATE_DATA_STATE = 0;

const RESULT_OK = 0;
const RESULT_ERR = 1;
const HOST_RESPONSE_CONTRACT = 0;
const CONTRACT_RESPONSE_PUT = 1;
const CONTRACT_RESPONSE_UPDATE = 3;

export class NativeBincodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NativeBincodeError';
  }
}

class BincodeWriter {
  private readonly chunks: Uint8Array[] = [];

  u8(value: number): void {
    this.chunks.push(new Uint8Array([value & 0xff]));
  }

  u32(value: number): void {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setUint32(0, value >>> 0, true);
    this.chunks.push(buf);
  }

  u64(value: number): void {
    const buf = new Uint8Array(8);
    new DataView(buf.buffer).setBigUint64(0, BigInt(value), true);
    this.chunks.push(buf);
  }

  bool(value: boolean): void {
    this.u8(value ? 1 : 0);
  }

  bytes(data: Uint8Array): void {
    this.u64(data.byteLength);
    if (data.byteLength) this.chunks.push(data);
  }

  string(value: string): void {
    this.bytes(new TextEncoder().encode(value));
  }

  raw(data: Uint8Array): void {
    if (data.byteLength) this.chunks.push(data);
  }

  finish(): Uint8Array {
    let total = 0;
    for (const chunk of this.chunks) total += chunk.byteLength;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  }
}

class BincodeReader {
  private offset = 0;

  constructor(private readonly buf: Uint8Array) {}

  remaining(): number {
    return this.buf.byteLength - this.offset;
  }

  u8(): number {
    if (this.offset >= this.buf.byteLength) {
      throw new NativeBincodeError('native frame truncated');
    }
    return this.buf[this.offset++];
  }

  u32(): number {
    if (this.offset + 4 > this.buf.byteLength) {
      throw new NativeBincodeError('native frame truncated');
    }
    const value = new DataView(this.buf.buffer, this.buf.byteOffset + this.offset, 4).getUint32(
      0,
      true,
    );
    this.offset += 4;
    return value;
  }

  u64(): number {
    if (this.offset + 8 > this.buf.byteLength) {
      throw new NativeBincodeError('native frame truncated');
    }
    const value = new DataView(this.buf.buffer, this.buf.byteOffset + this.offset, 8).getBigUint64(
      0,
      true,
    );
    this.offset += 8;
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new NativeBincodeError('native frame length exceeds safe integer');
    }
    return Number(value);
  }

  raw(length: number): Uint8Array {
    if (length < 0 || this.offset + length > this.buf.byteLength) {
      throw new NativeBincodeError('native frame truncated');
    }
    const slice = this.buf.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  readBytes(): Uint8Array {
    return this.raw(this.u64());
  }

  string(): string {
    return new TextDecoder().decode(this.readBytes());
  }
}

export type NativePackPutFrame = {
  bytes: Uint8Array;
  instanceId: Uint8Array;
  codeHash: Uint8Array;
};

/** `ClientRequest::ContractOp(ContractRequest::Put { … })` — same bytes as fdev. */
export function encodeNativeContractPut(input: {
  wasm: Uint8Array;
  parameters: Uint8Array;
  state: Uint8Array;
}): NativePackPutFrame {
  const unpacked = unpackContractWasm(input.wasm);
  const instanceId = blake3Concat(unpacked.codeHash, input.parameters);

  const w = new BincodeWriter();
  w.u32(CLIENT_REQUEST_CONTRACT_OP);
  w.u32(CONTRACT_REQUEST_PUT);
  w.u32(CONTRACT_CONTAINER_WASM);
  w.u32(CONTRACT_WASM_API_V1);
  w.bytes(unpacked.wasm);
  w.raw(unpacked.codeHash);
  w.bytes(input.parameters);
  w.raw(instanceId);
  w.raw(unpacked.codeHash);
  w.bytes(input.state);
  w.u64(0); // empty RelatedContracts HashMap
  w.bool(false); // subscribe
  w.bool(false); // blocking_subscribe

  return { bytes: w.finish(), instanceId, codeHash: unpacked.codeHash };
}

/** Pack-contract PUT: parameters = BLAKE3-32 of the state. */
export function encodeNativePackPut(input: {
  data: Uint8Array;
  wasm: Uint8Array;
}): NativePackPutFrame {
  return encodeNativeContractPut({
    wasm: input.wasm,
    parameters: packParametersFromBlob(input.data),
    state: input.data,
  });
}

/**
 * `fdev execute update --as-state`: `UpdateData::State` and a zero code hash.
 * The node looks the contract up by instance id.
 */
export function encodeNativeContractUpdate(input: {
  instanceId: Uint8Array;
  state: Uint8Array;
  codeHash?: Uint8Array;
}): Uint8Array {
  if (input.instanceId.byteLength !== 32) {
    throw new NativeBincodeError('update instance id must be 32 bytes');
  }
  const codeHash = input.codeHash ?? new Uint8Array(32);
  if (codeHash.byteLength !== 32) {
    throw new NativeBincodeError('update code hash must be 32 bytes');
  }

  const w = new BincodeWriter();
  w.u32(CLIENT_REQUEST_CONTRACT_OP);
  w.u32(CONTRACT_REQUEST_UPDATE);
  w.raw(input.instanceId);
  w.raw(codeHash);
  w.u32(UPDATE_DATA_STATE);
  w.bytes(input.state);
  return w.finish();
}

function blake3Concat(codeHash: Uint8Array, parameters: Uint8Array): Uint8Array {
  if (codeHash.byteLength === 32 && parameters.byteLength === 32) {
    return packContractInstanceId(codeHash, parameters);
  }
  const combined = new Uint8Array(codeHash.byteLength + parameters.byteLength);
  combined.set(codeHash, 0);
  combined.set(parameters, codeHash.byteLength);
  return blake3Bytes(combined);
}

export function encodeNativeAuthenticate(token: string): Uint8Array {
  const w = new BincodeWriter();
  w.u32(CLIENT_REQUEST_AUTHENTICATE);
  w.string(token);
  return w.finish();
}

export function encodeNativeClose(): Uint8Array {
  const w = new BincodeWriter();
  w.u32(CLIENT_REQUEST_CLOSE);
  return w.finish();
}

export type NativeHostPutResult =
  | { ok: true; instanceId: Uint8Array; codeHash: Uint8Array }
  | { ok: false; message: string };

export function decodeNativeHostResult(bytes: Uint8Array): NativeHostPutResult {
  const r = new BincodeReader(bytes);
  const tag = r.u32();
  if (tag === RESULT_ERR) return { ok: false, message: decodeErrorKind(r) };
  if (tag !== RESULT_OK) {
    return { ok: false, message: `unexpected Result tag ${tag}` };
  }

  const host = r.u32();
  if (host !== HOST_RESPONSE_CONTRACT) {
    return { ok: false, message: `unexpected HostResponse variant ${host}` };
  }

  const contract = r.u32();
  if (contract !== CONTRACT_RESPONSE_PUT && contract !== CONTRACT_RESPONSE_UPDATE) {
    return { ok: false, message: `unexpected ContractResponse variant ${contract}` };
  }
  if (r.remaining() < 64) {
    return { ok: false, message: 'PutResponse missing ContractKey' };
  }
  return { ok: true, instanceId: r.raw(32), codeHash: r.raw(32) };
}

function decodeErrorKind(r: BincodeReader): string {
  const kind = r.u32();
  try {
    switch (kind) {
      case 1: // DeserializationError { cause }
      case 6: // Unhandled { cause }
      case 9: // OperationError { cause }
        return r.string();
      case 8: // RequestError
        return decodeRequestError(r);
      case 10:
        return 'operation timed out';
      default:
        return `ErrorKind variant ${kind}`;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `ErrorKind variant ${kind} (${message})`;
  }
}

function decodeRequestError(r: BincodeReader): string {
  const variant = r.u32();
  if (variant === 3) return 'operation timed out';
  if (variant !== 0) return `RequestError variant ${variant}`;
  return decodeContractError(r);
}

function decodeContractError(r: BincodeReader): string {
  const variant = r.u32();
  // Get / Put / Update / Subscribe are { key: ContractKey, cause }.
  if (variant <= 3) {
    if (r.remaining() < 64) return `ContractError variant ${variant}`;
    r.raw(64);
    return r.string();
  }
  // ContractStackOverflow / MissingRelated / MissingContract are { key: InstanceId }.
  if (variant <= 6 && r.remaining() >= 32) {
    r.raw(32);
    return variant === 6 ? 'missing contract' : `ContractError variant ${variant}`;
  }
  return `ContractError variant ${variant}`;
}

/** Same text net as `fdev` slot fallback — the CLI only gives us a string. */
export function looksLikeAlreadyPublished(message: string): boolean {
  return /already (exists|published|present)|duplicate contract|contract .* exists/i.test(message);
}

export function toNativeFreenetWsUrl(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set('encodingProtocol', 'native');
  return parsed.toString();
}
