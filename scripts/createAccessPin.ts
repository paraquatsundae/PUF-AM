/**
 * Create a farm invite PIN (printed once). Requires Firebase Admin credentials.
 * Also writes the code to secrets/last-invite-pin.txt (gitignored) so a closed terminal
 * does not lose the only copy.
 *
 * Usage:
 *   npx tsx scripts/createAccessPin.ts --farm farm_<uid> --role admin --label "Owner"
 *   npx tsx scripts/createAccessPin.ts --farm farm_xxx --role farmer --max-uses 10 --days 30
 */
import * as dotenv from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  AccessPinRecord,
  generatePinCode,
  pinDocId,
} from '../server/accessPinCrypto.ts';
import { getAdminDb, getAdminApp } from '../server/firebaseAdmin.ts';

dotenv.config();

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const farmId = argValue('--farm');
  const role = (argValue('--role') || 'admin') as AccessPinRecord['role'];
  const label = argValue('--label') || 'Bootstrap';
  const maxUsesRaw = argValue('--max-uses');
  const daysRaw = argValue('--days');
  const maxUses = maxUsesRaw === undefined ? null : Number(maxUsesRaw);
  const days = daysRaw === undefined ? 365 : Number(daysRaw);

  if (!farmId) {
    console.error('Usage: npx tsx scripts/createAccessPin.ts --farm farm_<id> [--role admin|farmer|viewer] [--label Owner] [--max-uses N] [--days 90]');
    process.exit(1);
  }

  if (!['admin', 'farmer', 'viewer'].includes(role)) {
    console.error('Invalid --role');
    process.exit(1);
  }

  getAdminApp();
  const code = generatePinCode(8);
  const docId = pinDocId(code);
  const now = new Date();
  const expiresAt =
    days > 0 ? new Date(now.getTime() + days * 86400000).toISOString() : null;

  const record: AccessPinRecord = {
    farmId,
    role,
    label,
    active: true,
    maxUses: Number.isFinite(maxUses as number) ? maxUses : null,
    useCount: 0,
    expiresAt,
    createdBy: 'script',
    createdAt: now.toISOString(),
    codeHint: `${code.slice(0, 2)}••••${code.slice(-2)}`,
  };

  await getAdminDb().collection('access_pins').doc(docId).set(record);

  const farmRef = getAdminDb().collection('farms').doc(farmId);
  if (!(await farmRef.get()).exists) {
    await farmRef.set({
      id: farmId,
      name: label === 'Bootstrap' ? 'Orchard' : label,
      ownerUid: 'pending',
      createdAt: now.toISOString(),
    });
  }

  const secretsDir = resolve(process.cwd(), 'secrets');
  mkdirSync(secretsDir, { recursive: true });
  const outPath = resolve(secretsDir, 'last-invite-pin.txt');
  writeFileSync(
    outPath,
    [
      `CODE=${code}`,
      `farmId=${farmId}`,
      `role=${role}`,
      `label=${label}`,
      `createdAt=${now.toISOString()}`,
      `expiresAt=${expiresAt || 'never'}`,
      '',
      'Sign in at /login with CODE + your name.',
      '',
    ].join('\n'),
    'utf8'
  );

  console.log('');
  console.log('Invite PIN created (also saved to secrets/last-invite-pin.txt):');
  console.log(`  CODE:   ${code}`);
  console.log(`  Farm:   ${farmId}`);
  console.log(`  Role:   ${role}`);
  console.log(`  Label:  ${label}`);
  console.log(`  Uses:   ${maxUses ?? 'unlimited'}`);
  console.log(`  Expires:${expiresAt || 'never'}`);
  console.log(`  File:   ${outPath}`);
  console.log('');
  console.log('Sign in at /login with this PIN + your name.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
