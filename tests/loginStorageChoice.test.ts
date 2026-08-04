/**
 * The start screen must never invent a Freenet option a build cannot honour, and
 * must never make a returning operator re-answer the storage question.
 */

import { describe, expect, it } from 'vitest';

import { freenetOptionState, initialLoginStep } from '../src/lib/loginStorageChoice.ts';

describe('freenetOptionState', () => {
  it('offers Freenet whenever the mist gate is open', () => {
    expect(freenetOptionState({ mistEnabled: true, desktop: false })).toBe('available');
    expect(freenetOptionState({ mistEnabled: true, desktop: true })).toBe('available');
  });

  it('points a desktop operator at the Settings toggle instead of hiding it', () => {
    expect(freenetOptionState({ mistEnabled: false, desktop: true })).toBe('needs-setting');
  });

  it('hides it entirely on web and Capacitor builds', () => {
    expect(freenetOptionState({ mistEnabled: false, desktop: false })).toBe('hidden');
  });
});

describe('initialLoginStep', () => {
  it('keeps production web on the Firebase flow with no chooser', () => {
    expect(
      initialLoginStep({ freenet: 'hidden', welcomeBack: false, backend: 'firebase' })
    ).toBe('firebase');
  });

  it('asks first on a fresh device that can reach Freenet', () => {
    expect(
      initialLoginStep({ freenet: 'available', welcomeBack: false, backend: 'firebase' })
    ).toBe('choose');
    expect(
      initialLoginStep({ freenet: 'needs-setting', welcomeBack: false, backend: 'firebase' })
    ).toBe('choose');
  });

  it('sends a remembered Firebase device straight back to the PIN prompt', () => {
    expect(
      initialLoginStep({ freenet: 'available', welcomeBack: true, backend: 'firebase' })
    ).toBe('firebase');
  });

  it('still asks when the device last ran the mist backend', () => {
    expect(
      initialLoginStep({ freenet: 'available', welcomeBack: true, backend: 'mist' })
    ).toBe('choose');
  });
});
