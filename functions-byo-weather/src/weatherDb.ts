export type WeatherSnap = {
  exists: boolean;
  id?: string;
  data(): Record<string, unknown> | undefined;
};

export type WeatherDocRef = {
  get(): Promise<WeatherSnap>;
  set(data: Record<string, unknown>, opts?: { merge?: boolean }): Promise<void>;
};

export type WeatherCollection = {
  get(): Promise<{ docs: WeatherSnap[] }>;
  doc(id: string): WeatherDocRef;
  /** Projection — Admin `select()`. Hourly discovery must not download weatherData. */
  select(...fields: string[]): WeatherCollection;
};

/** Minimal Admin Firestore surface used by this package (injectable in tests). */
export type WeatherDb = {
  doc(path: string): WeatherDocRef;
  collection(name: string): WeatherCollection;
};
