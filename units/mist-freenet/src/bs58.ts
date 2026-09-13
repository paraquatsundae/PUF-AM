/**
 * bs58 v6 ships dual CJS/ESM (`exports.default = { encode, decode }` plus
 * `__esModule`). Electron main is esbuild CJS with `packages: 'external'`, which
 * emits `__toESM(require("bs58"), 1)`. Node-compat mode then sets `.default` to
 * the whole module, so `import_bs58.default.decode` is not a function.
 *
 * Unwrap once here so every Send / slot / pack-id call site gets a real codec.
 */

import bs58Module from 'bs58';

export type Bs58Codec = {
  encode: (source: Uint8Array) => string;
  decode: (str: string) => Uint8Array;
};

function isBs58Codec(value: unknown): value is Bs58Codec {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Bs58Codec).encode === 'function' &&
    typeof (value as Bs58Codec).decode === 'function'
  );
}

/** Walk CJS/ESM/esbuild `__toESM(..., 1)` wrappers until encode/decode are functions. */
export function unwrapBs58(mod: unknown): Bs58Codec {
  let current: unknown = mod;
  for (let i = 0; i < 3; i++) {
    if (isBs58Codec(current)) return current;
    if (current && typeof current === 'object' && 'default' in current) {
      current = (current as { default: unknown }).default;
      continue;
    }
    break;
  }
  throw new Error('bs58: encode/decode are not functions after import interop');
}

const bs58 = unwrapBs58(bs58Module);
export default bs58;
