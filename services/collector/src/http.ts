/**
 * Küçük HTTP istemcisi: auth header, JSON parse, hata yönetimi, basit retry.
 * Jira ve GitLab istemcileri bunu paylaşır.
 */

export interface HttpOptions {
  baseUrl: string;
  headers: Record<string, string>;
}

export class HttpClient {
  constructor(private opts: HttpOptions) {}

  /** Ham yanıt (header'lara erişim gerektiğinde — GitLab sayfalama). */
  async raw(path: string, init: RequestInit = {}): Promise<Response> {
    const url = path.startsWith("http") ? path : `${this.opts.baseUrl}${path}`;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          ...init,
          headers: { ...this.opts.headers, ...(init.headers ?? {}) },
        });
        if (res.status === 429 || res.status >= 500) {
          await sleep(500 * (attempt + 1));
          continue;
        }
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status} ${url} :: ${body.slice(0, 300)}`);
        }
        return res;
      } catch (err) {
        lastErr = err;
        await sleep(500 * (attempt + 1));
      }
    }
    throw new Error(`İstek başarısız (${url}): ${String(lastErr)}`);
  }

  async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.raw(path, init);
    return (await res.json()) as T;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
