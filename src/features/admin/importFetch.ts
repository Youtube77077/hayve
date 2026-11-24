/**
 * Reads a web page for the admin import. In the iPhone app pages are read directly; in a browser
 * most sites block that, so it goes through the Hayve API (`/admin/import/fetch`) when it's set up.
 */
const API = process.env.EXPO_PUBLIC_API_URL;

export async function fetchPage(url: string, signal?: AbortSignal): Promise<string> {
  try {
    const r = await fetch(url, { signal, headers: { Accept: 'text/html' } });
    if (r.ok) {
      const html = await r.text();
      if (html.length > 200) return html;
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
  }
  if (API) {
    const r = await fetch(`${API.replace(/\/$/, '')}/admin/import/fetch?url=${encodeURIComponent(url)}`, { signal, credentials: 'include' });
    if (r.ok) return r.text();
    let msg = `The Hayve server couldn't read it (${r.status})`;
    try {
      msg = ((await r.json()) as { message?: string }).message ?? msg;
    } catch {
      /* keep */
    }
    throw new Error(msg);
  }
  throw new Error('This browser can’t read that site. Import from the Hayve app on your iPhone, or connect the Hayve server (EXPO_PUBLIC_API_URL).');
}
