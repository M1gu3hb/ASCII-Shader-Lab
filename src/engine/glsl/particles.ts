/** Analytic particle trajectories, rendered as a scalar field at any chosen time. */
export const PARTICLE_IDS = [
  'enjambre_vivo', 'estela_cometas', 'lluvia_ascendente', 'orbitas_gemelas',
  'corazon_particulas', 'cardumen_luz', 'vortice_polvo', 'ondas_estelares',
  'mariposa_puntos', 'nieve_orbital', 'floracion_luz', 'constelacion_dinamica',
] as const;

export const PARTICLE_GLSL: Record<string, string> = {};
for (const [mode, id] of PARTICLE_IDS.entries()) {
  PARTICLE_GLSL[id] = `
float P_${id}(vec2 p,float t,float a,float b){
  float v=0.;
  for(int i=0;i<28;i++){
    float k=float(i),h=hash12(vec2(k,19.)), ph=k*2.399963+h*.8, sp=.22+h*.45;
    vec2 c=vec2(0.); float period=fract(h+t*(.035+sp*.07));
    if(${mode}==0){
      float morph=.5+.5*sin(t*.42);
      vec2 scattered=vec2(hash12(vec2(k,51.))-.5,hash12(vec2(k,91.))-.5)*1.25;
      c=mix(scattered,vec2(cos(ph),sin(ph))*(.23+a*.21),morph);
    }else if(${mode}==1){
      c=vec2(-.75+period*1.5, .26*sin(k*1.7)+.14*sin(t*.3+k));
    }else if(${mode}==2){
      c=vec2((h-.5)*1.45,-.68+period*1.4);
    }else if(${mode}==3){
      float ring=mod(k,2.);
      c=vec2(cos(ph+t*(ring<.5?.36:-.27))*(.25+ring*.23),sin(ph+t*(ring<.5?.36:-.27))*(.16+ring*.16));
    }else if(${mode}==4){
      float u=ph+t*.13;
      c=vec2(16.*sin(u)*sin(u)*sin(u),13.*cos(u)-5.*cos(2.*u)-2.*cos(3.*u)-cos(4.*u))*.022;
      c*=.86+.12*sin(t*.95);
    }else if(${mode}==5){
      c=vec2(-.7+period*1.4,.24*sin(ph*.8+t*.33)+.14*sin(k*1.4));
      c.y+=.09*sin(c.x*8.+t*.65);
    }else if(${mode}==6){
      float r=.07+period*.62,th=ph+t*.3+period*TAU*2.;
      c=r*vec2(cos(th),sin(th));
    }else if(${mode}==7){
      float r=mod(k,4.)*.13+.08+.035*sin(t*.5+ph);
      c=vec2(cos(ph+t*.11),sin(ph+t*.11))*r;
    }else if(${mode}==8){
      float u=ph+t*.16, rr=.27+.11*cos(4.*u);
      c=vec2(sin(u)*rr*1.6,cos(u*2.)*rr*.8);
    }else if(${mode}==9){
      c=vec2((h-.5)*1.4+.08*sin(t*.5+ph), .65-period*1.3);
    }else if(${mode}==10){
      float u=ph+t*.17, rr=.17+.25*pow(abs(sin(3.*u)),2.);
      c=rr*vec2(cos(u),sin(u));
    }else{
      c=vec2((hash12(vec2(k,31.))-.5)*1.25,(hash12(vec2(k,71.))-.5)*.9);
      c+=.05*vec2(sin(t*.4+ph),cos(t*.35+ph));
    }
    float d=length(p-c), rad=.019+b*.027;
    float particle=exp(-d*d/(rad*rad))*(.55+.45*h);
    v=max(v,particle+.2*exp(-d*d/(rad*rad*16.)));
    if(${mode}==1 || ${mode}==2 || ${mode}==6){
      vec2 dir=${mode}==2?vec2(0.,-.1):${mode}==1?vec2(-.13,0.):normalize(c+vec2(.001,.001))*(-.09-a*.11);
      vec2 delta=p-c; float along=clamp(dot(delta,dir)/dot(dir,dir),0.,1.);
      float trail=length(delta-dir*along);
      v=max(v,(1.-smoothstep(.005,.018+b*.012,trail))*(1.-along)*.45);
    }
    if(${mode}==11 && i>0){
      float prev=k-1., hp=hash12(vec2(prev,19.)), pp=prev*2.399963+hp*.8;
      vec2 q=vec2((hash12(vec2(prev,31.))-.5)*1.25,(hash12(vec2(prev,71.))-.5)*.9);
      q+=.05*vec2(sin(t*.4+pp),cos(t*.35+pp));
      if(length(q-c)<.27) v=max(v,(1.-smoothstep(.002,.012,sdSeg(p,q,c)))*.35);
    }
  }
  return sat(v);
}`;
}
