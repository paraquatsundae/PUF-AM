/**
 * One native WS request at a time.
 *
 * 0.2.135 PutResponse is the Opennet insert, not a local ack. Overlapping
 * PUTs from a second Send (or Hot + watch) stack sockets the node never
 * answers. Queue; refuse a second *farm* publish higher up.
 * Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-14 (Send native PUT settle).
 */

let tail: Promise<void> = Promise.resolve();
let inFlight = 0;

export function nativeWsRequestInFlight(): boolean {
  return inFlight > 0;
}

export async function enqueueNativeWsRequest<T>(run: () => Promise<T>): Promise<T> {
  const previous = tail;
  let release: () => void = () => {};
  tail = new Promise<void>((resolve) => {
    release = resolve;
  });
  inFlight += 1;
  try {
    await previous;
    return await run();
  } finally {
    inFlight -= 1;
    release();
  }
}

/** Tests: drop a leftover chain so a hung fake socket cannot stall the next case. */
export function resetNativeWsQueueForTests(): void {
  tail = Promise.resolve();
  inFlight = 0;
}
