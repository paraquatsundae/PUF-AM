/**
 * The one line a device that holds a **read-only mirror of a cloud farm** sees
 * on every page (Plans/FREENET_NETWORK_PACK.md §3).
 *
 * Core-owned and pack-free on purpose: the fact comes from `farmPipes`, which
 * reads the session meta, so it shows whether or not the network pack's
 * surfaces are mounted. Firestore is the authority for this farm; the mirror
 * here is for reading and recovery, and editing means an invite PIN.
 */

import React from 'react';
import { Eye } from 'lucide-react';

import { isCloudMirror } from '../lib/farmPipes';

export function CloudMirrorBanner() {
  if (!isCloudMirror()) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2 px-4 py-1.5 bg-sky-50 border-b border-sky-200 text-xs text-sky-950"
    >
      <Eye className="w-3.5 h-3.5 shrink-0" />
      <span>
        <strong>This is a mirror of a cloud farm.</strong> To edit, join with an invite PIN.
      </span>
    </div>
  );
}
