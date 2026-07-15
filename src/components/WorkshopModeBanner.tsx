import { FlaskConical } from 'lucide-react';
import { isWorkshopMode } from '../lib/workshopMode';

export function WorkshopModeBanner() {
  if (!isWorkshopMode()) return null;

  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 text-center text-xs font-semibold flex items-center justify-center gap-2 z-[6000] relative">
      <FlaskConical className="w-4 h-4 shrink-0" />
      <span>
        Workshop mode — local UI only (no Firestore). Map edits stay in the browser. Remove{' '}
        <code className="font-mono bg-amber-600/20 px-1 rounded">VITE_WORKSHOP_MODE</code> and sign in for
        cloud data.
      </span>
    </div>
  );
}
