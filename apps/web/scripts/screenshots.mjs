// Captures screenshots of the main pages in mock mode.
// Usage (dev server running on :3000): node scripts/screenshots.mjs [outDir] [filter]
// Uses the preinstalled Playwright Chromium.
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const out = process.argv[2] ?? 'docs/screenshots';
const filter = process.argv[3] ?? '';
// Comma-separated page names to capture (default: all).
const only = (process.env.PAGES ?? '').split(',').filter(Boolean);
mkdirSync(out, { recursive: true });

const pages = [
  { name: 'landing', path: '/', auth: false, full: true },
  { name: 'login', path: '/entrar', auth: false },
  { name: 'hoje', path: '/app', auth: true },
  { name: 'calendario', path: '/app/calendario', auth: true },
  { name: 'resultados', path: '/app/resultados', auth: true },
  { name: 'imoveis', path: '/app/imoveis', auth: true },
  { name: 'onboarding', path: '/app/imoveis/novo', auth: true },
  { name: 'imovel', path: '/app/imoveis/prop_campeche', auth: true },
  { name: 'conta', path: '/app/conta', auth: true },
  { name: 'checkout', path: '/checkout', auth: true },
  { name: 'admin', path: '/admin', auth: true, admin: true },
];
const viewports = [
  { tag: 'desktop', width: 1440, height: 900 },
  { tag: 'mobile', width: 390, height: 844 },
];
const themes = (process.env.THEMES ?? 'light,dark').split(',');

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
for (const vp of viewports) {
  for (const theme of themes) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, colorScheme: theme });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error('pageerror', e.message));
    let loggedAs = null;
    for (const p of pages) {
      if (filter && !p.name.includes(filter)) continue;
      if (only.length && !only.includes(p.name)) continue;
      if (p.auth) {
        const email = p.admin ? 'admin@precisari.com.br' : 'carla@exemplo.com.br';
        if (loggedAs !== email) {
          await page.goto(`${BASE}/entrar`);
          await page.evaluate(() => localStorage.clear());
          await page.goto(`${BASE}/entrar`);
          await page.getByLabel('E-mail').fill(email);
          await page.getByRole('button', { name: 'Receber código' }).click();
          await page.getByLabel('Dígito 1 de 6').fill('123456');
          await page.waitForURL(/\/app/);
          loggedAs = email;
        }
      }
      await page.goto(`${BASE}${p.path}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(900);
      const file = join(out, `${p.name}-${vp.tag}-${theme}.png`);
      const png = await page.screenshot({ fullPage: Boolean(p.full) });
      // Palette PNG keeps the committed set small (< 4 MB total).
      await sharp(png).png({ palette: true, quality: 80, compressionLevel: 9 }).toFile(file);
      console.log('saved', file);
    }
    await ctx.close();
  }
}
await browser.close();
