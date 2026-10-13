// Drives the installed debug APK on an Android emulator through the WebView's DevTools socket
// and saves real device screenshots. Run by .github/workflows/android.yml (device-check job).
//
// Each step starts from the groups list, so if Android stops the app part-way (the emulator's
// Play services restarts a few minutes after boot), the app is relaunched and the step retried once.
import { _android as android } from 'playwright-core';
import fs from 'node:fs';

const OUT = process.argv[2] || 'device-shots';
const PKG = 'com.batwara.app';
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => { const line = a.join(' '); console.log(line); fs.appendFileSync(`${OUT}/log.txt`, line + '\n'); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const failed = [];

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
  failed.push(label);
  return false;
}

const [device] = await android.devices({ omitDriverInstall: true });
if (!device) throw new Error('No Android device');
log('device', device.model(), device.serial());
const shotOf = async (name) => { await wait(1400); fs.writeFileSync(`${OUT}/${name}.png`, await device.screenshot()); log('shot', name); };

let page;
async function launch() {
  await device.shell(`am force-stop ${PKG}`);
  await device.shell(`am start -W -n ${PKG}/.MainActivity`);
  const webview = await device.webView({ pkg: PKG }, { timeout: 90000 });
  page = await webview.page();
  page.on('console', (m) => log('console', m.type(), m.text()));
  page.on('pageerror', (e) => log('PAGEERROR', e.message));
  return page;
}

/** Why Android stopped the app, if it did. */
async function whyStopped() {
  try {
    const am = String(await device.shell('logcat -d -v time -s ActivityManager:I ActivityTaskManager:W'));
    for (const l of am.split('\n').filter((x) => x.includes(PKG) && /Killing|died|crash|ANR/i.test(x)).slice(-4)) log('system', l.trim());
  } catch { /* logcat unavailable */ }
}

/** Saves which other apps' content providers the app is connected to. */
async function providers(label) {
  try {
    const dump = String(await device.shell(`dumpsys activity processes ${PKG}`));
    fs.writeFileSync(`${OUT}/process-${label}.txt`, dump);
    const i = dump.indexOf('Connected Providers:');
    const lines = i < 0 ? [] : dump.slice(i).split('\n').slice(1).filter((l) => /^\s+- /.test(l)).map((l) => l.trim());
    log('providers', label, lines.length ? lines.join(' | ') : 'none');
  } catch (e) {
    log('providers', label, 'unavailable', String(e?.message || e));
  }
}

const active = '.navstack:not(.is-inactive)';
const goa = `${active} .row-title:has-text("Goa trip")`;
const screens = () => page.locator(`${active} .screen-host`).count();
const sheets = () => page.locator('.sheet-layer').count();

/** Signs in and loads the sample groups, unless that's already done. */
async function ready() {
  await page.waitForFunction(
    () => document.querySelector('.onb') || /No groups yet|Goa trip/.test(document.body.innerText),
    null,
    { timeout: 60000 },
  );
  if (await page.locator('.onb').count()) {
    await shotOf('01-welcome');
    const native = await page.evaluate(async () => {
      const S = window.Capacitor.Plugins.BatwaraSystem;
      const ins = await S.insets();
      const apps = await S.upiApps();
      return { ins, apps: apps.apps.map((a) => a.label), sat: getComputedStyle(document.documentElement).getPropertyValue('--sat'), ua: navigator.userAgent };
    });
    log('native', JSON.stringify(native));
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
  }
  if (await page.locator('text=No groups yet').count()) {
    await page.click('text=Try with sample groups');
    await page.waitForSelector(goa, { timeout: 30000 });
    await wait(2500);
    await shotOf('05-groups');
  }
}

/** Back to the groups list from wherever the last step stopped. */
async function home() {
  for (let i = 0; i < 4 && (await sheets()) > 0; i++) { await device.shell('input keyevent 4'); await wait(1500); }
  await page.click('.tab:has-text("Groups")');
  await until('groups list', screens, 1);
  await page.waitForSelector(goa, { timeout: 15000 });
}

async function openGroup() {
  await home();
  await page.click(goa);
  await page.waitForSelector(`${active} .fab`, { timeout: 15000 });
  await until('group opened', screens, 2);
  await wait(800);
}

/** Runs a step; if Android stopped the app during it, relaunches and tries once more. */
async function step(name, fn) {
  for (let attempt = 1; ; attempt++) {
    try {
      await fn();
      return;
    } catch (e) {
      const msg = String(e?.stack || e);
      const gone = /closed|crash|disconnect|Target/i.test(msg);
      log(`step ${name} attempt ${attempt} error:`, msg.split('\n').slice(0, 3).join(' / '));
      if (gone) await whyStopped();
      if (!gone || attempt >= 2) throw Object.assign(e, { step: name });
      log(`step ${name}: the app was stopped; relaunching and retrying`);
      await launch();
      await ready();
    }
  }
}

try {
  await launch();
  await step('onboarding', ready);
  await providers('after-onboarding');

  await step('group', async () => {
    await openGroup();
    await shotOf('06-group');
    await page.evaluate(() => document.querySelector('.navstack:not(.is-inactive) .screen-host[data-depth="0"] .screen-scroll').scrollTo(0, 640));
    await shotOf('07-group-scrolled');
  });

  await step('back-button', async () => {
    await openGroup();
    await device.shell('input keyevent 4');
    await until('back button pops the screen', screens, 1);
  });

  await step('swipe-back', async () => {
    await openGroup();
    await device.shell('input swipe 160 1500 1000 1520 220');
    await until('swipe right pops the screen', screens, 1);
  });

  await step('add-expense', async () => {
    await openGroup();
    await page.click(`${active} .fab`);
    await page.waitForSelector('.desc-input', { timeout: 15000 });
    await wait(900);
    await page.fill('.desc-input', 'Breakfast at the café');
    await page.fill('.amount-input', '840');
    await shotOf('08-add-expense');
    await page.click('.sheet-header .glass-btn.is-tint');
    await until('expense saved and sheet closed', sheets, 0);
    await page.waitForSelector(`${active} .row-title:has-text("Breakfast at the café")`, { timeout: 15000 });
    await shotOf('09-saved');
  });
  await providers('after-expense');

  await step('settle', async () => {
    await openGroup();
    await page.click(`${active} .btn:has-text("Settle Up")`);
    await page.waitForSelector('.sheet-card .row:has-text("Aarav")', { timeout: 15000 });
    await page.click('.sheet-card .row:has-text("Aarav")');
    await wait(1200);
    await shotOf('10-pay');
    await device.shell('input keyevent 4');
    await until('back button closes the sheet', sheets, 0);
  });

  await step('drag-dismiss', async () => {
    await openGroup();
    await page.click(`${active} .btn:has-text("Settle Up")`);
    await until('settle sheet open', sheets, 1);
    await wait(900);
    await device.shell('input swipe 540 420 540 2100 260');
    await until('dragging the sheet down closes it', sheets, 0);
  });

  await step('share', async () => {
    await openGroup();
    await page.click(`${active} .glass-btn[aria-label="Share group"]`);
    await page.waitForSelector('text=Send Update to Members', { timeout: 10000 });
    await page.click('text=Send Update to Members');
    await wait(3500);
    await shotOf('11-android-share-sheet');
    await device.shell('input keyevent 4');
    await wait(2000);
  });

  await step('dark-mode', async () => {
    await home();
    await device.shell('cmd uimode night yes');
    await wait(3000);
    log('theme after night mode', await page.evaluate(() => document.documentElement.dataset.theme));
    await shotOf('12-dark');
    await page.click('.tab:has-text("Activity")');
    await shotOf('13-dark-activity');
    await device.shell('cmd uimode night no');
    await wait(2000);
    log('theme after day mode', await page.evaluate(() => document.documentElement.dataset.theme));
  });
  await providers('end');

  await step('restart', async () => {
    await launch();
    await page.waitForSelector(goa, { timeout: 60000 });
    await page.click(goa);
    await page.waitForSelector(`${active} .row-title:has-text("Breakfast at the café")`, { timeout: 15000 });
    log('data survived a restart');
    await shotOf('14-after-restart');
  });

  if (failed.length) {
    log('RESULT failed checks:', failed.join('; '));
    process.exitCode = 1;
  } else {
    log('RESULT ok');
  }
} catch (e) {
  log('RESULT failed at', e?.step || 'start', String(e && e.stack || e));
  try { fs.writeFileSync(`${OUT}/failure.png`, await device.screenshot()); } catch {}
  await whyStopped();
  process.exitCode = 1;
} finally {
  await device.close();
}
