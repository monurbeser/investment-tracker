type Entry = { value: unknown; expires: number };

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

/** In-memory TTL cache with in-flight de-duplication (per server instance). */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const p = load()
    .then((value) => {
      store.set(key, { value, expires: Date.now() + ttlMs });
      if (store.size > 2000) {
        const now = Date.now();
        for (const [k, e] of store) if (e.expires < now) store.delete(k);
      }
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export class UpstreamError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? 12000);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) throw new UpstreamError(`${new URL(url).host} ${res.status}`, res.status);
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof UpstreamError) throw e;
    const msg = (e as Error).name === "AbortError" ? "zaman aşımı" : (e as Error).message;
    throw new UpstreamError(`${new URL(url).host}: ${msg}`);
  } finally {
    clearTimeout(timer);
  }
}

export const isDemo = () => process.env.DATA_MODE === "demo";
