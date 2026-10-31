/**
 * CBH 2026/27 moisture maximums used as the truck blend's starting point.
 * Canola: CAN1, CAG1, CAN2 and CAG2 are all 8.0% (canola receival standard).
 * Wheat and barley base limits are the figures on the CBH receival standards page.
 * Oats (OAT1, OAT2, OAT3) are 12%. Lupin (LUP1) is 14%.
 * A site can receive above these while high moisture is open. That change is
 * typed on the truck page; it is not a second standard baked in here.
 */

export type ReceivalGrade = {
  id: string;
  label: string;
  /** Maximum moisture for a load at the standard, percent. */
  moistureMax: number;
};

export const CBH_RECEIVAL_GRADES: readonly ReceivalGrade[] = [
  { id: 'cag1', label: 'CAG1', moistureMax: 8 },
  { id: 'wheat', label: 'Wheat', moistureMax: 12.5 },
  { id: 'aww1', label: 'AWW1', moistureMax: 13.5 },
  { id: 'malt', label: 'Malt', moistureMax: 12.5 },
  { id: 'bfed1', label: 'Feed barley', moistureMax: 13.5 },
  { id: 'oat1', label: 'Oats', moistureMax: 12 },
  { id: 'lup1', label: 'Lupin', moistureMax: 14 },
];

export const DEFAULT_RECEIVAL_GRADE_ID = 'cag1';

export function receivalGrade(id: string | undefined): ReceivalGrade | null {
  return CBH_RECEIVAL_GRADES.find((grade) => grade.id === id) ?? null;
}

export function defaultReceival(): { gradeId: string; deliverAt: number; trailerMax: number } {
  const grade = receivalGrade(DEFAULT_RECEIVAL_GRADE_ID) ?? CBH_RECEIVAL_GRADES[0];
  return { gradeId: grade.id, deliverAt: grade.moistureMax, trailerMax: grade.moistureMax };
}
