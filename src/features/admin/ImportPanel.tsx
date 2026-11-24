import { useRef, useState } from 'react';
import { View } from 'react-native';
import { importer, regions } from '../../backend/api';
import { Button, Card, Chip, color, Group, HScroll, Input, ListRow, Photo, radius, Section, Segmented, T, useToast } from '../../design';
import { useAction, useLive } from '../../lib/hooks';
import { celebrate } from '../celebrate';
import { fetchPage } from './importFetch';
import { extractLinks, extractListing, type ImportKind, type ParsedListing, siteOf } from './importParse';

const KINDS: { key: ImportKind | 'auto'; label: string }[] = [
  { key: 'auto', label: 'Auto' },
  { key: 'shop', label: 'Shop' },
  { key: 'bites', label: 'Bites' },
  { key: 'stay', label: 'Stay' },
  { key: 'drive', label: 'Drive' },
  { key: 'holiday', label: 'Holidays' },
];
const KIND_LABEL: Record<ImportKind, string> = { shop: 'Shop', bites: 'Bites', stay: 'Stay', drive: 'Drive', holiday: 'Holidays' };

/** Admin → Import: paste links (or one search page) to fill the app with real-looking listings for a demo. */
export function ImportPanel() {
  const toast = useToast();
  const { run, busy } = useAction();
  const [mode, setMode] = useState<'links' | 'page'>('links');
  const [text, setText] = useState('');
  const [kind, setKind] = useState<ImportKind | 'auto'>('auto');
  const [city, setCity] = useState(regions.REGIONS[0].city.name);
  const [max, setMax] = useState('40');
  const [progress, setProgress] = useState<{ done: number; total: number; note: string } | null>(null);
  const [found, setFound] = useState<ParsedListing[]>([]);
  const [failed, setFailed] = useState<{ url: string; why: string }[]>([]);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const ctrl = useRef<AbortController | null>(null);
  const counts = useLive(() => importer.importedCounts()).data;
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;

  const read = async () => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setFound([]);
    setFailed([]);
    setSkip(new Set());
    let urls = text.split(/\s+/).map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s));
    if (!urls.length) return toast('Paste at least one link that starts with https://', 'error');
    try {
      if (mode === 'page') {
        setProgress({ done: 0, total: 1, note: `Looking for listings on ${siteOf(urls[0])}…` });
        const html = await fetchPage(urls[0], c.signal);
        urls = extractLinks(html, urls[0], Math.min(200, Math.max(1, Number(max) || 40)));
        if (!urls.length) {
          setProgress(null);
          return toast('No listings found on that page. Try a search or category page, or paste item links.', 'error');
        }
      }
      const ok: ParsedListing[] = [];
      const bad: { url: string; why: string }[] = [];
      let done = 0;
      // A few at a time, so a page full of links is quick but polite.
      const queue = [...urls];
      const worker = async () => {
        while (queue.length && !c.signal.aborted) {
          const u = queue.shift()!;
          setProgress({ done, total: urls.length, note: `Reading ${siteOf(u)}…` });
          try {
            const p = extractListing(await fetchPage(u, c.signal), u);
            if (p) ok.push(p);
            else bad.push({ url: u, why: 'No title or photo on that page' });
          } catch (e) {
            if ((e as Error).name === 'AbortError') return;
            bad.push({ url: u, why: (e as Error).message });
          }
          done++;
          setProgress({ done, total: urls.length, note: `Read ${done} of ${urls.length}` });
          setFound([...ok]);
          setFailed([...bad]);
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast((e as Error).message, 'error');
    } finally {
      setProgress(null);
    }
  };

  const chosen = found.filter((f) => !skip.has(f.url));
  const add = () =>
    run(
      () =>
        importer.importListings(
          chosen.map((f) => ({ kind: kind === 'auto' ? f.kind : kind, url: f.url, site: f.site || siteOf(f.url), title: f.title, description: f.description, images: f.images, priceCents: f.priceCents, currency: f.currency, brand: f.brand, city: f.city && regions.REGIONS.some((r) => r.city.name === f.city) ? f.city : city, country: f.country, lat: f.lat, lng: f.lng, cuisine: f.cuisine, rating: f.rating, reviewCount: f.reviewCount })),
        ),
      {
        onDone: (c) => {
          const n = Object.values(c).reduce((a, b) => a + b, 0);
          setFound([]);
          setText('');
          celebrate({ title: `${n} listing${n === 1 ? '' : 's'} added`, body: (Object.keys(c) as ImportKind[]).filter((k) => c[k]).map((k) => `${c[k]} in ${KIND_LABEL[k]}`).join(' · ') });
        },
      },
    );

  return (
    <View style={{ gap: 16 }}>
      <Section title="Import listings" subtitle="Paste links to items, homes, holidays, restaurants or cars. Hayve reads each page's photos, title and price and adds it to the right service.">
        <Card style={{ gap: 14 }}>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { key: 'links', label: 'Paste links', icon: 'link-outline' },
              { key: 'page', label: 'From a page', icon: 'albums-outline' },
            ]}
          />
          <Input
            label={mode === 'links' ? 'Links, one per line' : 'A search or category page'}
            placeholder={mode === 'links' ? 'https://www.vinted.com/items/…\nhttps://www.airbnb.com/rooms/…' : 'https://www.example.com/search?q=…'}
            value={text}
            onChangeText={setText}
            multiline={mode === 'links'}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {mode === 'page' && <Input label="How many listings" keyboardType="number-pad" value={max} onChangeText={setMax} />}
          <View style={{ gap: 6 }}>
            <T variant="subhead" weight="700">
              Add to
            </T>
            <HScroll gap={8}>
              {KINDS.map((k) => (
                <Chip key={k.key} label={k.label} selected={kind === k.key} onPress={() => setKind(k.key)} />
              ))}
            </HScroll>
          </View>
          <View style={{ gap: 6 }}>
            <T variant="subhead" weight="700">
              City (when the page doesn’t say)
            </T>
            <HScroll gap={8}>
              {regions.REGIONS.map((r) => (
                <Chip key={r.code} label={r.city.name} selected={city === r.city.name} onPress={() => setCity(r.city.name)} />
              ))}
            </HScroll>
          </View>
          {progress ? (
            <View style={{ gap: 8 }}>
              <T variant="subhead">{progress.note}</T>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: color.grey100, overflow: 'hidden' }}>
                <View style={{ height: '100%', width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%`, backgroundColor: color.indigo }} />
              </View>
              <Button title="Stop" variant="ghost" size="sm" style={{ alignSelf: 'flex-start' }} onPress={() => ctrl.current?.abort()} />
            </View>
          ) : (
            !found.length && <Button title="Read the links" size="lg" full onPress={() => void read()} />
          )}
        </Card>
      </Section>

      {found.length > 0 && (
        <Section title={`${chosen.length} ready to add`} subtitle="Tap one to leave it out.">
          <View style={{ gap: 10 }}>
            {found.map((f) => {
              const off = skip.has(f.url);
              return (
                <Card key={f.url} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', opacity: off ? 0.4 : 1, padding: 12 }} onPress={() => setSkip((s) => { const n = new Set(s); if (n.has(f.url)) n.delete(f.url); else n.add(f.url); return n; })}>
                  <Photo uri={f.images[0]} style={{ width: 64, height: 64 }} rounded={radius.md} label={f.site} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <T variant="headline" numberOfLines={2}>
                      {f.title}
                    </T>
                    <T variant="footnote" color={color.textSecondary}>
                      {KIND_LABEL[kind === 'auto' ? f.kind : kind]} · {f.site}
                      {f.priceCents ? ` · ${(f.priceCents / 100).toFixed(2)} ${f.currency ?? ''}` : ''}
                    </T>
                  </View>
                </Card>
              );
            })}
          </View>
          <Button title={busy ? 'Adding…' : `Add ${chosen.length} listing${chosen.length === 1 ? '' : 's'}`} size="lg" full disabled={!chosen.length} loading={busy} style={{ marginTop: 14 }} onPress={add} />
        </Section>
      )}

      {failed.length > 0 && (
        <Section title={`${failed.length} couldn’t be read`}>
          <Group>
            {failed.slice(0, 20).map((f) => (
              <ListRow key={f.url} icon="information-circle-outline" title={siteOf(f.url)} subtitle={f.why} chevron={false} />
            ))}
          </Group>
        </Section>
      )}

      <Section title="Imported so far" subtitle={total ? `${counts!.shop} Shop · ${counts!.bites} Bites · ${counts!.stay} Stay · ${counts!.drive} Drive · ${counts!.holiday} Holidays` : 'Nothing imported yet.'}>
        {total > 0 && <Button title="Remove all imported listings" variant="ghost" size="sm" icon="trash-outline" style={{ alignSelf: 'flex-start' }} onPress={() => run(() => importer.removeImported(), { success: 'Imported listings removed' })} />}
      </Section>
    </View>
  );
}
