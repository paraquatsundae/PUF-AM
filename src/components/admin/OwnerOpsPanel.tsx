import React, { useEffect, useState } from 'react';
import { KeyRound, Landmark, Loader2, Ticket, Users } from 'lucide-react';

import {
  fetchAdminOpsSnapshot,
  type AdminOpsSnapshot,
} from '../../lib/adminOps';

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString();
}

export function OwnerOpsPanel() {
  const [data, setData] = useState<AdminOpsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchAdminOpsSnapshot()
      .then((snapshot) => {
        if (!cancelled) setData(snapshot);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="py-16 text-center">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-2" />
        <p className="text-slate-500">Loading farms, enrollment, and invite PINs…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        {error || 'No ops data.'} Cloud Run / the workshop server must have Firebase Admin
        configured. Maps and DPIRD keys stay in Google Cloud Console.
      </div>
    );
  }

  const activePins = data.pins.filter((pin) => pin.active).length;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi icon={<Landmark className="w-4 h-4" />} label="Cloud farms" value={data.farms.length} />
        <Kpi
          icon={<Ticket className="w-4 h-4" />}
          label="Enrollment unused"
          value={`${data.enrollment.unusedCount} / ${data.enrollment.configuredCount}`}
        />
        <Kpi icon={<Users className="w-4 h-4" />} label="Active invite PINs" value={activePins} />
      </div>

      <section>
        <h3 className="text-sm font-bold text-slate-900 mb-3">Farms on this project</h3>
        <OpsTable
          empty="No cloud farms yet."
          headers={['Farm', 'Owner', 'Created', 'Modules']}
          rows={data.farms.map((farm) => [
            farm.name,
            farm.ownerUid ? farm.ownerUid.slice(0, 8) + '…' : '—',
            formatWhen(farm.createdAt),
            farm.enabledModules.length ? String(farm.enabledModules.length) : 'defaults',
          ])}
        />
      </section>

      <section>
        <h3 className="text-sm font-bold text-slate-900 mb-1">Enrollment codes</h3>
        <p className="text-xs text-slate-500 mb-3">
          Codes themselves never leave Secret Manager. This is the spent-hash audit.
        </p>
        <OpsTable
          empty="No enrollment codes have been reserved."
          headers={['Hash', 'Farm', 'Reserved', 'Used']}
          rows={data.enrollment.uses.map((use) => [
            use.hashPrefix + '…',
            use.farmName || use.farmId || 'reserved',
            formatWhen(use.reservedAt),
            formatWhen(use.usedAt),
          ])}
        />
      </section>

      <section>
        <h3 className="text-sm font-bold text-slate-900 mb-1">Invite PINs</h3>
        <p className="text-xs text-slate-500 mb-3">
          Hashes only — the PIN text is not stored. Revoke from the farm&apos;s People card.
        </p>
        <OpsTable
          empty="No invite PINs minted."
          headers={['Farm', 'Label', 'Role', 'Uses', 'Expires', 'Last redeem']}
          rows={data.pins.map((pin) => [
            pin.farmId,
            `${pin.label}${pin.codeHint ? ` · ${pin.codeHint}` : ''}${pin.active ? '' : ' (revoked)'}`,
            pin.role,
            pin.maxUses == null ? String(pin.useCount) : `${pin.useCount}/${pin.maxUses}`,
            formatWhen(pin.expiresAt),
            pin.lastRedeemedDisplayName || formatWhen(pin.lastRedeemedAt),
          ])}
        />
      </section>

      <section className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600 flex gap-3">
        <KeyRound className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-slate-800">API keys</p>
          <p className="text-xs mt-1">
            DPIRD and Maps keys are restricted in Google Cloud Console for this Firebase
            project. They are not listed here on purpose.
          </p>
        </div>
      </section>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
      <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
        <span className="p-1.5 bg-white rounded-lg text-emerald-600">{icon}</span>
        {label}
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function OpsTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: string[][];
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="py-10 text-center text-slate-500 border-2 border-dashed border-slate-100 rounded-2xl text-sm">
        {empty}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-slate-50">
            {headers.map((header) => (
              <th
                key={header}
                className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50/50">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-sm text-slate-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
