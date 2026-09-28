/**
 * WebGL diagnostics: can this browser run the WebGL 2 engine, and if not, why not.
 * The probe runs once per page (cached) and always releases the contexts it creates.
 */

export type GLReason = 'ok' | 'no-api' | 'blocked' | 'no-webgl2' | 'forced';

export interface GLStatus {
  webgl2: boolean;
  webgl1: boolean;
  /**
   * ok: WebGL 2 works. no-api: the browser has no WebGL 2 at all (too old, or built without it).
   * blocked: the API exists but no context could be created (acceleration off, GPU or driver
   * blocklisted, policy, or WebGL disabled after crashes). no-webgl2: only WebGL 1 works.
   * forced: the page asked for the basic engine (?motor=basico or localStorage 'mt.motor').
   */
  reason: GLReason;
  /** WebGL runs on a software rasteriser (SwiftShader, llvmpipe…): it works, but slowly. */
  software: boolean;
  renderer?: string;
  /** statusMessage of the browser's webglcontextcreationerror, when it gave one. */
  detail?: string;
}

export interface GLExplanation { title: string; body: string; steps: string[] }

export const MOTOR_PARAM = 'motor';
export const MOTOR_KEY = 'mt.motor';
export const MOTOR_BASIC = 'basico';

const SOFTWARE_RE = /swiftshader|llvmpipe|softpipe|software|microsoft basic render|basic render driver|mesa offscreen/i;

/** Raw probe result (never 'forced'; the request for the basic engine is applied on read). */
let cached: GLStatus | null = null;

/** True when the page asked for the basic engine (URL ?motor=basico or localStorage 'mt.motor' = 'basico'). */
export function basicRequested(): boolean {
  try {
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).get(MOTOR_PARAM) === MOTOR_BASIC) return true;
  } catch { /* ignore */ }
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(MOTOR_KEY) === MOTOR_BASIC) return true;
  } catch { /* storage blocked */ }
  return false;
}

function release(gl: WebGLRenderingContext | WebGL2RenderingContext | null) {
  try { gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* ignore */ }
}

function rendererOf(gl: WebGLRenderingContext | WebGL2RenderingContext): string | undefined {
  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const s = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return typeof s === 'string' && s ? s : undefined;
  } catch {
    return undefined;
  }
}

/** Tries one context type on a fresh canvas; captures the browser's creation error message. */
function tryContext(type: 'webgl2' | 'webgl' | 'experimental-webgl'): { gl: WebGLRenderingContext | WebGL2RenderingContext | null; detail?: string } {
  let detail: string | undefined;
  try {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    const onErr = (e: Event) => { const m = (e as WebGLContextEvent).statusMessage; if (m) detail = m; };
    cv.addEventListener('webglcontextcreationerror', onErr);
    const gl = cv.getContext(type, { failIfMajorPerformanceCaveat: false }) as WebGLRenderingContext | WebGL2RenderingContext | null;
    cv.removeEventListener('webglcontextcreationerror', onErr);
    return { gl, detail };
  } catch (e) {
    return { gl: null, detail: detail ?? (e as Error).message };
  }
}

/** Probes WebGL support once (cached). Pass { fresh: true } to probe again. Never throws. */
export function probeWebGL(o: { fresh?: boolean } = {}): GLStatus {
  if (!cached || o.fresh) cached = probe();
  return basicRequested() ? { ...cached, reason: 'forced' } : { ...cached };
}

const hasApi = () => typeof WebGL2RenderingContext !== 'undefined';

function probe(): GLStatus {
  if (typeof document === 'undefined') return { webgl2: false, webgl1: false, reason: 'no-api', software: false };
  let webgl2 = false, webgl1 = false, renderer: string | undefined, detail: string | undefined;
  if (hasApi()) {
    const r2 = tryContext('webgl2');
    if (r2.gl) { webgl2 = true; renderer = rendererOf(r2.gl); release(r2.gl); }
    detail = r2.detail;
  }
  if (!webgl2) {
    let r1 = tryContext('webgl');
    if (!r1.gl) r1 = tryContext('experimental-webgl');
    if (r1.gl) { webgl1 = true; renderer = rendererOf(r1.gl); release(r1.gl); }
    detail ??= r1.detail;
  } else webgl1 = true;
  const reason: GLReason = webgl2 ? 'ok' : !hasApi() ? 'no-api' : webgl1 ? 'no-webgl2' : 'blocked';
  return {
    webgl2, webgl1, reason, software: !!renderer && SOFTWARE_RE.test(renderer),
    ...(renderer ? { renderer } : {}), ...(detail && !webgl2 ? { detail } : {}),
  };
}

const STEP_CHROME = 'Chrome o Edge: abre Configuración → Sistema (en Edge, «Sistema y rendimiento»), activa «Usar aceleración gráfica cuando esté disponible» y reinicia el navegador. En chrome://gpu (o edge://gpu) puedes ver si WebGL 2 quedó en «Hardware accelerated».';
const STEP_FIREFOX = 'Firefox: abre about:support y revisa la sección «Gráficos»; ahí dice si WebGL 2 está bloqueado y por qué. En Ajustes → General → Rendimiento puedes volver a activar la aceleración por hardware.';
const STEP_SAFARI = 'Safari: WebGL viene activado en las versiones recientes. Si alguien lo desactivó, revisa Ajustes → Avanzado y el menú Desarrollo (funciones experimentales).';
const STEP_RESTART = 'Si WebGL funcionaba y dejó de hacerlo, reinicia el navegador: tras varios errores gráficos algunos navegadores lo bloquean hasta reiniciar.';
const STEP_MANAGED = 'En equipos de trabajo o escuela, la administración puede tener WebGL bloqueado por política; en ese caso pide que lo habiliten.';
const STEP_DRIVERS = 'Actualiza el controlador de la tarjeta gráfica (o el sistema): los navegadores bloquean WebGL 2 en controladores con fallos conocidos.';

/** Spanish explanation of a probe result, precise per reason. */
export function explainWebGL(s: GLStatus): GLExplanation {
  const said = s.detail ? ` El navegador dijo: «${s.detail}».` : '';
  switch (s.reason) {
    case 'forced':
      return {
        title: 'Motor básico elegido',
        body: 'Pediste el motor básico, que dibuja con el procesador en lugar de la tarjeta gráfica. '
          + (s.webgl2 ? 'Este navegador sí puede usar el motor completo (WebGL 2).' : 'Este navegador tampoco tiene WebGL 2 disponible.'),
        steps: [
          'Para volver al motor completo, quita «?motor=basico» de la dirección.',
          'Si lo elegiste como preferencia, bórrala: en la consola del navegador, localStorage.removeItem(\'mt.motor\').',
        ],
      };
    case 'no-api':
      return {
        title: 'Este navegador no incluye WebGL 2',
        body: 'La versión de tu navegador no trae WebGL 2 (es antigua o se compiló sin él), así que GLYPHOS usa su motor básico, que dibuja con el procesador.',
        steps: [
          'Actualiza a una versión reciente de Chrome, Edge, Firefox o Safari (Safari 15 o posterior).',
          'Si ya usas un navegador reciente y ves este aviso, puede ser una edición sin WebGL: prueba con otro navegador.',
        ],
      };
    case 'blocked':
      return {
        title: 'WebGL está desactivado o bloqueado',
        body: 'Tu navegador sabe usar WebGL 2, pero no pudo crear un contexto gráfico. Suele pasar cuando la aceleración gráfica está apagada, cuando el navegador bloqueó tu tarjeta o su controlador, o tras varios errores gráficos. Mientras tanto, GLYPHOS usa su motor básico.' + said,
        steps: [STEP_CHROME, STEP_FIREFOX, STEP_SAFARI, STEP_RESTART, STEP_MANAGED],
      };
    case 'no-webgl2':
      return {
        title: 'Tu tarjeta gráfica no ofrece WebGL 2',
        body: 'El navegador puede usar WebGL 1, pero no WebGL 2 con esta tarjeta o este controlador. GLYPHOS usa su motor básico.' + said,
        steps: [STEP_DRIVERS, STEP_CHROME, STEP_FIREFOX, STEP_RESTART, STEP_MANAGED],
      };
    case 'ok':
    default:
      if (s.software) {
        return {
          title: 'WebGL 2 funciona, por software',
          body: `Tu navegador dibuja WebGL sin la tarjeta gráfica${s.renderer ? ` (${s.renderer})` : ''}. Funciona, pero puede ir lento.`,
          steps: [STEP_CHROME, STEP_FIREFOX, STEP_DRIVERS],
        };
      }
      return { title: 'WebGL 2 activo', body: 'Tu navegador usa la tarjeta gráfica: el motor completo está disponible.', steps: [] };
  }
}
