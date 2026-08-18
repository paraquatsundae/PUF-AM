import type { ReactNode } from 'react';
import { APP_LOGO_SRC, APP_NAME, APP_TAGLINE } from '../../brand';

export function LoginBrand({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <div className="mx-auto h-16 w-16 rounded-2xl flex items-center justify-center overflow-hidden shadow-sm ring-1 ring-emerald-900/20">
        <img
          src={APP_LOGO_SRC}
          alt={APP_NAME}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
      </div>
      <h2 className="mt-5 text-center text-2xl font-extrabold text-slate-900">{title}</h2>
      <p className="mt-1 text-center text-sm font-medium text-emerald-800">{APP_TAGLINE}</p>
      {subtitle && <p className="mt-2 text-center text-sm text-slate-600">{subtitle}</p>}
    </div>
  );
}

export function LoginPanel({
  children,
  wide,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 py-10 px-4">
      <div
        className={`w-full space-y-5 bg-white p-7 rounded-2xl shadow-xl ${
          wide ? 'max-w-lg' : 'max-w-md'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full inline-flex items-center justify-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
    >
      <span aria-hidden="true">←</span>
      {label}
    </button>
  );
}
