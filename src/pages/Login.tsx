import { Loader2 } from 'lucide-react';
import { APP_NAME } from '../brand';
import { WelcomeChooser } from '../components/login/WelcomeChooser';
import { CloudSyncOptions } from '../components/login/CloudSyncOptions';
import { ByoFirebaseExplain } from '../components/login/ByoFirebaseExplain';
import { ByoFirebaseSetup } from '../components/login/ByoFirebaseSetup';
import { ByoFirebaseConfigPaste } from '../components/login/ByoFirebaseConfigPaste';
import { ByoFirebaseRules } from '../components/login/ByoFirebaseRules';
import { PufworksSubscribeExplain } from '../components/login/PufworksSubscribeExplain';
import { PackSurfaces } from '../components/PackSurfaces';
import { LoginCloudForm } from '../components/login/LoginCloudForm';
import { LoginRecoveryScreen } from '../components/login/LoginRecoveryScreen';
import { JoinCodeEntry } from '../components/login/JoinCodeEntry';
import { JoinCloudNameStep } from '../components/login/JoinCloudNameStep';
import { JoinFreenetUnavailable } from '../components/login/JoinFreenetUnavailable';
import { useLoginFlow } from '../hooks/useLoginFlow';

export function Login() {
  const flow = useLoginFlow();
  const { loading, setLocalError, setByoDraftConfig, byoDraftConfig, freenetOption, step, setStep } =
    flow;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Loading {APP_NAME}...</p>
        </div>
      </div>
    );
  }

  if (flow.recoveryPin) {
    return <LoginRecoveryScreen flow={flow} />;
  }

  if (step === 'join') {
    const { stage } = flow.join;
    if (stage === 'cloud-name') return <JoinCloudNameStep flow={flow} />;
    if (stage === 'freenet-unavailable') {
      return <JoinFreenetUnavailable onBack={() => flow.join.back()} />;
    }
    if (stage === 'freenet' && flow.freenetJoinAvailability !== 'none') {
      return (
        <PackSurfaces
          surface="loginJoin"
          code={flow.join.classification.normalized}
          kind={flow.join.classification.kind === 'join-ticket' ? 'join-ticket' : 'farm-code'}
          heldTicket={flow.join.heldTicket ?? undefined}
          availability={flow.freenetJoinAvailability}
          onBack={() => flow.join.back()}
        />
      );
    }
    return <JoinCodeEntry flow={flow} />;
  }

  if (step === 'create-choose') {
    return (
      <WelcomeChooser
        freenetOption={freenetOption}
        onCloud={() => {
          setStep('cloud-options');
          setLocalError(null);
        }}
        onFreenet={() => {
          setStep('freenet-explain');
          setLocalError(null);
        }}
        onBack={() => {
          setStep('join');
          setLocalError(null);
        }}
      />
    );
  }

  if (step === 'cloud-options') {
    return (
      <CloudSyncOptions
        canGoWelcome={freenetOption !== 'hidden'}
        onPufworks={() => {
          setStep('firebase');
          setLocalError(null);
        }}
        onByo={() => {
          setStep('cloud-byo');
          setLocalError(null);
        }}
        onSubscribe={() => {
          setStep('cloud-subscribe');
          setLocalError(null);
        }}
        onBack={() => {
          setStep(freenetOption === 'hidden' ? 'join' : 'create-choose');
          setLocalError(null);
        }}
      />
    );
  }

  const openFreenet =
    freenetOption === 'hidden' ? undefined : () => setStep('freenet-explain');

  if (step === 'cloud-byo') {
    return (
      <ByoFirebaseExplain
        onBack={() => setStep('cloud-options')}
        onFreenet={openFreenet}
        onContinue={() => setStep('cloud-byo-setup')}
      />
    );
  }

  if (step === 'cloud-byo-setup') {
    return (
      <ByoFirebaseSetup
        onBack={() => setStep('cloud-byo')}
        onFreenet={openFreenet}
        onContinue={() => setStep('cloud-byo-config')}
      />
    );
  }

  if (step === 'cloud-byo-config') {
    return (
      <ByoFirebaseConfigPaste
        onBack={() => setStep('cloud-byo-setup')}
        onValid={(config) => {
          setByoDraftConfig(config);
          setStep('cloud-byo-rules');
        }}
      />
    );
  }

  if (step === 'cloud-byo-rules' && byoDraftConfig) {
    return <ByoFirebaseRules config={byoDraftConfig} onBack={() => setStep('cloud-byo-config')} />;
  }

  if (step === 'cloud-subscribe') {
    return (
      <PufworksSubscribeExplain
        onBack={() => setStep('cloud-options')}
        onFreenet={openFreenet}
        onPufworks={() => setStep('firebase')}
      />
    );
  }

  if (step === 'freenet-explain') {
    return (
      <PackSurfaces
        surface="loginExplain"
        optionState={freenetOption}
        onBack={() => setStep('create-choose')}
      />
    );
  }

  return <LoginCloudForm flow={flow} />;
}
