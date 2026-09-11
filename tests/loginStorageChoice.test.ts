/**
 * The start screen must never invent a Freenet option a build cannot honour, and
 * must never make a returning operator re-answer the storage question.
 */

import { describe, expect, it } from 'vitest';

import { freenetOptionState, initialLoginStep } from '../src/lib/loginStorageChoice.ts';

describe('freenetOptionState', () => {
  it('offers Freenet on the desktop shell when the mist gate is open', () => {
    expect(freenetOptionState({ capability: 'electron', mistEnabled: true })).toBe('available');
  });

  it('points a desktop operator at the Settings toggle instead of hiding it', () => {
    expect(freenetOptionState({ capability: 'electron', mistEnabled: false })).toBe('needs-setting');
  });

  it('hides it on the hosted web even when the build baked the mist flag (decision 5)', () => {
    expect(freenetOptionState({ capability: null, mistEnabled: false })).toBe('hidden');
    expect(freenetOptionState({ capability: null, mistEnabled: true })).toBe('hidden');
  });

  it('offers it on a workshop hub so a fresh user can start without Firebase', () => {
    expect(freenetOptionState({ capability: null, mistEnabled: false, workshopHub: true })).toBe(
      'available'
    );
  });

  it('keeps the tablet reader path: an APK with the gate open reads through a hub', () => {
    expect(
      freenetOptionState({ capability: null, mistEnabled: true, nativeReader: true })
    ).toBe('available');
    expect(
      freenetOptionState({ capability: null, mistEnabled: false, nativeReader: true })
    ).toBe('hidden');
  });

  it('will offer it outright once the Android host exists', () => {
    expect(freenetOptionState({ capability: 'android', mistEnabled: false })).toBe('available');
  });
});

describe('initialLoginStep', () => {
  it('lands a fresh hosted-web device on the join box', () => {
    expect(
      initialLoginStep({ freenet: 'hidden', welcomeBack: false, backend: 'firebase' })
    ).toBe('join');
  });

  it('lands a fresh device that can reach Freenet on the join box', () => {
    expect(
      initialLoginStep({ freenet: 'available', welcomeBack: false, backend: 'firebase' })
    ).toBe('join');
    expect(
      initialLoginStep({
        freenet: freenetOptionState({ capability: null, mistEnabled: false, workshopHub: true }),
        welcomeBack: false,
        backend: 'firebase',
      })
    ).toBe('join');
    expect(
      initialLoginStep({ freenet: 'needs-setting', welcomeBack: false, backend: 'firebase' })
    ).toBe('join');
  });

  it('sends a remembered Firebase device straight back to the PIN prompt', () => {
    expect(
      initialLoginStep({ freenet: 'available', welcomeBack: true, backend: 'firebase' })
    ).toBe('firebase');
  });

  it('still opens Join when the device last ran the mist backend', () => {
    expect(
      initialLoginStep({ freenet: 'available', welcomeBack: true, backend: 'mist' })
    ).toBe('join');
  });

  it('opens the Firebase form when this device already pasted a BYO config', () => {
    expect(
      initialLoginStep({
        freenet: 'available',
        welcomeBack: false,
        backend: 'firebase',
        byoConfigured: true,
      })
    ).toBe('firebase');
  });
});
