import type { WeatherDb, WeatherSnap } from '../../functions-byo-weather/src/weatherDb';

function isDirectChild(path: string, collectionName: string): boolean {
  const prefix = `${collectionName}/`;
  if (!path.startsWith(prefix)) return false;
  return !path.slice(prefix.length).includes('/');
}

export function memoryWeatherDb() {
  const store = new Map<string, Record<string, unknown>>();

  const db: WeatherDb = {
    doc(path: string) {
      return {
        async get(): Promise<WeatherSnap> {
          const data = store.get(path);
          return {
            exists: data !== undefined,
            id: path.split('/').pop(),
            data: () => data,
          };
        },
        async set(data: Record<string, unknown>, opts?: { merge?: boolean }) {
          const prev = store.get(path) || {};
          store.set(path, opts?.merge ? { ...prev, ...data } : { ...data });
        },
      };
    },
    collection(name: string) {
      function makeCollection(fields?: string[]) {
        return {
          async get() {
            const docs: WeatherSnap[] = [];
            for (const [path, data] of store) {
              if (!isDirectChild(path, name)) continue;
              const projected = fields
                ? Object.fromEntries(fields.filter((f) => f in data).map((f) => [f, data[f]]))
                : data;
              docs.push({
                exists: true,
                id: path.slice(name.length + 1),
                data: () => projected,
              });
            }
            return { docs };
          },
          doc(id: string) {
            return db.doc(`${name}/${id}`);
          },
          select(...next: string[]) {
            return makeCollection(next);
          },
        };
      }
      return makeCollection();
    },
  };

  return { db, store };
}
