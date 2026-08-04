import { describe, expect, it } from 'vitest';

import { mistSetupDestination } from './finishMistFarmSetup.ts';
import { farmRoleForMistRole } from './mistFarmSession.ts';

describe('mistSetupDestination', () => {
  it('sends the owner who minted the farm into the geometry wizard', () => {
    expect(mistSetupDestination({ role: 'owner' })).toBe('/farm-setup');
  });

  it('keeps a joiner out of the wizard — their geometry arrives over Freenet', () => {
    expect(mistSetupDestination({ role: 'farmer', joinTicketPending: true })).toBe('/');
    expect(mistSetupDestination({ role: 'admin', joinedViaTicket: true })).toBe('/');
    expect(mistSetupDestination({ role: 'viewer' })).toBe('/');
  });

  it('does not send an owner who arrived on a ticket to setup either', () => {
    expect(mistSetupDestination({ role: 'owner', joinedViaTicket: true })).toBe('/');
    expect(mistSetupDestination({ role: 'owner', joinTicketPending: true })).toBe('/');
  });
});

describe('farmRoleForMistRole', () => {
  it('maps the mist-only owner rung onto the module system admin role', () => {
    expect(farmRoleForMistRole('owner')).toBe('admin');
  });

  it('passes the roles the module system already understands straight through', () => {
    expect(farmRoleForMistRole('admin')).toBe('admin');
    expect(farmRoleForMistRole('farmer')).toBe('farmer');
    expect(farmRoleForMistRole('viewer')).toBe('viewer');
  });
});
