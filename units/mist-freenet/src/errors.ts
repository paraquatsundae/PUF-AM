/** Thrown when a put would exceed the configured disk budget. */
export class MistStorageFullError extends Error {
  readonly code = 'MIST_STORAGE_FULL' as const;
  readonly maxBytes: number;
  readonly usedBytes: number;
  readonly requestedBytes: number;

  constructor(maxBytes: number, usedBytes: number, requestedBytes: number) {
    super(
      `Mist storage full: ${usedBytes + requestedBytes} bytes would exceed cap of ${maxBytes} bytes`,
    );
    this.name = 'MistStorageFullError';
    this.maxBytes = maxBytes;
    this.usedBytes = usedBytes;
    this.requestedBytes = requestedBytes;
  }
}
