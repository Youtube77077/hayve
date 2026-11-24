import type { RefObject } from 'react';
import type { View } from 'react-native';
import type { CardData } from './ShareCard';
import { fitToBox, toPath } from './trip';

const W = 1080;
const H = 1920;
const INDIGO = '#4F46E5';

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Website: draw the same card on a canvas, then share it (phones) or download it (computers). */
export async function shareTripCard(_ref: RefObject<View | null>, d: CardData): Promise<'shared' | 'unavailable' | 'downloaded'> {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0E0E10';
  g.fillRect(0, 0, W, H);
  if (d.photo) {
    try {
      const img = await loadImage(d.photo);
      const s = Math.max(W / img.width, H / img.height);
      g.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
      g.fillStyle = 'rgba(14,14,16,0.38)';
      g.fillRect(0, 0, W, H);
    } catch {
      /* photo couldn't be read: plain card */
    }
  }
  const font = (w: number, px: number) => `${w} ${px}px "Plus Jakarta Sans", system-ui, sans-serif`;
  g.fillStyle = '#fff';
  g.textBaseline = 'alphabetic';
  g.font = font(800, 56);
  g.fillText('Hayve', 60, 150);
  const w1 = g.measureText('Hayve').width;
  g.font = font(500, 56);
  g.fillText(' Holiday', 60 + w1, 150);

  const projected = fitToBox([...d.lines, d.stops], W - 120, 900, 0.08);
  g.save();
  g.translate(60, 330);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const [stroke, width] of [[INDIGO, 22], ['#fff', 10]] as const) {
    g.strokeStyle = stroke;
    g.lineWidth = width;
    for (const l of projected.slice(0, d.lines.length)) g.stroke(new Path2D(toPath(l)));
  }
  for (const [x, y] of projected[projected.length - 1] ?? []) {
    g.beginPath();
    g.arc(x, y, 12, 0, Math.PI * 2);
    g.fillStyle = '#fff';
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = INDIGO;
    g.stroke();
  }
  g.restore();

  g.fillStyle = '#fff';
  g.font = font(800, 96);
  g.fillText(d.city, 60, H - 520);
  g.font = font(600, 36);
  g.fillText(d.country, 60, H - 470);
  const stats: [string, string][] = [[`${d.km} km`, 'on the road'], [String(d.places), d.places === 1 ? 'place' : 'places'], [String(d.days), 'days']];
  let x = 60;
  for (const [v, l] of stats) {
    g.font = font(800, 64);
    g.fillText(v, x, H - 340);
    const vw = g.measureText(v).width;
    g.font = font(600, 30);
    g.fillText(l, x, H - 300);
    x += Math.max(vw, g.measureText(l).width) + 56;
  }
  g.fillStyle = 'rgba(255,255,255,0.4)';
  g.fillRect(60, H - 240, W - 120, 2);
  g.fillStyle = '#fff';
  g.font = font(700, 32);
  g.fillText('Everything in one app', 60, H - 170);
  if (d.code) {
    g.font = font(600, 32);
    const t = `hayve.app/t/${d.code}`;
    g.fillText(t, W - 60 - g.measureText(t).width, H - 170);
  }

  const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/png'));
  const file = new File([blob], `hayve-${d.city.toLowerCase().replace(/\W+/g, '-')}.png`, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], text: d.code ? `My trip to ${d.city} · hayve.app/t/${d.code}` : `My trip to ${d.city}` });
    return 'shared';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}
