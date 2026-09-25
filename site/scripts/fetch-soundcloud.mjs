// Pulls NicNac's public SoundCloud catalog into the site at build time:
//   src/data/tracks.json   – titles, ids, durations, tags, real waveform peaks
//   public/art/<slug>.jpg  – 500x500 artwork
//
// Playback on the site always goes through SoundCloud's official embed widget;
// this script only snapshots public metadata so the custom player can draw
// real waveforms and render instantly. Re-run after uploading new beats:
//   npm run fetch:tracks
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE = 'https://soundcloud.com/nicnackproductions';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

// Duplicate uploads / test masters that shouldn't show twice in the catalog.
const SKIP = new Set(['big-bad-wolf', 'iron-man-mastered-with-sunroof']);

const get = async (url, as = 'text') => {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Origin: 'https://soundcloud.com' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return as === 'json' ? res.json() : as === 'buf' ? Buffer.from(await res.arrayBuffer()) : res.text();
};

const cleanTitle = (t) =>
  t
    .replace(/^\(sold\)\s*-\s*/i, '')
    .replace(/\s*\(sold\)\s*/i, '')
    .replace(/^xx-\s*|\s*-\s*xx$/gi, '')
    .replace(/^"(.+)"\s+instr?amental$/i, '$1')
    .replace(/\bTO\b/g, 'To')
    .trim();

const html = await get(PROFILE);
const hydration = JSON.parse(html.match(/window\.__sc_hydration\s*=\s*(\[.*?\]);<\/script>/s)[1]);
const clientId = hydration.find((h) => h.hydratable === 'apiClient').data.id;
const user = hydration.find((h) => h.hydratable === 'user').data;

const list = await get(
  `https://api-v2.soundcloud.com/users/${user.id}/tracks?client_id=${clientId}&limit=100`,
  'json',
);

await mkdir(join(ROOT, 'public/art'), { recursive: true });
await mkdir(join(ROOT, 'src/data'), { recursive: true });

const tracks = [];
for (const t of list.collection) {
  if (SKIP.has(t.permalink) || t.sharing !== 'public') continue;
  // Sold beats come off the site: mark the SoundCloud title "(sold)" and re-run this script.
  if (/\bsold\b/i.test(t.title)) continue;
  const slug = t.permalink.replace(/-\d+$/, '');
  const art = t.artwork_url || user.avatar_url;
  const artFile = `art/${slug}.jpg`;
  if (!existsSync(join(ROOT, 'public', artFile))) {
    await writeFile(join(ROOT, 'public', artFile), await get(art.replace('-large', '-t500x500'), 'buf'));
  }
  let peaks = [];
  let env = '';
  try {
    const wf = await get(t.waveform_url.replace('.png', '.json'), 'json');
    // Full-resolution loudness envelope (≈10 samples/sec) packed as base36 chars. The widget's
    // audio lives in a cross-origin iframe, so this is what drives the audio-reactive visuals.
    {
      const s = wf.samples, max = Math.max(...s) || 1;
      env = s.map((v) => Math.round((v / max) * 35).toString(36)).join('');
    }
    // Downsample to 600 points, normalise to 0-100.
    const n = 600, s = wf.samples, max = Math.max(...s) || 1;
    for (let i = 0; i < n; i++) {
      const a = Math.floor((i / n) * s.length), b = Math.max(a + 1, Math.floor(((i + 1) / n) * s.length));
      let m = 0;
      for (let j = a; j < b; j++) m = Math.max(m, s[j]);
      peaks.push(Math.round((m / max) * 100));
    }
  } catch (e) {
    console.warn('no waveform for', t.title, e.message);
  }
  tracks.push({
    id: t.id,
    slug,
    title: cleanTitle(t.title),
    rawTitle: t.title,
    url: t.permalink_url,
    duration: t.duration,
    year: Number(t.created_at.slice(0, 4)),
    typeBeat: (/type beat/i.exec(t.title) || [null])[0] ? t.title.replace(/.*?([\w ]+?) type beat.*/i, '$1').trim() : null,
    likes: t.likes_count,
    plays: t.playback_count,
    art: artFile,
    peaks,
    env,
  });
  console.log('✓', t.title);
}

await writeFile(
  join(ROOT, 'src/data/tracks.json'),
  JSON.stringify({ fetched: new Date().toISOString(), profile: PROFILE, tracks }, null, 0),
);
console.log(`\n${tracks.length} tracks written.`);
