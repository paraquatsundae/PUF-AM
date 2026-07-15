import type { FieldIssue } from './fieldStore';

export type IssuePreset = {
  id: string;
  label: string;
  category: FieldIssue['category'];
  priority: FieldIssue['priority'];
};

/** Common orchard issues — tap to log after dropping a pin. */
export const COMMON_ISSUE_PRESETS: IssuePreset[] = [
  { id: 'tree-down', label: 'Tree down', category: 'damage', priority: 'high' },
  { id: 'burst-pipe', label: 'Burst pipe', category: 'irrigation', priority: 'high' },
  { id: 'irrigation-leak', label: 'Irrigation leak', category: 'irrigation', priority: 'high' },
  { id: 'blocked-drip', label: 'Blocked dripper', category: 'irrigation', priority: 'medium' },
  { id: 'bog-hole', label: 'Bog hole', category: 'other', priority: 'medium' },
  { id: 'pest', label: 'Pest', category: 'pest', priority: 'medium' },
  { id: 'disease', label: 'Disease', category: 'disease', priority: 'medium' },
  { id: 'weeds', label: 'Weeds', category: 'pest', priority: 'low' },
  { id: 'fence', label: 'Fence damage', category: 'damage', priority: 'medium' },
];
