import { create } from 'zustand';
import { getEngine } from './engineBridge';
import { rollDice, useStudio } from './store';
import { toast } from './toast';

/**
 * Live inputs:
 *  - Sound: the microphone level drives the piece's pulse. Requested only when the person
 *    presses the button; analysed in the browser, never recorded or sent anywhere.
 *  - Exhibition mode: the dice roll by themselves every N seconds.
 */
interface LiveState { mic: 'off' | 'starting' | 'on' | 'error'; level: number; gain: number; auto: number }
export const useLive = create<LiveState>(() => ({ mic: 'off', level: 0, gain: 1.4, auto: 0 }));

let ctx: AudioContext | null = null;
let stream: MediaStream | null = null;
let raf = 0;

export async function startMic() {
  if (useLive.getState().mic === 'on') return;
  if (!navigator.mediaDevices?.getUserMedia) { useLive.setState({ mic: 'error' }); toast('Este navegador no da acceso al micrófono.'); return; }
  useLive.setState({ mic: 'starting' });
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.55;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const bins = new Uint8Array(analyser.frequencyBinCount);
    let env = 0, floor = 0.05;
    const tick = () => {
      analyser.getByteFrequencyData(bins);
      // weight the low end (kick, bass) a bit more than the rest
      let low = 0, all = 0;
      for (let i = 1; i < bins.length; i++) { const v = bins[i] / 255; all += v; if (i < 24) low += v; }
      const level = Math.min(1, (low / 23) * 0.65 + (all / bins.length) * 0.9);
      floor = floor * 0.995 + level * 0.005;                       // adaptive noise floor
      const v = Math.max(0, level - floor * 0.9) * useLive.getState().gain * 2.2;
      env = v > env ? env + (v - env) * 0.6 : env * 0.9;           // fast attack, slow release
      const e = getEngine();
      if (e) e.externalPulse = Math.min(1, env);
      useLive.setState({ level: Math.min(1, env) });
      raf = requestAnimationFrame(tick);
    };
    tick();
    useLive.setState({ mic: 'on' });
    toast('El micrófono mueve la pieza. Se analiza en tu navegador; nada se graba.');
  } catch {
    useLive.setState({ mic: 'error' });
    toast('No se pudo abrir el micrófono. Revisa el permiso del navegador.');
  }
}

export function stopMic() {
  cancelAnimationFrame(raf);
  stream?.getTracks().forEach(t => t.stop());
  stream = null;
  void ctx?.close();
  ctx = null;
  const e = getEngine();
  if (e) e.externalPulse = 0;
  useLive.setState({ mic: 'off', level: 0 });
}

let autoT = 0;
let lastInput = 0;
addEventListener('pointerdown', e => { if ((e.target as HTMLElement).closest?.('.panel, .deck, .topbar, dialog')) lastInput = performance.now(); }, { passive: true });

export function setAuto(seconds: number) {
  clearInterval(autoT);
  useLive.setState({ auto: seconds });
  if (!seconds) return;
  autoT = window.setInterval(() => {
    const s = useStudio.getState();
    if (document.hidden || s.ui.sheet !== 'none' || s.space === 'componentes' || document.querySelector('dialog[open]')) return;
    if (performance.now() - lastInput < 4000) return; // someone is tweaking: don't pull the rug
    rollDice();
  }, seconds * 1000);
}
