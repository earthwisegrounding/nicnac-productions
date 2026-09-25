# NicNac Productions — website rebuild

A from-scratch rebuild of the NicNac Productions site, now live at **https://nicnacproductions.com** (the old site was nicnacproductions.store). Everything here is original: a 3D scene built in Blender from the NicNac logo, rendered in Cycles, and brought to life in the browser with WebGL. The site streams his SoundCloud catalogue through a custom in-page player.

```
nicnac/
├── site/            ← the website (Vite, vanilla JS, no framework)
│   ├── index.html
│   ├── src/
│   │   ├── main.js          page orchestration (gate, vault, cursor, scroll, form…)
│   │   ├── gl.js            WebGL2 hero: video + gaze-tracking eye + audio-reactive shader
│   │   ├── player.js        custom player over SoundCloud's official embed widget
│   │   ├── styles.css
│   │   └── data/
│   │       ├── tracks.json  catalogue snapshot (titles, durations, waveforms)
│   │       ├── eye.json     gaze-sprite grid metadata (written by Blender)
│   │       └── site.js      ← email / socials settings
│   ├── public/media/        hero loops, posters, eye sprites, stills
│   ├── scripts/fetch-soundcloud.mjs
│   └── netlify.toml
├── blender/         ← the 3D scene and every render script
│   ├── build_scene.py       builds nicnac_throne.blend from scratch
│   ├── render.py            loop / single-frame renders (landscape + portrait)
│   ├── eye_sprites.py       the 187 gaze sprites
│   ├── stills.py            editorial stills (about + services)
│   └── render_all.sh        full production queue (~70 min on an M1 Max)
└── brand/logo-original.jpg
```

## Run it

```bash
cd site
npm install
npm run dev        # http://localhost:5173
npm run build      # → site/dist
```

## Live deploy (GitHub Pages → nicnacproductions.com)

Every push to `main` builds `site/` and publishes it through `.github/workflows/deploy-pages.yml`.
The custom domain is set in the repo's Pages settings. DNS is at GoDaddy (ns05/ns06.domaincontrol.com):

| Type  | Host  | Value |
|-------|-------|-------|
| A     | `@`   | 185.199.108.153 · 185.199.109.153 · 185.199.110.153 · 185.199.111.153 |
| CNAME | `www` | `earthwisegrounding.github.io.` |

GitHub Pages can't receive form posts, so on this host the booking form points visitors to Instagram DMs. To make the form deliver, either move hosting to Netlify (Netlify Forms is already wired up) or swap in a form service such as Formspree.

## Deploy (Netlify — the current host)

- **Git deploy:** point the Netlify site at this repo with base directory `site/`. `netlify.toml` handles the build.
- **Drag and drop:** run `npm run build` and drop `site/dist` onto the site's Deploys page.

The booking form uses **Netlify Forms** (`name="booking"`). After the first deploy:
Netlify → Site → Forms → *booking* → **Form notifications → Email** → add NicNac's real inbox.

## Things the client should know

1. **The old booking email never worked.** `booking@nicnacproductions.com` sat on an unregistered domain, so every inquiry from the old site bounced. The domain is registered now (2026-09-24) but still has no mailbox or MX records. Set up email on it, then put the address in `site/src/data/site.js`.
2. **New beats.** After uploading to SoundCloud, run `npm run fetch:tracks` in `site/`, then rebuild and deploy. That refreshes the list, artwork and waveforms.
3. **Sold a beat?** Add "(sold)" to its SoundCloud title and re-run `npm run fetch:tracks`. Sold beats drop off the site automatically.
4. **Prices and lease terms** live in `site/src/data/licenses.js` (from Nick's sheet: MP3 $30, WAV $60, Trackout $120, same terms on every beat). Change a number there and it updates everywhere: the Licenses section, every "License" button, and the per-beat panel.
5. **Taking payment.** Right now "License" opens an Instagram DM to @supremeonicnac with the request pre-written and copied. To sell directly, create one payment link per tier (for example Stripe Payment Links for $30, $60, $120) and paste them into the `checkout` fields in `licenses.js`. The buttons become "Buy", and each order carries the beat as `client_reference_id`.
6. **Playback** goes through SoundCloud's official widget, so plays count on his SoundCloud stats. iOS Safari sometimes wants one tap on SoundCloud's own play button before audio can start. The player detects this and shows the widget for that single tap.

## The experience

- **Gate:** the logo draws itself. *Enter with sound* starts the most-played beat as you fall through the eye.
- **Hero:** a seamless 6-second Cycles loop. An infinite log-spiral of gold pyramids pours out of an eclipsed eye. Every frame is mathematically self-similar, so the loop never visibly repeats.
- **The eye watches you.** 187 Cycles-rendered gaze positions are composited into the video in real time, following the cursor (or wandering on its own).
- **Audio-reactive:** while a track plays, the tunnel speeds up and the bloom, warp streaks, lens and chromatic aberration pulse with that track's real loudness envelope.
- **Hold anywhere (or press T):** *open the third eye.* A six-fold kaleidoscope, holographic thin-film colour, and a 3× time warp.
- **The Vault:** all 16 beats that are for sale. Hover to reveal the art in a triangle, click to play. A persistent dock gives real waveforms, seeking, and a full-screen visualizer.
- **Licenses:** three lease tiers side by side. Every track row and the player dock have a "License" button that opens a per-beat panel: pick a tier, preview the beat, then DM (or check out, once payment links are set).
- Built mobile-first for Instagram traffic. It honours reduced-motion, works by keyboard, and adapts its resolution on weaker GPUs.

## The TRACKS neon sign

`site/public/media/tracks-neon*.webp` come from a photo of a neon sign on black
(`brand/tracks-neon-source.jpg`), turned into a transparent image that composites like light:

```bash
cd brand
uv run --with pillow --with numpy python neon_to_alpha.py tracks-neon-source.jpg ../site/public/media/tracks-neon.webp scale=2 q=82
uv run --with pillow --with numpy python neon_to_alpha.py tracks-neon-source.jpg ../site/public/media/tracks-neon-1x.webp scale=1 q=86
# the sputtering K: its glow footprint + complement (x-range = the K, as fractions of the image width)
uv run --with pillow --with numpy python neon_letter_mask.py ../site/public/media/tracks-neon.webp ../site/public/media/tracks-neon-k 0.648 0.786
```

## Re-rendering the 3D

```bash
cd blender
./get_hdri.sh                                          # CC0 studio HDRIs (not stored in git)
blender -b --factory-startup --python build_scene.py   # rebuild the scene
./render_all.sh                                        # sprites + both loops
blender -b nicnac_throne.blend --python stills.py      # stills
./encode.sh                                            # → site/public/media
```
