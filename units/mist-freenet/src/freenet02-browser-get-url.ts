/**
 * Where a Freenet 0.2 node binds its WebSocket API on the machine running it.
 *
 * Its own module so that asking *where* the node would be costs nothing: the
 * client that speaks to it pulls in the flatbuffers SDK, and a device deciding
 * whether it has a node at all should not pay for that to find out.
 */

export const DEFAULT_LOCAL_FREENET_WS_URL = 'ws://127.0.0.1:7509/v1/contract/command';
