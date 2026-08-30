import { motion } from 'motion/react';
import { getInfraType } from '../../../shared/farm/infraTypes';
import type { InternalBoundaryKind } from './BoundaryEditActionBar';

export function InternalBoundaryDrawBanner({
  kind,
  blockName,
}: {
  kind: InternalBoundaryKind;
  blockName?: string;
}) {
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1100] pointer-events-none w-[calc(100%-1.5rem)] max-w-md">
      <div className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur shadow-lg px-3 py-2 text-center">
        <p className="text-xs font-semibold text-slate-800">
          Drawing{' '}
          {getInfraType(kind)?.shortLabel || 'internal boundary'}
          {blockName ? ` · ${blockName}` : ''}
        </p>
        <p className="text-[10px] text-slate-500 mt-0.5">
          Tap to place points · Finish when closed · Cancel to abort
        </p>
      </div>
    </div>
  );
}

export function CoverageZonesLegend() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="absolute bottom-24 lg:bottom-12 right-4 z-[1000] bg-white/95 backdrop-blur shadow-lg rounded-xl border border-slate-200 p-3 pointer-events-auto"
    >
      <h4 className="text-xs font-semibold text-slate-900 mb-2 uppercase tracking-wider">Coverage Zones</h4>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-600/20 border border-blue-600 border-dashed"></div>
          <span className="text-xs text-slate-600">Weather Station (500m)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-600/20 border border-amber-600 border-dashed"></div>
          <span className="text-xs text-slate-600">Soil Sensor (50m)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-cyan-600/20 border border-cyan-600 border-dashed"></div>
          <span className="text-xs text-slate-600">Irrigation Valve (150m)</span>
        </div>
      </div>
    </motion.div>
  );
}
