import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useNavigate, Link } from 'react-router-dom';
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
  Database,
  Zap,
} from 'lucide-react';
import { useAuth, OperationType, handleFirestoreError } from '../contexts/AuthContext';
import { db } from '../firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { InvitePinManager } from '../components/InvitePinManager';
import { FarmSyncCards } from '../components/sync/FarmSyncCards';
import { UnlockPinSettingsCard } from '../components/UnlockPinSettingsCard';
import { MistDeviceCard } from '../components/MistDeviceCard';
import { TabletHubCard } from '../components/TabletHubCard';
import { MistWorkshopCard } from '../components/MistWorkshopCard';
import {
  BlightEngineSettings,
  SliderControl,
} from '../components/blight/BlightEngineSettings';
import { DEFAULT_MODEL_PARAMS, type ModelParameters } from '../lib/modelParameters';
import { activeFarmPipe } from '../lib/farmPipes';
import { isWorkshopDiagnosticsEnabled } from '../lib/workshopMode';
import { useWalnutPack } from '../hooks/useWalnutPack';
import {
  ensureShareCrewLocationDefault,
  getShareCrewLocation,
  setShareCrewLocation,
} from '../lib/crewPresence';


function MarketEconomicsCard({
  params,
  onParamsChange,
  isLocked,
}: {
  params: ModelParameters;
  onParamsChange: (next: ModelParameters) => void;
  isLocked: boolean;
}) {
  const set = (patch: Partial<ModelParameters>) => onParamsChange({ ...params, ...patch });
  return (
    <div className="bg-white border border-indigo-100 p-6 rounded-2xl space-y-6 shadow-sm ring-1 ring-indigo-50 md:col-span-3 lg:col-span-1">
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
          isLocked={isLocked}
          onChange={(val) => set({ marketPrice: val })}
          description="Projected farm gate price for Nut-In-Shell."
        />

        <SliderControl 
          label="Harvest Cost (AUD/kg)"
          value={params.harvestCostPerKg || 0.45}
          min={0.1} max={2.0} step={0.05}
          isLocked={isLocked}
          onChange={(val) => set({ harvestCostPerKg: val })}
          description="Estimated cost per kg for harvesting and processing."
        />

        <SliderControl 
          label="Water Cost (AUD/ML)"
          value={params.waterCostPerML || 150}
          min={50} max={1000} step={10}
          isLocked={isLocked}
          onChange={(val) => set({ waterCostPerML: val })}
          description="Current cost of irrigation water per Megalitre."
        />
      </div>

      <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
        <p className="text-[9px] text-indigo-700 leading-relaxed">
          <span className="font-bold uppercase">Note:</span> These values directly impact the <strong>Projected Season Profit</strong> and <strong>ROI</strong> calculations on your dashboard.
        </p>
      </div>
    </div>
  );
}

export function Settings() {
  const navigate = useNavigate();
  const { userData, user, isAdmin } = useAuth();
  const hasWalnutPack = useWalnutPack();
  const [activeTab, setActiveTab] = useState<'general' | 'sync' | 'advanced'>('general');
  const farmPipe = activeFarmPipe();
  const [params, setParams] = useState<ModelParameters>(DEFAULT_MODEL_PARAMS);
  const [isLocked, setIsLocked] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [shareCrewLocation, setShareCrewLocationState] = useState(() => getShareCrewLocation());

  useEffect(() => {
    void ensureShareCrewLocationDefault().then((v) => setShareCrewLocationState(v));
  }, [userData?.uid]);

  useEffect(() => {
    if (!userData?.farmId) return;

    const docRef = doc(db, 'farms', userData.farmId, 'settings', 'model_params');
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setParams({
          ...DEFAULT_MODEL_PARAMS,
          ...docSnap.data()
        } as ModelParameters);
      } else {
        // Initialize with defaults if not exists
        setParams(DEFAULT_MODEL_PARAMS);
      }
      setLoading(false);
    }, (error) => {
      setLoading(false);
      try {
        handleFirestoreError(error, OperationType.GET, `farms/${userData.farmId}/settings/model_params`);
      } catch (e) {
        // Error is already logged by handleFirestoreError
      }
    });

    return () => unsubscribe();
  }, [userData?.farmId]);

  const handleSaveParams = async () => {
    if (!userData?.farmId || !isAdmin) return;
    
    setSaving(true);
    setMessage(null);

    try {
      const docRef = doc(db, 'farms', userData.farmId, 'settings', 'model_params');
      await setDoc(docRef, params);
      setIsLocked(true);
      setMessage({ type: 'success', text: 'Model parameters updated successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update parameters. Check permissions.' });
      try {
        handleFirestoreError(error, OperationType.WRITE, `farms/${userData.farmId}/settings/model_params`);
      } catch (e) {
        // Error is already logged by handleFirestoreError
      }
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (window.confirm('Are you sure you want to reset all parameters to regional defaults?')) {
      setParams(DEFAULT_MODEL_PARAMS);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500 font-mono">INITIALIZING ENGINE...</div>;
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-8 pb-20">
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <SettingsIcon className="w-8 h-8 text-slate-700" />
            Settings
          </h1>
          <p className="text-slate-500">Manage your farm configuration and engine parameters.</p>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {(
          [
            { id: 'general', label: 'General' },
            { id: 'sync', label: 'Sync' },
            { id: 'advanced', label: 'Advanced' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-3 text-sm font-medium transition-colors relative ${
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
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-2">
              <h2 className="text-lg font-bold text-slate-900">How this farm moves around</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                {farmPipe === 'freenet' ? (
                  <>
                    This farm lives on its devices, not in a cloud account. It travels two ways:
                    over <strong>Wi‑Fi</strong> between devices on the same network, and over{' '}
                    <strong>Freenet</strong> to a device anywhere else. That was chosen when the
                    farm was created and is not switched here.
                  </>
                ) : (
                  <>
                    This farm is kept in the <strong>cloud</strong>, so every device with an invite
                    sees the same thing. It also travels over <strong>Wi‑Fi</strong> between devices
                    on the same network when there is no internet. That was chosen when the farm was
                    created and is not switched here.
                  </>
                )}
              </p>
            </div>

            <TabletHubCard />

            <FarmSyncCards />

            {/*
              Every knob and hash for the Freenet / local-store path. A farmer
              never needs it and it is the loudest thing on the page, so it is
              bench-only rather than shipped with the app.
            */}
            {isWorkshopDiagnosticsEnabled() && <MistWorkshopCard />}
          </div>
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
                  , together with the FarmCode and its device PIN. Everyone who has been handed one
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
                    Invite PIN / workshop defaults on; turn off anytime.
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
                  The Model Modifier Menu is restricted to Farm Managers and Researchers with Administrative privileges.
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {!hasWalnutPack && (
                  <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl space-y-2">
                    <h2 className="text-lg font-bold text-slate-900">Walnut crop pack off</h2>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Walnut blight calibration stays hidden until this farm has the walnut crop pack — set
                      orchard/tree + walnut species in{' '}
                      <Link to="/farm-setup" className="font-semibold text-emerald-700 hover:underline">
                        Farm setup
                      </Link>
                      , or mark a map area as walnut. Market cost inputs below still apply for any enterprise.
                    </p>
                  </div>
                )}

                {message && !hasWalnutPack && (
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

                {hasWalnutPack ? (
                  <BlightEngineSettings
                    params={params}
                    onParamsChange={setParams}
                    isLocked={isLocked}
                    onToggleLock={() => setIsLocked(!isLocked)}
                    afterHeader={
                      message ? (
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
                      ) : null
                    }
                    gridTrailing={
                      <MarketEconomicsCard
                        params={params}
                        onParamsChange={setParams}
                        isLocked={isLocked}
                      />
                    }
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <MarketEconomicsCard
                      params={params}
                      onParamsChange={setParams}
                      isLocked={false}
                    />
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                  <button
                    onClick={handleSaveParams}
                    disabled={saving}
                    className="flex-1 bg-[#141414] text-[#E4E3E0] py-4 rounded-xl font-mono text-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors disabled:opacity-50"
                  >
                    {saving ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Processing...' : 'Deploy Parameters'}
                  </button>
                  {hasWalnutPack && (
                  <button
                    onClick={handleResetDefaults}
                    className="px-6 py-4 border border-[#141414] text-[#141414] rounded-xl font-mono text-xs font-bold uppercase hover:bg-white transition-colors"
                  >
                    Reset to Defaults
                  </button>
                  )}
                </div>

                <div className="p-4 bg-slate-100 border border-slate-200 rounded-xl flex items-start gap-3">
                  <Database className="w-5 h-5 text-slate-500 shrink-0" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-700 uppercase font-mono">Audit Log Active</p>
                    <p className="text-[10px] text-slate-500 italic">
                      All parameter changes are logged with timestamp and user ID: {user?.uid}. 
                      Historical engine states are preserved for research reconciliation.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
