import { Link } from 'react-router-dom';
import { Shield, Users, Settings, Plug, Radio } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { activeFarmPipes } from '../../lib/farmPipes';

/**
 * Farm-scoped admin — People, plugins, Send. Not PUFworks hosted admin
 * (whitelist, billing, enrollment). Those stay behind `isPlatformAdmin`.
 */
export function FarmAdminPanel() {
  const { userData } = useAuth();
  const pipes = activeFarmPipes(userData?.farmId);

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Shield className="w-6 h-6 text-emerald-600" />
          Farm admin
        </h1>
        <p className="text-sm text-slate-500">
          You are an admin of this farm. Hosted PUFworks admin (whitelist, billing) is a
          different door and stays closed here.
        </p>
      </header>

      <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
        <p className="text-sm text-slate-700">
          <span className="font-semibold">{userData?.displayName || 'Signed in'}</span>
          <span className="text-slate-500"> · {userData?.role === 'admin' ? 'farm admin' : userData?.role}</span>
        </p>
        {userData?.farmId && (
          <p className="text-xs font-mono text-slate-500 break-all">{userData.farmId}</p>
        )}
      </section>

      <nav className="grid gap-3">
        <Link
          to="/farm-setup"
          className="flex items-center gap-3 bg-white rounded-2xl border border-slate-200 p-4 hover:border-emerald-300 hover:bg-emerald-50/40"
        >
          <Users className="w-5 h-5 text-emerald-700 shrink-0" />
          <span>
            <span className="block font-semibold text-slate-900">Farm setup → People</span>
            <span className="block text-sm text-slate-500">
              {pipes.freenet && !pipes.cloud
                ? 'Join tickets you have handed out'
                : 'Farm type, people, and one-time setup'}
            </span>
          </span>
        </Link>
        {pipes.cloud && (
          <Link
            to="/farm-management"
            className="flex items-center gap-3 bg-white rounded-2xl border border-slate-200 p-4 hover:border-emerald-300 hover:bg-emerald-50/40"
          >
            <Users className="w-5 h-5 text-emerald-700 shrink-0" />
            <span>
              <span className="block font-semibold text-slate-900">Farm management</span>
              <span className="block text-sm text-slate-500">Team, invite PINs, modules</span>
            </span>
          </Link>
        )}
        <Link
          to="/settings?tab=plugins"
          className="flex items-center gap-3 bg-white rounded-2xl border border-slate-200 p-4 hover:border-emerald-300 hover:bg-emerald-50/40"
        >
          <Plug className="w-5 h-5 text-emerald-700 shrink-0" />
          <span>
            <span className="block font-semibold text-slate-900">Settings → Plugins</span>
            <span className="block text-sm text-slate-500">Crop packs and the Freenet network pack</span>
          </span>
        </Link>
        {pipes.freenet && (
          <Link
            to="/settings?tab=sync"
            className="flex items-center gap-3 bg-white rounded-2xl border border-slate-200 p-4 hover:border-emerald-300 hover:bg-emerald-50/40"
          >
            <Radio className="w-5 h-5 text-emerald-700 shrink-0" />
            <span>
              <span className="block font-semibold text-slate-900">Settings → Sync</span>
              <span className="block text-sm text-slate-500">Send this farm, join tickets</span>
            </span>
          </Link>
        )}
        <Link
          to="/settings"
          className="flex items-center gap-3 bg-white rounded-2xl border border-slate-200 p-4 hover:border-emerald-300 hover:bg-emerald-50/40"
        >
          <Settings className="w-5 h-5 text-emerald-700 shrink-0" />
          <span>
            <span className="block font-semibold text-slate-900">Settings</span>
            <span className="block text-sm text-slate-500">Device PIN, leave farm, privacy</span>
          </span>
        </Link>
      </nav>
    </div>
  );
}
