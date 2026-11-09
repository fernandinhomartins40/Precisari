// One-off: copies brand assets from /assets/brand into public/ at web-friendly sizes.
// Usage (from apps/web): node scripts/optimize-assets.mjs
import sharp from 'sharp';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '../../../assets/brand');
const out = join(here, '../public');
mkdirSync(join(out, 'brand'), { recursive: true });

const logos = ['logo-principal', 'logo-negativa-tangerina', 'logo-monocromatica-branca'];
for (const l of logos) {
  await sharp(join(src, 'logos', `${l}-1600.png`))
    .trim()
    .resize({ width: 420 })
    .png({ compressionLevel: 9 })
    .toFile(join(out, 'brand', `${l}.png`));
}
await sharp(join(src, 'logos', 'simbolo-marinho-1600.png'))
  .trim()
  .resize({ width: 160 })
  .png({ compressionLevel: 9 })
  .toFile(join(out, 'brand', 'simbolo-marinho.png'));

const photos = [
  ['hero-apartamento-litoral', 1600, 72],
  ['imovel-studio-campeche', 720, 74],
  ['destino-campeche', 1200, 72],
];
for (const [p, w, q] of photos) {
  await sharp(join(src, 'photos', `${p}-1600.png`))
    .resize({ width: w })
    .webp({ quality: q })
    .toFile(join(out, 'brand', `${p}.webp`));
}
copyFileSync(join(src, 'icons', 'favicon.ico'), join(out, 'favicon.ico'));
for (const s of [32, 180, 192, 512]) copyFileSync(join(src, 'icons', `app-icon-${s}.png`), join(out, `icon-${s}.png`));
console.log('assets optimized');
