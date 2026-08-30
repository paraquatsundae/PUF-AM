import { describe, expect, it } from 'vitest';
import { escapeHtml } from './escapeHtml';

describe('escapeHtml', () => {
  it('escapes markup and quotes', () => {
    expect(escapeHtml(`<img src=x onerror=alert(1)> & "hi"`)).toBe(
      '&lt;img src=x onerror=alert(1)&gt; &amp; &quot;hi&quot;'
    );
  });
});
