import type { ApplicationMethod, DiaryEvent, SprayType } from './farmDiaryTypes';

export function sprayEventsByDate(
  events: DiaryEvent[],
  targetBlockId?: string
): Record<string, { type: SprayType; method: ApplicationMethod }> {
  const sprayMap: Record<string, { type: SprayType; method: ApplicationMethod }> = {};
  const sortedEvents = [...events].sort((a, b) => a.date.localeCompare(b.date));

  sortedEvents.forEach((e) => {
    if (e.type === 'spray' && e.sprayType) {
      if (!targetBlockId || !e.blockId || e.blockId === targetBlockId) {
        const existing = sprayMap[e.date];
        const currentMethod = e.applicationMethod || 'ground';

        if (existing) {
          let mergedType: SprayType = existing.type;
          if (existing.type !== e.sprayType) {
            if (
              (existing.type === 'chem' && e.sprayType === 'bio') ||
              (existing.type === 'bio' && e.sprayType === 'chem') ||
              existing.type === 'both' ||
              e.sprayType === 'both'
            ) {
              mergedType = 'both';
            }
          }

          const methodPriority: Record<ApplicationMethod, number> = {
            helicopter: 4,
            drone: 3,
            aeroplane: 2,
            ground: 1,
          };

          const mergedMethod =
            methodPriority[currentMethod] > methodPriority[existing.method] ? currentMethod : existing.method;

          sprayMap[e.date] = {
            type: mergedType,
            method: mergedMethod,
          };
        } else {
          sprayMap[e.date] = {
            type: e.sprayType,
            method: currentMethod,
          };
        }
      }
    }
  });
  return sprayMap;
}

export function irrigationEventsByDate(
  events: DiaryEvent[],
  targetBlockId?: string
): Record<string, number> {
  const irrigationMap: Record<string, number> = {};
  events.forEach((e) => {
    if (e.type === 'irrigation' && e.irrigationAmount !== undefined) {
      if (!targetBlockId || !e.blockId || e.blockId === targetBlockId) {
        irrigationMap[e.date] = (irrigationMap[e.date] || 0) + e.irrigationAmount;
      }
    }
  });
  return irrigationMap;
}
