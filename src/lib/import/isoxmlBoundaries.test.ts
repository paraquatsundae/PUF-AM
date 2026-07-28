import { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseIsoxmlTaskData } from './isoxmlBoundaries';

beforeAll(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  (globalThis as unknown as { DOMParser: typeof DOMParser }).DOMParser = dom.window.DOMParser;
});

const SAMPLE = `<?xml version="1.0" encoding="utf-8"?>
<ISO11783_TaskData VersionMajor="4" VersionMinor="2">
  <CTR A="CTR1" B="Test Client" />
  <FRM A="FRM1" B="Clare Downs" I="CTR1" />
  <FRM A="FRM2" B="Soothsay" I="CTR1" />
  <PFD A="PFD1" C="North" D="0" E="CTR1" F="FRM1">
    <PLN A="1" B="0">
      <LSG A="1">
        <PNT A="10" C="-33.67" D="120.89" />
        <PNT A="10" C="-33.67" D="120.90" />
        <PNT A="10" C="-33.68" D="120.90" />
        <PNT A="10" C="-33.68" D="120.89" />
      </LSG>
    </PLN>
  </PFD>
  <PFD A="PFD2" C="South" D="0" E="CTR1" F="FRM2">
    <PLN A="1" B="0">
      <LSG A="1">
        <PNT A="10" C="-33.70" D="120.80" />
        <PNT A="10" C="-33.70" D="120.81" />
        <PNT A="10" C="-33.71" D="120.81" />
      </LSG>
    </PLN>
  </PFD>
</ISO11783_TaskData>`;

describe('parseIsoxmlTaskData', () => {
  it('reads farm names, paddock names, and boundary rings', () => {
    const tree = parseIsoxmlTaskData(SAMPLE);
    expect(tree.clients).toHaveLength(1);
    expect(tree.clients[0].name).toBe('Test Client');
    const farms = tree.clients[0].farms;
    expect(farms.map((f) => f.name).sort()).toEqual(['Clare Downs', 'Soothsay']);
    const clare = farms.find((f) => f.name === 'Clare Downs')!;
    expect(clare.fields).toHaveLength(1);
    expect(clare.fields[0].name).toBe('North');
    // lon,lat order
    expect(clare.fields[0].boundary[0][0]).toBeCloseTo(120.89);
    expect(clare.fields[0].boundary[0][1]).toBeCloseTo(-33.67);
    expect(clare.fields[0].boundary.length).toBeGreaterThanOrEqual(4);
  });
});
