import {
  ContractCodeT,
  ContractContainer,
  ContractType,
  ContractKey,
  FreenetWsApi,
  PutRequest,
  WasmContractV1,
  RelatedContractsT,
} from '@freenetorg/freenet-stdlib';
import bs58 from 'bs58';
import { blake3 } from '@noble/hashes/blake3.js';
import { readFileSync } from 'node:fs';

const wasm = readFileSync('./units/mist-freenet/assets/pack-contract.wasm');
const codeHash = bs58.decode('5Piu7V1PjjcPVnTvUbyMdDiyvwoBprBPZ4GFUHfabyzW');
const state = new TextEncoder().encode(`probe2-${Date.now()}`);
const params = blake3(state);
const combined = new Uint8Array(64);
combined.set(codeHash,0); combined.set(params,32);
const instance = blake3(combined);

const handler = {
  onContractPut: (r) => console.log('onContractPut', r.key.encode()),
  onContractGet: () => {},
  onContractUpdate: () => {},
  onContractUpdateNotification: () => {},
  onContractNotFound: () => console.log('not found'),
  onDelegateResponse: () => {},
  onErr: (e) => console.error('onErr', e.cause),
  onOpen: () => console.log('open'),
  onClose: (c,r) => console.log('close', c, r),
};

const url = new URL('ws://127.0.0.1:7509/v1/contract/command');
url.searchParams.set('encodingProtocol', 'flatbuffers');
const api = new FreenetWsApi(url, handler);

await new Promise((r) => setTimeout(r, 500));

const contractCode = new ContractCodeT(Array.from(wasm), Array.from(codeHash));
const contractKey = new ContractKey(instance, codeHash);
const wasmContract = new WasmContractV1(contractCode, Array.from(params), contractKey);
const container = new ContractContainer(ContractType.WasmContractV1, wasmContract);
const putReq = new PutRequest(container, Array.from(state), new RelatedContractsT([]), false, false);

try {
  const resp = await api.put(putReq);
  console.log('put resolved', resp.key.encode());
} catch (e) {
  console.error('put rejected', e.message);
}
