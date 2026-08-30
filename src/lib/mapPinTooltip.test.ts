import { describe, expect, it } from 'vitest';
import { getPinTooltipHtml } from './mapPinTooltip';

describe('getPinTooltipHtml', () => {
  it('includes name, type label, and status', () => {
    const html = getPinTooltipHtml({
      id: 'p1',
      name: 'North dam',
      type: 'dam',
      status: 'active',
      lat: 0,
      lng: 0,
    });
    expect(html).toContain('North dam');
    expect(html).toContain('active');
    expect(html).toContain('Dam / water body');
  });

  it('falls back when the pin has no name', () => {
    const html = getPinTooltipHtml({
      id: 'p2',
      name: '',
      type: 'standpipe',
      status: 'offline',
      lat: 0,
      lng: 0,
    });
    expect(html).toContain('Unnamed asset');
    expect(html).toContain('offline');
  });

  it('escapes user-authored name', () => {
    const html = getPinTooltipHtml({
      id: 'p3',
      name: '<b>x</b>',
      type: 'dam',
      status: 'active',
      lat: 0,
      lng: 0,
    });
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
  });
});
