/**
 * Additional original fields for GLYPHOS. Every chunk is self-contained so unrelated
 * patterns can coexist in the same compiled shader. p uses screen-height coordinates.
 * Ideas: Mandelbrot, Sierpinski, Vogel phyllotaxis, hypotrochoids and quasiperiodic waves.
 */
export const EXTRA_GLSL: Record<string, string> = {
  mandelbrot: `
float P_mandelbrot(vec2 p, float t, float a, float b){
  vec2 c = (p + vec2(.16 + .07 * sin(t * .08), .02 * cos(t * .09))) * (2.6 - 1.9 * a) + vec2(-.63, 0.);
  vec2 z = vec2(0.); float n = 0.;
  for (int i = 0; i < 48; i++){
    if (dot(z,z) > 64.) break;
    z = vec2(z.x*z.x-z.y*z.y, 2.*z.x*z.y) + c; n += 1.;
  }
  float v = n / 48.;
  return sat(mix(pow(v, .65), .5 + .5 * sin(n * (.22 + b * .7)), b * .65) * smoothstep(.03,.15,v));
}`,
  sierpinski: `
float P_sierpinski(vec2 p, float t, float a, float b){
  vec2 q = fract((p + .5) * (1. + a * 1.8) + vec2(t * .014, 0.));
  float cut = 0.;
  for (int i = 0; i < 6; i++){
    vec2 digit = floor(q * 3.);
    if (digit.x == 1. && digit.y == 1.) cut = 1.;
    q = fract(q * 3.);
  }
  float rim = min(min(q.x,1.-q.x),min(q.y,1.-q.y));
  return (1. - cut) * mix(.72 + .28 * smoothstep(0.,.12,rim), 1., b);
}`,
  filotaxis: `
float P_filotaxis(vec2 p, float t, float a, float b){
  float r = length(p), n = pow(r / (.027 + a * .008), 2.);
  float v = 0.;
  for (int j = -24; j <= 24; j++){
    float k = floor(n) + float(j); if (k < 0. || k > 340.) continue;
    float an = k * 2.39996323 + t * .08;
    vec2 c = (.027 + a * .008) * sqrt(k) * vec2(cos(an), sin(an));
    float d = length(p - c);
    v = max(v, (1. - smoothstep(.006 + b * .002, .018 + b * .013, d)) * (.45 + .55 * (k / 340.)));
  }
  return v * (1. - smoothstep(.51,.64,r));
}`,
  quasicristal: `
float P_quasicristal(vec2 p, float t, float a, float b){
  float v = 0.; float f = 10. + a * 17.;
  for (int i = 0; i < 5; i++){
    float an = TAU * float(i) / 5.;
    v += cos(dot(p,vec2(cos(an),sin(an))) * f + t * (.16 + float(i) * .025));
  }
  v = .5 + v * .1;
  return mix(v, hard(v, .64), b);
}`,
  topografia: `
float P_topografia(vec2 p, float t, float a, float b){
  float h = fbm(p * (1. + a * 1.3) + vec2(t * .035,-t * .02));
  h += .1 * sin(p.x * 2. + p.y * 1.5);
  float f = fract(h * (4. + b * 8.));
  float line = 1. - smoothstep(.0, .09 + PX, min(f,1.-f));
  return sat(.08 + .28 * h + .68 * line);
}`,
  espirografo: `
float P_espirografo(vec2 p, float t, float a, float b){
  float r = .44, q = floor(3. + a * 7.), arm = .18 + b * .27;
  float d = 8.; vec2 prev = vec2(r + arm, 0.);
  for (int i = 1; i <= 96; i++){
    float u = float(i) / 96. * TAU;
    vec2 next = r * vec2(cos(u), sin(u)) + arm * vec2(cos(q*u+t*.22), -sin(q*u+t*.22));
    d = min(d, sdSeg(p, prev, next)); prev = next;
  }
  return sat(1. - smoothstep(PX*.35,PX*1.5,d) + .25*exp(-d*18.));
}`,
  circuitos: `
float P_circuitos(vec2 p, float t, float a, float b){
  float k = 8. + a * 13.; vec2 g = p * k, id = floor(g), f = fract(g);
  float h = hash12(id), v = 0.;
  float hor = 1. - smoothstep(.018,.04 + PX*k*.4,abs(f.y-.5));
  float ver = 1. - smoothstep(.018,.04 + PX*k*.4,abs(f.x-.5));
  v = h < .5 ? hor : ver;
  if (h > .75) v = max(hor,ver);
  float pad = 1. - smoothstep(.12,.2,length(f-.5));
  float blink = .5 + .5*sin(t*1.4 + h*TAU);
  return sat(v * (.3 + b*.4) + step(.77,h)*pad*(.4+.6*blink));
}`,
  dunas: `
float P_dunas(vec2 p, float t, float a, float b){
  float q = p.y * (13. + a * 24.)
    + sin(p.x * 4. + t*.18)* (1.2 + b * 3.)
    + 1.3 * sin(p.x * 9. - t*.12) + .8 * fbm(p*3. + vec2(t*.02,0.));
  float f = fract(q / TAU), crest = pow(1. - f, 7.);
  return sat(.14 + .42 * pow(f, 1.8) + .7 * crest);
}`,
  entrelazado: `
float P_entrelazado(vec2 p, float t, float a, float b){
  vec2 g = p * (7. + a * 12.); vec2 id = floor(g), f = fract(g);
  float h = 1. - smoothstep(.12,.22,abs(f.y-.5));
  float v = 1. - smoothstep(.12,.22,abs(f.x-.5));
  float over = mod(id.x+id.y,2.);
  float warp = .5 + .5 * cos((over > .5 ? f.y : f.x)*TAU + t*.05);
  return sat(max(h*(over>.5 ? .4:1.),v*(over>.5 ? 1.:.4))*(.55+.45*warp) * (.6+.4*b));
}`,
  obelisco: `
float ob_sd(vec3 p, float a){
  float y = clamp(p.y,-.64,.64), w = mix(.34,.12,(y+.64)/1.28) + a*.08;
  return max(max(abs(p.x),abs(p.z))-w,abs(p.y)-.64);
}
float P_obelisco(vec2 p, float t, float a, float b){
  mat3 R=rotXY(.22+t*.16,.35+t*.38);
  vec3 ro=R*vec3(0.,0.,-3.), rd=R*normalize(vec3(p,1.65));
  float d=0.; vec3 q=vec3(0.); bool hit=false;
  for(int i=0;i<64;i++){
    q=ro+rd*d; float s=ob_sd(q,a);
    if(s<.002){hit=true;break;} d+=max(s*.7,.002); if(d>6.)break;
  }
  if(!hit)return 0.;
  vec2 e=vec2(.003,0.);
  vec3 n=normalize(vec3(ob_sd(q+e.xyy,a)-ob_sd(q-e.xyy,a),ob_sd(q+e.yxy,a)-ob_sd(q-e.yxy,a),ob_sd(q+e.yyx,a)-ob_sd(q-e.yyx,a)));
  vec3 L=normalize(R*vec3(-.6,.7,-.5));
  float line=1.-smoothstep(.015,.05,abs(fract((q.y+.64)*(6.+b*14.))-.5));
  return sat(.1+.72*max(dot(n,L),0.)+.2*max(dot(n,-rd),0.)+line*.17);
}`,
  prisma: `
float pr_sd(vec3 p,float a){
  vec2 q=abs(p.xz); float hex=max(q.x*.8660254+q.y*.5,q.y)-(.43+a*.12);
  return max(hex,abs(p.y)-.55);
}
float P_prisma(vec2 p,float t,float a,float b){
  mat3 R=rotXY(.45+t*.24,t*.42);
  vec3 ro=R*vec3(0.,0.,-3.),rd=R*normalize(vec3(p,1.65));
  float d=0.; vec3 q=vec3(0.); bool hit=false;
  for(int i=0;i<64;i++){
    q=ro+rd*d; float s=pr_sd(q,a);
    if(s<.002){hit=true;break;} d+=max(s*.78,.002); if(d>6.)break;
  }
  if(!hit)return 0.;
  vec2 e=vec2(.003,0.);
  vec3 n=normalize(vec3(pr_sd(q+e.xyy,a)-pr_sd(q-e.xyy,a),pr_sd(q+e.yxy,a)-pr_sd(q-e.yxy,a),pr_sd(q+e.yyx,a)-pr_sd(q-e.yyx,a)));
  vec3 L=normalize(R*vec3(-.6,.65,-.5));
  float stripe=.5+.5*cos(q.y*(14.+b*28.)+t*.5);
  return sat(.07+max(dot(n,L),0.)*(.5+.42*stripe)+.2*max(dot(n,-rd),0.));
}`,
  reloj_arena: `
float ra_sd(vec3 p,float a){
  float r=.12+(abs(p.y)/.59)*(.29+a*.1);
  float body=max(length(p.xz)-r,abs(p.y)-.59);
  float rim=length(vec2(length(p.xz)-(.43+a*.1),abs(p.y)-.59))-.034;
  return min(body,rim);
}
float P_reloj_arena(vec2 p,float t,float a,float b){
  mat3 R=rotXY(.2+t*.13,t*.38);
  vec3 ro=R*vec3(0.,0.,-3.),rd=R*normalize(vec3(p,1.65));
  float d=0.; vec3 q=vec3(0.); bool hit=false;
  for(int i=0;i<72;i++){
    q=ro+rd*d; float s=ra_sd(q,a);
    if(s<.002){hit=true;break;} d+=max(s*.65,.002); if(d>6.)break;
  }
  if(!hit)return 0.;
  vec2 e=vec2(.003,0.);
  vec3 n=normalize(vec3(ra_sd(q+e.xyy,a)-ra_sd(q-e.xyy,a),ra_sd(q+e.yxy,a)-ra_sd(q-e.yxy,a),ra_sd(q+e.yyx,a)-ra_sd(q-e.yyx,a)));
  vec3 L=normalize(R*vec3(-.6,.7,-.5));
  float sand=smoothstep(-.05,.04,q.y + .29 * sin(t*.38)) * step(q.y,0.);
  return sat(.08+.55*max(dot(n,L),0.)+.27*max(dot(n,-rd),0.)+b*.2*sand);
}`,
};
