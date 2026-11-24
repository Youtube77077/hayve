import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Reads a public web page for the admin import (link previews). Only http(s), only public
 * addresses (no localhost, private networks or cloud metadata), at most 3 redirects, 3 MB, 10 s.
 */
export function isPublicAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false; // link-local, cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
    if (a >= 224) return false; // multicast, reserved
    return true;
  }
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::') return false;
    if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return false;
    if (v.startsWith('::ffff:')) return isPublicAddress(v.slice(7));
    return true;
  }
  return false;
}

async function assertPublicUrl(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('That link is not valid');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Only web links (http or https) can be imported');
  if (u.username || u.password) throw new Error('Links with passwords are not allowed');
  const addrs = isIP(u.hostname) ? [{ address: u.hostname }] : await lookup(u.hostname, { all: true });
  if (!addrs.length || !addrs.every((a) => isPublicAddress(a.address))) throw new Error('That address is not on the public internet');
  return u;
}

export async function fetchPublicPage(raw: string, opts: { timeoutMs?: number; maxBytes?: number } = {}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxBytes = opts.maxBytes ?? 3 * 1024 * 1024;
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop <= 3; hop++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { redirect: 'manual', signal: ctrl.signal, headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'Mozilla/5.0 (compatible; HayveLinkPreview/1.0)' } });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        url = await assertPublicUrl(new URL(res.headers.get('location')!, url).toString());
        continue;
      }
      if (!res.ok) throw new Error(`The site answered ${res.status}`);
      const type = res.headers.get('content-type') ?? '';
      if (!/text\/html|application\/xhtml/i.test(type)) throw new Error('That link is not a web page');
      const reader = res.body?.getReader();
      if (!reader) return await res.text();
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
      return new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
    } finally {
      clearTimeout(t);
    }
  }
  throw new Error('Too many redirects');
}
