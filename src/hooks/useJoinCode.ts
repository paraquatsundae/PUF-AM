/**
 * One-job hook: join-box reducer + live formatting.
 * `Plans/LOGIN_JOIN_SINGLE_BOX.md` §2.5.
 */

import { useCallback, useMemo, useReducer } from 'react';
import { formatJoinCodeInput } from '../lib/joinCodeClassifier.ts';
import {
  initialJoinState,
  joinCodeReducer,
  type FreenetJoinAvailability,
  type JoinCodeAction,
  type JoinCodeState,
} from '../lib/joinCodeFlow.ts';

export function useJoinCode(opts: { availability: FreenetJoinAvailability }) {
  const { availability } = opts;
  const reducer = useCallback(
    (state: JoinCodeState, action: JoinCodeAction) => joinCodeReducer(state, action, availability),
    [availability],
  );
  const [state, dispatch] = useReducer(reducer, undefined, initialJoinState);

  const setInput = useCallback((raw: string) => {
    dispatch({ type: 'TYPE', input: formatJoinCodeInput(raw) });
  }, []);

  const goContinue = useCallback(() => {
    dispatch({ type: 'CONTINUE' });
  }, []);

  const back = useCallback(() => {
    dispatch({ type: 'BACK' });
  }, []);

  const changeCode = useCallback(() => {
    dispatch({ type: 'CHANGE_CODE' });
  }, []);

  return useMemo(
    () => ({
      input: state.input,
      setInput,
      classification: state.classification,
      stage: state.stage,
      continue: goContinue,
      back,
      changeCode,
      heldTicket: state.heldTicket,
      notice: state.notice,
      availability,
    }),
    [
      state.input,
      state.classification,
      state.stage,
      state.heldTicket,
      state.notice,
      setInput,
      goContinue,
      back,
      changeCode,
      availability,
    ],
  );
}

export type JoinCodeFlow = ReturnType<typeof useJoinCode>;
