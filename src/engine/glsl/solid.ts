/**
 * A ray-marched solid as a pattern chunk: the camera orbits the object (rotXY of two expressions of t),
 * the march starts and ends where the ray crosses a bounding sphere (rays that miss it cost nothing),
 * and the light, normal and shading are the same for every solid of the library, so its CPU twin
 * (../basic/solid.ts) can follow it step by step. `sdf` is the body of
 *   float <id>_sd(vec3 q, float t, float a, float b)
 * and `shade` an expression of q, t, a, b, dif (diffuse), face (light at the eye) and spec (highlight).
 */
export interface SolidChunk {
  /** rotXY(x, y) of the camera, as GLSL expressions of t (and a, b). */
  rot: [string, string];
  /** Distance of the eye from the centre, and focal length. */
  eye: number;
  focal: number;
  /** Radius of the bounding sphere. */
  bound: number;
  steps: number;
  /** Fraction of the distance bound taken per step (less than 1 for bent or twisted fields). */
  k: number;
  /** Direction of the light in camera space. */
  light: [number, number, number];
  sdf: string;
  shade: string;
}

const f = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

export function solidChunk(id: string, s: SolidChunk): string {
  const sd = `${id}_sd`;
  return `
float ${sd}(vec3 q, float t, float a, float b){ ${s.sdf} }
float P_${id}(vec2 p, float t, float a, float b){
  mat3 R = rotXY(${s.rot[0]}, ${s.rot[1]});
  vec3 ro = R * vec3(0., 0., -${f(s.eye)}), rd = R * normalize(vec3(p, ${f(s.focal)}));
  float bb = dot(ro, rd), h = bb * bb - dot(ro, ro) + ${f(s.bound * s.bound)};
  if (h < 0.) return 0.;
  h = sqrt(h);
  float d = -bb - h, dmax = -bb + h;
  vec3 q = ro; bool hit = false;
  for (int i = 0; i < ${s.steps}; i++){
    q = ro + rd * d;
    float s = ${sd}(q, t, a, b);
    if (s < .002){ hit = true; break; }
    d += max(s * ${f(s.k)}, .002); if (d > dmax) break;
  }
  if (!hit) return 0.;
  vec2 e = vec2(1., -1.) * .002;
  vec3 n = normalize(e.xyy * ${sd}(q + e.xyy, t, a, b) + e.yyx * ${sd}(q + e.yyx, t, a, b)
                   + e.yxy * ${sd}(q + e.yxy, t, a, b) + e.xxx * ${sd}(q + e.xxx, t, a, b));
  vec3 L = normalize(R * vec3(${s.light.map(f).join(', ')}));
  float dif = max(dot(n, L), 0.), face = max(dot(n, -rd), 0.);
  float spec = pow(max(dot(reflect(-L, n), -rd), 0.), 18.);
  return sat(${s.shade});
}`;
}
