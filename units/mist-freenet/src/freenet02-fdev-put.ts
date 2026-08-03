/**
 * PUT via fdev CLI — uses native WebSocket encoding (same node :7509).
 *
 * @freenetorg/freenet-stdlib flatbuffers PUT times out against freenet 0.2.118;
 * fdev `execute put` succeeds (native protocol). GET stays on flatbuffers SDK.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { encodeFreenet02Uri } from './freenet02-uri.ts';
import {
  packParametersFromBlob,
  resolvePackContractWasmPath,
} from './freenet02-pack.ts';
import type { FreenetPutOptions, FreenetPutResult } from './freenet-transport.ts';

function resolveFdevBin(): string {
  return process.env.FDEV_BIN?.trim() || 'fdev';
}

function parsePublishedKey(output: string): string | null {
  const m = output.match(/Publishing contract ([1-9A-HJ-NP-Za-km-z]{20,})/);
  if (m?.[1]) return m[1];
  const m2 = output.match(/response_key:\s*([1-9A-HJ-NP-Za-km-z]{20,})/);
  return m2?.[1] ?? null;
}

export async function putBlobViaFdev(
  data: Uint8Array,
  options: FreenetPutOptions = {},
): Promise<FreenetPutResult> {
  const identifier = options.identifier ?? `fdev-put-${Date.now()}`;
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'mist-freenet-fdev-'));
  const statePath = path.join(tmpDir, 'state.bin');
  const paramsPath = path.join(tmpDir, 'params.bin');
  const wasmPath = resolvePackContractWasmPath();

  try {
    const params = packParametersFromBlob(data);
    await writeFile(statePath, data);
    await writeFile(paramsPath, params);

    const args = [
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
    if (port) args.splice(1, 0, '--port', port);

    const output = await runFdev(args);
    const key = parsePublishedKey(output);
    if (!key) {
      throw new Error(`fdev put: could not parse contract key from output:\n${output.slice(-500)}`);
    }

    return { uri: encodeFreenet02Uri(key), identifier };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
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
      reject(new Error('fdev put timeout (300s)'));
    }, 300_000);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const combined = `${stdout}\n${stderr}`;
      if (code === 0) resolve(combined);
      else reject(new Error(`fdev put exit ${code}: ${combined.slice(-800)}`));
    });
  });
}
