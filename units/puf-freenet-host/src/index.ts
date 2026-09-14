/**
 * PUF Freenet Host — Node-only entry.
 *
 * Owns the lifecycle of a bundled `freenet` node inside a PUF app. No import of
 * `units/mist-freenet`: the ciphertext wire client is injected, keeping this the
 * clean fork boundary for PUF-FN. Plan: `Plans/reference/DESKTOP_FREENET_PLUGIN.md`.
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
  freenetPortNotFreenetMessage,
  identifyFreenet02Listener,
} from './identify-freenet02.ts';

export {
  attachKindFromListener,
  classifyFreenetListener,
  decidePortTakenMode,
} from './listener-owner.ts';

export {
  BINARY_ENV_VARS,
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

export {
  FREENET_ANDROID_ATTACHED_NOTE,
  FREENET_ANDROID_STOP_LABEL,
  FREENET_ATTACHED_LEAVE_BODY,
  FREENET_ATTACHED_LEAVE_BUTTON,
  FREENET_ATTACHED_LEAVE_TITLE,
  FREENET_QUIT_ASK_TITLE,
  FREENET_QUIT_KEEP_LABEL,
  FREENET_QUIT_MANAGED_DETAIL,
  FREENET_QUIT_STOP_LABEL,
  freenetQuitAskKind,
  quitStopsManagedFreenet,
  shouldOfferStopFreenet,
} from './quit-ask.ts';

export {
  FREENET_ANDROID_NODE_PACKAGE,
  FREENET_KILL_ANDROID_NODE_LEFT,
  FREENET_KILL_FOREIGN_LEFT,
  FREENET_KILL_SWITCH_HINT,
  FREENET_KILL_SWITCH_LABEL,
  FREENET_KILL_STOPPED_OURS,
  FREENET_OPEN_ANDROID_NODE_LABEL,
  FREENET_START_ON_DEVICE_LABEL,
  FREENET_STOP_USER_SERVICE_ASK,
  FREENET_STOP_USER_SERVICE_CONFIRM,
  claimedKilledAndroidNode,
  killSwitchHonestMessage,
  leftoverAfterKillSwitch,
  maySignalAttachedListener,
  shouldConfirmStopUserService,
  shouldOfferKillSwitch,
  shouldOfferStartFreenet,
} from './kill-switch.ts';

export type { FreenetListenerKind } from './listener-owner.ts';
export type { FreenetQuitAskKind, FreenetQuitChoice } from './quit-ask.ts';

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
  FreenetAttachKind,
  FreenetHostStatus,
  FreenetHostStatusOptions,
  FreenetKillSwitchOptions,
  FreenetKillSwitchResult,
  FreenetLeftoverKind,
  FreenetIdentifyFn,
  FreenetInspectFn,
  FreenetListenerOwner,
  FreenetNodeRingInfo,
  FreenetProbeFn,
  FreenetPutCiphertextOptions,
  FreenetPutCiphertextResult,
  FreenetRingPeer,
  FreenetSlotPutInput,
  FreenetSlotPutResult,
  FreenetSpawnFn,
  FreenetVersionFn,
  FreenetWireClient,
} from './types.ts';

export {
  asRingLocation,
  emptyFreenetNodeRing,
  freenet02VersionString,
  isJsonObject,
  looksLikeFreenet02Version,
  looksLikeFreenet02VersionText,
  looksLikeHtmlStatusBody,
  mergeNodeVersion,
  parseFreenetNodeStatusJson,
} from './node-status-json.ts';

export {
  FREENET_PUT_ALREADY_IN_PROGRESS,
  FREENET_PUT_NOT_LISTENING,
  FREENET_PUT_WAIT_OPENNET,
  freenetPutReadyError,
  shouldEnforceFreenetPutReady,
} from './put-ready.ts';

export {
  FREENET_LOG_PEER_FRESH_MS,
  FREENET_LOG_RING_LAST,
  lineHasFreenetLogPeerCount,
  mergeFreenetRingFromLog,
  parseFreenetLogPeerCount,
  parseFreenetLogPeerLine,
  readFreenetLogContractTraffic,
  readFreenetLogPeerCount,
} from './log-peer-count.ts';

export type { FreenetLogPeerHit, FreenetLogPeerKey } from './log-peer-count.ts';

export {
  FREENET_CONTRACT_TRAFFIC_FADE_MS,
  FREENET_CONTRACT_TRAFFIC_FRESH_MS,
  FREENET_CONTRACT_TRAFFIC_MAX,
  asFreenetContractTrafficEvent,
  asFreenetContractTrafficList,
  createFreenetContractTrafficEvent,
  freenetContractTrafficLabel,
  mergeFreenetContractTraffic,
  parseFreenetLogContractLine,
  parseFreenetLogContractTraffic,
  slotKindFromStorageKey,
  visibleFreenetContractTraffic,
} from './contract-traffic.ts';

export type {
  FreenetContractDirection,
  FreenetContractOp,
  FreenetContractSlotKind,
  FreenetContractTrafficEvent,
  FreenetContractTrafficSource,
} from './contract-traffic.ts';
