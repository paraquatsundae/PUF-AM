/**
 * Operator-facing Freenet explainer — login and in-app.
 *
 * Login already opens on this copy. After a farm exists, Settings → Sync and
 * Farm setup → People need the same story without sending the operator back
 * through /login. Keep the words here so the two surfaces cannot drift.
 *
 * @see Plans/FREENET_OPERATOR_FLOW.md
 */

import { useEffect, useId, useState, type ReactNode } from 'react';
import { CircleHelp, X } from 'lucide-react';

export function FreenetDiagram() {
  return (
    <svg
      viewBox="0 0 360 168"
      className="w-full h-auto"
      role="img"
      aria-label="Two laptops share a farm over Freenet. A paper FarmCode recovers it. No cloud bill."
    >
      <rect x="8" y="28" width="96" height="64" rx="10" fill="#4c1d95" />
      <text x="56" y="56" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="700">
        Laptop A
      </text>
      <text x="56" y="74" textAnchor="middle" fill="#ddd6fe" fontSize="9">
        holds the farm
      </text>

      <rect x="256" y="28" width="96" height="64" rx="10" fill="#4c1d95" />
      <text x="304" y="56" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="700">
        Laptop B
      </text>
      <text x="304" y="74" textAnchor="middle" fill="#ddd6fe" fontSize="9">
        joins later
      </text>

      <path d="M112 56 H248" stroke="#7c3aed" strokeWidth="2" fill="none" />
      <text x="180" y="48" textAnchor="middle" fill="#5b21b6" fontSize="10" fontWeight="600">
        Freenet / Wi‑Fi
      </text>
      <text x="180" y="78" textAnchor="middle" fill="#6b7280" fontSize="9">
        sealed copies
      </text>

      <rect x="118" y="104" width="124" height="48" rx="8" fill="#fef3c7" stroke="#d97706" />
      <text x="180" y="124" textAnchor="middle" fill="#92400e" fontSize="10" fontWeight="700">
        Paper FarmCode
      </text>
      <text x="180" y="140" textAnchor="middle" fill="#78350f" fontSize="9">
        written down once
      </text>

      <text x="180" y="16" textAnchor="middle" fill="#047857" fontSize="11" fontWeight="700">
        $0 — no Google account
      </text>
    </svg>
  );
}

export function FreenetHowItWorksBody() {
  return (
    <div className="space-y-4 text-sm text-slate-600 leading-relaxed">
      <p>
        The farm lives on <strong>this device</strong>. Nothing is stored on a PUFworks or Google
        server, so nobody sends you a bill. Wi‑Fi in the shed still moves a copy to another
        PUF-Ag Manager on the same network. Over the internet, sealed copies travel on Freenet —
        other computers pass the ciphertext; they cannot read it.
      </p>
      <p>
        Two different codes, not one. The <strong>FarmCode</strong> is the farm&apos;s identity —
        written on paper once when you start. The short <strong>join ticket</strong> (
        <span className="font-mono">PUF-XXXX-XXXX</span>) is a time-limited handoff the owner
        reads out after <strong>Send this farm</strong>. A cloud invite PIN opens neither.
      </p>

      <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-3">
        <FreenetDiagram />
      </div>

      <p className="text-[11px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
        Free means free: no enrollment code, no subscription, no Google project.
      </p>

      <div className="space-y-2">
        <h3 className="text-sm font-bold text-slate-900">Start a new farm</h3>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Enter the farm name and your name.</li>
          <li>Write the FarmCode on paper. The app will not show it again.</li>
          <li>Optional 4-digit PIN locks this device only — not the farm.</li>
          <li>Finish Farm setup. The farm is still only on this computer.</li>
          <li>
            Settings → Sync → <strong>Send this farm</strong> is what puts a sealed copy on
            Freenet and mints a join ticket. Until you send, nobody else can join.
          </li>
        </ol>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-bold text-slate-900">Add a person</h3>
        <ol className="list-decimal pl-5 space-y-1">
          <li>On a PUF-AM laptop, Settings → Sync → Send this farm.</li>
          <li>Pick who it is for (a label on this computer) and what they may see.</li>
          <li>
            Read out the new <span className="font-mono">PUF-XXXX-XXXX</span> ticket. They must
            already have the paper FarmCode.
          </li>
          <li>
            Keep this laptop on and on the same Wi‑Fi while they join if you can. The ticket is
            looked up here first; the farm itself always travels on Freenet.
          </li>
        </ol>
        <p>
          Farm setup → People lists tickets minted on <strong>this</strong> laptop. Revoking a
          ticket stops the next person using it. A device that already pulled the farm keeps its
          copy.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-bold text-slate-900">Join on another device</h3>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Welcome → Freenet → Join a farm I already have.</li>
          <li>Type the paper FarmCode and your name.</li>
          <li>Type the owner&apos;s join ticket on the Enter join ticket screen.</li>
        </ol>
        <p>
          A tablet can hold and fetch a farm. Only a laptop can Send. Two tablets with no laptop
          cannot hand a farm to each other.
        </p>
      </div>
    </div>
  );
}

export function FreenetHowItWorksButton({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          'inline-flex items-center gap-1.5 text-[11px] font-semibold text-violet-800 px-2 py-1 rounded-lg border border-violet-200 hover:bg-violet-50'
        }
      >
        <CircleHelp className="w-3.5 h-3.5" />
        {children ?? 'How this works'}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-[6000] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 sm:p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700">
                  Freenet network · completely free
                </p>
                <h2 id={titleId} className="text-xl font-extrabold text-slate-900">
                  How this works
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <FreenetHowItWorksBody />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
