// Drives the installed debug APK on an Android emulator through the WebView's DevTools socket
// and saves real device screenshots. Run by .github/workflows/android.yml (device-check job).
import { _android as android } from 'playwright-core';
import fs from 'node:fs';

const OUT = process.argv[2] || 'device-shots';
const PKG = 'com.batwara.app';
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => { const line = a.join(' '); console.log(line); fs.appendFileSync(`${OUT}/log.txt`, line + '\n'); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** Poll until fn() returns the expected value (the software-rendered emulator is slow). */
async function until(label, fn, expected, timeout = 12000) {
  const t0 = Date.now();
  let v;
  while (Date.now() - t0 < timeout) {
    v = await fn();
    if (v === expected) { log(label, 'OK', `${Date.now() - t0}ms`); return true; }
    await wait(250);
  }
  log(label, 'FAILED', 'last value', v);
  return false;
}

const [device] = await android.devices({ omitDriverInstall: true });
if (!device) throw new Error('No Android device');
log('device', device.model(), device.serial());
const shotOf = async (name) => { await wait(1400); fs.writeFileSync(`${OUT}/${name}.png`, await device.screenshot()); log('shot', name); };

async function launch() {
  await device.shell(`am force-stop ${PKG}`);
  await device.shell(`am start -W -n ${PKG}/.MainActivity`);
  const webview = await device.webView({ pkg: PKG }, { timeout: 90000 });
  const page = await webview.page();
  page.on('console', (m) => log('console', m.type(), m.text()));
  page.on('pageerror', (e) => log('PAGEERROR', e.message));
  return page;
}

let step = 'launch';
try {
  let page = await launch();
  const active = '.navstack:not(.is-inactive)';
  step = 'welcome';
  await page.waitForSelector('.onb', { timeout: 60000 });
  await shotOf('01-welcome');
  const native = await page.evaluate(async () => {
    const S = window.Capacitor.Plugins.BatwaraSystem;
    const ins = await S.insets();
    const apps = await S.upiApps();
    return { ins, apps: apps.apps.map((a) => a.label), sat: getComputedStyle(document.documentElement).getPropertyValue('--sat'), ua: navigator.userAgent };
  });
  log('native', JSON.stringify(native));

  step = 'onboarding';
  await page.click('text=Continue');
  await page.waitForSelector('.phone-input');
  await page.fill('.phone-input', '9876543210');
  await shotOf('02-phone-keyboard');
  await page.click('text=Send Code');
  await page.waitForSelector('.suggest button', { timeout: 15000 });
  await shotOf('03-otp');
  await page.click('.suggest button');
  await page.waitForSelector('input[placeholder="Your name"]', { timeout: 15000 });
  await page.fill('input[placeholder="Your name"]', 'Krutik Rao');
  await page.click('text=Get Started');
  await page.waitForSelector('text=No groups yet', { timeout: 15000 });
  await shotOf('04-empty');

  step = 'sample';
  await page.click('text=Try with sample groups');
  await page.waitForSelector(`${active} .row-title:has-text("Goa trip")`, { timeout: 30000 });
  await wait(2500);
  await shotOf('05-groups');

  step = 'group';
  await page.click(`${active} .row-title:has-text("Goa trip")`);
  await page.waitForSelector(`${active} .fab`, { timeout: 15000 });
  await shotOf('06-group');
  await page.evaluate(() => document.querySelector('.navstack:not(.is-inactive) .screen-host[data-depth="0"] .screen-scroll').scrollTo(0, 640));
  await shotOf('07-group-scrolled');

  const screens = () => page.locator(`${active} .screen-host`).count();
  step = 'back-button';
  await device.shell('input keyevent 4');
  await until('back button pops the screen', screens, 1);

  step = 'swipe-back';
  await page.click(`${active} .row-title:has-text("Goa trip")`);
  await until('group opened', screens, 2);
  await wait(800);
  await device.shell('input swipe 160 1500 1000 1520 220');
  await until('swipe right pops the screen', screens, 1);

  step = 'add-expense';
  await page.click(`${active} .row-title:has-text("Goa trip")`);
  await page.waitForSelector(`${active} .fab`, { timeout: 15000 });
  await wait(800);
  await page.click(`${active} .fab`);
  await page.waitForSelector('.desc-input', { timeout: 15000 });
  await wait(900);
  await page.fill('.desc-input', 'Breakfast at the café');
  await page.fill('.amount-input', '840');
  await shotOf('08-add-expense');
  await page.click('.sheet-header .glass-btn.is-tint');
  await wait(1500);
  await shotOf('09-saved');

  step = 'settle';
  await page.click(`${active} .btn:has-text("Settle Up")`);
  await page.waitForSelector('.sheet-card .row:has-text("Aarav")', { timeout: 15000 });
  await page.click('.sheet-card .row:has-text("Aarav")');
  await wait(1200);
  await shotOf('10-pay');
  const sheets = () => page.locator('.sheet-layer').count();
  await device.shell('input keyevent 4');
  await until('back button closes the sheet', sheets, 0);

  step = 'drag-dismiss';
  await page.click(`${active} .btn:has-text("Settle Up")`);
  await until('settle sheet open', sheets, 1);
  await wait(900);
  await device.shell('input swipe 540 420 540 2100 260');
  await until('dragging the sheet down closes it', sheets, 0);

  step = 'share';
  await page.click(`${active} .glass-btn[aria-label="Share group"]`);
  await page.waitForSelector('text=Send Update to Members', { timeout: 10000 });
  await page.click('text=Send Update to Members');
  await wait(3500);
  await shotOf('11-android-share-sheet');
  await device.shell('input keyevent 4');
  await wait(2000);

  step = 'dark-mode';
  await device.shell('cmd uimode night yes');
  await wait(3000);
  log('theme after night mode', await page.evaluate(() => document.documentElement.dataset.theme));
  await shotOf('12-dark');
  await page.click('.tab:has-text("Activity")');
  await shotOf('13-dark-activity');
  await device.shell('cmd uimode night no');
  await wait(2000);
  log('theme after day mode', await page.evaluate(() => document.documentElement.dataset.theme));

  step = 'restart';
  page = await launch();
  await page.waitForSelector(`${active} .row-title:has-text("Goa trip")`, { timeout: 60000 });
  log('data survived a restart');
  await shotOf('14-after-restart');
  log('RESULT ok');
} catch (e) {
  log('RESULT failed at', step, String(e && e.stack || e));
  try { fs.writeFileSync(`${OUT}/failure.png`, await device.screenshot()); } catch {}
  try {
    // If Android stopped the app, say why.
    const am = String(await device.shell('logcat -d -v time -s ActivityManager:I ActivityTaskManager:W'));
    for (const l of am.split('\n').filter((x) => x.includes(PKG)).slice(-6)) log('system', l.trim());
  } catch {}
  process.exitCode = 1;
} finally {
  await device.close();
}
