export function serialize(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function deserialize<T = unknown>(s: string): T {
  return JSON.parse(s) as T;
}
