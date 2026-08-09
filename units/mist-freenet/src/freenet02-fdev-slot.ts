/**
 * Slot PUT / UPDATE via the `fdev` CLI — Node only.
 *
 * Same reason as the pack path (`freenet02-fdev-put.ts`): the flatbuffers SDK PUT
 * hangs against a 0.2.11x node, while `fdev execute` speaks the node's native
 * WebSocket encoding on the same port. GET stays on the SDK.
 *
 * Nothing here holds a farm secret. The caller hands over `parameters` and a state
 * that was signed and sealed in the browser, so this is a byte mover — which is
 * what keeps encrypt-before-upload true for the slot as well as for the blobs.
 *
 * @see units/mist-freenet/contracts/slot-contract — the contract these bytes are for
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { encodeFreenet02Uri } from './freenet02-uri.ts';
import {
  JOIN_SLOT_PARAMETERS_BYTES,
  JOIN_SLOT_HEADER_BYTES,
  JOIN_SLOT_MAGIC,
} from './freenet02-slot.ts';

/** Workshop default — the vendored, pinned slot WASM. */
export const DEFAULT_SLOT_CONTRACT_WASM = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../assets/slot-contract.wasm',
);

export function resolveSlotContractWasmPath(): string {
  const fromEnv = process.env.FREENET_SLOT_WASM?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return DEFAULT_SLOT_CONTRACT_WASM;
}

function resolveFdevBin(): string {
  return process.env.FDEV_BIN?.trim() || 'fdev';
}

function parsePublishedKey(output: string): string | null {
  const m = output.match(/Publishing contract ([1-9A-HJ-NP-Za-km-z]{20,})/);
  if (m?.[1]) return m[1];
  const m2 = output.match(/response_key:\s*([1-9A-HJ-NP-Za-km-z]{20,})/);
  return m2?.[1] ?? null;
}

/**
 * Structural check before anything leaves the machine.
 *
 * The hub cannot verify the signature — it has no farm key, by design — but it can
 * refuse bytes that are not a slot state at all. That catches the case worth
 * catching: a caller wiring the wrong buffer into this route and publishing farm
 * plaintext to a public network.
 */
function assertSlotShape(parameters: Uint8Array, state: Uint8Array): void {
  if (parameters.length !== JOIN_SLOT_PARAMETERS_BYTES) {
    throw new Error(
      `slot put: parameters must be ${JOIN_SLOT_PARAMETERS_BYTES} bytes (slot id + verifying key), got ${parameters.length}`,
    );
  }
  if (state.length < JOIN_SLOT_HEADER_BYTES) {
    throw new Error(
      `slot put: state must be at least ${JOIN_SLOT_HEADER_BYTES} bytes, got ${state.length}`,
    );
  }
  for (let i = 0; i < JOIN_SLOT_MAGIC.length; i++) {
    if (state[i] !== JOIN_SLOT_MAGIC[i]) {
      throw new Error('slot put: state is not a PUFSLOT1 slot state — refusing to publish it');
    }
  }
}

export type SlotPutResult = {
  /** `FN02@…` for the published instance. */
  uri: string;
  instanceIdBase58: string;
  /** `put` for a first publish, `update` when the slot already existed. */
  mode: 'put' | 'update';
};

/**
 * Publish or refresh a join slot.
 *
 * A slot's whole point is that its address does not move when its contents do, so
 * a re-send has to reach the *same* instance rather than mint a new one. `fdev
 * execute put` on a contract the node already has is not a refresh, so this tries
 * `put` first and falls back to `update --as-state` when the node says the
 * contract is already there. The contract's `update_state` takes whole states and
 * orders them by sequence number, which is why `--as-state` is correct and a delta
 * would not be.
 */
export async function putJoinSlotViaFdev(input: {
  parameters: Uint8Array;
  state: Uint8Array;
  /** Base58 instance id the caller derived — used for the update fallback. */
  instanceIdBase58: string;
}): Promise<SlotPutResult> {
  assertSlotShape(input.parameters, input.state);

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'mist-freenet-slot-'));
  const statePath = path.join(tmpDir, 'state.bin');
  const paramsPath = path.join(tmpDir, 'params.bin');
  const wasmPath = resolveSlotContractWasmPath();

  try {
    await writeFile(statePath, input.state);
    await writeFile(paramsPath, input.parameters);

    const putArgs = [
      'network',
      'execute',
      'put',
      '--code',
      wasmPath,
      '--parameters',
      paramsPath,
      'contract',
      '--state',
      statePath,
    ];

    const port = process.env.FREENET_WS_PORT?.trim();
    if (port) putArgs.splice(1, 0, '--port', port);

    let output: string;
    try {
      output = await runFdev(putArgs);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!looksLikeAlreadyPublished(message)) throw err;

      const updateArgs = [
        'network',
        'execute',
        'update',
        input.instanceIdBase58,
        statePath,
        '--as-state',
      ];
      if (port) updateArgs.splice(1, 0, '--port', port);
      await runFdev(updateArgs);

      return {
        uri: encodeFreenet02Uri(input.instanceIdBase58),
        instanceIdBase58: input.instanceIdBase58,
        mode: 'update',
      };
    }

    const key = parsePublishedKey(output);
    // The address is derived, so a key we cannot parse out of the log is a
    // cosmetic loss rather than a failed publish — the caller already knows where
    // it put things.
    const instanceIdBase58 = key ?? input.instanceIdBase58;
    if (key && key !== input.instanceIdBase58) {
      throw new Error(
        `slot put: node published ${key} but this device derived ${input.instanceIdBase58} — ` +
          'the pinned slot code hash and the shipped WASM disagree (npm run desktop:verify:pack)',
      );
    }

    return {
      uri: encodeFreenet02Uri(instanceIdBase58),
      instanceIdBase58,
      mode: 'put',
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Whether a failed `put` means "this contract is already on the node".
 *
 * Matched on text because that is all the CLI gives us. Being wrong is not
 * expensive in either direction: a false positive turns into an `update` that
 * fails with its own message, and a false negative surfaces the original error.
 */
function looksLikeAlreadyPublished(message: string): boolean {
  return /already (exists|published|present)|duplicate contract|contract .* exists/i.test(message);
}

function runFdev(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const bin = resolveFdevBin();
    const child = spawn(bin, args, {
      env: { ...process.env, MODE: 'network' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('fdev slot publish timeout (300s)'));
    }, 300_000);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const combined = `${stdout}\n${stderr}`;
      if (code === 0) resolve(combined);
      else reject(new Error(`fdev slot publish exit ${code}: ${combined.slice(-800)}`));
    });
  });
}
