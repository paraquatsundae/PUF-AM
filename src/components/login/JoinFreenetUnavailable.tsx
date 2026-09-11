import { BackLink, LoginBrand, LoginPanel } from './LoginBrand';

export function JoinFreenetUnavailable({ onBack }: { onBack: () => void }) {
  return (
    <LoginPanel>
      <LoginBrand title="This is a Freenet farm" />
      <p className="text-sm text-slate-600">
        A FarmCode / join ticket opens a farm that lives on Freenet. The web app cannot run
        Freenet — a browser has no node.
      </p>
      <div className="text-sm text-slate-700 space-y-2">
        <p className="font-medium">What you can do:</p>
        <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
          <li>
            <strong>Install PUF-AM Desktop</strong> (Windows / Linux; macOS later) and type the
            same code there.
          </li>
          <li>
            On a tablet: install the PUF-AM app and pair it with the owner&apos;s laptop on the
            shed Wi‑Fi.
          </li>
        </ul>
        <p>
          If the owner also runs this farm in the cloud, ask them for an invite PIN — that works
          here.
        </p>
      </div>
      <BackLink label="Back" onClick={onBack} />
    </LoginPanel>
  );
}
