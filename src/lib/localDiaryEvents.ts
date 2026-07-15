import type { DiaryEvent } from './farmDiary';

const key = (farmId: string) => `sentinut_diary_events_${farmId}`;

function read(farmId: string): DiaryEvent[] {
  try {
    const raw = localStorage.getItem(key(farmId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(farmId: string, events: DiaryEvent[]) {
  localStorage.setItem(key(farmId), JSON.stringify(events));
}

export const localDiaryEvents = {
  list(farmId: string, startDate?: string, endDate?: string): DiaryEvent[] {
    let items = read(farmId);
    if (startDate) items = items.filter((e) => e.date >= startDate);
    if (endDate) items = items.filter((e) => e.date <= endDate);
    return items.sort((a, b) => b.date.localeCompare(a.date));
  },
  upsert(farmId: string, event: DiaryEvent) {
    const list = read(farmId);
    const idx = list.findIndex((e) => e.id === event.id);
    if (idx >= 0) list[idx] = event;
    else list.push(event);
    write(farmId, list);
    return list.sort((a, b) => b.date.localeCompare(a.date));
  },
  remove(farmId: string, id: string) {
    const list = read(farmId).filter((e) => e.id !== id);
    write(farmId, list);
    return list;
  },
};
