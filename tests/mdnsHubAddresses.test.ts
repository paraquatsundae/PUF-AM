/**
 * Which address the hub tells a tablet to use.
 *
 * The multi-homed laptop is the whole problem: with USB tethering up, the
 * tethered interface hands out `192.168.42.x`, a textbook private LAN address
 * that beat the real Wi‑Fi one under address-class ordering alone. The hub then
 * advertised — and printed in Settings — an address reachable only from the phone
 * plugged into it, so a tablet that discovered the hub could not reach it.
 *
 * @see Plans/APK_FREENET_PLUGIN.md §8a
 */

import { describe, expect, it } from 'vitest';

import { interfaceRank } from '../server/mdnsHub.ts';

describe('interface ranking', () => {
  it('puts Wi‑Fi first', () => {
    for (const name of ['wlan0', 'wlp3s0', 'wlp0s20f3', 'Wi-Fi', 'WiFi 2']) {
      expect(interfaceRank(name)).toBe(0);
    }
  });

  it('puts wired second — a shed Ethernet run is still the shed LAN', () => {
    for (const name of ['eth0', 'eno1', 'ens33', 'enp2s0', 'Ethernet']) {
      expect(interfaceRank(name)).toBe(1);
    }
  });

  it('ranks USB tethering and USB NICs last', () => {
    for (const name of ['usb0', 'rndis0', 'ncm0', 'enp0s20u2']) {
      expect(interfaceRank(name)).toBeGreaterThan(interfaceRank('eth0'));
      expect(interfaceRank(name)).toBeGreaterThan(interfaceRank('wlan0'));
    }
  });

  it('ranks virtual bridges below anything physical', () => {
    for (const name of ['docker0', 'br-abc123', 'virbr0', 'vmnet1', 'veth9f2', 'tun0', 'wg0']) {
      expect(interfaceRank(name)).toBeGreaterThan(interfaceRank('eth0'));
    }
  });

  it('prefers Wi‑Fi over a tethered interface even when the tether looks more like a LAN', () => {
    // 192.168.42.x (tether) vs 10.0.5.x (Wi‑Fi): address class says the tether,
    // interface says the Wi‑Fi, and the interface is right.
    expect(interfaceRank('wlan0')).toBeLessThan(interfaceRank('usb0'));
  });
});
