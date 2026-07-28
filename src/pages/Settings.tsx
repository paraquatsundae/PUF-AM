import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { 
  Settings as SettingsIcon, 
  Shield, 
  Cpu, 
  Save, 
  RefreshCcw, 
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Info,
  Database,
  Zap,
  Droplets,
  ThermometerSun,
  FileText,
  ExternalLink,
  Map as MapIcon,
  DollarSign,
  Lock,
  Unlock,
  Plus,
  Minus
} from 'lucide-react';
import { useAuth, OperationType, handleFirestoreError } from '../contexts/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { InvitePinManager } from '../components/InvitePinManager';
import { OfflineSyncCard } from '../components/OfflineSyncCard';
import { useWalnutPack } from '../hooks/useWalnutPack';
import {
  ensureShareCrewLocationDefault,
  getShareCrewLocation,
  setShareCrewLocation,
} from '../lib/crewPresence';
import { Link } from 'react-router-dom';

interface ModelParameters {
  blightSensitivity: number;
  cropCoefficient: number;
  gddBaseTemp: number;
  humidityGradientFactor: number;
  splashMultiplier: number;
  chemRainWashoffRate: number;
  bioColonizationEff: number;
  bioFavorableGrowthRate: number;
  bioEnvDegradationCoef: number;
  springStartingInoculum: number;
  orchardInoculumLevel: 'low' | 'medium' | 'high';
  latencyGDDThreshold: number;
  secondarySpreadMultiplier: number;
  treeHeight: number;
  canopyWidth: number;
  rowSpacing: number;
  chemEfficacy: number;
  bioEfficacy: number;
  marketPrice: number;
  harvestCostPerKg: number;
  waterCostPerML: number;
}

const DEFAULT_PARAMS: ModelParameters = {
  blightSensitivity: 0.85,
  cropCoefficient: 1.15,
  gddBaseTemp: 10.0,
  humidityGradientFactor: 1.2,
  splashMultiplier: 1.5,
  chemRainWashoffRate: 0.05,
  bioColonizationEff: 0.75,
  bioFavorableGrowthRate: 1.1,
  bioEnvDegradationCoef: 0.75,
  springStartingInoculum: 0.02,
  orchardInoculumLevel: 'medium',
  latencyGDDThreshold: 120.0,
  secondarySpreadMultiplier: 1.0,
  treeHeight: 4.5,
  canopyWidth: 4.0,
  rowSpacing: 7.0,
  chemEfficacy: 95,
  bioEfficacy: 30,
  marketPrice: 3.30,
  harvestCostPerKg: 0.45,
  waterCostPerML: 150
};

function ParameterGlossary() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-[#E4E3E0] border border-[#141414] rounded-2xl overflow-hidden mt-6">
      <div 
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-[#d6d5d2] transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3">
          <Info className="w-5 h-5 text-[#141414]" />
          <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-[#141414]">Parameter Glossary & Measurement Guide</h3>
        </div>
        {isOpen ? <ChevronUp className="w-5 h-5 text-[#141414]" /> : <ChevronDown className="w-5 h-5 text-[#141414]" />}
      </div>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="p-6 pt-0 border-t border-[#141414]/20 space-y-8 text-sm text-[#141414] mt-4 font-sans">
              
              {/* Blight Risk Parameters */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-[#141414]/20 pb-2">
                  <Zap className="w-4 h-4 text-amber-600" />
                  <h3 className="font-mono text-sm font-bold uppercase tracking-wider">Blight Risk Parameters</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <h4 className="font-bold">Sensitivity Threshold</h4>
                    <p className="text-xs leading-relaxed"><strong>What it is:</strong> A modifier that adjusts the baseline susceptibility of the orchard to <em>Xanthomonas arboricola pv. juglandis</em>. It acts as a genetic or historical risk weight.</p>
                    <p className="text-xs leading-relaxed"><strong>How it is measured:</strong> Determined by the specific walnut cultivar planted in the block (e.g., 'Chandler' vs. 'Franquette') and historical disease pressure. It is input as a relative decimal: <code>1.0</code> represents average susceptibility, <code>&lt; 1.0</code> indicates a highly resistant block, and <code>&gt; 1.0</code> indicates a highly susceptible block with a history of severe blight.</p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold">Humidity Gradient Factor</h4>
                    <p className="text-xs leading-relaxed"><strong>What it is:</strong> An environmental multiplier that accounts for the discrepancy between the relative humidity (RH) recorded by an open-air weather station and the actual RH trapped deep inside the orchard canopy.</p>
                    <p className="text-xs leading-relaxed"><strong>How it is measured:</strong> Calibrated by temporarily placing micro-sensors inside the canopy and comparing their readings to the main farm weather station. A value of <code>1.0</code> assumes the canopy matches the weather station; a value like <code>1.2</code> simulates a microclimate that stays 20% more humid than the surrounding air.</p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold">Splash Multiplier</h4>
                    <p className="text-xs leading-relaxed"><strong>What it is:</strong> A kinetic energy variable that simulates how effectively heavy rainfall physically disperses bacteria from infected tissues (like overwintering buds) to healthy tissues.</p>
                    <p className="text-xs leading-relaxed"><strong>How it is measured:</strong> Based on regional weather patterns and storm intensity. If the orchard is in a region prone to sudden, violent downpours (high kinetic energy), this should be increased (e.g., <code>1.2</code> to <code>1.5</code>). If the region typically experiences light, misty rain, it should remain closer to <code>1.0</code>.</p>
                  </div>
                </div>
              </div>

              {/* Horticultural Parameters */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-[#141414]/20 pb-2">
                  <ThermometerSun className="w-4 h-4 text-emerald-600" />
                  <h3 className="font-mono text-sm font-bold uppercase tracking-wider">Horticultural Parameters</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <h4 className="font-bold">Crop Coefficient (Kc)</h4>
                    <p className="text-xs leading-relaxed"><strong>What it is:</strong> A rough canopy-coverage factor used in water budgeting UI — not the blight TRV/CDF path.</p>
                    <p className="text-xs leading-relaxed"><strong>How it is measured:</strong> Estimated from canopy width ÷ row spacing when those values are available.</p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold">GDD Base Temp (°C)</h4>
                    <p className="text-xs leading-relaxed"><strong>What it is:</strong> The minimum temperature threshold below which pathogen GDD (and experimental latency) stalls — not the chill Dynamic Model base.</p>
                    <p className="text-xs leading-relaxed"><strong>How it is set:</strong> Default <code>10.0°C</code> for Persian walnuts. Separate from the SH <strong>calendar phenology</strong> table (May–Aug dormant → Oct bloom) used on Forecast / Historical.</p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold">Calendar phenology (not a slider)</h4>
                    <p className="text-xs leading-relaxed"><strong>What it is:</strong> Hard-coded Southern-Hemisphere month → stage schedule in the blight engine. Susceptibility: dormant 0.1, bud break 1.5, bloom 2.0, post-bloom 1.0, shell hardening 0.3.</p>
                    <p className="text-xs leading-relaxed"><strong>Override:</strong> Blight Risk → <em>Scouted override</em> (from today forward, session-only). Sandbox locks a fixed stage. Diary-persisted scouting is later work.</p>
                  </div>

                </div>
              </div>

              {/* Inoculum & Latency */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-[#141414]/20 pb-2">
                  <Database className="w-4 h-4 text-blue-600" />
                  <h3 className="font-mono text-sm font-bold uppercase tracking-wider">Threat start & latency</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <h4 className="font-bold">Initial threat floor</h4>
                    <p className="text-xs leading-relaxed"><strong>What it is:</strong> The unitless threat value at the start of a blight model run. Weather then rebuilds (or decays) the curve from there.</p>
                    <p className="text-xs leading-relaxed"><strong>How it is set:</strong> A plain calibration knob — <strong>not</strong> loaded from last season’s disease map, dormant sprays, or bud CFU. Default <code>0.02</code> is a small floor so the chart is not stuck at absolute zero before the first wet days. Raise it only if you want a higher baseline for what-ifs.</p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold">Latency GDD Threshold</h4>
                    <p className="text-xs leading-relaxed"><strong>What it is:</strong> Sandbox-only (experimental). Heat units before queued infection pressure “erupts” when Latency / secondary is on.</p>
                    <p className="text-xs leading-relaxed"><strong>How it is set:</strong> Default <code>120 GDD</code> — not fitted to WA lesion timing. Forecast and Historical ignore this.</p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold">Secondary Spread Multiplier</h4>
                    <p className="text-xs leading-relaxed"><strong>What it is:</strong> Sandbox-only (experimental). Multiplier on erupting latent pressure.</p>
                    <p className="text-xs leading-relaxed"><strong>How it is set:</strong> Default <code>1.0</code> = no extra bump. Raise only for what-ifs — not a field-validated secondary-inoculum model.</p>
                  </div>
                </div>
              </div>

              {/* Sandbox protection */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-[#141414]/20 pb-2">
                  <Shield className="w-4 h-4 text-indigo-600" />
                  <h3 className="font-mono text-sm font-bold uppercase tracking-wider">Sandbox protection (what-if)</h3>
                </div>
                <p className="text-xs leading-relaxed bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  These knobs only change the <strong>Blight → Sandbox</strong> chart (hypothetical chem/bio armour).
                  Forecast and Historical stay weather-driven. Diary sprays are markers, not proof of field efficacy.
                  Defaults are round numbers for exploration — not MIC assays or label rainfastness.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <h4 className="font-bold">Chemical Rain Washoff Rate</h4>
                    <p className="text-xs leading-relaxed"><strong>What it is:</strong> Sandbox knob for how fast hypothetical chemical cover decays after heavy rain days.</p>
                    <p className="text-xs leading-relaxed"><strong>How it is set:</strong> Not manufacturer rainfastness. Higher = armour falls off faster in the what-if chart.</p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold">Application Method Penetration Penalty</h4>
                    <p className="text-xs leading-relaxed"><strong>What it is:</strong> Sandbox reduction of spray “hit” by method (ground / drone / air) vs canopy size.</p>
                    <p className="text-xs leading-relaxed"><strong>How it is set:</strong> Heuristic for comparing scenarios — not a deposition trial or certified coverage model.</p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold">Bio-Establishment / Multiplication / Survival</h4>
                    <p className="text-xs leading-relaxed"><strong>What it is:</strong> Sandbox knobs for how a hypothetical biological agent establishes, grows in favourable weather, and decays when hostile.</p>
                    <p className="text-xs leading-relaxed"><strong>How it is set:</strong> Simple daily factors for what-ifs — not CFU counts, plaque assays, or strain-specific biology for your orchard.</p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold">Chemical / Biological Efficacy (%)</h4>
                    <p className="text-xs leading-relaxed"><strong>What it is:</strong> Peak hypothetical suppression when a sandbox spray is applied (chem) or after bio “establishes” (bio).</p>
                    <p className="text-xs leading-relaxed"><strong>How it is set:</strong> Defaults (~95% chem / ~30% bio) are placeholders for scenario comparison. They are <strong>not</strong> lab MIC results, resistance surveys, or a claim that diary sprays delivered that control in the field.</p>
                  </div>
                </div>
              </div>

              {/* Orchard Architecture & Genetics */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-[#141414]/20 pb-2">
                  <Shield className="w-4 h-4 text-emerald-600" />
                  <h3 className="font-mono text-sm font-bold uppercase tracking-wider">Orchard Architecture & Genetics</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <h4 className="font-bold">Tree / canopy geometry (TRV → CDF)</h4>
                    <p className="text-xs leading-relaxed"><strong>What it is:</strong> Tree height, canopy width, and row spacing from the Orchard Map feed a rough TRV-style index used as CDF.</p>
                    <p className="text-xs leading-relaxed"><strong>How it is used:</strong> Blight RH/wetness/splash microclimate modifiers stay <strong>off</strong> until all three are set on a block (or all three are overridden in the blight sandbox). Not a certified spray-volume TRV calculator.</p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold">Canopy Closure (%)</h4>
                    <p className="text-xs leading-relaxed"><strong>What it is:</strong> The percentage of the orchard floor shaded by the tree canopy at solar noon. It directly impacts microclimate humidity and leaf wetness duration.</p>
                    <p className="text-xs leading-relaxed"><strong>How it is measured:</strong> Visually estimated or measured using aerial imagery/PAR sensors. A closed canopy (80-100%) severely restricts airflow and sunlight penetration, meaning morning dew or rain takes significantly longer to dry, drastically increasing the infection window.</p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold">Cultivar sensitivity (vs “resistance profile”)</h4>
                    <p className="text-xs leading-relaxed"><strong>What it is:</strong> Overall orchard sensitivity is mainly the <em>Sensitivity Threshold</em> knob under blight parameters — a relative weight, not a genotype × pathogen resistance matrix.</p>
                    <p className="text-xs leading-relaxed"><strong>Chem/bio efficacy %:</strong> Those live under <strong>Sandbox protection</strong> above. They are what-if suppressors, not a measured resistance profile for your copper or bio product.</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (val: number) => void;
  description?: string;
  unit?: string;
  isLocked: boolean;
}

function SliderControl({ label, value, min, max, step, onChange, description, unit, isLocked }: SliderControlProps) {
  const handleIncrement = () => {
    if (isLocked) return;
    const newValue = Math.min(max, value + step);
    onChange(Number(newValue.toFixed(3)));
  };

  const handleDecrement = () => {
    if (isLocked) return;
    const newValue = Math.max(min, value - step);
    onChange(Number(newValue.toFixed(3)));
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-end">
        <label className="text-[10px] font-mono font-bold uppercase text-slate-700">{label}</label>
        <span className="text-xs font-mono font-bold text-slate-900">{value}{unit}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleDecrement}
          disabled={isLocked || value <= min}
          className="p-1.5 bg-white border border-[#141414] rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Minus className="w-3 h-3" />
        </button>
        <input 
          type="range" 
          min={min} 
          max={max} 
          step={step}
          value={value}
          disabled={isLocked}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1 accent-[#141414] disabled:opacity-50 disabled:cursor-not-allowed h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
        />
        <button
          onClick={handleIncrement}
          disabled={isLocked || value >= max}
          className="p-1.5 bg-white border border-[#141414] rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
      {description && <p className="text-[9px] italic opacity-60 leading-tight">{description}</p>}
    </div>
  );
}

export function Settings() {
  const navigate = useNavigate();
  const { userData, user, isAdmin } = useAuth();
  const hasWalnutPack = useWalnutPack();
  const [activeTab, setActiveTab] = useState<'general' | 'advanced'>('general');
  const [params, setParams] = useState<ModelParameters>(DEFAULT_PARAMS);
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
          ...DEFAULT_PARAMS,
          ...docSnap.data()
        } as ModelParameters);
      } else {
        // Initialize with defaults if not exists
        setParams(DEFAULT_PARAMS);
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
      setParams(DEFAULT_PARAMS);
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
        <button
          onClick={() => setActiveTab('general')}
          className={`px-6 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'general' ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          General
          {activeTab === 'general' && (
            <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('advanced')}
          className={`px-6 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'advanced' ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Advanced
          {activeTab === 'advanced' && (
            <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600" />
          )}
        </button>
      </div>

      <div className="py-4">
        {activeTab === 'general' ? (
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

            {isAdmin && <InvitePinManager />}

            <OfflineSyncCard />

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
              <h2 className="text-lg font-bold text-slate-900">User Preferences</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl opacity-50">
                  <div>
                    <p className="font-medium text-slate-900">Email Notifications (Coming Soon)</p>
                    <p className="text-xs text-slate-500">Receive daily risk summaries and critical alerts.</p>
                  </div>
                  <div className="w-12 h-6 bg-slate-300 rounded-full relative cursor-not-allowed">
                    <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full" />
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl opacity-50">
                  <div>
                    <p className="font-medium text-slate-900">SMS Alerts (Premium)</p>
                    <p className="text-xs text-slate-500">Get instant SMS notifications for high-risk events.</p>
                  </div>
                  <div className="w-12 h-6 bg-slate-300 rounded-full relative cursor-not-allowed">
                    <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full" />
                  </div>
                </div>
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

                {hasWalnutPack && (
                <>
                {/* Technical Header */}
                <div className="bg-[#141414] text-[#E4E3E0] p-6 rounded-2xl border border-[#141414] shadow-xl space-y-4 font-mono">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Cpu className="w-6 h-6 text-emerald-400" />
                      <h2 className="text-lg font-bold uppercase tracking-wider">Model Modifier Engine v2.4</h2>
                    </div>
                    <button
                      onClick={() => setIsLocked(!isLocked)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                        isLocked 
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                      {isLocked ? 'Controls Locked' : 'Controls Active'}
                    </button>
                  </div>
                  <p className="text-xs opacity-70 leading-relaxed max-w-2xl">
                    Weather knobs (sensitivity, splash, humidity, geometry) affect Forecast / Historical threat.
                    Chem/bio protection knobs only change Blight → Sandbox what-ifs — they do not rewrite diary history
                    or claim field spray efficacy.
                  </p>
                </div>
                </>
                )}

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

                {/* Parameter Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {hasWalnutPack && (
                  <>
                  {/* Blight Parameters */}
                  <div className="bg-[#E4E3E0] border border-[#141414] p-6 rounded-2xl space-y-6">
                    <div className="flex items-center gap-2 border-b border-[#141414] pb-2">
                      <Zap className="w-4 h-4" />
                      <h3 className="font-mono text-xs font-bold uppercase">Blight Risk Parameters</h3>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="font-mono text-[11px] font-bold uppercase tracking-wide">
                          Orchard inoculum (Ji k)
                        </label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {([
                            { id: 'low', label: 'Low', k: '0.5×' },
                            { id: 'medium', label: 'Medium', k: '1.0×' },
                            { id: 'high', label: 'High', k: '2.0×' },
                          ] as const).map((opt) => {
                            const active = (params.orchardInoculumLevel ?? 'medium') === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                disabled={isLocked}
                                onClick={() => setParams({ ...params, orchardInoculumLevel: opt.id })}
                                className={clsx(
                                  'flex flex-col items-center py-2 rounded-lg border text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                                  active
                                    ? 'bg-[#141414] text-white border-[#141414]'
                                    : 'bg-white text-[#141414] border-[#141414] hover:bg-slate-100'
                                )}
                              >
                                {opt.label}
                                <span className={clsx('text-[9px] font-mono', active ? 'text-slate-300' : 'opacity-60')}>
                                  {opt.k}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[9px] italic opacity-60 leading-tight">
                          Primary inoculum for the Ji Forecast/Historical model, from prior-season blight or bud CFU.
                          Scales infection risk (k); Medium = baseline. Workshop default until bud CFU calibration.
                        </p>
                      </div>

                      <SliderControl 
                        label="Sensitivity Threshold"
                        value={params.blightSensitivity}
                        min={0} max={1} step={0.01}
                        isLocked={isLocked}
                        onChange={(val) => setParams({...params, blightSensitivity: val})}
                        description="Legacy Sandbox index only — not used by the Ji Forecast/Historical charts."
                      />

                      <SliderControl 
                        label="Humidity Gradient Factor"
                        value={params.humidityGradientFactor}
                        min={1} max={2} step={0.05}
                        isLocked={isLocked}
                        onChange={(val) => setParams({...params, humidityGradientFactor: val})}
                        description="Weights LWD duration based on ambient RH levels."
                      />

                      <SliderControl 
                        label="Splash Multiplier"
                        value={params.splashMultiplier || 1.0}
                        min={1} max={3} step={0.1}
                        isLocked={isLocked}
                        onChange={(val) => setParams({...params, splashMultiplier: val})}
                        description="Simulates bacterial dispersal from rain kinetic energy."
                      />
                    </div>
                  </div>

                  {/* Horticultural Parameters */}
                  <div className="bg-[#E4E3E0] border border-[#141414] p-6 rounded-2xl space-y-6">
                    <div className="flex items-center gap-2 border-b border-[#141414] pb-2">
                      <ThermometerSun className="w-4 h-4" />
                      <h3 className="font-mono text-xs font-bold uppercase">Horticultural Parameters</h3>
                    </div>
                    
                    <div className="space-y-4">
                      <SliderControl 
                        label="GDD Base Temp (°C)"
                        value={params.gddBaseTemp}
                        min={5} max={15} step={0.5}
                        isLocked={isLocked}
                        onChange={(val) => setParams({...params, gddBaseTemp: val})}
                        description="Baseline temperature for blight growing degree-days (not Dynamic Model chill)."
                      />
                    </div>
                  </div>

                  {/* Inoculum & Latency */}
                  <div className="bg-[#E4E3E0] border border-[#141414] p-6 rounded-2xl space-y-6">
                    <div className="flex items-center gap-2 border-b border-[#141414] pb-2">
                      <Database className="w-4 h-4" />
                      <h3 className="font-mono text-xs font-bold uppercase">Threat start & latency</h3>
                    </div>
                    
                    <div className="space-y-4">
                      <SliderControl 
                        label="Initial threat floor"
                        value={params.springStartingInoculum ?? 0.02}
                        min={0} max={2} step={0.01}
                        isLocked={isLocked}
                        onChange={(val) => setParams({...params, springStartingInoculum: val})}
                        description="Legacy Sandbox index only. Ji production inoculum uses ‘Orchard inoculum (k)’ above."
                      />

                      <p className="text-[11px] text-slate-600 leading-relaxed bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        Latency / secondary knobs below are <strong>experimental</strong>. They only apply when
                        Sandbox → “Latency / secondary” is on. Forecast and Historical ignore them.
                      </p>

                      <SliderControl 
                        label="Latency GDD Threshold"
                        value={params.latencyGDDThreshold || 120}
                        min={50} max={300} step={5}
                        isLocked={isLocked}
                        onChange={(val) => setParams({...params, latencyGDDThreshold: val})}
                        description="Sandbox only: heat units before latent pressure erupts (experimental)."
                      />

                      <SliderControl 
                        label="Secondary Spread Mult."
                        value={params.secondarySpreadMultiplier ?? 1.0}
                        min={1.0} max={5.0} step={0.1}
                        isLocked={isLocked}
                        onChange={(val) => setParams({...params, secondarySpreadMultiplier: val})}
                        description="Sandbox only: multiplier on erupting latent pressure (1.0 = no extra bump)."
                      />
                    </div>
                  </div>

                  {/* Canopy Geometry & TRV Engine */}
                  <div className="bg-[#E4E3E0] border border-[#141414] p-6 rounded-2xl space-y-6">
                    <div className="flex items-center gap-2 border-b border-[#141414] pb-2">
                      <Shield className="w-4 h-4" />
                      <h3 className="font-mono text-xs font-bold uppercase">Canopy Geometry & TRV Engine</h3>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="p-3 bg-white border border-[#141414] rounded-xl space-y-2">
                        <div className="flex justify-between items-center">
                          <p className="text-[10px] font-bold text-slate-700 uppercase font-mono">Calculated TRV</p>
                          <span className="text-sm font-bold text-indigo-600 font-mono">
                            {Math.round((params.treeHeight * params.canopyWidth * 10000) / params.rowSpacing).toLocaleString()} m³/ha
                          </span>
                        </div>
                        <p className="text-[9px] text-slate-500 italic leading-relaxed">
                          Homemade size index for optional microclimate nudges when map geometry is explicit — not a certified spray-volume TRV.
                        </p>
                      </div>

                      <SliderControl 
                        label="Tree Height (m)"
                        value={params.treeHeight}
                        min={1} max={20} step={0.1}
                        isLocked={isLocked}
                        onChange={(val) => setParams({...params, treeHeight: val})}
                        unit="m"
                      />

                      <SliderControl 
                        label="Canopy Width (m)"
                        value={params.canopyWidth}
                        min={1} max={10} step={0.1}
                        isLocked={isLocked}
                        onChange={(val) => setParams({...params, canopyWidth: val})}
                        unit="m"
                      />

                      <SliderControl 
                        label="Row Spacing (m)"
                        value={params.rowSpacing}
                        min={3} max={15} step={0.5}
                        isLocked={isLocked}
                        onChange={(val) => setParams({...params, rowSpacing: val})}
                        unit="m"
                      />
                    </div>
                  </div>

                  {/* Sandbox protection — what-if only */}
                  <div className="bg-[#E4E3E0] border border-indigo-300 p-6 rounded-2xl space-y-6 md:col-span-3 lg:col-span-1">
                    <div className="flex items-center gap-2 border-b border-[#141414] pb-2">
                      <Shield className="w-4 h-4 text-indigo-600" />
                      <h3 className="font-mono text-xs font-bold uppercase">Sandbox protection (what-if)</h3>
                    </div>

                    <p className="text-[11px] text-slate-600 leading-relaxed bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Used only on <strong>Blight → Sandbox</strong>. Forecast / Historical ignore these.
                      Placeholders for scenario comparison — not lab MIC, rainfastness labels, or proof that diary sprays worked.
                    </p>
                    
                    <div className="space-y-4">
                      <SliderControl 
                        label="Chem Rain Washoff Rate"
                        value={params.chemRainWashoffRate}
                        min={0} max={0.2} step={0.01}
                        isLocked={isLocked}
                        onChange={(val) => setParams({...params, chemRainWashoffRate: val})}
                        description="Sandbox only: how fast hypothetical chem cover drops after heavy rain."
                      />

                      <SliderControl 
                        label="Chemical Efficacy (%)"
                        value={params.chemEfficacy || 95}
                        min={0} max={100} step={1}
                        isLocked={isLocked}
                        onChange={(val) => setParams({...params, chemEfficacy: val})}
                        unit="%"
                        description="Sandbox only: peak hypothetical chem suppression — not orchard resistance testing."
                      />

                      <SliderControl 
                        label="Biological Efficacy (%)"
                        value={params.bioEfficacy || 30}
                        min={0} max={100} step={1}
                        isLocked={isLocked}
                        onChange={(val) => setParams({...params, bioEfficacy: val})}
                        unit="%"
                        description="Sandbox only: peak hypothetical bio suppression — not plaque assays."
                      />

                      <SliderControl 
                        label="Bio-Establishment Rate"
                        value={params.bioColonizationEff}
                        min={0} max={1} step={0.05}
                        isLocked={isLocked}
                        onChange={(val) => setParams({...params, bioColonizationEff: val})}
                        description="Sandbox only: fraction of bio that “takes” after a what-if spray."
                      />

                      <SliderControl 
                        label="Bio-Multiplication Rate"
                        value={params.bioFavorableGrowthRate || 1.1}
                        min={1.0} max={1.5} step={0.01}
                        isLocked={isLocked}
                        onChange={(val) => setParams({...params, bioFavorableGrowthRate: val})}
                        description="Sandbox only: daily growth factor in favourable weather."
                      />

                      <SliderControl 
                        label="Bio-Survival Rate"
                        value={params.bioEnvDegradationCoef || 0.75}
                        min={0.5} max={1.0} step={0.01}
                        isLocked={isLocked}
                        onChange={(val) => setParams({...params, bioEnvDegradationCoef: val})}
                        description="Sandbox only: daily survival under hostile weather."
                      />
                    </div>
                  </div>
                  </>
                  )}

                  {/* Market & Economic Parameters - Distinct Styling for Clarity */}
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
                        isLocked={hasWalnutPack ? isLocked : false}
                        onChange={(val) => setParams({...params, marketPrice: val})}
                        description="Projected farm gate price for Nut-In-Shell."
                      />

                      <SliderControl 
                        label="Harvest Cost (AUD/kg)"
                        value={params.harvestCostPerKg || 0.45}
                        min={0.1} max={2.0} step={0.05}
                        isLocked={hasWalnutPack ? isLocked : false}
                        onChange={(val) => setParams({...params, harvestCostPerKg: val})}
                        description="Estimated cost per kg for harvesting and processing."
                      />

                      <SliderControl 
                        label="Water Cost (AUD/ML)"
                        value={params.waterCostPerML || 150}
                        min={50} max={1000} step={10}
                        isLocked={hasWalnutPack ? isLocked : false}
                        onChange={(val) => setParams({...params, waterCostPerML: val})}
                        description="Current cost of irrigation water per Megalitre."
                      />
                    </div>

                    <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
                      <p className="text-[9px] text-indigo-700 leading-relaxed">
                        <span className="font-bold uppercase">Note:</span> These values directly impact the <strong>Projected Season Profit</strong> and <strong>ROI</strong> calculations on your dashboard.
                      </p>
                    </div>
                  </div>
                </div>

                {hasWalnutPack && <ParameterGlossary />}

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
