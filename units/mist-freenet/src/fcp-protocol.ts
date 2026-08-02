/**
 * FCPv2 message framing — encode headers and parse inbound messages.
 *
 * @see https://github.com/hyphanet/wiki/wiki/FCPv2
 */

export type FcpFieldMap = Record<string, string>;

export type FcpMessage = {
  name: string;
  fields: FcpFieldMap;
  /** Present on AllData / direct ClientPut payloads. */
  data?: Uint8Array;
};

const CRLF = '\r\n';

/** Serialize an FCP header block (no trailing payload). */
export function encodeFcpHeader(name: string, fields: FcpFieldMap, terminator: 'EndMessage' | 'Data' = 'EndMessage'): string {
  const lines = [name];
  for (const [key, value] of Object.entries(fields)) {
    lines.push(`${key}=${value}`);
  }
  lines.push(terminator);
  return `${lines.join(CRLF)}${CRLF}`;
}

/** ClientPut with inline bytes (UploadFrom=direct). */
export function encodeClientPutDirect(fields: FcpFieldMap, data: Uint8Array): Uint8Array {
  const header = encodeFcpHeader('ClientPut', { ...fields, UploadFrom: 'direct', DataLength: String(data.byteLength) }, 'Data');
  const headerBytes = new TextEncoder().encode(header);
  const out = new Uint8Array(headerBytes.byteLength + data.byteLength);
  out.set(headerBytes, 0);
  out.set(data, headerBytes.byteLength);
  return out;
}

export function encodeClientHello(name: string): string {
  return encodeFcpHeader('ClientHello', { Name: name, ExpectedVersion: '2.0' });
}

export function encodeClientGet(fields: FcpFieldMap): string {
  return encodeFcpHeader('ClientGet', fields);
}

type ParseState = {
  buffer: Uint8Array;
};

function indexOfSubarray(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function splitHeaderLines(headerText: string): { name: string; fields: FcpFieldMap } {
  const lines = headerText.replace(/\r\n/g, '\n').split('\n').filter((l) => l.length > 0);
  if (lines.length === 0) throw new Error('FCP: empty message');
  const name = lines[0]!;
  const fields: FcpFieldMap = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line === 'EndMessage' || line === 'Data') break;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    fields[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return { name, fields };
}

/**
 * Incrementally parse complete FCP messages from a byte stream.
 * Returns parsed messages and the unconsumed tail buffer.
 */
export function parseFcpStream(state: ParseState, chunk: Uint8Array): { messages: FcpMessage[]; state: ParseState } {
  const combined =
    state.buffer.byteLength === 0
      ? chunk
      : (() => {
          const merged = new Uint8Array(state.buffer.byteLength + chunk.byteLength);
          merged.set(state.buffer, 0);
          merged.set(chunk, state.buffer.byteLength);
          return merged;
        })();

  const messages: FcpMessage[] = [];
  let offset = 0;
  const dataMarker = new TextEncoder().encode(`${CRLF}Data${CRLF}`);
  const endMarker = new TextEncoder().encode(`${CRLF}EndMessage${CRLF}`);

  while (offset < combined.length) {
    const slice = combined.subarray(offset);
    const dataIdx = indexOfSubarray(slice, dataMarker);
    const endIdx = indexOfSubarray(slice, endMarker);

    let headerEnd = -1;
    let hasDataPayload = false;

    if (dataIdx >= 0 && (endIdx < 0 || dataIdx < endIdx)) {
      headerEnd = offset + dataIdx;
      hasDataPayload = true;
    } else if (endIdx >= 0) {
      headerEnd = offset + endIdx;
      hasDataPayload = false;
    } else {
      break;
    }

    const headerBytes = combined.subarray(offset, headerEnd);
    const headerText = new TextDecoder().decode(headerBytes);
    const firstLineEnd = headerText.indexOf('\n');
    if (firstLineEnd < 0) break;

    const { name, fields } = splitHeaderLines(headerText);

    if (hasDataPayload) {
      const payloadStart = headerEnd + dataMarker.length;
      const dataLength = Number(fields.DataLength ?? fields['InitialMetadata.DataLength'] ?? NaN);
      if (!Number.isFinite(dataLength) || dataLength < 0) break;
      if (combined.length < payloadStart + dataLength) break;

      const data = combined.subarray(payloadStart, payloadStart + dataLength);
      messages.push({ name, fields, data: new Uint8Array(data) });
      offset = payloadStart + dataLength;
    } else {
      messages.push({ name, fields });
      offset = headerEnd + endMarker.length;
    }
  }

  return {
    messages,
    state: { buffer: combined.subarray(offset) },
  };
}
