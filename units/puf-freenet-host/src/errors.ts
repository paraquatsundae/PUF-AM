/** No `freenet` (or `fdev`) binary found in any resolution source. */
export class FreenetBinaryNotFoundError extends Error {
  readonly code = 'FREENET_BINARY_NOT_FOUND' as const;
  readonly binaryName: string;
  readonly searched: string[];

  constructor(binaryName: string, searched: string[]) {
    super(
      `Freenet binary "${binaryName}" not found. Searched: ${searched.length ? searched.join(', ') : '(no candidates)'}`,
    );
    this.name = 'FreenetBinaryNotFoundError';
    this.binaryName = binaryName;
    this.searched = searched;
  }
}

/** Spawn succeeded but the WebSocket API never accepted a connection. */
export class FreenetHostStartTimeoutError extends Error {
  readonly code = 'FREENET_HOST_START_TIMEOUT' as const;

  constructor(wsUrl: string, timeoutMs: number) {
    super(`Freenet node did not open ${wsUrl} within ${timeoutMs} ms`);
    this.name = 'FreenetHostStartTimeoutError';
  }
}

/** put/get attempted with no `wire` client injected (see FreenetHostOptions). */
export class FreenetWireUnavailableError extends Error {
  readonly code = 'FREENET_WIRE_UNAVAILABLE' as const;

  constructor(operation: string) {
    super(
      `Freenet host cannot ${operation}: no wire client injected. Pass options.wire (PUF-AM wraps Freenet02WsTransport).`,
    );
    this.name = 'FreenetWireUnavailableError';
  }
}
