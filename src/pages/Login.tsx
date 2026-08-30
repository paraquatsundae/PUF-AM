import { Loader2 } from 'lucide-react';
import { APP_NAME } from '../brand';
import { WelcomeChooser } from '../components/login/WelcomeChooser';
import { CloudSyncOptions } from '../components/login/CloudSyncOptions';
import { ByoFirebaseExplain } from '../components/login/ByoFirebaseExplain';
import { ByoFirebaseSetup } from '../components/login/ByoFirebaseSetup';
import { ByoFirebaseConfigPaste } from '../components/login/ByoFirebaseConfigPaste';
import { ByoFirebaseRules } from '../components/login/ByoFirebaseRules';
import { PufworksSubscribeExplain } from '../components/login/PufworksSubscribeExplain';
import { FreenetExplain } from '../components/login/FreenetExplain';
import { LoginCloudForm } from '../components/login/LoginCloudForm';
import { LoginRecoveryScreen } from '../components/login/LoginRecoveryScreen';
import { useLoginFlow } from '../hooks/useLoginFlow';

export function Login() {
  const flow = useLoginFlow();
  const { loading, navigate, setLocalError, setByoDraftConfig, byoDraftConfig, freenetOption, step, setStep } =
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

  if (step === 'choose') {
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
          setStep('choose');
          setLocalError(null);
        }}
      />
    );
  }

  if (step === 'cloud-byo') {
    return (
      <ByoFirebaseExplain
        onBack={() => setStep('cloud-options')}
        onFreenet={() => setStep('freenet-explain')}
        onContinue={() => setStep('cloud-byo-setup')}
      />
    );
  }

  if (step === 'cloud-byo-setup') {
    return (
      <ByoFirebaseSetup
        onBack={() => setStep('cloud-byo')}
        onFreenet={() => setStep('freenet-explain')}
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
        onFreenet={() => setStep('freenet-explain')}
        onPufworks={() => setStep('firebase')}
      />
    );
  }

  if (step === 'freenet-explain') {
    return (
      <FreenetExplain
        freenetOption={freenetOption}
        onStart={() => navigate('/login/mist-new-farm')}
        onJoin={() => navigate('/login/mist-recover')}
        onBack={() => setStep('choose')}
      />
    );
  }

  return <LoginCloudForm flow={flow} />;
}
