/**
 * Synthetic sample media: a sunset landscape painted with Canvas 2D, so the landing, the guide pages
 * and their posters can show image and video conversion without shipping a photo or a video file.
 */

/** Paints the landscape into a 960×600 context. t = 0 is the still "photo"; t > 0 moves the sun and the water. */
export function paintLandscape(x: CanvasRenderingContext2D, t = 0) {
  const rise = Math.sin(t * 0.35) * 26;
  const sunY = 300 - rise;
  const sky = x.createLinearGradient(0, 0, 0, 380);
  sky.addColorStop(0, '#0d1b3d'); sky.addColorStop(0.55, '#b34d4d'); sky.addColorStop(1, '#ffb36b');
  x.fillStyle = sky; x.fillRect(0, 0, 960, 380);
  const sun = x.createRadialGradient(560, sunY, 10, 560, sunY, 160);
  sun.addColorStop(0, '#fff6d6'); sun.addColorStop(0.35, '#ffd27a'); sun.addColorStop(1, 'rgba(255,160,90,0)');
  x.fillStyle = sun; x.beginPath(); x.arc(560, sunY, 160, 0, Math.PI * 2); x.fill();
  const ridge = (base: number, amp: number, f: number, col: string) => {
    x.fillStyle = col; x.beginPath(); x.moveTo(0, 600);
    for (let i = 0; i <= 960; i += 8) x.lineTo(i, base - amp * (Math.sin(i * f) * 0.6 + Math.sin(i * f * 2.7 + 1) * 0.3 + Math.sin(i * f * 6.1) * 0.1));
    x.lineTo(960, 600); x.fill();
  };
  ridge(330, 70, 0.006, '#3b2340'); ridge(365, 45, 0.011, '#231628'); ridge(390, 25, 0.02, '#120c18');
  const lake = x.createLinearGradient(0, 390, 0, 600);
  lake.addColorStop(0, '#6b3a4a'); lake.addColorStop(1, '#0a0d1c');
  x.fillStyle = lake; x.fillRect(0, 390, 960, 210);
  x.fillStyle = 'rgba(255,214,140,.55)';
  for (let y = 400; y < 600; y += 9) { const w = 170 * (1 - (y - 400) / 260); x.fillRect(560 - w / 2 + Math.sin(y + t * 2.2) * 8, y, w, 3); }
}

/** The still landscape (960×600), used as the sample "photo". */
export function syntheticPhoto(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 960; c.height = 600;
  paintLandscape(c.getContext('2d')!);
  return c;
}
