import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { loadImportFile } from './readTaskDataFile';

function fileFromBytes(name: string, bytes: Uint8Array, type = 'application/octet-stream'): File {
  return new File([bytes], name, { type });
}

const SAMPLE_TASKDATA = `<?xml version="1.0"?><ISO11783_TaskData><FRM A="FRM1" B="F" I="CTR1"/><PFD A="PFD1" C="P" E="CTR1" F="FRM1"/></ISO11783_TaskData>`;

describe('loadImportFile', () => {
  it('reads TASKDATA.XML from a JD-style zip', async () => {
    const zipped = zipSync({
      'Export/TASKDATA/TASKDATA.XML': new TextEncoder().encode(SAMPLE_TASKDATA),
      'Export/TASKDATA/LINKLIST.XML': new TextEncoder().encode('<ISO11783LinkList/>'),
    });
    const loaded = await loadImportFile(fileFromBytes('ops.zip', zipped, 'application/zip'));
    expect(loaded.kind).toBe('xml');
    expect(loaded.fromZip).toBe(true);
    expect(loaded.text).toContain('ISO11783_TaskData');
    expect(loaded.sourceName).toMatch(/TASKDATA\.XML/i);
  });

  it('reads raw Taskdata.xml case-insensitively by content', async () => {
    const bytes = new TextEncoder().encode(SAMPLE_TASKDATA);
    const loaded = await loadImportFile(fileFromBytes('Taskdata.xml', bytes, 'text/xml'));
    expect(loaded.kind).toBe('xml');
    expect(loaded.fromZip).toBe(false);
    expect(loaded.text).toContain('ISO11783_TaskData');
    expect(loaded.sourceName).toBe('Taskdata.xml');
  });
});
