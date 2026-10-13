// Render the Batwara mark to PNG masters (1024px) with headless Chromium.
import { chromium } from 'playwright-core';
import { iconSvg, GLYPH } from '../src/brand.js';
const OUT = process.env.OUT;
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
async function render(name, svg) {
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', '<svg width="1024" height="1024" ')}</body></html>`);
  await page.screenshot({ path: `${OUT}/${name}.png`, omitBackground: true, clip: { x: 0, y: 0, width: 1024, height: 1024 } });
  console.log('rendered', name);
}
await render('full-square', iconSvg({ rounded: false }));
await render('full-rounded', iconSvg({ rounded: true }));
// Adaptive-icon foreground: glyph only, sized to sit inside the 66/108 safe zone.
await render('foreground', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${GLYPH(0.68)}</svg>`);
await render('monochrome', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${GLYPH(0.68, 26, '#FFFFFF', '#FFFFFF')}</svg>`);
await browser.close();
