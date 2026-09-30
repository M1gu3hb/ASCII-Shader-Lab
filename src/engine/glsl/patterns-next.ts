import { PARTICLE_GLSL } from './particles';

/** More independent fields. Each chunk is compiled only when the pattern is used. */
export const NEXT_GLSL: Record<string, string> = {
  mareas_lentas: `
float P_mareas_lentas(vec2 p,float t,float a,float b){
  float y=p.y+.14*sin(p.x*2.7+t*.21)+.045*sin(p.x*8.-t*.14);
  float u=y*(13.+a*19.); float f=abs(sin(u));
  return sat(.08+.65*pow(f,1.5+b*2.)+.26*(1.-smoothstep(-.45,.45,p.y)));
}`,
  jardin_zen: `
float P_jardin_zen(vec2 p,float t,float a,float b){
  vec2 c=vec2(.15*sin(t*.12),.1*cos(t*.1));
  float d=length(p-c)+.2*length(p+vec2(.62,-.18));
  float v=abs(sin((19.+a*25.)*d));
  return sat(.05+.83*pow(v,3.+b*4.)+.12*fbm(p*2.));
}`,
  bruma_lejana: `
float P_bruma_lejana(vec2 p,float t,float a,float b){
  float s=0.;
  for(int i=0;i<4;i++){
    float k=float(i), n=fbm(vec2(p.x*(.8+k*.34)+t*(.025+k*.008),k*7.1));
    float horizon=-.35+k*.17+(n-.5)*(.12+a*.17);
    s=max(s,(1.-smoothstep(-.12,.055+b*.08,p.y-horizon))*(.28+k*.17));
  }
  return sat(s);
}`,
  luciernagas: `
float P_luciernagas(vec2 p,float t,float a,float b){
  vec2 g=p*(7.+a*9.), id=floor(g), f=fract(g)-.5;
  float h=hash12(id), phase=t*(.25+h*.4)+h*TAU;
  vec2 c=vec2(.24*sin(phase*1.17),.24*cos(phase*.83));
  float d=length(f-c); float alive=step(.57,h)*(.45+.55*sin(phase)*sin(phase));
  return sat(alive*(exp(-d*d*(50.+b*120.))+.19*exp(-d*d*12.)));
}`,
  lluvia_mansa: `
float P_lluvia_mansa(vec2 p,float t,float a,float b){
  float v=0.;
  for(int i=0;i<8;i++){
    float fi=float(i), k=fract(t*(.055+fi*.009)+hash12(vec2(fi,7.)));
    vec2 c=vec2(-.57+mod(fi,4.)*.38,.23-floor(fi/4.)*.44);
    float d=length(p-c), r=k*(.22+a*.34);
    v=max(v,(1.-smoothstep(.005,.03+b*.018,abs(d-r)))*(1.-k)*1.05);
  }
  return sat(v);
}`,
  bambu: `
float P_bambu(vec2 p,float t,float a,float b){
  float k=7.+a*10.; vec2 id=floor(vec2(p.x*k,0.)); float h=hash12(id);
  float x=(floor(p.x*k)+.5)/k+.018*sin(p.y*4.+t*.18+h*TAU);
  float stalk=1.-smoothstep(.004,.012+b*.014,abs(p.x-x));
  float joint=1.-smoothstep(.01,.028,abs(fract((p.y+.5)*(4.+h*3.))-.5));
  float leaves=0.;
  for(int j=0;j<4;j++){
    float yy=-.37+float(j)*.24+h*.12;
    vec2 q=(p-vec2(x,yy))*vec2(1.,2.);
    leaves=max(leaves,1.-smoothstep(.027,.055,length(q-vec2(.12*sin(float(j)*2.+h*8.),.055))));
  }
  return sat(stalk*(.35+.35*joint)+leaves*.55);
}`,
  respiracion: `
float P_respiracion(vec2 p,float t,float a,float b){
  vec2 q=p/vec2(1.,.78); float r=length(q), pulse=.36+.045*sin(t*.52);
  float ring=exp(-pow((r-pulse)*(19.+a*36.),2.));
  float core=exp(-r*r*(6.+b*14.))*(.35+.13*sin(t*.52));
  return sat(ring*.77+core);
}`,
  estuario: `
float P_estuario(vec2 p,float t,float a,float b){
  float flow=p.x*.65+p.y*.9+sin(p.y*3.+t*.15)*(.12+a*.25);
  float q=flow*(13.+b*17.)+fbm(p*3.+vec2(t*.025,0.))*2.;
  return sat(.1+.74*pow(abs(sin(q)),3.)+.14*fbm(p*2.));
}`,
  lemniscata: `
float P_lemniscata(vec2 p,float t,float a,float b){
  vec2 q=p/vec2(.9,.8); float r2=dot(q,q), k=.17+a*.21;
  float f=abs(r2*r2-2.*k*(q.x*q.x-q.y*q.y));
  return sat((1.-smoothstep(.003,.01+b*.024,f))*.9+.16*exp(-f*40.));
}`,
  superformula: `
float P_superformula(vec2 p,float t,float a,float b){
  float th=atan(p.y,p.x)+t*.08, m=floor(3.+a*7.), n=.4+b*1.3;
  float co=abs(cos(m*th/4.)), si=abs(sin(m*th/4.));
  float rad=.43/pow(pow(co,n)+pow(si,n),1./n);
  float d=abs(length(p)-rad);
  return sat((1.-smoothstep(.004,.017,d))*.9+.17*exp(-d*28.));
}`,
  armonografo: `
float P_armonografo(vec2 p,float t,float a,float b){
  float d=3.; vec2 prev=vec2(0.);
  for(int i=0;i<96;i++){
    float u=float(i)*.095; float fade=exp(-u*(.09+b*.06));
    vec2 next=vec2(sin(u*2.1+t*.12)+.45*sin(u*3.02),cos(u*(2.2+a*.35))+.3*cos(u*3.11+t*.09))*.34*fade;
    if(i>0)d=min(d,sdSeg(p,prev,next)); prev=next;
  }
  return sat((1.-smoothstep(.004,.014,d))+.12*exp(-d*20.));
}`,
  catenaria: `
float P_catenaria(vec2 p,float t,float a,float b){
  float v=0.;
  for(int i=0;i<5;i++){
    float j=float(i), x=p.x*(1.5+a*1.7)+.12*sin(t*.12+j);
    float y=.17*(cosh(x)-1.)-.35+j*.15;
    v=max(v,(1.-smoothstep(.005,.013+b*.008,abs(p.y-y)))*(.48+j*.08));
  }
  return sat(v);
}`,
  apolonio: `
float P_apolonio(vec2 p,float t,float a,float b){
  float v=0.; vec2 q=p;
  for(int i=0;i<5;i++){
    float r=.44/pow(2.,float(i)); float d=abs(length(q)-r);
    v=max(v,(1.-smoothstep(.004,.012+b*.01,d))*(.9-float(i)*.1));
    q=abs(q)-vec2(r*.5,.0); q*=1.55+a*.12;
  }
  return sat(v);
}`,
  campo_flujo: `
float P_campo_flujo(vec2 p,float t,float a,float b){
  float u=p.y+(.13+a*.2)*sin(p.x*4.+t*.16)+.08*sin(p.x*9.-p.y*5.+t*.1);
  float v=abs(sin(u*(22.+b*18.)));
  return sat(.06+.83*pow(v,5.));
}`,
  flor_armonica: `
float P_flor_armonica(vec2 p,float t,float a,float b){
  float th=atan(p.y,p.x), r=length(p), k=floor(5.+a*8.);
  float edge=.3+.12*cos(k*th+t*.28)+.045*cos((k*2.+3.)*th-t*.21);
  float d=abs(r-edge);
  float inner=abs(r-.17-.022*sin(k*th-t*.16));
  return sat(1.-smoothstep(.004,.015+b*.007,min(d,inner))+.12*exp(-d*20.));
}`,
  estrella_mar: `
float P_estrella_mar(vec2 p,float t,float a,float b){
  float th=atan(p.y,p.x)+t*.08, r=length(p);
  float petals=pow(.5+.5*cos((5.+floor(a*4.))*th),2.+b*3.);
  float edge=.16+.34*petals;
  return sat((1.-smoothstep(.006,.028,abs(r-edge)))*.83+.3*(1.-smoothstep(edge-.06,edge+.03,r)));
}`,
};

/** A softly shaded, genuine 3D signed-distance volume with evolving geometry. */
function solid(id: string, sdf: string, detail = '0.') {
  return `
float ${id}_sd(vec3 q,float t,float a,float b){ ${sdf} }
float P_${id}(vec2 p,float t,float a,float b){
  mat3 R=rotXY(.27+.13*sin(t*.16),.3+t*.23);
  vec3 ro=R*vec3(0.,0.,-2.55),rd=R*normalize(vec3(p,1.65));
  float d=0.; vec3 q=vec3(0.); bool hit=false;
  for(int i=0;i<72;i++){
    q=ro+rd*d; float s=${id}_sd(q,t,a,b);
    if(s<.002){hit=true;break;} d+=max(s*.66,.002); if(d>6.)break;
  }
  if(!hit)return 0.;
  vec2 e=vec2(.003,0.);
  vec3 n=normalize(vec3(${id}_sd(q+e.xyy,t,a,b)-${id}_sd(q-e.xyy,t,a,b),${id}_sd(q+e.yxy,t,a,b)-${id}_sd(q-e.yxy,t,a,b),${id}_sd(q+e.yyx,t,a,b)-${id}_sd(q-e.yyx,t,a,b)));
  vec3 L=normalize(R*vec3(-.6,.7,-.5));
  return sat(.09+.64*max(dot(n,L),0.)+.2*max(dot(n,-rd),0.)+(${detail})*.2);
}`;
}

Object.assign(NEXT_GLSL, {
  simbiosis: solid('simbiosis', `
    float s=10.;
    for(int i=0;i<3;i++){
      float f=float(i), ph=t*.63+f*TAU/3.;
      vec3 c=vec3((.23+.22*sin(t*.4)) * cos(ph),.28*sin(ph*.85),(.23+.22*sin(t*.4))*sin(ph));
      float d=length(q-c)-(.24+a*.1); float h=max(.12+b*.18-abs(s-d),0.)/(.12+b*.18);
      s=min(s,d)-h*h*(.12+b*.18)*.25;
    }
    return s;`, '.4+.4*sin(q.y*11.+t*.7)'),
  pendulos: solid('pendulos', `
    float s=10.;
    for(int i=0;i<5;i++){
      float f=float(i), x=(f-2.)*.23;
      float angle=sin(t*(.65+f*.12))*(.2+a*.35);
      vec3 c=vec3(x+.38*sin(angle),-.25-.38*cos(angle)+.38,(f-2.)*.035);
      float ball=length(q-c)-(.11+b*.055);
      vec3 v=vec3(x,.55,(f-2.)*.035)-c;
      float u=clamp(dot(q-c,v)/dot(v,v),0.,1.);
      float wire=length(q-c-v*u)-.014;
      s=min(s,min(ball,wire));
    }
    return s;`, '.2'),
  cinta_ola: solid('cinta_ola', `
    float x=q.x; float y=.22*sin(x*7.+t*.9)*(1.-x*x*.5);
    float width=.38+a*.12;
    return max(max(abs(q.y-y)-(.018+b*.01),abs(q.x)-.6),abs(q.z-.12*cos(x*5.+t*.9)) -width);`, '.5+.5*cos(q.x*18.+t)'),
  jade_vivo: solid('jade_vivo', `
    float r=length(q), th=atan(q.z,q.x), phi=atan(q.y,length(q.xz));
    float wave=.045*sin(th*6.+t*.58)*cos(phi*4.-t*.41)+.025*sin(phi*11.+th*3.+t*.3);
    return r-(.43+a*.12+wave*(.4+b));`, '.5+.5*sin(q.y*17.+t*.5)'),
  caliz: solid('caliz', `
    float y=q.y; float radius=.12+(.26+a*.1)*smoothstep(-.46,.4,y);
    float shell=abs(length(q.xz)-radius)-(.026+b*.015);
    float body=max(shell,max(-.5-y,y-.47));
    float stem=max(length(q.xz)-.035, max(-.62-y,y+.44));
    float lip=length(vec2(length(q.xz)-radius,y-.45))-.033;
    return min(min(body,stem),lip);`, '.45+.35*cos(atan(q.z,q.x)*8.+t*.3)'),
  medusa: solid('medusa', `
    float dome=length(vec3(q.x, max(q.y-.05,0.)*.75,q.z))-(.35+a*.12);
    dome=max(dome,-q.y+.04);
    float tent=10.;
    for(int i=0;i<7;i++){
      float f=float(i), ph=f*TAU/7.;
      vec3 c=vec3(.19*cos(ph)+.05*sin(t*.5+q.y*7.+ph),-.1,.19*sin(ph)+.05*cos(t*.5+q.y*7.+ph));
      float d=length(q.xz-c.xz)-(.012+b*.013);
      tent=min(tent,max(d,max(-.6-q.y,q.y+.07)));
    }
    return min(dome,tent);`, '.4+.5*exp(-abs(q.y-.05)*6.)'),
  esferas_orbita: solid('esferas_orbita', `
    float s=10.;
    for(int i=0;i<6;i++){
      float f=float(i), ph=f*TAU/6.+t*(.35+a*.35);
      vec3 c=vec3(.4*cos(ph),.21*sin(ph*2.+t*.2),.4*sin(ph));
      s=min(s,length(q-c)-(.11+b*.05));
    }
    float ring=length(vec2(length(q.xz)-.4,q.y))-.017;
    return min(s,ring);`, '.5+.5*cos(q.x*9.+q.z*8.)'),
  },
);
Object.assign(NEXT_GLSL, PARTICLE_GLSL);
