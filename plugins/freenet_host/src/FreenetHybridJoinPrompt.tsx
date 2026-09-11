/**
 * `postSignInPrompt` — dismissible FarmCode offer after a PIN lands in a hybrid farm.
 * `Plans/LOGIN_JOIN_SINGLE_BOX.md` §2.6.
 */
import { useState } from 'react';
import { farmFreenetHostState } from '../../../shared/farm/networkPacks';
import { useAuth } from '../../../src/contexts/AuthContext';
import { mirroredCloudFarmId } from '../../../src/lib/farmPipes';
import { getFreenetHostCapability } from '../../../src/lib/freenetHostCapability.ts';
import { FreenetEnterFarmCode } from './FreenetEnterFarmCode';
import {
  dismissFarmCodePrompt,
  isFarmCodePromptDismissed,
  shouldOfferFarmCodePrompt,
} from './shouldOfferFarmCodePrompt.ts';

export default function FreenetHybridJoinPrompt() {
  const { userData, farmNetworkPacks } = useAuth();
  const farmId = userData?.farmId ?? '';
  const [entering, setEntering] = useState(false);
  const [hidden, setHidden] = useState(false);

  const offer =
    !hidden &&
    Boolean(farmId) &&
    shouldOfferFarmCodePrompt({
      enabled: farmFreenetHostState(farmNetworkPacks)?.enabled === true,
      farmId,
      seedCloudFarmId: mirroredCloudFarmId(),
      capability: getFreenetHostCapability(),
      dismissed: isFarmCodePromptDismissed(farmId),
    });

  if (!offer && !entering) return null;

  if (entering) {
    return (
      <div className="px-4 pt-4">
        <FreenetEnterFarmCode
          farmId={farmId}
          onCancel={() => setEntering(false)}
          onDone={() => {
            setEntering(false);
            setHidden(true);
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-4 mt-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 space-y-2">
      <p className="text-sm text-violet-950">
        <strong>This farm keeps a Freenet mirror.</strong> To take part from this computer, enter
        the paper FarmCode the owner holds. You can do it now or later under Settings → Plugins →
        Freenet.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setEntering(true)}
          className="px-3 py-1.5 rounded-lg bg-violet-800 text-white text-xs font-semibold"
        >
          Enter the FarmCode
        </button>
        <button
          type="button"
          onClick={() => {
            dismissFarmCodePrompt(farmId);
            setHidden(true);
          }}
          className="px-3 py-1.5 text-xs font-medium text-violet-800"
        >
          Later
        </button>
      </div>
    </div>
  );
}
