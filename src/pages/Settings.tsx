import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { 
  Settings as SettingsIcon, 
  Shield, 
  Save, 
  RefreshCcw, 
  AlertTriangle,
  ChevronRight,
  FileText,
  DollarSign,
  Zap,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { InvitePinManager } from '../components/InvitePinManager';
import { useFarmEconomicsSettings } from '../hooks/useFarmEconomicsSettings';
import { FarmSyncCards } from '../components/sync/FarmSyncCards';
import { UnlockPinSettingsCard } from '../components/UnlockPinSettingsCard';
import { MistDeviceCard } from '../components/MistDeviceCard';
import { TabletHubCard } from '../components/TabletHubCard';
import { MistWorkshopCard } from '../components/MistWorkshopCard';
import { PluginsPanel } from '../components/PluginsPanel';
import { SliderControl } from '../components/ui/SliderControl';
import { type EconomicsModelParams } from '../lib/modelParameters';
import { activeFarmPipe } from '../lib/farmPipes';
import { isWorkshopDiagnosticsEnabled } from '../lib/workshopMode';
import {
  ensureShareCrewLocationDefault,
  getShareCrewLocation,
  setShareCrewLocation,
} from '../lib/crewPresence';

type SettingsTab = 'general' | 'plugins' | 'sync' | 'economics';

const SETTINGS_TABS: readonly { id: SettingsTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'sync', label: 'Sync' },
  { id: 'economics', label: 'Economics' },
];

function isSettingsTab(value: string | null): value is SettingsTab {
  return Boolean(value && SETTINGS_TABS.some((t) => t.id === value));
}

function MarketEconomicsCard({
  params,
  onParamsChange,
}: {
  params: EconomicsModelParams;
  onParamsChange: (next: EconomicsModelParams) => void;
}) {
  const set = (patch: Partial<EconomicsModelParams>) => onParamsChange({ ...params, ...patch });
  return (
    <div className="bg-white border border-indigo-100 p-6 rounded-2xl space-y-6 shadow-sm ring-1 ring-indigo-50 max-w-xl">
      <div className="flex items-center gap-3 border-b border-indigo-50 pb-3">
        <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
          <DollarSign className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Market & Economics</h3>
          <p className="text-[10px] text-slate-400 font-medium">FINANCIAL MODELING INPUTS</p>
        </div>
      </div>
      
      <div className="space-y-6">
        <SliderControl 
          label="Market Price (AUD/kg)"
          value={params.marketPrice || 3.30}
          min={1.0} max={10.0} step={0.1}
          isLocked={false}
          onChange={(val) => set({ marketPrice: val })}
          description="Projected farm gate price for Nut-In-Shell."
        />

        <SliderControl 
          label="Harvest Cost (AUD/kg)"
          value={params.harvestCostPerKg || 0.45}
          min={0.1} max={2.0} step={0.05}
          isLocked={false}
          onChange={(val) => set({ harvestCostPerKg: val })}
          description="Estimated cost per kg for harvesting and processing."
        />

        <SliderControl 
          label="Water Cost (AUD/ML)"
          value={params.waterCostPerML || 150}
          min={50} max={1000} step={10}
          isLocked={false}
          onChange={(val) => set({ waterCostPerML: val })}
          description="Current cost of irrigation water per Megalitre."
        />
      </div>

      <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
        <p className="text-[9px] text-indigo-700 leading-relaxed">
          <span className="font-bold uppercase">Note:</span> These values feed projected season profit / ROI
          style numbers where those surfaces read them. Walnut blight research knobs live under{' '}
          <Link to="/blight" className="font-semibold underline underline-offset-2">
            Blight risk → Sandbox
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

export function Settings() {
  const navigate = useNavigate();
  const { userData, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTabState] = useState<SettingsTab>(() =>
    isSettingsTab(tabParam) ? tabParam : 'general'
  );
  const farmPipe = activeFarmPipe();
  const { economics, setEconomics, loading, saving, message, saveEconomics } = useFarmEconomicsSettings(
    userData?.farmId,
    isAdmin
  );
  const [shareCrewLocation, setShareCrewLocationState] = useState(() => getShareCrewLocation());

  const setActiveTab = (id: SettingsTab) => {
    setActiveTabState(id);
    setSearchParams(id === 'general' ? {} : { tab: id }, { replace: true });
  };

  useEffect(() => {
    if (isSettingsTab(tabParam) && tabParam !== activeTab) {
      setActiveTabState(tabParam);
    }
  }, [tabParam, activeTab]);

  useEffect(() => {
    void ensureShareCrewLocationDefault().then((v) => setShareCrewLocationState(v));
  }, [userData?.uid]);

  if (loading) {
    return <div className="p-8 text-center text-slate-500 font-mono">Loading settings…</div>;
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-8 pb-20">
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <SettingsIcon className="w-8 h-8 text-slate-700" />
            Settings
          </h1>
          <p className="text-slate-500">Manage your farm configuration and market inputs.</p>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto">
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-3 text-sm font-medium transition-colors relative shrink-0 ${
              activeTab === tab.id ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <motion.div
                layoutId="tab-underline"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600"
              />
            )}
          </button>
        ))}
      </div>

      <div className="py-4">
        {activeTab === 'sync' ? (
          <div className="space-y-6">
            <TabletHubCard />
            <FarmSyncCards />
            {isWorkshopDiagnosticsEnabled() && <MistWorkshopCard />}
          </div>
        ) : activeTab === 'plugins' ? (
          <PluginsPanel onOpenSync={() => setActiveTab('sync')} />
        ) : activeTab === 'general' ? (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-slate-900">Farm Profile</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Farm Name</label>
                  <input 
                    type="text" 
                    readOnly 
                    value={userData?.farmId || 'Loading...'} 
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed"
                  />
                  <p className="text-[10px] text-slate-400 italic">Farm ID is managed by the organization administrator.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Subscription Tier</label>
                  <div className="p-2 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-700 font-bold uppercase text-xs flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    {userData?.subscriptionTier || 'Free'}
                  </div>
                </div>
              </div>
            </div>

            {/*
              Invite PINs are a Firebase mechanism — the code is minted and
              redeemed against the cloud farm doc. On a Freenet farm the way
              somebody joins is a join ticket, under Sync, so offering a PIN
              here would be a button with nothing behind it.
            */}
            {isAdmin && farmPipe === 'cloud' && <InvitePinManager />}

            {farmPipe === 'freenet' && (
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-2">
                <h2 className="text-lg font-bold text-slate-900">Crew</h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  This farm has no cloud account, so there are no invite PINs. Somebody joins by
                  being read a join ticket from{' '}
                  <button
                    type="button"
                    onClick={() => setActiveTab('sync')}
                    className="font-semibold text-emerald-700 hover:underline"
                  >
                    Sync
                  </button>
                  , together with the paper FarmCode they already wrote down. A device PIN is only
                  needed if they set one when they recovered. Everyone who has been handed a ticket
                  is listed under{' '}
                  <Link to="/farm-setup" className="font-semibold text-emerald-700 hover:underline">
                    Farm setup → People
                  </Link>
                  .
                </p>
              </div>
            )}

            <MistDeviceCard />

            <UnlockPinSettingsCard />

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-slate-900">Privacy</h2>
              <div className="flex items-center justify-between gap-4 p-4 bg-slate-50 rounded-xl">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">Share location with farm crew</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    While the Farm Map is open, other signed-in members see your live GPS marker.
                    {farmPipe === 'freenet'
                      ? ' On Freenet, only people on the same Wi‑Fi see you — there is no cloud crew list. Defaults on here; turn off anytime.'
                      : ' Invite PIN / workshop defaults on; turn off anytime.'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={shareCrewLocation}
                  onClick={() => {
                    const next = !shareCrewLocation;
                    setShareCrewLocation(next);
                    setShareCrewLocationState(next);
                  }}
                  className={clsx(
                    'relative w-12 h-6 rounded-full shrink-0 transition-colors',
                    shareCrewLocation ? 'bg-emerald-600' : 'bg-slate-300'
                  )}
                >
                  <span
                    className={clsx(
                      'absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all',
                      shareCrewLocation ? 'left-7' : 'left-1'
                    )}
                  />
                </button>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-slate-900">Legal & Compliance</h2>
              <div className="space-y-2">
                <button 
                  onClick={() => navigate('/privacy')}
                  className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-emerald-600" />
                    <span className="font-medium text-slate-900">Privacy Policy</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-emerald-600 transition-colors" />
                </button>
                <button 
                  onClick={() => navigate('/terms')}
                  className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-indigo-600" />
                    <span className="font-medium text-slate-900">Terms of Service</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {!isAdmin ? (
              <div className="bg-amber-50 border border-amber-200 p-8 rounded-2xl text-center space-y-4">
                <Shield className="w-12 h-12 text-amber-600 mx-auto" />
                <h2 className="text-xl font-bold text-amber-900">Restricted Access</h2>
                <p className="text-amber-700 max-w-md mx-auto">
                  Market & economics inputs are restricted to farm administrators.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
                  Farm-gate price and cost inputs for financial modelling. Walnut blight research knobs moved to{' '}
                  <Link to="/blight" className="font-semibold text-emerald-700 hover:underline">
                    Blight risk → Sandbox → Research modifiers
                  </Link>
                  ; orchard inoculum (Ji k) is on Blight risk for everyone who can see the pack.
                </p>

                {message && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium ${
                      message.type === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {message.type === 'success' ? <Save className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    {message.text}
                  </motion.div>
                )}

                <MarketEconomicsCard params={economics} onParamsChange={setEconomics} />

                <button
                  type="button"
                  onClick={() => void saveEconomics()}
                  disabled={saving}
                  className="w-full sm:w-auto px-8 bg-[#141414] text-[#E4E3E0] py-4 rounded-xl font-mono text-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  {saving ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving ? 'Saving…' : 'Save economics'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
