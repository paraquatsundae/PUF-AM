import { motion } from 'motion/react';
import type { ApplicationMethod, SprayType } from '../../lib/farmDiary';
import { cn } from '../../lib/utils';

type Props = {
  sprayType: SprayType;
  onSprayType: (value: SprayType) => void;
  applicationMethod: ApplicationMethod;
  onApplicationMethod: (value: ApplicationMethod) => void;
  agentName: string;
  onAgentName: (value: string) => void;
  showCustomAgent: boolean;
  onShowCustomAgent: (value: boolean) => void;
  customAgent: string;
  onCustomAgent: (value: string) => void;
  availableProducts: string[];
  carrier: string;
  onCarrier: (value: string) => void;
  showCustomCarrier: boolean;
  onShowCustomCarrier: (value: boolean) => void;
  customCarrier: string;
  onCustomCarrier: (value: string) => void;
  allCarriers: string[];
  adjuvant: string;
  onAdjuvant: (value: string) => void;
  showCustomAdjuvant: boolean;
  onShowCustomAdjuvant: (value: boolean) => void;
  customAdjuvant: string;
  onCustomAdjuvant: (value: string) => void;
  allAdjuvants: string[];
};

export function DiaryComposerSprayFields({
  sprayType,
  onSprayType,
  applicationMethod,
  onApplicationMethod,
  agentName,
  onAgentName,
  showCustomAgent,
  onShowCustomAgent,
  customAgent,
  onCustomAgent,
  availableProducts,
  carrier,
  onCarrier,
  showCustomCarrier,
  onShowCustomCarrier,
  customCarrier,
  onCustomCarrier,
  allCarriers,
  adjuvant,
  onAdjuvant,
  showCustomAdjuvant,
  onShowCustomAdjuvant,
  customAdjuvant,
  onCustomAdjuvant,
  allAdjuvants,
}: Props) {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5 ml-1">Agent Classification</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onSprayType('chem')}
            className={cn(
              'py-3 text-xs font-bold rounded-xl border transition-all',
              sprayType === 'chem'
                ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
            )}
          >
            Chemical
          </button>
          <button
            type="button"
            onClick={() => onSprayType('bio')}
            className={cn(
              'py-3 text-xs font-bold rounded-xl border transition-all',
              sprayType === 'bio'
                ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
            )}
          >
            Biological
          </button>
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5 ml-1">Application Method</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onApplicationMethod('ground')}
            className={cn(
              'py-2 text-xs font-bold rounded-xl border transition-all',
              applicationMethod === 'ground'
                ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
            )}
          >
            Ground Sprayer
          </button>
          <button
            type="button"
            onClick={() => onApplicationMethod('drone')}
            className={cn(
              'py-2 text-xs font-bold rounded-xl border transition-all',
              applicationMethod === 'drone'
                ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
            )}
          >
            Drone
          </button>
          <button
            type="button"
            onClick={() => onApplicationMethod('helicopter')}
            className={cn(
              'py-2 text-xs font-bold rounded-xl border transition-all',
              applicationMethod === 'helicopter'
                ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
            )}
          >
            Helicopter
          </button>
          <button
            type="button"
            onClick={() => onApplicationMethod('aeroplane')}
            className={cn(
              'py-2 text-xs font-bold rounded-xl border transition-all',
              applicationMethod === 'aeroplane'
                ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
            )}
          >
            Aeroplane
          </button>
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5 ml-1">Agent Name / Product</label>
        <div className="space-y-2">
          <select
            value={showCustomAgent ? 'custom' : agentName}
            onChange={(e) => {
              if (e.target.value === 'custom') {
                onShowCustomAgent(true);
              } else {
                onShowCustomAgent(false);
                onAgentName(e.target.value);
              }
            }}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all"
          >
            <option value="">Select {sprayType === 'chem' ? 'Chemical' : 'Biological'}...</option>
            {availableProducts.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value="custom">+ Add New {sprayType === 'chem' ? 'Chemical' : 'Biological'}...</option>
          </select>

          {showCustomAgent && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
              <input
                type="text"
                placeholder={`Enter custom ${sprayType === 'chem' ? 'chemical' : 'biological'} name`}
                value={customAgent}
                onChange={(e) => onCustomAgent(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-emerald-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                autoFocus
              />
            </motion.div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5 ml-1">Carrier</label>
          <div className="space-y-2">
            <select
              value={showCustomCarrier ? 'custom' : carrier}
              onChange={(e) => {
                if (e.target.value === 'custom') {
                  onShowCustomCarrier(true);
                } else {
                  onShowCustomCarrier(false);
                  onCarrier(e.target.value);
                }
              }}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all"
            >
              {allCarriers.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value="custom">+ Add New Carrier...</option>
            </select>
            {showCustomCarrier && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                <input
                  type="text"
                  placeholder="Custom carrier"
                  value={customCarrier}
                  onChange={(e) => onCustomCarrier(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-emerald-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                />
              </motion.div>
            )}
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5 ml-1">Adjuvant / Additive</label>
          <div className="space-y-2">
            <select
              value={showCustomAdjuvant ? 'custom' : adjuvant}
              onChange={(e) => {
                if (e.target.value === 'custom') {
                  onShowCustomAdjuvant(true);
                } else {
                  onShowCustomAdjuvant(false);
                  onAdjuvant(e.target.value);
                }
              }}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all"
            >
              {allAdjuvants.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
              <option value="custom">+ Add New Adjuvant...</option>
            </select>
            {showCustomAdjuvant && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                <input
                  type="text"
                  placeholder="Custom adjuvant"
                  value={customAdjuvant}
                  onChange={(e) => onCustomAdjuvant(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-emerald-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                />
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
