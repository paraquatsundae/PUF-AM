/**
 * PUF Freenet Host — Node-only entry.
 *
 * Owns the lifecycle of a bundled `freenet` node inside a PUF app. No import of
 * `units/mist-freenet`: the ciphertext wire client is injected, keeping this the
 * clean fork boundary for PUF-FN. Plan: `Plans/DESKTOP_FREENET_PLUGIN.md`.
 */

export {
  DEFAULT_FREENET_WS_HOST,
  DEFAULT_FREENET_WS_PORT,
  FREENET_HOST_ID,
  createFreenetHost,
  freenetHostEnv,
  freenetWsUrl,
  probeTcpPort,
} from './freenet-host.ts';

export {
  BINARY_ENV_VARS,
  FDEV_BINARY,
  FREENET_BINARY,
  freenetBinaryFileName,
  freenetOsTag,
  freenetPlatformTag,
  freenetVendorDir,
  resolveFreenetBinary,
  resolveFreenetBinaryOrThrow,
} from './resolve-binary.ts';

export {
  FreenetBinaryNotFoundError,
  FreenetHostStartTimeoutError,
  FreenetWireUnavailableError,
} from './errors.ts';

export type {
  ResolveBinaryOptions,
  ResolveBinaryResult,
} from './resolve-binary.ts';

export type {
  FreenetBinaryInfo,
  FreenetBinarySource,
  FreenetChildProcess,
  FreenetHostEvent,
  FreenetHostEventListener,
  FreenetHostMode,
  FreenetHostOptions,
  FreenetHostPlugin,
  FreenetHostStatus,
  FreenetProbeFn,
  FreenetPutCiphertextOptions,
  FreenetPutCiphertextResult,
  FreenetSpawnFn,
  FreenetVersionFn,
  FreenetWireClient,
} from './types.ts';
