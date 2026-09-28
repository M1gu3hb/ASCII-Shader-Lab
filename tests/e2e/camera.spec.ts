import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { dismissWelcome } from './helpers';

/**
 * The camera with Chromium's fake devices. The front camera shows as a mirror by default (as a phone's
 * camera app does), the rear one as it is; what the stage shows is what the still and the recording
 * contain; the person's own «Espejo» choice survives turning the camera off and on.
 *
 * The fake camera plays a still frame we write (bright on its left third, dark elsewhere), so the
 * orientation can be read from the pictures. Chromium's fake cameras do not say which way they look: a
 * small shim makes the second one the rear camera, as a phone reports it.
 */

const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const FAKE = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];

/** A Y4M clip (I420) whose frames are bright on their left third and dark on the rest. */
function markerClip(path: string) {
  const W = 320, H = 240;
  const y = Buffer.alloc(W * H), uv = Buffer.alloc(W * H / 4, 128);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) y[j * W + i] = i < W / 3 ? 235 : 16;
  const frame = Buffer.concat([Buffer.from('FRAME\n'), y, uv, uv]);
  writeFileSync(path, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), frame, frame, frame]));
}

/** Makes Chromium's second fake camera the rear one: asked for by facingMode, and reporting it. */
function phoneCameras() {
  const md = navigator.mediaDevices;
  if (!md) return;
  const orig = md.getUserMedia.bind(md);
  const facingOf = (label: string) => (/_1$/.test(label) ? 'environment' : 'user');
  md.getUserMedia = async (c?: MediaStreamConstraints) => {
    const v = c && typeof c.video === 'object' ? { ...c.video } as MediaTrackConstraints : c?.video;
    const fm = v && typeof v === 'object' ? v.facingMode as { exact?: string; ideal?: string } | string | undefined : undefined;
    const want = typeof fm === 'string' ? fm : fm?.exact ?? fm?.ideal;
    if (v && typeof v === 'object' && !v.deviceId && want) {
      let cams = (await md.enumerateDevices()).filter(d => d.kind === 'videoinput');
      if (!cams.some(d => d.label)) {
        const s = await orig({ video: true });
        s.getTracks().forEach(t => t.stop());
        cams = (await md.enumerateDevices()).filter(d => d.kind === 'videoinput');
      }
      const cam = cams.find(d => facingOf(d.label) === want);
      if (cam) { delete v.facingMode; v.deviceId = { exact: cam.deviceId }; }
    }
    const s = await orig({ ...c, video: v });
    for (const t of s.getVideoTracks()) {
      const get = t.getSettings.bind(t);
      t.getSettings = () => ({ ...get(), facingMode: facingOf(t.label) });
    }
    return s;
  };
}

async function studio(browser: Browser, baseURL: string, shim = false) {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1366, height: 860 }, acceptDownloads: true });
  if (shim) await ctx.addInitScript(phoneCameras);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/studio/#space=media&source=camera');
  await expect(page.locator('.stage canvas').first()).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('.seedline')).toBeVisible({ timeout: 45_000 });
  await dismissWelcome(page);
  return { ctx, page, errors };
}

const mirrorSwitch = (page: Page) => page.getByRole('switch', { name: 'Espejo: como te ves en el espejo' });
/** Flips «Espejo» as a person does: on its row (the drawn switch sits over the real checkbox). */
const flipMirror = (page: Page) => page.locator('.panel').getByText('Espejo: como te ves en el espejo').click();
const cameraOn = async (page: Page) => {
  await expect(page.getByRole('button', { name: 'Apagar cámara' })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.prompt .card')).toHaveCount(0);
};

/** Mean brightness of 16 columns of a picture (its middle rows), from PNG, WebM or MP4 bytes. */
function profile(page: Page, bytes: Buffer, type: string): Promise<number[]> {
  return page.evaluate(async ([b64, mime]) => {
    const data = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const blob = new Blob([data], { type: mime });
    let src: CanvasImageSource, w: number, h: number;
    if (mime.startsWith('image/')) {
      const bmp = await createImageBitmap(blob);
      src = bmp; w = bmp.width; h = bmp.height;
    } else {
      const v = document.createElement('video');
      v.muted = true;
      v.src = URL.createObjectURL(blob);
      await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('video')); setTimeout(() => rej(new Error('el video grabado no carga')), 20_000); });
      v.currentTime = 0.2;
      await new Promise(res => { v.onseeked = res; setTimeout(res, 1500); });
      src = v; w = v.videoWidth; h = v.videoHeight;
    }
    const c = new OffscreenCanvas(w, h);
    const x = c.getContext('2d')!;
    x.drawImage(src, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    const cols = new Array(16).fill(0), n = new Array(16).fill(0);
    for (let j = Math.floor(h * 0.25); j < h * 0.75; j++) {
      for (let i = 0; i < w; i++) {
        const k = (j * w + i) * 4, b = Math.floor((i / w) * 16);
        cols[b] += 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];
        n[b]++;
      }
    }
    return cols.map((s, i) => s / n[i]);
  }, [bytes.toString('base64'), type] as const);
}

function corr(a: number[], b: number[]) {
  const m = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const ma = m(a), mb = m(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return num / Math.sqrt(da * db || 1);
}
const flip = (v: number[]) => v.slice().reverse();
/** Same orientation: it matches the other clearly better than the other's mirror image. */
const sameWay = (a: number[], b: number[]) => ({ same: +corr(a, b).toFixed(2), mirrored: +corr(a, flip(b)).toFixed(2) });

/** The stage as it looks, without the interface over it. */
async function stage(page: Page) {
  await page.addStyleTag({ content: '.topbar, .panel, .deck, .seedline, .stage-top, .stage-marks, .notices { visibility: hidden !important; }' });
  await page.waitForTimeout(400);
  const png = await page.locator('.stage canvas').first().screenshot();
  await page.evaluate(() => document.head.lastElementChild?.remove());
  return profile(page, png, 'image/png');
}

async function still(page: Page) {
  await page.keyboard.press('e');
  const sheet = page.getByRole('dialog', { name: 'Llevar la pieza fuera' });
  await sheet.getByRole('tab', { name: 'Imagen' }).click();
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), sheet.getByRole('button', { name: 'Descargar imagen' }).click()]);
  const bytes = readFileSync((await d.path())!);
  await sheet.getByRole('button', { name: 'Cerrar' }).click();
  return profile(page, bytes, 'image/png');
}

async function pause(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press(' ');
}

test.describe('la cámara', () => {
  test('la frontal empieza en espejo, y la imagen fija y la grabación salen como el escenario', async ({ playwright, baseURL }) => {
    test.setTimeout(360_000);
    // (a plain ASCII path: Chromium does not open the clip from the test's own folder, named after its title)
    mkdirSync(test.info().project.outputDir, { recursive: true });
    const clip = join(test.info().project.outputDir, `camera-marker-${test.info().workerIndex}.y4m`);
    markerClip(clip);
    const browser = await playwright.chromium.launch({ args: [...GL, ...FAKE, `--use-file-for-fake-video-capture=${clip}`] });
    const { page, errors } = await studio(browser, baseURL!);
    await page.locator('.prompt .card').getByRole('button', { name: 'Activar cámara' }).click();
    await cameraOn(page);
    // a desktop webcam does not say which way it looks: it faces the person, so it starts as a mirror
    await expect(page.getByRole('radio', { name: 'Cámara frontal' })).toHaveAttribute('aria-checked', 'true');
    await expect(mirrorSwitch(page)).toBeChecked();
    await expect(page.getByText('Lo que ves es lo que tendrá el archivo')).toBeVisible();
    await pause(page);
    const onStage = await stage(page);
    const onStill = await still(page);
    const a = sameWay(onStill, onStage);
    expect(a.same, `imagen fija frente al escenario ${JSON.stringify(a)}`).toBeGreaterThan(0.6);
    expect(a.same).toBeGreaterThan(a.mirrored + 0.5);

    // without the mirror, the stage turns round, and the still follows it
    await flipMirror(page);
    await expect(mirrorSwitch(page)).not.toBeChecked();
    const plain = await stage(page);
    const turned = sameWay(plain, onStage);
    expect(turned.mirrored, `escenario sin espejo frente al escenario con espejo ${JSON.stringify(turned)}`).toBeGreaterThan(turned.same + 0.5);
    const plainStill = sameWay(await still(page), plain);
    expect(plainStill.same, `imagen fija sin espejo ${JSON.stringify(plainStill)}`).toBeGreaterThan(plainStill.mirrored + 0.5);

    // the live recording, with the mirror back on (and the stage playing: a paused stage sends no frames)
    await flipMirror(page);
    await expect(mirrorSwitch(page)).toBeChecked();
    await pause(page);
    await expect(page.getByRole('button', { name: 'Pausar animación' })).toBeVisible();
    await page.keyboard.press('e');
    const sheet = page.getByRole('dialog', { name: 'Llevar la pieza fuera' });
    await sheet.getByRole('tab', { name: 'Video y GIF' }).click();
    await sheet.getByRole('button', { name: 'Empezar a grabar' }).click();
    const chip = page.locator('.rec-chip');
    await expect(chip).toContainText('Grabando');
    await page.waitForTimeout(2000);
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), chip.getByRole('button', { name: 'Detener y guardar' }).click()]);
    const name = d.suggestedFilename();
    const rec = await profile(page, readFileSync((await d.path())!), name.endsWith('.mp4') ? 'video/mp4' : 'video/webm');
    const r = sameWay(rec, onStage);
    expect(r.same, `grabación frente al escenario ${JSON.stringify(r)}`).toBeGreaterThan(r.mirrored + 0.5);
    expect(errors).toEqual([]);
    await browser.close();
  });

  test('la trasera, sin espejo; lo que eliges se mantiene al apagar y encender, y el espejo automático no cuenta como edición', async ({ playwright, baseURL }) => {
    test.setTimeout(300_000);
    const browser = await playwright.chromium.launch({ args: [...GL, ...FAKE.map(a => (a === FAKE[0] ? `${a}=device-count=2` : a))] });
    const { page, errors } = await studio(browser, baseURL!, true);
    await page.locator('.prompt .card').getByRole('button', { name: 'Activar cámara' }).click();
    await cameraOn(page);
    const front = page.getByRole('radio', { name: 'Cámara frontal' });
    const rear = page.getByRole('radio', { name: 'Cámara trasera' });
    await expect(front).toHaveAttribute('aria-checked', 'true');
    await expect(mirrorSwitch(page)).toBeChecked();

    // the mirror the camera gave is the camera's, not an edit: a new roll keeps it and is not «editado»
    const count = async () => Number((await page.locator('.seedline').textContent())?.match(/(\d+)\/(\d+)/)?.[2]);
    const n = await count();
    await page.locator('.act.dice').click();
    await expect(page.locator('.seedline')).toContainText(`${n + 1}/${n + 1}`);
    await expect(page.locator('.seedline')).not.toContainText('editado');
    await expect(mirrorSwitch(page)).toBeChecked();

    // the rear camera: as it is
    await rear.click();
    await cameraOn(page);
    await expect(rear).toHaveAttribute('aria-checked', 'true');
    await expect(mirrorSwitch(page)).not.toBeChecked();
    // two cameras listed, with their names: the device picker shows the one on
    await expect(page.getByRole('combobox', { name: 'Dispositivo' })).toContainText('fake_device_1');

    // the person mirrors the rear camera: it holds after turning the camera off and on
    await flipMirror(page);
    await expect(mirrorSwitch(page)).toBeChecked();
    await page.getByRole('button', { name: 'Apagar cámara' }).click();
    await page.locator('.panel').getByRole('button', { name: 'Activar cámara' }).click();
    await cameraOn(page);
    await expect(rear).toHaveAttribute('aria-checked', 'true');
    await expect(mirrorSwitch(page)).toBeChecked();

    // back to the front one: its own default (a mirror)
    await front.click();
    await cameraOn(page);
    await expect(front).toHaveAttribute('aria-checked', 'true');
    await expect(mirrorSwitch(page)).toBeChecked();
    // no mirror for the front camera, by choice: kept on restart, and after reloading the page
    await flipMirror(page);
    await expect(mirrorSwitch(page)).not.toBeChecked();
    await page.getByRole('button', { name: 'Apagar cámara' }).click();
    await page.locator('.panel').getByRole('button', { name: 'Activar cámara' }).click();
    await cameraOn(page);
    await expect(front).toHaveAttribute('aria-checked', 'true');
    await expect(mirrorSwitch(page)).not.toBeChecked();
    await page.reload();
    await expect(page.locator('.seedline')).toBeVisible({ timeout: 45_000 });
    await dismissWelcome(page);
    await page.locator('.prompt .card').getByRole('button', { name: 'Activar cámara' }).click();
    await cameraOn(page);
    await expect(front).toHaveAttribute('aria-checked', 'true');
    await expect(mirrorSwitch(page)).not.toBeChecked();
    expect(errors).toEqual([]);
    await browser.close();
  });
});
