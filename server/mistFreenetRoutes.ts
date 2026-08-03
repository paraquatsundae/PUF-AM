/**
 * Workshop API — in-process Freenet peer + encrypted mist put/get proxy.
 *
 * Browser IndexedDB holds local cache; when the server peer is up, the UI can
 * publish/pull Hot ciphertext via FCP without running Hyphanet UI separately.
 */

import type { Express, Request, Response } from 'express';
import { hotKey } from '../units/mist-freenet/src/index.ts';
import type { MistPutMeta } from '../units/mist-freenet/src/types.ts';
import {
  createFreenetPeerHost,
  ensureFreenetPeer,
  getFreenetPeerStatus,
  stopFreenetPeerHost,
} from './freenetPeerHost.ts';

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

function mistApiUnavailable(_req: Request, res: Response): boolean {
  if (process.env.MIST_FREENET_DISABLED === '1') {
    res.status(503).json({
      error: 'Mist Freenet API disabled (MIST_FREENET_DISABLED=1)',
    });
    return true;
  }
  return false;
}

export function registerMistFreenetRoutes(app: Express): void {
  app.get('/api/mist/freenet/peer/status', async (req, res) => {
    if (mistApiUnavailable(req, res)) return;
    try {
      const status = await getFreenetPeerStatus();
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'status failed' });
    }
  });

  app.post('/api/mist/freenet/peer/start', async (req, res) => {
    if (mistApiUnavailable(req, res)) return;
    try {
      const contribute = Boolean(req.body?.contribute);
      const peer = await ensureFreenetPeer({ start: true, contribute });
      const status = await peer.start();
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'start failed' });
    }
  });

  app.post('/api/mist/freenet/peer/stop', async (_req, res) => {
    try {
      const status = await stopFreenetPeerHost();
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'stop failed' });
    }
  });

  app.post('/api/mist/freenet/peer/contribute', async (req, res) => {
    if (mistApiUnavailable(req, res)) return;
    try {
      const enabled = Boolean(req.body?.enabled);
      const peer = await ensureFreenetPeer({ start: false });
      peer.setContribute(enabled);
      const status = await peer.status();
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'contribute update failed' });
    }
  });

  app.post('/api/mist/freenet/put', async (req, res) => {
    if (mistApiUnavailable(req, res)) return;
    try {
      const { key, ciphertextBase64, meta } = req.body as {
        key?: string;
        ciphertextBase64?: string;
        meta?: MistPutMeta;
      };

      if (!key || !ciphertextBase64 || !meta?.kind) {
        return res.status(400).json({ error: 'key, ciphertextBase64, and meta.kind are required' });
      }

      const peer = await ensureFreenetPeer({ start: true });
      const store = peer.getStore();
      const ciphertext = base64ToBytes(ciphertextBase64);
      const result = await store.put(key, ciphertext, meta);
      const record = store.getFreenetRecord(key);

      res.json({
        ...result,
        freenetUri: record?.uri,
        freenetPending: record?.pending ?? true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'put failed';
      const status = message.includes('plaintext') || message.includes('AEAD') ? 400 : 500;
      res.status(status).json({ error: message });
    }
  });

  app.get('/api/mist/freenet/get', async (req, res) => {
    if (mistApiUnavailable(req, res)) return;
    try {
      const key = String(req.query.key || '').trim();
      if (!key) {
        return res.status(400).json({ error: 'query key is required' });
      }

      const peer = await ensureFreenetPeer({ start: true });
      const entry = await peer.getStore().get(key);
      if (!entry) {
        return res.status(404).json({ error: 'not found' });
      }

      res.json({
        key: entry.key,
        ciphertextBase64: bytesToBase64(entry.ciphertext),
        meta: entry.meta,
        contentHash: entry.meta.content_hash,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'get failed' });
    }
  });

  app.post('/api/mist/freenet/hot/publish/:farmId', async (req, res) => {
    if (mistApiUnavailable(req, res)) return;
    try {
      const farmId = String(req.params.farmId || '').trim();
      const ciphertextBase64 = String(req.body?.ciphertextBase64 || '').trim();
      if (!farmId || !ciphertextBase64) {
        return res.status(400).json({ error: 'farmId and body.ciphertextBase64 are required' });
      }

      const key = hotKey(farmId, 'current');
      const peer = await ensureFreenetPeer({ start: true });
      const store = peer.getStore();
      const ciphertext = base64ToBytes(ciphertextBase64);
      const contentHash =
        String(req.body?.contentHash || '').trim() ||
        (await import('../units/mist-freenet/src/hash.ts')).sha256Hex(ciphertext);

      const result = await store.put(key, ciphertext, {
        kind: 'hot',
        content_hash: contentHash,
        size: ciphertext.byteLength,
      });

      const record = store.getFreenetRecord(key);
      res.json({
        storageKey: key,
        contentHash: result.contentHash,
        freenetUri: record?.uri,
        freenetPending: record?.pending ?? true,
        publishedAt: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'hot publish failed';
      const status = message.includes('plaintext') || message.includes('AEAD') ? 400 : 500;
      res.status(status).json({ error: message });
    }
  });

  app.get('/api/mist/freenet/hot/:farmId', async (req, res) => {
    if (mistApiUnavailable(req, res)) return;
    try {
      const farmId = String(req.params.farmId || '').trim();
      if (!farmId) {
        return res.status(400).json({ error: 'farmId is required' });
      }

      const key = hotKey(farmId, 'current');
      const peer = await ensureFreenetPeer({ start: true });
      const entry = await peer.getStore().get(key);
      if (!entry) {
        return res.status(404).json({ error: 'hot/current not on Freenet cache or network' });
      }

      res.json({
        storageKey: key,
        ciphertextBase64: bytesToBase64(entry.ciphertext),
        contentHash: entry.meta.content_hash,
        size: entry.meta.size,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'hot pull failed' });
    }
  });

  /** Test-only: create peer with mock transport (never in production path). */
  if (process.env.NODE_ENV === 'test') {
    app.post('/api/mist/freenet/test/reset', async (_req, res) => {
      await stopFreenetPeerHost();
      createFreenetPeerHost({ allowPlaintextForTests: true });
      res.json({ ok: true });
    });
  }
}
