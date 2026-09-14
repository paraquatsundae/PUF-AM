/**
 * Pure reducer for the single-box join (`Plans/LOGIN_JOIN_SINGLE_BOX.md` §2.4–2.5).
 *
 * Crew invite (`PUF-` + 26) advances to Freenet. A short 8-symbol ticket is
 * refused (cannot unwrap the farm). FarmCode is owner recover only. Hosted web
 * (`availability === 'none'`) discards both — decision 5.
 */

import type { FreenetHostCapability } from './freenetHostCapability.ts';
import { normalizeInviteToken } from '../../shared/sync/inviteToken.ts';
import {
  SHORT_TICKET_REFUSED,
  TICKET_FIRST_NOTICE,
  classifyJoinCode,
  type JoinCodeClassification,
} from './joinCodeClassifier.ts';

export type JoinStage = 'code' | 'cloud-name' | 'freenet' | 'freenet-unavailable';

export type FreenetJoinAvailability = 'host' | 'reader' | 'none';

export type JoinCodeState = {
  input: string;
  classification: JoinCodeClassification;
  stage: JoinStage;
  heldTicket: string | null;
  /** Farmer-facing hold notice after a ticket was typed first. */
  notice: string | null;
};

export type JoinCodeAction =
  | { type: 'TYPE'; input: string }
  | { type: 'CONTINUE' }
  | { type: 'BACK' }
  | { type: 'CHANGE_CODE' };

export function freenetJoinAvailability(input: {
  capability: FreenetHostCapability;
  native: boolean;
  workshopHub: boolean;
  /** Capacitor FreenetHost plugin — this APK can start :7509 itself. */
  canStartOwnNode?: boolean;
}): FreenetJoinAvailability {
  if (input.capability === 'electron' || input.capability === 'android' || input.workshopHub) {
    return 'host';
  }
  if (input.native && input.canStartOwnNode) return 'host';
  if (input.native) return 'reader';
  return 'none';
}

export function initialJoinState(): JoinCodeState {
  return {
    input: '',
    classification: classifyJoinCode(''),
    stage: 'code',
    heldTicket: null,
    notice: null,
  };
}

function emptyCode(heldTicket: string | null, notice: string | null): JoinCodeState {
  return {
    ...initialJoinState(),
    heldTicket,
    notice,
  };
}

/**
 * CONTINUE on a crew invite or FarmCode goes to `freenet`. A short `PUF-`
 * ticket stays on `code` with an honest refuse. Web (`none`) goes to
 * `freenet-unavailable` and drops the string.
 */
export function joinCodeReducer(
  state: JoinCodeState,
  action: JoinCodeAction,
  availability: FreenetJoinAvailability,
): JoinCodeState {
  switch (action.type) {
    case 'TYPE': {
      return {
        ...state,
        input: action.input,
        classification: classifyJoinCode(action.input),
      };
    }
    case 'CHANGE_CODE': {
      return {
        ...state,
        stage: 'code',
        notice: state.heldTicket ? TICKET_FIRST_NOTICE : null,
      };
    }
    case 'BACK': {
      return emptyCode(null, null);
    }
    case 'CONTINUE': {
      const { kind, normalized } = state.classification;
      if (kind === 'unknown' || kind === 'hub-pairing') return state;
      // Invalid / incomplete FarmCode or ticket is kind-recognised with an empty
      // normalized string — stay on the box, do not open the Freenet step.
      if (!normalized) return state;

      if (kind === 'invite-pin') {
        if (normalized.length !== 8) return state;
        return { ...state, stage: 'cloud-name', notice: null };
      }

      if (kind === 'join-ticket') {
        if (!normalizeInviteToken(normalized)) {
          return { ...state, notice: SHORT_TICKET_REFUSED };
        }
        if (availability === 'none') {
          return { ...emptyCode(null, null), stage: 'freenet-unavailable' };
        }
        return { ...state, stage: 'freenet', heldTicket: null, notice: null };
      }

      if (kind !== 'farm-code') return state;
      if (availability === 'none') {
        return { ...emptyCode(null, null), stage: 'freenet-unavailable' };
      }
      return { ...state, stage: 'freenet', notice: null };
    }
    default:
      return state;
  }
}
