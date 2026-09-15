/**
 * farm_chat/log rules — text check (no emulator harness).
 * Plans/FARM_MESSAGING.md · Plans/FIREBASE_BILLING.md
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

describe('firestore.rules farm_chat/log', () => {
  it('caps the rolling doc and refuses a messages collection', () => {
    expect(rules).toContain('match /farm_chat/log');
    expect(rules).toContain('isValidFarmChatLog');
    expect(rules).toContain('data.messages.size() <= 80');
    expect(rules).toContain("m.text.size() <= 400");
    expect(rules).not.toContain('match /messages/{');
  });

  it('members read; admin/farmer write; no photo fields on the allow-list', () => {
    const helper = rules.match(/function isValidFarmChatLog\([\s\S]*?\n {4}\}/)?.[0] ?? '';
    expect(helper).toContain("hasOnlyAllowedFields(['messages', 'updatedAt', 'updatedBy'])");
    expect(helper).not.toMatch(/photo/i);
    expect(rules).toContain('allow create, update: if canMutateFarm(farmId) && isValidFarmChatLog');
  });
});
