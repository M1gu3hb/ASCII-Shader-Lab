/*! Hecho con Monotrama · https://monotrama.vercel.app · Licencia MIT-0: úsalo, modifícalo y véndelo sin atribución.
    <monotrama-field recipe='{…}'> · atributos: src (imagen o video), pointer="window", static, paused, poster (imagen si no hay WebGL 2) */
"use strict";(()=>{var Oe=Object.defineProperty;var Ue=(a,t,i)=>t in a?Oe(a,t,{enumerable:!0,configurable:!0,writable:!0,value:i}):a[t]=i;var m=(a,t,i)=>Ue(a,typeof t!="symbol"?t+"":t,i);var Ne=[{id:"nube",name:"Nubes",family:"organico",a:"Detalle",b:"Deriva",cost:2},{id:"marmol",name:"M\xE1rmol",family:"organico",a:"Torsi\xF3n",b:"Frecuencia",cost:3},{id:"crestas",name:"Crestas",family:"organico",a:"Filo",b:"Frecuencia",cost:2},{id:"fuego",name:"Fuego",family:"organico",a:"Altura",b:"Turbulencia",cost:2},{id:"aurora",name:"Aurora",family:"organico",a:"Separaci\xF3n",b:"Finura",cost:2},{id:"causticas",name:"C\xE1usticas",family:"organico",a:"Escala",b:"Nitidez",cost:2},{id:"lava",name:"Lava",family:"organico",a:"Tama\xF1o",b:"Suavidad",cost:1},{id:"celulas",name:"C\xE9lulas",family:"organico",a:"Densidad",b:"Relieve",cost:2},{id:"grietas",name:"Grietas",family:"organico",a:"Densidad",b:"Grosor",cost:2},{id:"anillos",name:"Anillos",family:"geometrico",a:"Frecuencia",b:"Dureza",cost:1},{id:"cuadros",name:"Cuadros",family:"geometrico",a:"Frecuencia",b:"Dureza",cost:1},{id:"rayos",name:"Rayos",family:"geometrico",a:"Cantidad",b:"Giro",cost:1},{id:"tablero",name:"Tablero",family:"geometrico",a:"Casillas",b:"Oleaje",cost:1},{id:"truchet",name:"Laberinto",family:"geometrico",a:"Densidad",b:"Grosor",cost:1},{id:"hex",name:"Panal",family:"geometrico",a:"Densidad",b:"Borde",cost:1},{id:"trama",name:"Trama",family:"geometrico",a:"Lineatura",b:"Nube",cost:2},{id:"moire",name:"Moir\xE9",family:"geometrico",a:"Finura",b:"Deriva",cost:1},{id:"rombos",name:"Rombos",family:"geometrico",a:"Densidad",b:"Anillos",cost:1},{id:"franjas",name:"Franjas",family:"geometrico",a:"Cantidad",b:"Inclinaci\xF3n",cost:1},{id:"caleido",name:"Caleidoscopio",family:"geometrico",a:"Espejos",b:"Detalle",cost:2},{id:"ondas",name:"Ondas",family:"ondas",a:"Frecuencia",b:"Oleaje",cost:1},{id:"interferencia",name:"Interferencia",family:"ondas",a:"Frecuencia",b:"Separaci\xF3n",cost:1},{id:"plasma",name:"Plasma",family:"ondas",a:"Escala",b:"Remolino",cost:1},{id:"lissajous",name:"Lissajous",family:"ondas",a:"Ritmo X",b:"Ritmo Y",cost:3},{id:"ecualizador",name:"Ecualizador",family:"ondas",a:"Bandas",b:"Separaci\xF3n",cost:1},{id:"horizonte",name:"Horizonte",family:"ondas",a:"L\xEDneas",b:"Pico",cost:3},{id:"radar",name:"Radar",family:"se\xF1al",a:"Estela",b:"Anillos",cost:1},{id:"tunel",name:"T\xFAnel",family:"espacio",a:"Paredes",b:"Avance",cost:1},{id:"espiral",name:"Espiral",family:"espacio",a:"Brazos",b:"Torsi\xF3n",cost:1},{id:"estrellas",name:"Estrellas",family:"espacio",a:"Densidad",b:"Brillo",cost:1},{id:"hiper",name:"Hiperespacio",family:"espacio",a:"Densidad",b:"Impulso",cost:1},{id:"galaxia",name:"Galaxia",family:"espacio",a:"Brazos",b:"Torsi\xF3n",cost:2},{id:"rejilla",name:"Rejilla infinita",family:"espacio",a:"Horizonte",b:"Avance",cost:1},{id:"dona",name:"Dona",family:"solidos",a:"Grosor",b:"Giro",cost:3},{id:"esfera",name:"Esfera",family:"solidos",a:"Relieve",b:"Rayas",cost:2},{id:"cubo",name:"Cubo",family:"solidos",a:"Redondez",b:"Aristas",cost:3},{id:"nudo",name:"Nudo",family:"solidos",a:"Grosor",b:"Vueltas",cost:3},{id:"poliedro",name:"Poliedro",family:"solidos",a:"Caras",b:"Aristas",cost:2},{id:"giroide",name:"Giroide",family:"solidos",a:"Densidad",b:"Grosor",cost:3},{id:"moebius",name:"Cinta de M\xF6bius",family:"solidos",a:"Ancho",b:"Medias vueltas",cost:3},{id:"adn",name:"Doble h\xE9lice",family:"solidos",a:"Torsi\xF3n",b:"Pelda\xF1os",cost:3},{id:"planeta",name:"Planeta",family:"solidos",a:"Anillos",b:"Inclinaci\xF3n",cost:2},{id:"voxeles",name:"V\xF3xeles",family:"solidos",a:"Altura",b:"Bloques",cost:3},{id:"metabolas",name:"Metal l\xEDquido",family:"solidos",a:"Tama\xF1o",b:"Fusi\xF3n",cost:3},{id:"engranajes",name:"Engranajes",family:"solidos",a:"Dientes",b:"Radios",cost:3},{id:"cristales",name:"Cristales",family:"solidos",a:"Cantidad",b:"Largo",cost:3},{id:"julia",name:"Julia",family:"matematico",a:"Zoom",b:"Deriva",cost:3},{id:"rosa",name:"Rosa polar",family:"matematico",a:"P\xE9talos",b:"Trazo",cost:1},{id:"degradado",name:"Degradado",family:"matematico",a:"\xC1ngulo",b:"Ondulaci\xF3n",cost:1},{id:"forma",name:"Pol\xEDgono",family:"formas",a:"Lados",b:"Contorno",cost:1},{id:"estrella",name:"Estrella",family:"formas",a:"Puntas",b:"Contorno",cost:1},{id:"latido",name:"Latido",family:"formas",a:"Tama\xF1o",b:"Contorno",cost:1},{id:"lluvia",name:"Lluvia digital",family:"se\xF1al",a:"Columnas",b:"Ca\xEDda",cost:1},{id:"glitch",name:"Glitch",family:"se\xF1al",a:"Bandas",b:"Frecuencia",cost:2},{id:"ruido",name:"Est\xE1tica",family:"se\xF1al",a:"Contraste",b:"Frecuencia",cost:1}],ft=new Set(Ne.map(a=>a.id));var He={normal:"Normal",add:"Sumar",multiply:"Multiplicar",screen:"Trama (screen)",overlay:"Superponer",difference:"Diferencia",lighten:"Aclarar",darken:"Oscurecer",mask:"M\xE1scara",cutout:"Recorte",subtract:"Restar"},dt=Object.keys(He);var le=["|","\\","-","/"],L='ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',se=[{id:"system",name:"Mono del sistema",family:null,stack:L,google:null,weights:[400,700],mono:!0,display:!1},{id:"jetbrains",name:"JetBrains Mono",family:"JetBrains Mono",stack:`"JetBrains Mono", ${L}`,google:"JetBrains+Mono:wght@100..800",weights:[100,200,300,400,500,600,700,800],mono:!0,display:!0},{id:"plex",name:"IBM Plex Mono",family:"IBM Plex Mono",stack:`"IBM Plex Mono", ${L}`,google:"IBM+Plex+Mono:wght@100;200;300;400;500;600;700",weights:[100,200,300,400,500,600,700],mono:!0,display:!0},{id:"martian",name:"Martian Mono",family:"Martian Mono",stack:`"Martian Mono", "Martian Mono Variable", ${L}`,google:"Martian+Mono:wght@100..800",weights:[100,200,300,400,500,600,700,800],mono:!0,display:!0},{id:"space",name:"Space Mono",family:"Space Mono",stack:`"Space Mono", ${L}`,google:"Space+Mono:wght@400;700",weights:[400,700],mono:!0,display:!0},{id:"fira",name:"Fira Code",family:"Fira Code",stack:`"Fira Code", ${L}`,google:"Fira+Code:wght@300..700",weights:[300,400,500,600,700],mono:!0,display:!1},{id:"vt",name:"VT323 \xB7 terminal",family:"VT323",stack:`"VT323", ${L}`,google:"VT323",weights:[400],mono:!0,display:!0,fit:1.3},{id:"pixel",name:"Press Start \xB7 p\xEDxel",family:"Press Start 2P",stack:`"Press Start 2P", ${L}`,google:"Press+Start+2P",weights:[400],mono:!0,display:!0,fit:.72},{id:"silk",name:"Silkscreen \xB7 p\xEDxel",family:"Silkscreen",stack:`"Silkscreen", ${L}`,google:"Silkscreen:wght@400;700",weights:[400,700],mono:!1,display:!0},{id:"serif",name:"Instrument Serif",family:"Instrument Serif",stack:'"Instrument Serif", Georgia, "Times New Roman", serif',google:"Instrument+Serif:ital@0;1",weights:[400],mono:!1,display:!0,fit:1.2},{id:"sans",name:"Grotesca pesada",family:null,stack:'"Helvetica Neue", "Arial Black", Arial, system-ui, sans-serif',google:null,weights:[400,700,900],mono:!1,display:!0},{id:"courier",name:"Courier",family:null,stack:'"Courier New", Courier, monospace',google:null,weights:[400,700],mono:!0,display:!1}],N=a=>se.find(t=>t.id===a)??se[0];function ce(a,t){let i=a.weights[0];for(let e of a.weights)Math.abs(e-t)<Math.abs(i-t)&&(i=e);return i}var ue=new Map;function _(a){let t=new Set,i=[];for(let e of Array.from(a))e===`
`||e==="\r"||e==="	"||t.has(e)||(t.add(e),i.push(e));return i}function me(a,t){return`${a.italic?"italic ":""}${a.weight} ${t}px ${a.stack}`}function We(a,t,i){let e=a.join("")+"|"+t.stack+"|"+t.weight+"|"+(t.italic?1:0)+"|"+i.toFixed(2),r=ue.get(e);if(r)return r;let n=32,c=Math.max(12,Math.round(n*i)),o=document.createElement("canvas");o.width=n,o.height=c;let s=o.getContext("2d",{willReadFrequently:!0}),d=Math.round(Math.min(c*.82,n*1.55));s.font=me(t,d),s.textAlign="center",s.textBaseline="middle",s.fillStyle="#fff";let f=a.map(h=>{s.clearRect(0,0,n,c),s.fillText(h,n/2,c/2+d*.04);let g=s.getImageData(0,0,n,c).data,v=0;for(let x=3;x<g.length;x+=4)v+=g[x];return v}),u=a.map((h,g)=>[h,f[g],g]).sort((h,g)=>h[1]-g[1]||h[2]-g[2]).map(h=>h[0]);return ue.set(e,u),u}function fe(a,t){let i=_(a.charset);i.length||(i=[" ","#"]),a.sort&&i.length>1&&(i=We(i,a,a.ch/a.cw));let e=i.slice(),r=new Map;i.forEach((x,S)=>{r.has(x)||r.set(x,S)});let n=e.length;e.push(...le);let c=e.length;e.push("\u2588");let o=e.length;e.push(" "),r.has(" ")||r.set(" ",o),r.has("\u2588")||r.set("\u2588",c);for(let x of _(a.extras))r.has(x)||(r.set(x,e.length),e.push(x));let{cw:s,ch:d}=a,f=Math.max(1,Math.min(e.length,Math.floor(a.maxTex/s),64)),u=Math.ceil(e.length/f),h=t??document.createElement("canvas");h.width=f*s,h.height=Math.min(a.maxTex,u*d);let g=h.getContext("2d");g.clearRect(0,0,h.width,h.height);let v=Math.max(1,Math.min(d*.82,s*1.55)*a.scale);return g.font=me(a,v),g.textAlign="center",g.textBaseline="middle",g.fillStyle="#fff",e.forEach((x,S)=>{if(x===" ")return;let y=S%f*s,b=Math.floor(S/f)*d;g.save(),g.beginPath(),g.rect(y,b,s,d),g.clip(),x==="\u2588"?g.fillRect(y,b,s,d):g.fillText(x,y+s/2,b+d/2+v*.04),g.restore()}),{canvas:h,chars:e,cols:f,n:i.length,edgeBase:n,blockIdx:c,spaceIdx:o,index:r,cw:s,ch:d}}var he={on:!0,pattern:"nube",blend:"normal",mix:1,scale:1,speed:1,rot:0,x:0,y:0,a:.5,b:.5,invert:!1,phase:0},ze=" .:-=+*#%@";function Ke(){return{v:2,source:"pattern",layers:[{...he}],motion:{speed:1,warp:0,warpScale:1,hold:0,loop:0,pulse:0,bpm:110},media:{fit:"cover",zoom:1,panX:0,panY:0,mirror:!1,mix:0,blend:"multiply",reveal:0,rate:1},text:{content:"MONOTRAMA",font:"martian",weight:800,size:1,tracking:0,leading:1,align:"center",italic:!1,morph:0},interact:{mode:"light",strength:.4,radius:.18,auto:!1},glyph:{cell:10,aspect:1.4,charset:ze,sort:!0,font:"jetbrains",weight:500,scale:1,mode:"density",words:"TEJE LUZ CON CARACTERES ",edge:0,dither:0,ditherKind:"bayer",jitter:.5},tone:{bright:0,contrast:1,gamma:1,invert:!1,levels:0},color:{mode:"ramp",stops:["#1a1410","#ede6da"],bg:"#0b0a09",map:"luma",shift:0,cycle:0,hue:0,sat:1,vivid:.5,shade:0},fx:{glow:0,bloom:0,scan:0,vig:0,curve:0,chroma:0,grain:0,flicker:0,cellBg:0,grid:0},msg:{on:!1,text:"hola, mundo",mode:"type",speed:14,x:.5,y:.5,align:"center",color:"",box:.85,cursor:!0,hold:2.5},meta:{}}}var Xe=["pattern","image","video","camera","text"],H=["normal","add","multiply","screen","overlay","difference","lighten","darken","mask","cutout","subtract"],je=["density","lines","scramble","words"],qe=["ramp","source"],Ve=["luma","x","y","radial","angle","noise"],$e=["none","light","ripple","lens","repel","swirl","erase","paint","scramble"],Ye=["static","type","decode","marquee"],Je=["cover","contain","stretch"],de=["left","center","right"],Qe=/^#[0-9a-f]{6}$/i,Ze=/^#[0-9a-f]{3}$/i;function $(a,t){if(typeof a!="string")return t;let i=a.trim();return Qe.test(i)?i.toLowerCase():Ze.test(i)?("#"+i[1]+i[1]+i[2]+i[2]+i[3]+i[3]).toLowerCase():t}function p(a,t,i,e){let r=typeof a=="number"?a:typeof a=="string"?parseFloat(a):NaN;return Number.isFinite(r)?Math.min(e,Math.max(i,r)):t}function B(a,t){return typeof a=="boolean"?a:t}function A(a,t,i){return typeof a=="string"&&t.includes(a)?a:i}function D(a,t,i=4e3){return typeof a=="string"?a.slice(0,i):t}function R(a){return a&&typeof a=="object"&&!Array.isArray(a)?a:{}}var et=/^[0-9a-f]{16}$/;function tt(a){let t=R(a);if(t.kind!=="image"&&t.kind!=="video")return;let i=typeof t.size=="number"&&Number.isFinite(t.size)&&t.size>=0?Math.round(t.size):void 0;return{...typeof t.id=="string"&&et.test(t.id)?{id:t.id}:{},kind:t.kind,...typeof t.name=="string"&&t.name.trim()?{name:t.name.slice(0,200)}:{},...typeof t.type=="string"&&t.type?{type:t.type.slice(0,100)}:{},...i!==void 0?{size:i}:{},w:Math.round(p(t.w,0,0,1e5)),h:Math.round(p(t.h,0,0,1e5))}}function it(a,t){let i=R(a),e=he,r=D(i.pattern,e.pattern,40);return t&&!t.has(r)&&(r=e.pattern),{on:B(i.on,!0),pattern:r,blend:A(i.blend,H,"normal"),mix:p(i.mix,1,0,1),scale:p(i.scale,1,.05,8),speed:p(i.speed,1,-4,4),rot:p(i.rot,0,-360,360),x:p(i.x,0,-2,2),y:p(i.y,0,-2,2),a:p(i.a,.5,0,1),b:p(i.b,.5,0,1),invert:B(i.invert,!1),phase:p(i.phase,0,0,1e3)}}function Y(a,t){let i=Ke(),e=R(a),r=R(e.motion),n=R(e.media),c=R(e.text),o=R(e.interact),s=R(e.glyph),d=R(e.tone),f=R(e.color),u=R(e.fx),h=R(e.msg),g=R(e.meta),v=Array.isArray(e.layers)?e.layers.slice(0,4):[],x=v.length?v.map(E=>it(E,t)):i.layers,y=(Array.isArray(f.stops)?f.stops.slice(0,6):[]).map(E=>$(E,"")).filter(Boolean),b=tt(n.ref);return{v:2,source:A(e.source,Xe,i.source),layers:x,motion:{speed:p(r.speed,i.motion.speed,0,4),warp:p(r.warp,i.motion.warp,0,2),warpScale:p(r.warpScale,i.motion.warpScale,.1,4),hold:p(r.hold,i.motion.hold,0,30),loop:p(r.loop,i.motion.loop,0,60),pulse:p(r.pulse,i.motion.pulse,0,1),bpm:p(r.bpm,i.motion.bpm,30,200)},media:{fit:A(n.fit,Je,i.media.fit),zoom:p(n.zoom,i.media.zoom,.25,8),panX:p(n.panX,0,-1,1),panY:p(n.panY,0,-1,1),mirror:B(n.mirror,!1),mix:p(n.mix,i.media.mix,0,1),blend:A(n.blend,H,i.media.blend),reveal:p(n.reveal,0,0,1),rate:p(n.rate,1,.1,4),...b?{ref:b}:{}},text:{content:D(c.content,i.text.content,600),font:D(c.font,i.text.font,40),weight:p(c.weight,i.text.weight,100,900),size:p(c.size,i.text.size,.05,2),tracking:p(c.tracking,0,-.3,1),leading:p(c.leading,1,.6,2.5),align:A(c.align,de,"center"),italic:B(c.italic,!1),morph:p(c.morph,0,0,60)},interact:{mode:A(o.mode,$e,i.interact.mode),strength:p(o.strength,i.interact.strength,0,1),radius:p(o.radius,i.interact.radius,.02,.8),auto:B(o.auto,!1)},glyph:{cell:p(s.cell,i.glyph.cell,3,96),aspect:p(s.aspect,i.glyph.aspect,.5,3),charset:D(s.charset,i.glyph.charset,400)||i.glyph.charset,sort:B(s.sort,!0),font:D(s.font,i.glyph.font,40),weight:p(s.weight,i.glyph.weight,100,900),scale:p(s.scale,1,.2,2),mode:A(s.mode,je,"density"),words:D(s.words,i.glyph.words,2e3),edge:p(s.edge,0,0,1),dither:p(s.dither,0,0,1),ditherKind:A(s.ditherKind,["bayer","noise"],"bayer"),jitter:p(s.jitter,.5,0,1)},tone:{bright:p(d.bright,0,-1,1),contrast:p(d.contrast,1,0,4),gamma:p(d.gamma,1,.1,4),invert:B(d.invert,!1),levels:Math.round(p(d.levels,0,0,16))},color:{mode:A(f.mode,qe,"ramp"),stops:y.length?y:i.color.stops,bg:$(f.bg,i.color.bg),map:A(f.map,Ve,"luma"),shift:p(f.shift,0,-2,2),cycle:p(f.cycle,0,-1,1),hue:p(f.hue,0,0,1),sat:p(f.sat,1,0,2),vivid:p(f.vivid,.5,0,1),shade:p(f.shade,0,0,1)},fx:{glow:p(u.glow,0,0,2),bloom:p(u.bloom,0,0,2),scan:p(u.scan,0,0,1),vig:p(u.vig,0,0,1),curve:p(u.curve,0,0,1),chroma:p(u.chroma,0,0,1),grain:p(u.grain,0,0,1),flicker:p(u.flicker,0,0,1),cellBg:p(u.cellBg,0,0,1),grid:p(u.grid,0,0,1)},msg:{on:B(h.on,!1),text:D(h.text,i.msg.text,1200),mode:A(h.mode,Ye,i.msg.mode),speed:p(h.speed,i.msg.speed,1,120),x:p(h.x,.5,0,1),y:p(h.y,.5,0,1),align:A(h.align,de,"center"),color:h.color===""?"":$(h.color,""),box:p(h.box,i.msg.box,0,1),cursor:B(h.cursor,!0),hold:p(h.hold,i.msg.hold,0,30)},meta:{name:typeof g.name=="string"?g.name.slice(0,80):void 0,seed:typeof g.seed=="string"?g.seed.slice(0,80):void 0,arch:typeof g.arch=="string"?g.arch.slice(0,40):void 0,space:typeof g.space=="string"?g.space.slice(0,40):void 0,gen:typeof g.gen=="number"?g.gen:void 0}}}function z(a){return JSON.parse(JSON.stringify(a))}function K(a){let t=String(a||"#000").replace("#","");t.length===3&&(t=t[0]+t[0]+t[1]+t[1]+t[2]+t[2]);let i=parseInt(t,16)||0;return[(i>>16&255)/255,(i>>8&255)/255,(i&255)/255]}var J=a=>a<=.04045?a/12.92:Math.pow((a+.055)/1.055,2.4),Q=a=>a<=.0031308?12.92*a:1.055*Math.pow(a,1/2.4)-.055;function rt([a,t,i]){let e=J(a),r=J(t),n=J(i),c=Math.cbrt(.4122214708*e+.5363325363*r+.0514459929*n),o=Math.cbrt(.2119034982*e+.6806995451*r+.1073969566*n),s=Math.cbrt(.0883024619*e+.2817188376*r+.6299787005*n);return[.2104542553*c+.793617785*o-.0040720468*s,1.9779984951*c-2.428592205*o+.4505937099*s,.0259040371*c+.7827717662*o-.808675766*s]}function at([a,t,i]){let e=(a+.3963377774*t+.2158037573*i)**3,r=(a-.1055613458*t-.0638541728*i)**3,n=(a-.0894841775*t-1.291485548*i)**3;return[Q(4.0767416621*e-3.3077115913*r+.2309699292*n),Q(-1.2684380046*e+2.6097574011*r-.3413193965*n),Q(-.0041960863*e-.7034186147*r+1.707614701*n)]}function pe(a,t=256){let i=new Uint8Array(t*4),e=(a.length?a:["#ffffff"]).map(r=>rt(K(r)));for(let r=0;r<t;r++){let n=t===1?0:r/(t-1),c;if(e.length===1)c=e[0];else{let s=n*(e.length-1),d=Math.min(e.length-2,Math.floor(s)),f=s-d,u=e[d],h=e[d+1];c=[u[0]+(h[0]-u[0])*f,u[1]+(h[1]-u[1])*f,u[2]+(h[2]-u[2])*f]}let o=at(c);i[r*4]=Math.round(Math.max(0,Math.min(1,o[0]))*255),i[r*4+1]=Math.round(Math.max(0,Math.min(1,o[1]))*255),i[r*4+2]=Math.round(Math.max(0,Math.min(1,o[2]))*255),i[r*4+3]=255}return i}function Z(a,t){let i=a.length/4,e=Math.max(0,Math.min(1,t))*(i-1),r=Math.floor(e),n=e-r,c=Math.min(i-1,r+1);return[0,1,2].map(o=>(a[r*4+o]*(1-n)+a[c*4+o]*n)/255)}var ge=new Map;function ve(a){return{stack:t=>N(t).stack,async ensure(t,i,e=!1,r="AaMm@#01"){let n=N(t);if(!n.family||typeof document>"u"||!document.fonts)return!0;a.google&&n.google&&!ot(n.family)&&await nt(t,n);let c=`${e?"italic ":""}${ce(n,i)} 32px "${n.family}"`;try{return(await Promise.race([document.fonts.load(c,r||"Aa"),new Promise(s=>setTimeout(()=>s([]),5e3))])).length>0}catch{return!1}}}}function nt(a,t){let i=ge.get(a);return i||(i=new Promise(e=>{let r=document.createElement("link");r.rel="stylesheet",r.href=`https://fonts.googleapis.com/css2?family=${t.google}&display=swap`,r.dataset.mtFont=a,r.onload=()=>e(),r.onerror=()=>e(),setTimeout(e,4e3),document.head.appendChild(r)}),ge.set(a,i)),i}function ot(a){for(let t of document.fonts)if(t.family.replace(/["']/g,"")===a)return!0;return!1}function O(a,t,i){let e=(o,s)=>{let d=a.createShader(o);if(a.shaderSource(d,s),a.compileShader(d),!a.getShaderParameter(d,a.COMPILE_STATUS)&&!a.isContextLost()){let f=a.getShaderInfoLog(d)||"error de compilaci\xF3n";throw a.deleteShader(d),new Error(f+`
`+be(s,f))}return d},r=e(a.VERTEX_SHADER,t),n=e(a.FRAGMENT_SHADER,i),c=a.createProgram();if(a.attachShader(c,r),a.attachShader(c,n),a.bindAttribLocation(c,0,"aPos"),a.linkProgram(c),a.deleteShader(r),a.deleteShader(n),!a.getProgramParameter(c,a.LINK_STATUS)&&!a.isContextLost())throw new Error(a.getProgramInfoLog(c)||"error de enlazado");return{prog:c,u:new Map}}function ee(a,t,i){let e=(o,s)=>{let d=a.createShader(o);return a.shaderSource(d,s),a.compileShader(d),d},r=e(a.VERTEX_SHADER,t),n=e(a.FRAGMENT_SHADER,i),c=a.createProgram();return a.attachShader(c,r),a.attachShader(c,n),a.bindAttribLocation(c,0,"aPos"),a.linkProgram(c),{prog:c,vs:r,fs:n,fsSrc:i}}function te(a,t,i){return i?a.getProgramParameter(t.prog,37297)!==!1:!0}function ie(a,t){if(!(a.getProgramParameter(t.prog,a.LINK_STATUS)||a.isContextLost())){let e=a.getShaderParameter(t.fs,a.COMPILE_STATUS)?"":a.getShaderInfoLog(t.fs)||"error de compilaci\xF3n",r=e||a.getProgramInfoLog(t.prog)||"error de enlazado";throw a.deleteShader(t.vs),a.deleteShader(t.fs),a.deleteProgram(t.prog),new Error(r+(e?`
`+be(t.fsSrc,e):""))}return a.deleteShader(t.vs),a.deleteShader(t.fs),{prog:t.prog,u:new Map}}function re(a,t){a.deleteShader(t.vs),a.deleteShader(t.fs),a.deleteProgram(t.prog)}function be(a,t){let i=/ERROR: \d+:(\d+)/.exec(t);if(!i)return"";let e=+i[1];return a.split(`
`).slice(Math.max(0,e-4),e+2).map((r,n)=>`${e-3+n}: ${r}`).join(`
`)}function l(a,t,i){let e=t.u.get(i);return e===void 0&&(e=a.getUniformLocation(t.prog,i),t.u.set(i,e)),e}function w(a,t,i,e={}){let r={tex:a.createTexture(),w:t,h:i,internal:e.internal??a.RGBA8,format:e.format??a.RGBA,type:e.type??a.UNSIGNED_BYTE,filter:e.filter??a.NEAREST};return a.bindTexture(a.TEXTURE_2D,r.tex),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_S,a.CLAMP_TO_EDGE),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_T,a.CLAMP_TO_EDGE),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MIN_FILTER,r.filter),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MAG_FILTER,r.filter),a.texImage2D(a.TEXTURE_2D,0,r.internal,t,i,0,r.format,r.type,e.data??null),r}function G(a,t,i,e,r=null){a.bindTexture(a.TEXTURE_2D,t.tex),a.texImage2D(a.TEXTURE_2D,0,t.internal,i,e,0,t.format,t.type,r),t.w=i,t.h=e}function I(a,...t){let i=a.createFramebuffer();return a.bindFramebuffer(a.FRAMEBUFFER,i),t.forEach((e,r)=>a.framebufferTexture2D(a.FRAMEBUFFER,a.COLOR_ATTACHMENT0+r,a.TEXTURE_2D,e.tex,0)),t.length>1&&a.drawBuffers(t.map((e,r)=>a.COLOR_ATTACHMENT0+r)),a.bindFramebuffer(a.FRAMEBUFFER,null),i}function xe(a){if(!a.getExtension("EXT_color_buffer_float")&&!a.getExtension("EXT_color_buffer_half_float"))return!1;let t=w(a,2,2,{internal:a.RGBA16F,format:a.RGBA,type:a.HALF_FLOAT}),i=I(a,t);a.bindFramebuffer(a.FRAMEBUFFER,i);let e=a.checkFramebufferStatus(a.FRAMEBUFFER)===a.FRAMEBUFFER_COMPLETE;return a.bindFramebuffer(a.FRAMEBUFFER,null),a.deleteFramebuffer(i),a.deleteTexture(t.tex),e}var ae=`
#define PI 3.14159265359
#define TAU 6.28318530718
float sat(float x){ return clamp(x, 0., 1.); }
float hash11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
mat2 rotm(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec2 rot2(vec2 p, float a){ return rotm(a) * p; }
float hard(float v, float k){ float w = .5 * (1. - k) + .004; return smoothstep(.5 - w, .5 + w, v); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1., 0.)), u.x), mix(hash12(i + vec2(0., 1.)), hash12(i + vec2(1., 1.)), u.x), u.y);
}
float gnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6. - 15.) + 10.);
  vec2 ga = hash22(i) * 2. - 1., gb = hash22(i + vec2(1., 0.)) * 2. - 1.;
  vec2 gc = hash22(i + vec2(0., 1.)) * 2. - 1., gd = hash22(i + vec2(1., 1.)) * 2. - 1.;
  float va = dot(ga, f), vb = dot(gb, f - vec2(1., 0.)), vc = dot(gc, f - vec2(0., 1.)), vd = dot(gd, f - vec2(1., 1.));
  return .5 + .9 * mix(mix(va, vb, u.x), mix(vc, vd, u.x), u.y);
}
float noise3(vec3 p){
  vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3. - 2. * f);
  float a = hash13(i), b = hash13(i + vec3(1., 0., 0.)), c = hash13(i + vec3(0., 1., 0.)), d = hash13(i + vec3(1., 1., 0.));
  float e = hash13(i + vec3(0., 0., 1.)), g = hash13(i + vec3(1., 0., 1.)), h = hash13(i + vec3(0., 1., 1.)), k = hash13(i + vec3(1., 1., 1.));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z);
}
float fbm(vec2 p){
  float v = 0., a = .5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++){ v += a * gnoise(p); p = m * p + 17.1; a *= .5; }
  return v / .96875;
}
float fbm3(vec3 p){
  float v = 0., a = .5;
  for (int i = 0; i < 4; i++){ v += a * noise3(p); p = p * 2.03 + vec3(17.1, 3.7, 9.3); a *= .5; }
  return v / .9375;
}
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h); }
mat3 rotXY(float x, float y){
  float cx = cos(x), sx = sin(x), cy = cos(y), sy = sin(y);
  return mat3(1., 0., 0., 0., cx, sx, 0., -sx, cx) * mat3(cy, 0., -sy, 0., 1., 0., sy, 0., cy);
}
vec2 voro(vec2 x, float t){
  vec2 n = floor(x), f = fract(x); float f1 = 8., f2 = 8.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    vec2 g = vec2(float(i), float(j)); vec2 o = hash22(n + g); o = .5 + .42 * sin(t + TAU * o);
    float d = length(g + o - f);
    if (d < f1){ f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return vec2(f1, f2);
}
`,ye=`
float blendf(float a, float b, int m, float k){
  float r = b;
  if (m == 1) r = a + b;
  else if (m == 2) r = a * b;
  else if (m == 3) r = 1. - (1. - a) * (1. - b);
  else if (m == 4) r = a < .5 ? 2. * a * b : 1. - 2. * (1. - a) * (1. - b);
  else if (m == 5) r = abs(a - b);
  else if (m == 6) r = max(a, b);
  else if (m == 7) r = min(a, b);
  else if (m == 8) r = a * smoothstep(.42, .58, b);
  else if (m == 9) r = a * (1. - smoothstep(.42, .58, b));
  else if (m == 10) r = a - b;
  return clamp(mix(a, r, k), 0., 1.);
}
`;var W=`#version 300 es
precision highp float;
precision highp int;
`,k=`#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0., 1.); }`;function Me(a,t,i){return`${t}|${i?"L":"-"}|${a.join(",")}`}var Te=`
uniform sampler2D uMedia;
uniform vec2 uMediaSize;
uniform int uFit;
uniform float uZoom;
uniform vec2 uPan;
uniform float uMirror;
vec2 mediaUV(vec2 s){
  float ca = uRes.x / uRes.y, ma = uMediaSize.x / max(uMediaSize.y, 1.);
  vec2 k = vec2(1.);
  if (uFit == 0) k = ca > ma ? vec2(1., ma / ca) : vec2(ca / ma, 1.);
  else if (uFit == 1) k = ca > ma ? vec2(ca / ma, 1.) : vec2(1., ma / ca);
  vec2 uv = (s - .5) * k / uZoom + .5 - uPan * vec2(.5, -.5);
  if (uMirror > .5) uv.x = 1. - uv.x;
  return uv;
}
vec4 media(vec2 s){
  vec2 uv = mediaUV(s);
  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) return vec4(0.);
  return texture(uMedia, uv);
}
`;function Ee(a,t,i,e){let n=[...new Set(a)].map(o=>{let s=e[o];if(!s)throw new Error("Patr\xF3n no disponible en la librer\xEDa: "+o);return s}).join(`
`),c=a.map((o,s)=>`
  {
    vec4 A = uLA[${s}], B = uLB[${s}], C = uLC[${s}];
    vec2 q = rot2(p - A.zw, A.y) * A.x;
    PX = uCellP * A.x;
    float x = P_${o}(q, t * B.w + C.y, B.x, B.y);
    x = mix(x, 1. - x, C.x);
    ${s===0?"v = x * B.z;":"v = blendf(v, x, int(C.z), B.z);"}
  }`).join("");return W+`
uniform vec2 uRes;
uniform vec2 uCell;
uniform vec2 uGrid;
uniform float uCellP;
uniform float uTime;
uniform float uLoop;
uniform vec4 uLA[4];
uniform vec4 uLB[4];
uniform vec4 uLC[4];
uniform float uWarp, uWarpScale, uPulse;
uniform float uMediaMix;
uniform int uMediaBlend;
uniform float uMorph;
uniform sampler2D uText;
uniform sampler2D uSim;
uniform float uSimEnc;
uniform int uIMode;
uniform vec2 uPtr;
uniform float uPtrOn, uIStr, uIRad;
out vec4 o;
float PX;
${ae}
${ye}
${t==="media"?Te:""}
${n}
float stack(vec2 p, float t){
  float v = 0.;
  ${c}
  return v;
}
float simH(vec2 c){
  float r = texture(uSim, (c + .5) / uGrid).r;
  return uSimEnc > .5 ? (r - .5) * 4. : r;
}
void main(){
  vec2 cell = floor(gl_FragCoord.xy);
  vec2 px = (cell + .5) * uCell;
  vec2 p = vec2(px.x - .5 * uRes.x, .5 * uRes.y - px.y) / uRes.y;
  vec2 m = vec2(uPtr.x - .5 * uRes.x, .5 * uRes.y - uPtr.y) / uRes.y;
  vec2 dm = p - m;
  float dist = length(dm);
  float fall = uPtrOn * exp(-dist * dist / max(uIRad * uIRad, 1e-5));
  vec4 sim = texture(uSim, (cell + .5) / uGrid);
  vec2 pp = p;
  if (uIMode == 3) pp = m + dm * (1. - .62 * uIStr * fall);
  else if (uIMode == 4) pp = p - normalize(dm + 1e-5) * uIStr * uIRad * .7 * fall;
  else if (uIMode == 5) pp = m + rot2(dm, uIStr * 3.2 * fall);
  else if (uIMode == 2){
    vec2 g = vec2(simH(cell + vec2(1., 0.)) - simH(cell - vec2(1., 0.)), simH(cell - vec2(0., 1.)) - simH(cell + vec2(0., 1.)));
    pp += g * .05 * uIStr;
  }
  pp *= 1. - uPulse * .06;
  vec2 q = pp;
  if (uWarp > 0.){
    vec2 wq = pp * uWarpScale * 1.2;
    q += uWarp * (vec2(fbm(wq + uTime * .15), fbm(wq + vec2(5.2, 1.3) - uTime * .15)) - .5) * 1.6;
  }
  float pv;
  ${i?`
  float tl = mod(uTime, uLoop);
  float w = tl / uLoop;
  pv = mix(stack(q, tl), stack(q, tl - uLoop), w);
  pv = clamp(.5 + (pv - .5) * (1. + .41 * sin(PI * w)), 0., 1.);`:`
  pv = stack(q, uTime);`}
  vec3 col = vec3(1.);
  float l = pv;
  vec2 s = vec2(pp.x * uRes.y + .5 * uRes.x, .5 * uRes.y - pp.y * uRes.y) / uRes;
  vec2 cs = uCell / uRes * .25;
  ${t==="media"?`
  // a cell cut by the canvas edge (the last row or column) samples up to the edge, not the empty space
  // past it (that made a black band along the bottom of some exports)
  vec2 m0 = clamp(s - cs, 0., 1.), m1 = clamp(s + cs, 0., 1.);
  vec4 c4 = (media(m0) + media(vec2(m1.x, m0.y)) + media(vec2(m0.x, m1.y)) + media(m1)) * .25;
  col = c4.rgb;
  float ml = dot(col, vec3(.299, .587, .114));
  l = uMediaMix > 0. ? blendf(ml, pv, uMediaBlend, uMediaMix) : ml;`:""}
  ${t==="text"?`
  float tm = (texture(uText, s + vec2(-cs.x, -cs.y)).r + texture(uText, s + vec2(cs.x, -cs.y)).r
            + texture(uText, s + vec2(-cs.x, cs.y)).r + texture(uText, s + cs).r) * .25;
  l = uMediaMix > 0. ? blendf(tm, pv, uMediaBlend, uMediaMix) : tm;
  if (uMorph > 0.){
    float env = .5 - .5 * cos(TAU * uTime / uMorph);
    l = hash12(cell * 1.37) < smoothstep(.1, .9, env) ? pv : l;
  }`:""}
  if (uIMode == 1) l += uIStr * fall * (.75 + .25 * sin(dist * 40. - uTime * 6.));
  else if (uIMode == 2) l += simH(cell) * .3 * uIStr;
  else if (uIMode == 6) l *= 1. - clamp(sim.b, 0., 1.);
  else if (uIMode == 7) l += sim.b * .85;
  l += uPulse * .22;
  o = vec4(col, clamp(l, 0., 1.));
}`}var we=W+`
uniform sampler2D uPrev;
uniform vec2 uGrid;
uniform vec2 uCell;
uniform vec4 uSeg;
uniform float uBrushR, uStr, uActive, uImpulse, uEnc, uDt;
uniform int uMode;
out vec4 o;
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0., 1.); return length(pa - ba * h); }
float dec(float v){ return uEnc > .5 ? (v - .5) * 4. : v; }
float enc(float h){ return uEnc > .5 ? h * .25 + .5 : h; }
float H(ivec2 c){ ivec2 G = ivec2(uGrid) - 1; return dec(texelFetch(uPrev, clamp(c, ivec2(0), G), 0).r); }
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(uPrev, c, 0);
  float h = dec(s.r), hp = dec(s.g);
  float ky = (uCell.x * uCell.x) / (uCell.y * uCell.y);
  float kx = 1. / max(1., ky), kyy = ky / max(1., ky);
  float lap = kx * (H(c + ivec2(1, 0)) + H(c - ivec2(1, 0)) - 2. * h) + kyy * (H(c + ivec2(0, 1)) + H(c - ivec2(0, 1)) - 2. * h);
  float nh = (2. * h - hp + .45 * lap) * .985;
  vec2 px = (vec2(c) + .5) * uCell;
  float dd = sdSeg(px, uSeg.xy, uSeg.zw) / max(uBrushR, 1.);
  float brush = exp(-dd * dd * 2.5);
  float tr = s.b;
  if (uMode == 2) nh += brush * uStr * (uActive * .35 + uImpulse * 1.6);
  if (uMode == 6) tr = max(tr - uDt * .22, brush * uActive);
  else if (uMode == 7) tr = max(tr * exp(-uDt * .9), brush * uActive * (.4 + uStr * .8));
  else tr = 0.;
  if (uMode != 2) nh = 0.;
  o = vec4(enc(clamp(nh, -1.9, 1.9)), enc(clamp(h, -1.9, 1.9)), clamp(tr, 0., 1.), 1.);
}`,Se=W+`
uniform sampler2D uField;
uniform sampler2D uGrad;
uniform sampler2D uMsg;
uniform sampler2D uWords;
uniform vec2 uGrid;
uniform float uTime;
uniform float uN, uEdgeBase, uEdge, uDither;
uniform int uDitherKind;
uniform float uBright, uContrast, uGamma, uInvert, uLevels;
uniform int uGMode;
uniform float uJitter, uWordsN;
uniform int uCMode, uMap, uIsMedia;
uniform float uShift, uCycle, uHue, uSat, uVivid, uShade, uAspect;
uniform int uMsgOn, uMsgMode;
uniform float uMsgProg, uMsgWin, uMsgShift, uMsgW;
uniform vec3 uMsgColor;
uniform float uMsgUseColor;
uniform vec2 uCursor;
uniform float uCursorOn, uBlockIdx;
uniform int uIMode;
uniform vec2 uPtrCell;
uniform float uPtrOn, uIStr, uIRadCells;
layout(location = 0) out vec4 oC;
layout(location = 1) out vec4 oG;
${ae}
float tone(float l){ l = (l - .5) * uContrast + .5 + uBright; l = clamp(l, 0., 1.); l = pow(l, uGamma); return mix(l, 1. - l, uInvert); }
float L(ivec2 c){ c = clamp(c, ivec2(0), ivec2(uGrid) - 1); return tone(texelFetch(uField, c, 0).a); }
float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(.5, a.y * .75))); }
float bayer4(vec2 a){ return bayer2(.5 * a) * .25 + bayer2(a); }
float bayer8(vec2 a){ return bayer4(.5 * a) * .25 + bayer2(a); }
vec3 hueShift(vec3 c, float a){ vec3 k = vec3(.57735); float ca = cos(a); return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1. - ca); }
float tri(float x){ return 1. - abs(1. - mod(x, 2.)); }
float dec16(vec2 v){ return floor(v.x * 255. + .5) + floor(v.y * 255. + .5) * 256.; }
vec2 enc16(float i){ return vec2(mod(i, 256.), floor(i / 256.)) / 255.; }
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec2 cf = vec2(c);
  vec4 f = texelFetch(uField, c, 0);
  float l = tone(f.a);
  if (uLevels > 1.5) l = floor(l * uLevels * .9999) / (uLevels - 1.);
  float dth = uDitherKind == 0 ? bayer8(cf) : hash12(cf * 1.37 + 11.);
  float lq = clamp(l + (dth - .5) * uDither / max(uN - 1., 1.), 0., 1.);
  float idx = floor(lq * (uN - 1.) + .5);
  float alpha = 1.;
  float flags = 0.;
  float inten = mix(1., l, uShade);

  if (uGMode == 2){
    float h = hash12(cf * 1.31 + floor(uTime * (1. + uJitter * 14.) + hash12(cf) * 8.) * .73);
    idx = l < .06 ? 0. : floor(mix(uN * .35, uN - .01, h));
    inten = mix(inten, l, .85);
  } else if (uGMode == 3){
    float k = cf.y * uGrid.x + cf.x + floor(uTime * uJitter * 8.);
    vec4 wv = texelFetch(uWords, ivec2(int(mod(k, uWordsN)), 0), 0);
    idx = dec16(wv.rg) - 1.;
    alpha = smoothstep(.03, .14, l);
    inten = mix(inten, l, .85);
  } else if (uGMode == 1){
    idx = 0.;
  }
  if (uEdge > 0. || uGMode == 1){
    float tl = L(c + ivec2(-1, -1)), tc = L(c + ivec2(0, -1)), tr = L(c + ivec2(1, -1));
    float ml = L(c + ivec2(-1, 0)), mr = L(c + ivec2(1, 0));
    float bl = L(c + ivec2(-1, 1)), bc = L(c + ivec2(0, 1)), br = L(c + ivec2(1, 1));
    float gx = (tr + 2. * mr + br) - (tl + 2. * ml + bl);
    float gy = (tl + 2. * tc + tr) - (bl + 2. * bc + br);
    float e = uGMode == 1 ? max(uEdge, .35) : uEdge;
    if (length(vec2(gx, gy)) > mix(2.2, .12, e)){
      float an = atan(gy, gx); if (an < 0.) an += PI;
      idx = uEdgeBase + mod(floor(an / .7853982 + .5), 4.);
      alpha = 1.;
      if (uGMode == 1) inten = 1.;
    }
  }
  if (uIMode == 8){
    vec2 d = (cf - uPtrCell) * vec2(1., uAspect);
    float k = uPtrOn * exp(-dot(d, d) / max(uIRadCells * uIRadCells, 1.));
    float tt = floor(uTime * 18.);
    if (hash12(cf + tt * 1.7) < k * uIStr * 1.3){
      idx = 1. + floor(hash12(cf * .7 + tt) * max(uN - 1., 1.));
      l = max(l, .7); inten = max(inten, .9); alpha = 1.;
    }
  }

  float g = l;
  vec2 uv = (cf + .5) / uGrid;
  if (uMap == 1) g = uv.x;
  else if (uMap == 2) g = 1. - uv.y;
  else if (uMap == 3) g = length((uv - .5) * vec2(uGrid.x / (uGrid.y * uAspect), 1.)) * 1.5;
  else if (uMap == 4) g = atan(uv.y - .5, (uv.x - .5) * uGrid.x / (uGrid.y * uAspect)) / TAU + .5;
  else if (uMap == 5) g = smoothstep(.25, .75, fbm(uv * vec2(uGrid.x / (uGrid.y * uAspect), 1.) * 2.2 + uTime * .03));
  g = tri(g + uShift + uCycle * uTime);
  vec3 base = texture(uGrad, vec2(g, .5)).rgb;
  if (uCMode == 1 && uIsMedia == 1){
    base = f.rgb;
    float mx = max(max(base.r, base.g), base.b);
    base = mix(base, base / max(mx, .04), uVivid);
  }
  if (uHue > 0.) base = hueShift(base, uHue * TAU);
  float gr = dot(base, vec3(.299, .587, .114));
  base = clamp(mix(vec3(gr), base, uSat), 0., 1.);

  if (uMsgOn == 1){
    ivec2 mc = ivec2(int(mod(cf.x + uMsgShift, uMsgW)), c.y);
    vec4 m = texelFetch(uMsg, mc, 0);
    float mi = dec16(m.rg) - 1.;
    if (mi >= 0.){
      float ord = dec16(m.ba);
      vec3 mcol = uMsgUseColor > .5 ? uMsgColor : texture(uGrad, vec2(1., .5)).rgb;
      bool shown = (uMsgMode == 0 || uMsgMode == 3) || ord < floor(uMsgProg);
      bool scr = uMsgMode == 2 && !shown && ord < floor(uMsgProg) + uMsgWin;
      if (shown){ idx = mi; base = mcol; inten = 1.; alpha = 1.; flags = 1.; }
      else if (scr){ idx = 1. + floor(hash12(cf + floor(uTime * 24.)) * max(uN - 1., 1.)); base = mcol; inten = .85; alpha = 1.; flags = 1.; }
    }
  }
  if (uCursorOn > .5 && all(equal(c, ivec2(uCursor)))){
    idx = uBlockIdx; base = uMsgUseColor > .5 ? uMsgColor : texture(uGrad, vec2(1., .5)).rgb; inten = 1.; alpha = 1.; flags = 1.;
  }
  oC = vec4(base * inten, l);
  oG = vec4(enc16(idx), flags / 255., alpha);
}`,Re=W+`
uniform sampler2D uSrc;
uniform vec2 uDir;
uniform float uFromSelect;
out vec4 o;
vec3 S(ivec2 c){
  ivec2 G = textureSize(uSrc, 0) - 1;
  vec4 v = texelFetch(uSrc, clamp(c, ivec2(0), G), 0);
  return uFromSelect > .5 ? v.rgb * v.a : v.rgb;
}
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  ivec2 d = ivec2(uDir);
  vec3 acc = S(c) * .227027;
  acc += (S(c + d) + S(c - d)) * .1945946;
  acc += (S(c + 2 * d) + S(c - 2 * d)) * .1216216;
  acc += (S(c + 3 * d) + S(c - 3 * d)) * .054054;
  acc += (S(c + 4 * d) + S(c - 4 * d)) * .016216;
  o = vec4(acc, 1.);
}`,Ae=W+`
uniform sampler2D uC;
uniform sampler2D uG;
uniform sampler2D uAtlas;
uniform sampler2D uBloom;
uniform sampler2D uPrev;
uniform sampler2D uSimT;
uniform vec2 uRes;
uniform vec2 uCell;
uniform vec2 uGrid;
uniform float uAtlasCols;
uniform vec3 uBg;
uniform vec3 uAccent;
uniform float uCellBg, uGlow, uBloomAmt, uScan, uVig, uCurve, uChroma, uGrain, uFlicker, uGridAmt, uTime, uMsgBox;
uniform float uTrans, uTransparent, uReveal, uEraseReveal, uHasMedia, uN;
uniform int uTransKind;
uniform vec2 uTransOrigin;
uniform float uTransDir, uTransSeed;
${Te}
out vec4 o;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float glyphCov(float idx, ivec2 ic){
  ivec2 ac = ivec2(int(mod(idx, uAtlasCols)), int(floor(idx / uAtlasCols))) * ivec2(uCell) + ic;
  return texelFetch(uAtlas, ac, 0).a;
}
// Mosaico's block size in cells at progress p: 16, 8, 4, 2, 1
float mosaicBlock(float p){ return float(16 >> min(4, int(p * 5.))); }
// Transition state of a cell of the screen grid at progress p (see engine/transitions.ts; ported to JS in
// basic/transition.ts): x = 0 the new piece, 1 the old frame, 2 a glyph of the ramp (index y) in the accent.
vec2 transCell(vec2 cell, float p){
  float N1 = max(uN - 1., 1.);
  vec2 g = uGrid;
  float u = (cell.x + .5) / g.x, v = (cell.y + .5) / g.y;
  if (uTransDir < 0.) u = 1. - u;
  if (uTransKind == 1){
    // disoluci\xF3n: each cell at its own moment, down the ramp from dense to empty, then the new piece
    float s = hash12(cell * 1.37 + vec2(7.1, uTransSeed)) * .7;
    float lp = (p - s) / .3;
    if (lp < 0.) return vec2(1., 0.);
    if (lp >= 1.) return vec2(0.);
    return vec2(2., floor((1. - lp) * N1 + .5));
  }
  if (uTransKind == 2){
    // lluvia: columns fall at their own pace, a trail of scrambled glyphs ahead of the new piece
    float d = hash12(vec2(cell.x * 1.7 + uTransSeed, 3.1)) * .45;
    float tail = max(3., floor(g.y * .12));
    float front = clamp((p - d) / .55, 0., 1.) * (g.y + tail);
    if (cell.y < front - tail) return vec2(0.);
    if (cell.y < front) return vec2(2., cell.y >= front - 1. ? N1 : 1. + floor(hash12(cell + floor(uTime * 24.)) * N1));
    return vec2(1., 0.);
  }
  if (uTransKind == 3){
    // iris: a ring of glyphs opens from the origin (the centre, or where the pointer was)
    vec2 o = uTransOrigin * uRes;
    float r = length((cell + .5) * uCell - o) / uCell.x;
    float maxr = length(max(o, uRes - o)) / uCell.x + 1.;
    float rad = p * (maxr + 2.5);
    if (r < rad - 2.5) return vec2(0.);
    if (r < rad) return vec2(2., 1. + floor(hash12(cell + floor(uTime * 30.)) * N1));
    return vec2(1., 0.);
  }
  if (uTransKind == 4){
    // barrido: a diagonal scan, densest glyph at its front
    float h = u * .7 + v * .3;
    float front = p * 1.14;
    if (h < front - .14) return vec2(0.);
    if (h < front) return vec2(2., floor((h - front + .14) / .14 * N1 + .5));
    return vec2(1., 0.);
  }
  if (uTransKind == 5){
    // mosaico: blocks of the new piece appear, then the blocks halve down to single cells (see main)
    vec2 blk = floor(cell / mosaicBlock(p));
    if (p < .2 && hash12(blk * 1.31 + uTransSeed) > p * 5.) return vec2(1., 0.);
    return vec2(0.);
  }
  // tejido: a scrambled weave crosses the piece
  float h = hash12(cell * 1.13 + uTransSeed) * .3 + u * .55 + v * .15;
  float prog = p * 1.3 - .15;
  if (h > prog + .07) return vec2(1., 0.);
  if (h > prog) return vec2(2., 1. + floor(hash12(cell + floor(uTime * 30.)) * N1));
  return vec2(0.);
}
vec4 shade(vec2 pt){
  ivec2 cell = ivec2(floor(pt / uCell));
  if (pt.x < 0. || pt.y < 0. || cell.x >= int(uGrid.x) || cell.y >= int(uGrid.y)) return vec4(uBg * (1. - uTransparent), 1. - uTransparent);
  vec4 c = texelFetch(uC, cell, 0);
  vec4 g = texelFetch(uG, cell, 0);
  float idx = floor(g.r * 255. + .5) + floor(g.g * 255. + .5) * 256.;
  ivec2 ic = clamp(ivec2(floor(pt)) - cell * ivec2(uCell), ivec2(0), ivec2(uCell) - 1);
  float cov = glyphCov(idx, ic) * g.a;
  float flags = floor(g.b * 255. + .5);
  vec2 lc = (vec2(ic) + .5) / uCell - .5;
  float fillA = uCellBg * c.a;
  float glowA = uGlow * c.a * exp(-dot(lc, lc) * 7.) * .55;
  vec3 ink = c.rgb;
  if (uReveal > 0. || uEraseReveal > 0.){
    float r = uReveal;
    if (uEraseReveal > 0.) r = max(r, texture(uSimT, (vec2(cell) + .5) / uGrid).b * uEraseReveal);
    if (r > 0. && uHasMedia > .5){
      vec3 mcol = media(pt / uRes).rgb;
      if (uTransparent < .5) return vec4(mix(mix(mix(uBg, ink, fillA) + ink * glowA, ink, cov), mcol, r), 1.);
    }
  }
  if (uTransparent > .5){
    vec3 pc = ink * fillA; float pa = fillA;
    pc += ink * glowA * (1. - pa); pa += glowA * (1. - pa);
    if (flags > .5){ pc = mix(pc, uBg, uMsgBox); pa = mix(pa, 1., uMsgBox); }
    pc = ink * cov + pc * (1. - cov); pa = cov + pa * (1. - cov);
    return vec4(pc, pa);
  }
  vec3 bgc = mix(uBg, ink, fillA) + ink * glowA;
  if (flags > .5) bgc = mix(bgc, uBg, uMsgBox);
  return vec4(mix(bgc, ink, cov), 1.);
}
void main(){
  vec2 fc = gl_FragCoord.xy;
  // transitions work on the screen grid (the cells as drawn, before any CRT curvature)
  vec2 ps = vec2(fc.x, uRes.y - fc.y);
  vec2 tc = floor(ps / uCell);
  vec2 pt = ps;
  if (uTrans >= 0. && uTransKind == 5){
    // mosaico: each block shows its centre cell, magnified
    float B = mosaicBlock(uTrans);
    if (B > 1.){
      vec2 bo = floor(tc / B) * B;
      vec2 c = min(bo + floor(B * .5), uGrid - 1.);
      pt = c * uCell + (ps - bo * uCell) / B;
    }
  }
  float edgeMask = 1.;
  if (uCurve > 0.){
    vec2 uv = pt / uRes * 2. - 1.;
    uv *= 1. + uCurve * .14 * dot(uv, uv) - uCurve * .1;
    edgeMask = smoothstep(1., .985, max(abs(uv.x), abs(uv.y)));
    pt = (uv * .5 + .5) * uRes;
  }
  vec4 s = shade(pt);
  vec3 col = s.rgb;
  float alpha = s.a;
  if (uChroma > 0.){
    float off = uChroma * uCell.x * .45;
    col.r = shade(pt + vec2(off, 0.)).r;
    col.b = shade(pt - vec2(off, 0.)).b;
  }
  if (uTransparent < .5){
    if (uBloomAmt > 0.) col += texture(uBloom, pt / uCell / uGrid).rgb * uBloomAmt * 1.4;
    if (uGridAmt > 0.){
      vec2 f = fract(pt / uCell);
      float gl = step(f.x * uCell.x, 1.) + step(f.y * uCell.y, 1.);
      col = mix(col, mix(uBg, uAccent, .35), clamp(gl, 0., 1.) * uGridAmt * .6);
    }
  }
  if (uScan > 0.) col *= 1. - uScan * .45 * (.5 + .5 * cos(fc.y * 1.5708));
  if (uVig > 0.){ vec2 vv = fc / uRes - .5; col *= 1. - uVig * dot(vv, vv) * 2.2; }
  if (uFlicker > 0.) col *= 1. - uFlicker * .12 * (.5 + .5 * sin(uTime * 53.)) * hash12(vec2(floor(uTime * 12.), 3.));
  if (uGrain > 0. && uTransparent < .5) col += (hash12(fc + fract(uTime * 13.7) * 311.) - .5) * uGrain * .16;
  col *= edgeMask;
  if (uTrans >= 0.){
    vec2 st = transCell(tc, uTrans);
    if (st.x > 1.5){
      ivec2 ic = clamp(ivec2(floor(ps)) - ivec2(tc) * ivec2(uCell), ivec2(0), ivec2(uCell) - 1);
      float cv = glyphCov(st.y, ic);
      col = mix(uTransparent > .5 ? vec3(0.) : uBg, uAccent, cv);
      alpha = uTransparent > .5 ? cv : 1.;
    } else if (st.x > .5){
      vec4 pv = texelFetch(uPrev, ivec2(fc), 0);
      col = pv.rgb; alpha = pv.a;
    }
  }
  col = clamp(col, 0., 1.);
  if (uTransparent > .5){ o = vec4(alpha > 0. ? col / max(alpha, 1e-4) : vec3(0.), alpha); o.rgb = clamp(o.rgb, 0., 1.); }
  else o = vec4(col, 1.);
}`;function Pe(a,t,i,e,r){let n=Math.round(Math.max(256,Math.min(1600,t*.75))),c=Math.max(64,Math.round(n*i/Math.max(t,1)));a.width=n,a.height=c;let o=a.getContext("2d");o.fillStyle="#000",o.fillRect(0,0,n,c);let s=String(e.content||"").split(`
`),d=`${e.italic?"italic ":""}${e.weight} `,f=e.tracking,u=(y,b)=>(o.font=d+b+"px "+r,o.measureText(y).width+Math.max(0,Array.from(y).length-1)*f*b),h=1;for(let y of s)h=Math.max(h,u(y,100));let g=e.leading*1.02,v=Math.max(4,Math.min(100*n*.9/h,c*.86/(s.length*g))*e.size);o.font=d+v+"px "+r,o.fillStyle="#fff",o.textBaseline="middle";let x=n*.05,S=c/2-(s.length-1)*v*g/2;s.forEach((y,b)=>{let T=u(y,v),E=e.align==="left"?x:e.align==="right"?n-x-T:(n-T)/2,M=S+b*v*g;if(f===0)o.textAlign="left",o.fillText(y,E,M);else{o.textAlign="left";for(let C of Array.from(y))o.fillText(C,E,M),E+=o.measureText(C).width+f*v}})}function Fe(a,t,i,e,r,n,c,o){let s=[];if(c){let b=Array.from(a.replace(/\s*\n\s*/g,"   ")),E=Math.max(t,b.length+6),M=Math.max(0,Math.min(i-1,Math.round((i-1)*r))),C=new Uint8Array(E*i*4);return b.forEach((V,P)=>{let F=(M*E+P)*4,U=o(V)+1;C[F]=U&255,C[F+1]=U>>8,C[F+2]=P&255,C[F+3]=P>>8,s.push([P,M])}),{data:C,width:E,count:b.length,cells:s}}let d=Math.max(4,t-2),f=[];for(let b of String(a).split(`
`)){let T=[];for(let E of b.split(/(\s+)/).filter(Boolean)){let M=Array.from(E);if(/^\s+$/.test(E)){T.length&&T.length+M.length<=d&&T.push(...M.map(()=>" "));continue}if(T.length+M.length>d)for(T.length&&(f.push(Ce(T)),T=[]);M.length>d;)f.push(M.splice(0,d));T.push(...M)}f.push(Ce(T))}let u=f.slice(0,Math.max(1,i-1)),h=Math.max(...u.map(b=>b.length),1),g=u.length,v=Math.round((t-h)*e),x=Math.round((i-g)*r),S=new Uint8Array(t*i*4),y=0;return u.forEach((b,T)=>{let E=n==="left"?0:n==="right"?h-b.length:Math.floor((h-b.length)/2),M=x+T;b.forEach((C,V)=>{let P=v+E+V;if(P<0||P>=t||M<0||M>=i){y++;return}let F=(M*t+P)*4,U=o(C)+1;S[F]=U&255,S[F+1]=U>>8,S[F+2]=y&255,S[F+3]=y>>8,s.push([P,M]),y++}),y++,s.push([Math.min(t-1,v+E+b.length),M])}),{data:S,width:t,count:y,cells:s}}function Ce(a){let t=a.length;for(;t&&/\s/.test(a[t-1]);)t--;return a.slice(0,t)}function Le(a,t,i){let e=Math.max(1,t),r=Math.max(.5,a.speed),n=i*1.7%1<.55;if(a.mode==="static")return{prog:e+1,cursor:e,cursorOn:a.cursor&&n,shift:0};if(a.mode==="marquee")return{prog:e+1,cursor:-1,cursorOn:!1,shift:i*r};let c=e/r,o=a.hold,s=e/(r*(a.mode==="decode"?4:2.6)),f=c+o+s+.7,u=(i%f+f)%f,h,g=!1;u<c?h=u*r:u<c+o?(h=e,g=!0):u<c+o+s?h=e-(u-c-o)*r*(a.mode==="decode"?4:2.6):(h=0,g=!0);let v=Math.min(e-1,Math.floor(h));return{prog:h,cursor:v,cursorOn:a.mode==="type"&&a.cursor&&(!g||n),shift:0}}var st=[{id:"tejido",name:"Tejido",blurb:"una trama de glifos cruza la pieza"},{id:"disolucion",name:"Disoluci\xF3n",blurb:"cada celda se deshace por la rampa de glifos"},{id:"lluvia",name:"Lluvia",blurb:"la pieza nueva cae en columnas"},{id:"iris",name:"Iris",blurb:"se abre en c\xEDrculo desde el centro o desde el puntero"},{id:"barrido",name:"Barrido",blurb:"un escaneo en diagonal"},{id:"mosaico",name:"Mosaico",blurb:"de celdas grandes a finas",heavy:!0}],Be={tejido:0,disolucion:1,lluvia:2,iris:3,barrido:4,mosaico:5},ne={kind:"tejido",duration:.85};function Ge(a){if(!a)return null;if(a===!0)return ne;let t=st.some(i=>i.id===a.kind)?a.kind:"tejido";return{...a,kind:t,duration:Math.min(3,Math.max(.12,Number.isFinite(a.duration)?a.duration:.85))}}var Ie=(a,t)=>a.source==="text"?"text":a.source==="pattern"?"pattern":t?"media":"pattern",lt=700,X=(a,t)=>!t||a.getSyncParameter(t,a.SYNC_STATUS)===a.SIGNALED,j=class a{constructor(t,i,e){m(this,"kind","webgl2");m(this,"canvas");m(this,"gl");m(this,"o");m(this,"r");m(this,"fonts");m(this,"lib");m(this,"quad");m(this,"vao");m(this,"progs",new Map);m(this,"pSim");m(this,"pSel");m(this,"pBlur");m(this,"pComp");m(this,"tField");m(this,"fbField");m(this,"tSelC");m(this,"tSelG");m(this,"fbSel");m(this,"tSim",[]);m(this,"fbSim",[]);m(this,"simIdx",0);m(this,"tBloomA");m(this,"tBloomB");m(this,"fbBloomA");m(this,"fbBloomB");m(this,"tAtlas");m(this,"tGrad");m(this,"tMedia");m(this,"tText");m(this,"tMsg");m(this,"tWords");m(this,"prevT",[null,null]);m(this,"prevFb",[null,null]);m(this,"prevIdx",0);m(this,"tWarm");m(this,"fbWarm");m(this,"halfFloat",!1);m(this,"maxTex",4096);m(this,"parallel",null);m(this,"pending",null);m(this,"q",{});m(this,"adaptiveHold",0);m(this,"cssW",1);m(this,"cssH",1);m(this,"pr",1);m(this,"prCap",1);m(this,"W",1);m(this,"H",1);m(this,"cw",8);m(this,"ch",11);m(this,"cols",1);m(this,"rows",1);m(this,"atlas",null);m(this,"atlasCanvas",null);m(this,"atlasKey","");m(this,"textCanvas",null);m(this,"textKey","");m(this,"msg",null);m(this,"msgKey","");m(this,"wordsKey","");m(this,"wordsN",1);m(this,"gradKey","");m(this,"grad",new Uint8Array(4));m(this,"media",{});m(this,"mediaUploaded",null);m(this,"mediaTime",-1);m(this,"mediaW",1);m(this,"mediaH",1);m(this,"mediaOK",!1);m(this,"simMode","");m(this,"t",0);m(this,"realT",0);m(this,"playing");m(this,"raf",0);m(this,"last",0);m(this,"lastDraw",0);m(this,"alive",!0);m(this,"lost",!1);m(this,"visible",!0);m(this,"needsRender",!0);m(this,"sizeDirty",!0);m(this,"trans",-1);m(this,"transStart",NaN);m(this,"transElapsed",0);m(this,"transSpec",ne);m(this,"frames",0);m(this,"fps",0);m(this,"fpsT",0);m(this,"ema",16);m(this,"slow",0);m(this,"fast",0);m(this,"fontGen",0);m(this,"ptr",{x:-1e4,y:-1e4,tx:-1e4,ty:-1e4,px:-1e4,py:-1e4,on:0,targetOn:0,down:!1,lastReal:-1e9,impulse:0,moved:0});m(this,"ro",null);m(this,"io",null);m(this,"cleanup",[]);m(this,"loop",t=>{if(!this.alive)return;if(this.raf=requestAnimationFrame(this.loop),!this.visible||this.lost){this.last=0;return}this.pending&&this.stepPending(performance.now());let i=this.q.maxFps??0;if(i>0&&this.lastDraw&&t-this.lastDraw<1e3/i-2)return;let e=this.last?(t-this.last)/1e3:0,r=Math.min(.1,e);this.last=t,this.realT+=r,this.playing&&(this.t+=r*this.r.motion.speed),this.trans>=0&&!Number.isNaN(this.transStart)&&(this.transElapsed+=Math.min(.2,e));let n=this.stepPointer(r,t),c=this.r.source==="video"||this.r.source==="camera",o=["ripple","erase","paint"].includes(this.r.interact.mode);if(this.playing||this.needsRender||n||c||o||this.trans>=0){this.needsRender=!1,this.lastDraw=t;let s=performance.now(),d=this.trans>=0;this.render(r),this.measure(t,performance.now()-s,r,d)}});m(this,"transparent",!1);m(this,"externalPulse",0);this.canvas=t,this.o=e,this.lib=e.library,this.r=z(i),this.fonts=e.fonts??ve({google:e.googleFonts??!0}),this.playing=(e.autoplay??!0)&&!e.reducedMotion;let r=t.getContext("webgl2",{antialias:!1,alpha:e.alpha??!1,premultipliedAlpha:!1,depth:!1,stencil:!1,preserveDrawingBuffer:e.preserveDrawingBuffer??!1,powerPreference:"high-performance"});if(!r)throw new Error("webgl2");this.gl=r,this.initGL(),e.fixedSize&&this.resize(),this.requestFonts();let n=o=>{o.preventDefault(),this.lost=!0;let s=this.pending;this.pending=null,this.trans=-1,s&&this.applyRecipe(s.r)},c=()=>{this.lost=!1,this.progs.clear(),this.initGL(),this.invalidate()};t.addEventListener("webglcontextlost",n),t.addEventListener("webglcontextrestored",c),this.cleanup.push(()=>{t.removeEventListener("webglcontextlost",n),t.removeEventListener("webglcontextrestored",c)}),!e.fixedSize&&typeof ResizeObserver<"u"&&(this.ro=new ResizeObserver(()=>{this.sizeDirty=!0,this.needsRender=!0}),this.ro.observe(t)),e.observeVisibility&&typeof IntersectionObserver<"u"&&(this.io=new IntersectionObserver(o=>{this.visible=o.some(s=>s.isIntersecting),this.visible&&(this.needsRender=!0)}),this.io.observe(t)),(e.interactive??!0)&&this.bindPointer(),e.fixedSize||(this.raf=requestAnimationFrame(this.loop))}get recipe(){return z(this.pending?.r??this.r)}get time(){return this.t}set time(t){this.t=t,this.needsRender=!0}get isPlaying(){return this.playing}get stats(){return{cols:this.cols,rows:this.rows,fps:this.fps,pixelRatio:this.pr,width:this.W,height:this.H,ms:this.ema}}get glyphChars(){return this.atlas?this.atlas.chars.slice():[]}get busy(){return!!this.pending||this.trans>=0}set(t,i={}){let e=this.o.reducedMotion?null:Ge(i.transition),r=z(t);if(this.o.fixedSize||this.lost||!this.atlas){this.dropPending(),e&&this.atlas&&!this.lost&&this.captureTransition(e),this.applyRecipe(r);return}let n=this.fieldKeyOf(r),c=!this.progs.has(n),o=this.pending;if(!o&&!e&&!c){this.applyRecipe(r);return}if(o?(o.key!==n&&(this.dropPendingGL(o),o.key=n,o.frames=0),o.r=r,o.trans=e??o.trans,o.fonts=!1):o=this.pending={r,trans:e,since:performance.now(),frames:0,key:n,prog:null,compiled:null,warm:null,fonts:!1},c&&!o.prog)try{o.prog=ee(this.gl,k,this.fieldSource(r,n)),o.compiled=this.fence()}catch{}let s=o;this.fontsFor(r).then(()=>{this.pending===s&&s.r===r&&(s.fonts=!0)}),this.needsRender=!0}applyRecipe(t){let i=this.r;this.r=t,(i.glyph.cell!==t.glyph.cell||i.glyph.aspect!==t.glyph.aspect)&&(this.sizeDirty=!0),(i.glyph.font!==t.glyph.font||i.glyph.weight!==t.glyph.weight||i.glyph.charset!==t.glyph.charset||i.glyph.words!==t.glyph.words||i.msg.text!==t.msg.text||i.source!==t.source||i.text.font!==t.text.font||i.text.weight!==t.text.weight||i.text.italic!==t.text.italic||i.text.content!==t.text.content)&&this.requestFonts(),i.source!==t.source&&(this.mediaUploaded=null,this.mediaOK=!1),this.needsRender=!0}dropPendingGL(t){if(t.prog){try{re(this.gl,t.prog)}catch{}t.prog=null}for(let i of["compiled","warm"]){let e=t[i];if(e){try{this.gl.deleteSync(e)}catch{}t[i]=null}}}fence(){let t=this.gl.fenceSync(this.gl.SYNC_GPU_COMMANDS_COMPLETE,0);return this.gl.flush(),t}dropPending(){this.pending&&this.dropPendingGL(this.pending),this.pending=null}stepPending(t){let i=this.pending,e=this.gl,r=t-i.since>lt;i.frames++,!(i.prog&&(!(this.parallel?te(e,i.prog,this.parallel):X(e,i.compiled))&&!r||(this.adoptProgram(i),!r&&!this.lost&&(i.warm=this.warmUp(i.key)),!r)))&&(i.warm&&!r&&!X(e,i.warm)||i.trans&&!i.fonts&&!r||this.applyPending())}adoptProgram(t){let i=t.prog;if(i){t.prog=null;try{this.cacheProgram(t.key,ie(this.gl,i))}catch(e){this.o.onError?.(e.message)}}}warmUp(t){let i=this.progs.get(t),e=this.gl;if(!i)return null;e.bindVertexArray(this.vao),e.bindFramebuffer(e.FRAMEBUFFER,this.fbWarm),e.viewport(0,0,1,1),e.useProgram(i.prog),e.drawArrays(e.TRIANGLES,0,3),e.bindFramebuffer(e.FRAMEBUFFER,null);let r=e.fenceSync(e.SYNC_GPU_COMMANDS_COMPLETE,0);return e.flush(),r}async compileAhead(){if(this.lost)return;let t=this.gl,i=this.fieldKeyOf(this.r);if(this.progs.has(i))return;let e;try{e=ee(t,k,this.fieldSource(this.r,i))}catch{return}let r=this.fence(),n=performance.now(),c=()=>new Promise(o=>setTimeout(o,16));for(await c();this.alive&&!this.lost&&(this.parallel?!te(t,e,this.parallel):!X(t,r))&&performance.now()-n<2e3;)await c();if(r&&!this.lost&&t.deleteSync(r),!(!this.alive||this.lost)){if(this.progs.has(i)){re(t,e);return}try{this.cacheProgram(i,ie(t,e))}catch(o){this.o.onError?.(o.message)}}}async snapshot(t,i,e,r){let n=this.gl;if(this.lost)return null;t=Math.max(0,Math.min(this.W-1,Math.round(t))),i=Math.max(0,Math.min(this.H-1,Math.round(i))),e=Math.max(1,Math.min(this.W-t,Math.round(e))),r=Math.max(1,Math.min(this.H-i,Math.round(r)));let c=e*r*4,o=n.createBuffer();n.bindFramebuffer(n.FRAMEBUFFER,null),n.bindBuffer(n.PIXEL_PACK_BUFFER,o),n.bufferData(n.PIXEL_PACK_BUFFER,c,n.STREAM_READ),n.readPixels(t,this.H-i-r,e,r,n.RGBA,n.UNSIGNED_BYTE,0),n.bindBuffer(n.PIXEL_PACK_BUFFER,null);let s=this.fence(),d=performance.now();for(;!this.lost&&!X(n,s)&&performance.now()-d<4e3;)await new Promise(g=>setTimeout(g,8));if(this.lost)return null;let f=new Uint8Array(c);n.bindBuffer(n.PIXEL_PACK_BUFFER,o),n.getBufferSubData(n.PIXEL_PACK_BUFFER,0,f),n.bindBuffer(n.PIXEL_PACK_BUFFER,null),n.deleteBuffer(o),s&&n.deleteSync(s);let u=new ImageData(e,r),h=e*4;for(let g=0;g<r;g++)u.data.set(f.subarray((r-1-g)*h,(r-g)*h),g*h);return u}applyPending(){let t=this.pending;t&&(this.adoptProgram(t),this.dropPendingGL(t),this.pending=null,t.trans&&this.atlas&&!this.lost&&this.captureTransition(t.trans),this.applyRecipe(t.r))}fontsFor(t){let i=_(t.glyph.charset+(t.msg.on?t.msg.text:"")+(t.glyph.mode==="words"?t.glyph.words:"")).join("").slice(0,200)||"Aa",e=[this.fonts.ensure(t.glyph.font,t.glyph.weight,!1,i)];return t.source==="text"&&e.push(this.fonts.ensure(t.text.font,t.text.weight,t.text.italic,t.text.content.slice(0,120)||"Aa")),Promise.all(e).catch(()=>{})}setFixedSize(t,i,e){if(!this.o.fixedSize)return;let r=this.o.fixedSize;r.width===t&&r.height===i&&r.pixelRatio===e||(this.o={...this.o,fixedSize:{width:t,height:i,pixelRatio:e}},this.sizeDirty=!0,this.needsRender=!0)}holdAdaptive(t){this.adaptiveHold=t}setQuality(t){this.q={...t},this.sizeDirty=!0,this.needsRender=!0}play(){this.playing||(this.playing=!0,this.needsRender=!0)}pause(){this.playing=!1,this.needsRender=!0}setMedia(t,i){this.media[t]=i,this.mediaUploaded=null,this.mediaOK=!1,this.needsRender=!0}hasMedia(t){return!!this.media[t]}async ready(){await this.requestFonts(),this.atlasKey="",this.textKey="",this.o.fixedSize&&await this.compileAhead()}renderAt(t,i=t){this.applyPending(),this.t=t,this.realT=i,this.render(0)}renderNow(){this.applyPending(),this.render(0)}drawTo(t,i,e){this.renderNow(),t.drawImage(this.canvas,0,0,i,e)}readGrid(){this.renderNow();let t=this.gl,i=this.cols*this.rows,e=new Uint8Array(i*4),r=new Uint8Array(i*4);t.bindFramebuffer(t.FRAMEBUFFER,this.fbSel),t.readBuffer(t.COLOR_ATTACHMENT0),t.readPixels(0,0,this.cols,this.rows,t.RGBA,t.UNSIGNED_BYTE,e),t.readBuffer(t.COLOR_ATTACHMENT1),t.readPixels(0,0,this.cols,this.rows,t.RGBA,t.UNSIGNED_BYTE,r),t.readBuffer(t.COLOR_ATTACHMENT0),t.bindFramebuffer(t.FRAMEBUFFER,null);let n=new Array(i),c=new Uint8Array(i*3),o=new Uint8Array(i),s=new Uint8Array(i),d=new Uint8Array(i),f=this.atlas?.chars??[" "];for(let u=0;u<i;u++){let h=r[u*4]+r[u*4+1]*256;n[u]=f[h]??" ",c[u*3]=e[u*4],c[u*3+1]=e[u*4+1],c[u*3+2]=e[u*4+2],s[u]=e[u*4+3],d[u]=r[u*4+2],o[u]=r[u*4+3]}return{cols:this.cols,rows:this.rows,chars:n,rgb:c,alpha:o,lum:s,flags:d,bg:this.r.color.bg,cw:this.cw,ch:this.ch}}accent(){return"#"+Z(this.grad,1).map(i=>Math.round(i*255).toString(16).padStart(2,"0")).join("")}setPointer(t,i,e){this.ptr.tx=t*this.W,this.ptr.ty=i*this.H,this.ptr.targetOn=e?1:0,this.ptr.lastReal=performance.now()}destroy(){this.alive=!1,cancelAnimationFrame(this.raf),this.dropPending(),this.ro?.disconnect(),this.io?.disconnect(),this.cleanup.forEach(t=>t()),this.cleanup=[];try{this.gl.getExtension("WEBGL_lose_context")?.loseContext()}catch{}}initGL(){let t=this.gl;this.maxTex=Math.min(8192,t.getParameter(t.MAX_TEXTURE_SIZE)),this.halfFloat=xe(t),this.parallel=t.getExtension("KHR_parallel_shader_compile"),t.pixelStorei(t.UNPACK_FLIP_Y_WEBGL,!1),t.pixelStorei(t.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),t.pixelStorei(t.UNPACK_ALIGNMENT,1),this.vao=t.createVertexArray(),t.bindVertexArray(this.vao),this.quad=t.createBuffer(),t.bindBuffer(t.ARRAY_BUFFER,this.quad),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.disable(t.DEPTH_TEST),t.disable(t.BLEND),this.pSim=O(t,k,we),this.pSel=O(t,k,Se),this.pBlur=O(t,k,Re),this.pComp=O(t,k,Ae),this.tField=w(t,1,1),this.fbField=I(t,this.tField),this.tSelC=w(t,1,1),this.tSelG=w(t,1,1),this.fbSel=I(t,this.tSelC,this.tSelG);let i=this.halfFloat?{internal:t.RGBA16F,format:t.RGBA,type:t.HALF_FLOAT,filter:t.LINEAR}:{filter:t.LINEAR};this.tSim=[w(t,1,1,i),w(t,1,1,i)],this.fbSim=this.tSim.map(e=>I(t,e)),this.tBloomA=w(t,1,1,{filter:t.LINEAR}),this.tBloomB=w(t,1,1,{filter:t.LINEAR}),this.fbBloomA=I(t,this.tBloomA),this.fbBloomB=I(t,this.tBloomB),this.tAtlas=w(t,1,1),this.tGrad=w(t,256,1,{filter:t.LINEAR}),this.tMedia=w(t,1,1,{filter:t.LINEAR}),this.tText=w(t,1,1,{filter:t.LINEAR}),this.tMsg=w(t,1,1),this.tWords=w(t,1,1),this.tWarm=w(t,1,1),this.fbWarm=I(t,this.tWarm),this.prevT=[null,null],this.prevFb=[null,null],this.prevIdx=0,this.trans=-1}invalidate(){this.sizeDirty=!0,this.atlasKey=this.textKey=this.msgKey=this.wordsKey=this.gradKey="",this.mediaUploaded=null,this.simMode="",this.needsRender=!0}requestFonts(){let t=this.r,i=++this.fontGen,e=_(t.glyph.charset+(t.msg.on?t.msg.text:"")+(t.glyph.mode==="words"?t.glyph.words:"")).join("").slice(0,200)||"Aa",r=[this.fonts.ensure(t.glyph.font,t.glyph.weight,!1,e)];return t.source==="text"&&r.push(this.fonts.ensure(t.text.font,t.text.weight,t.text.italic,t.text.content.slice(0,120)||"Aa")),Promise.all(r).then(()=>{i!==this.fontGen&&this.alive||(this.atlasKey="",this.textKey="",this.needsRender=!0)})}bindPointer(){let t=this.o.pointerTarget??"canvas",i=s=>{let d=this.canvas.getBoundingClientRect();if(!d.width||!d.height)return null;let f=(s.clientX-d.left)*this.W/d.width,u=(s.clientY-d.top)*this.H/d.height;return{x:f,y:u,inside:f>=0&&u>=0&&f<=this.W&&u<=this.H}},e=s=>{let d=i(s);if(!d)return;let f=this.ptr;f.targetOn===0&&d.inside&&(f.x=f.px=d.x,f.y=f.py=d.y),f.tx=d.x,f.ty=d.y,f.targetOn=d.inside?1:0,f.lastReal=performance.now(),this.r.interact.mode!=="none"&&(this.needsRender=!0)},r=s=>{e(s),this.ptr.down=!0,this.ptr.impulse=1},n=()=>{this.ptr.down=!1},c=s=>{s.pointerType!=="mouse"&&(this.ptr.down=!1),this.ptr.targetOn=0},o={passive:!0};if(t==="canvas"){let s=this.canvas;s.addEventListener("pointermove",e,o),s.addEventListener("pointerdown",r,o),s.addEventListener("pointerup",n,o),s.addEventListener("pointercancel",c,o),s.addEventListener("pointerleave",c,o),this.cleanup.push(()=>{s.removeEventListener("pointermove",e),s.removeEventListener("pointerdown",r),s.removeEventListener("pointerup",n),s.removeEventListener("pointercancel",c),s.removeEventListener("pointerleave",c)})}else{let s=f=>{f.relatedTarget||(this.ptr.targetOn=0)},d=()=>{this.ptr.targetOn=0};window.addEventListener("pointermove",e,o),window.addEventListener("pointerdown",r,o),window.addEventListener("pointerup",n,o),document.addEventListener("mouseout",s),window.addEventListener("blur",d),this.cleanup.push(()=>{window.removeEventListener("pointermove",e),window.removeEventListener("pointerdown",r),window.removeEventListener("pointerup",n),document.removeEventListener("mouseout",s),window.removeEventListener("blur",d)})}}measure(t,i,e,r=!1){if(this.frames++,t-this.fpsT>500&&(this.fps=Math.round(this.frames*1e3/(t-this.fpsT)),this.frames=0,this.fpsT=t,this.o.onStats?.(this.stats)),!(!this.playing||e<=0||r)&&(this.ema=this.ema*.95+e*1e3*.05,!!(this.q.adaptive??this.o.adaptive??!0))){if(performance.now()<this.adaptiveHold){this.slow=0;return}this.ema>26?(this.slow++,this.fast=0):this.ema<18?(this.fast++,this.slow=0):this.slow=this.fast=0,this.slow>90&&this.pr>.75&&(this.pr=Math.max(.75,this.pr*.8),this.slow=0,this.sizeDirty=!0,this.ema=16),this.fast>300&&this.pr<this.prCap&&(this.pr=Math.min(this.prCap,this.pr*1.15),this.fast=0,this.sizeDirty=!0)}}stepPointer(t,i){let e=this.ptr,r=this.r.interact;if(r.mode==="none")return!1;if(r.auto&&i-e.lastReal>2500){let o=this.realT*.35;e.tx=this.W*(.5+.32*Math.sin(o*1.3)),e.ty=this.H*(.5+.28*Math.sin(o*1.7+1.2)),e.targetOn=1}let n=r.mode==="ripple"||r.mode==="erase"||r.mode==="paint";if(e.px=e.x,e.py=e.y,n||e.on<.01)e.x=e.tx,e.y=e.ty;else{let o=Math.min(1,t*12);e.x+=(e.tx-e.x)*o,e.y+=(e.ty-e.y)*o}e.moved=Math.hypot(e.x-e.px,e.y-e.py);let c=e.on;return e.on+=(e.targetOn-e.on)*Math.min(1,t*7),Math.abs(e.on-c)>.001||e.moved>.05||e.impulse>0}resize(){this.sizeDirty=!1;let t=this.gl,i=this.r.glyph;if(this.o.fixedSize)this.cssW=this.o.fixedSize.width,this.cssH=this.o.fixedSize.height,this.pr=this.prCap=this.o.fixedSize.pixelRatio;else{this.cssW=Math.max(1,this.canvas.clientWidth||300),this.cssH=Math.max(1,this.canvas.clientHeight||150);let s=Math.min(this.q.maxPixelRatio??2,this.o.maxPixelRatio??2,Math.max(1,window.devicePixelRatio||1));s!==this.prCap&&(this.prCap=s,this.pr=s),this.pr>this.prCap&&(this.pr=this.prCap)}let e=this.pr,r=Math.min(this.maxTex,t.getParameter(t.MAX_RENDERBUFFER_SIZE));(this.cssW*e>r||this.cssH*e>r)&&(e=Math.min(r/this.cssW,r/this.cssH)),this.W=Math.max(1,Math.round(this.cssW*e)),this.H=Math.max(1,Math.round(this.cssH*e)),this.canvas.width!==this.W&&(this.canvas.width=this.W),this.canvas.height!==this.H&&(this.canvas.height=this.H),this.cw=Math.max(2,Math.round(i.cell*e)),this.ch=Math.max(2,Math.round(i.cell*i.aspect*e));let n=Math.max(1,Math.ceil(this.W/this.cw)),c=Math.max(1,Math.ceil(this.H/this.ch));(n!==this.cols||c!==this.rows||this.tField.w!==n)&&(this.cols=n,this.rows=c,G(t,this.tField,n,c),G(t,this.tSelC,n,c),G(t,this.tSelG,n,c),G(t,this.tBloomA,n,c),G(t,this.tBloomB,n,c),this.resetSim(),this.msgKey="");let o=this.prevT[this.prevIdx];o&&(o.w!==this.W||o.h!==this.H)&&(this.trans=-1),this.textKey=""}resetSim(){let t=this.gl,i=this.cols*this.rows,e=null;if(!this.halfFloat){e=new Uint8Array(i*4);for(let r=0;r<i;r++)e[r*4]=128,e[r*4+1]=128}for(let r of this.tSim)G(t,r,this.cols,this.rows,e)}updateAtlas(){let t=this.r,i=t.glyph,e=(t.msg.on?t.msg.text:"")+(i.mode==="words"?i.words:""),r=[i.charset,i.sort,i.font,i.weight,i.scale,this.cw,this.ch,_(e).sort().join("")].join("");if(r===this.atlasKey&&this.atlas)return;this.atlasKey=r,this.atlas=fe({charset:i.charset,sort:i.sort,stack:this.fonts.stack(i.font),weight:i.weight,scale:i.scale*(N(i.font).fit??1),cw:this.cw,ch:this.ch,extras:e,maxTex:this.maxTex},this.atlasCanvas??void 0),this.atlasCanvas=this.atlas.canvas;let n=this.gl;n.bindTexture(n.TEXTURE_2D,this.tAtlas.tex),n.texImage2D(n.TEXTURE_2D,0,n.RGBA8,n.RGBA,n.UNSIGNED_BYTE,this.atlas.canvas),this.msgKey="",this.wordsKey=""}updateGrad(){let t=this.r.color.stops.join(",");if(t===this.gradKey)return;this.gradKey=t,this.grad=pe(this.r.color.stops,256);let i=this.gl;i.bindTexture(i.TEXTURE_2D,this.tGrad.tex),i.texImage2D(i.TEXTURE_2D,0,i.RGBA8,256,1,0,i.RGBA,i.UNSIGNED_BYTE,this.grad)}updateText(){if(this.r.source!=="text")return;let t=this.r.text,i=JSON.stringify(t)+this.W+"x"+this.H;if(i===this.textKey)return;this.textKey=i,this.textCanvas??(this.textCanvas=document.createElement("canvas")),Pe(this.textCanvas,this.W,this.H,t,this.fonts.stack(t.font));let e=this.gl;e.bindTexture(e.TEXTURE_2D,this.tText.tex),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,e.RGBA,e.UNSIGNED_BYTE,this.textCanvas)}updateMsg(){let t=this.r.msg;if(!t.on||!this.atlas){this.msg=null;return}let i=[t.text,t.mode==="marquee",t.x,t.y,t.align,this.cols,this.rows,this.atlasKey].join("|");if(i===this.msgKey&&this.msg)return;this.msgKey=i;let e=this.atlas.index;this.msg=Fe(t.text,this.cols,this.rows,t.x,t.y,t.align,t.mode==="marquee",n=>e.get(n)??this.atlas.spaceIdx);let r=this.gl;G(r,this.tMsg,this.msg.width,this.rows,this.msg.data)}updateWords(){let t=this.r.glyph;if(t.mode!=="words"||!this.atlas)return;let i=t.words+"|"+this.atlasKey;if(i===this.wordsKey)return;this.wordsKey=i;let e=Array.from(t.words.replace(/\s+/g," ")).filter(c=>c!==`
`),r=e.length?e:["#"];this.wordsN=r.length;let n=new Uint8Array(r.length*4);r.forEach((c,o)=>{let s=(this.atlas.index.get(c)??this.atlas.spaceIdx)+1;n[o*4]=s&255,n[o*4+1]=s>>8}),G(this.gl,this.tWords,r.length,1,n)}currentMedia(){return this.currentMediaOf(this.r)}currentMediaOf(t){let i=t.source;return i==="image"||i==="video"||i==="camera"?this.media[i]??null:null}updateMedia(){let t=this.currentMedia();if(!t){this.mediaOK=!1;return}let i=this.gl;if(typeof HTMLVideoElement<"u"&&t instanceof HTMLVideoElement){if(t.readyState<2||!t.videoWidth||this.mediaUploaded===t&&t.currentTime===this.mediaTime&&this.mediaOK)return;this.mediaW=t.videoWidth,this.mediaH=t.videoHeight,this.mediaTime=t.currentTime}else{if(this.mediaUploaded===t&&this.mediaOK)return;let r=t;this.mediaW=r.naturalWidth||r.width||1,this.mediaH=r.naturalHeight||r.height||1}i.bindTexture(i.TEXTURE_2D,this.tMedia.tex);try{i.texImage2D(i.TEXTURE_2D,0,i.RGBA8,i.RGBA,i.UNSIGNED_BYTE,t),this.mediaUploaded=t,this.mediaOK=!0}catch(r){this.mediaOK=!1,this.o.onError?.("media: "+r.message)}}static patternsOf(t){let i=t.layers.filter(e=>e.on).slice(0,4);return i.length?i.map(e=>e.pattern):["nube"]}fieldKeyOf(t,i){let e=i??Ie(t,t.source===this.r.source&&this.mediaOK?!0:!!this.currentMediaOf(t));return Me(a.patternsOf(t),e,t.motion.loop>0)}fieldSource(t,i){let e=i.split("|")[0];return Ee(a.patternsOf(t),e,t.motion.loop>0,this.lib)}cacheProgram(t,i){let e=this.progs.get(t);if(e&&e!==i&&this.gl.deleteProgram(e.prog),this.progs.set(t,i),this.progs.size>48){let r=this.progs.keys().next().value;r!==t&&(this.gl.deleteProgram(this.progs.get(r).prog),this.progs.delete(r))}}fieldProgram(t){let i=this.fieldKeyOf(this.r,t),e=this.progs.get(i);if(!e)try{e=O(this.gl,k,this.fieldSource(this.r,i)),this.cacheProgram(i,e)}catch(r){return this.o.onError?.(r.message),null}return e}captureTransition(t){let i=this.gl,e=this.prevIdx^1,r=this.prevT[e];(!r||r.w!==this.W||r.h!==this.H)&&(r&&i.deleteTexture(r.tex),this.prevFb[e]&&i.deleteFramebuffer(this.prevFb[e]),r=this.prevT[e]=w(i,this.W,this.H),this.prevFb[e]=I(i,r));let n=this.prevT[this.prevIdx];this.compose(this.prevFb[e],n&&n.w===this.W&&n.h===this.H?this.trans:-1),this.prevIdx=e,this.trans=0,this.transStart=NaN,this.transSpec=t}render(t){if(this.lost)return;if(this.sizeDirty&&this.resize(),this.updateAtlas(),this.updateGrad(),this.updateText(),this.updateMsg(),this.updateWords(),this.updateMedia(),this.trans>=0){Number.isNaN(this.transStart)&&(this.transStart=this.realT,this.transElapsed=0);let n=this.o.fixedSize?this.realT-this.transStart:this.transElapsed;if(this.trans=n/this.transSpec.duration,this.trans>=1||this.trans<0){this.trans=-1;let c=this.prevIdx^1,o=this.prevT[c];o&&(this.gl.deleteTexture(o.tex),this.gl.deleteFramebuffer(this.prevFb[c]),this.prevT[c]=null,this.prevFb[c]=null)}}this.gl.bindVertexArray(this.vao),this.runSim(t);let e=Ie(this.r,this.mediaOK),r=this.fieldProgram(e);r&&this.runField(r,e),this.runSelect(e),this.r.fx.bloom>0&&this.runBloom(),this.compose(null,this.trans),this.ptr.impulse=0}timeQ(){let t=this.r.motion.hold;return t>0?Math.floor(this.t*t)/t:this.t}runSim(t){let i=this.r.interact.mode,e=this.gl,r=i==="ripple"||i==="erase"||i==="paint";if(i!==this.simMode&&(this.simMode=i,this.resetSim()),!r)return;let n=this.ptr,c=this.r.interact,o=this.pSim,s=this.tSim[this.simIdx],d=this.simIdx^1;e.bindFramebuffer(e.FRAMEBUFFER,this.fbSim[d]),e.viewport(0,0,this.cols,this.rows),e.useProgram(o.prog),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,s.tex),e.uniform1i(l(e,o,"uPrev"),0),e.uniform2f(l(e,o,"uGrid"),this.cols,this.rows),e.uniform2f(l(e,o,"uCell"),this.cw,this.ch),e.uniform4f(l(e,o,"uSeg"),n.px,n.py,n.x,n.y),e.uniform1f(l(e,o,"uBrushR"),Math.max(4,c.radius*this.H*.5)),e.uniform1f(l(e,o,"uStr"),c.strength);let f=c.auto&&performance.now()-n.lastReal>2500,u=n.on>.2?Math.min(1,n.moved/Math.max(2,this.cw*.5))+(n.down?.6:0)+(f?.5:0):0;e.uniform1f(l(e,o,"uActive"),Math.min(1.2,u)),e.uniform1f(l(e,o,"uImpulse"),n.impulse*(n.on>.2?1:0)),e.uniform1f(l(e,o,"uEnc"),this.halfFloat?0:1),e.uniform1f(l(e,o,"uDt"),t||1/60),e.uniform1i(l(e,o,"uMode"),["none","light","ripple","lens","repel","swirl","erase","paint","scramble"].indexOf(i)),e.drawArrays(e.TRIANGLES,0,3),this.simIdx=d}runField(t,i){let e=this.gl,r=this.r;e.bindFramebuffer(e.FRAMEBUFFER,this.fbField),e.viewport(0,0,this.cols,this.rows),e.useProgram(t.prog);let n=this.timeQ();e.uniform2f(l(e,t,"uRes"),this.W,this.H),e.uniform2f(l(e,t,"uCell"),this.cw,this.ch),e.uniform2f(l(e,t,"uGrid"),this.cols,this.rows),e.uniform1f(l(e,t,"uCellP"),this.ch/this.H),e.uniform1f(l(e,t,"uTime"),n),e.uniform1f(l(e,t,"uLoop"),r.motion.loop);let c=r.layers.filter(f=>f.on).slice(0,4),o=new Float32Array(16),s=new Float32Array(16),d=new Float32Array(16);(c.length?c:[{...r.layers[0],on:!0}]).forEach((f,u)=>{o.set([f.scale,f.rot*Math.PI/180,f.x,f.y],u*4),s.set([f.a,f.b,f.mix,f.speed],u*4),d.set([f.invert?1:0,f.phase,Math.max(0,H.indexOf(f.blend)),0],u*4)}),e.uniform4fv(l(e,t,"uLA"),o),e.uniform4fv(l(e,t,"uLB"),s),e.uniform4fv(l(e,t,"uLC"),d),e.uniform1f(l(e,t,"uWarp"),r.motion.warp),e.uniform1f(l(e,t,"uWarpScale"),r.motion.warpScale),e.uniform1f(l(e,t,"uPulse"),this.pulse(n)),e.uniform1f(l(e,t,"uMediaMix"),r.media.mix),e.uniform1i(l(e,t,"uMediaBlend"),Math.max(0,H.indexOf(r.media.blend))),e.uniform1f(l(e,t,"uMorph"),r.text.morph),this.bindMediaUniforms(t,2),e.activeTexture(e.TEXTURE3),e.bindTexture(e.TEXTURE_2D,this.tText.tex),e.uniform1i(l(e,t,"uText"),3),e.activeTexture(e.TEXTURE4),e.bindTexture(e.TEXTURE_2D,this.tSim[this.simIdx].tex),e.uniform1i(l(e,t,"uSim"),4),e.uniform1f(l(e,t,"uSimEnc"),this.halfFloat?0:1),this.bindPointerUniforms(t),e.drawArrays(e.TRIANGLES,0,3)}pulse(t){let i=this.r.motion;if(this.externalPulse>0)return Math.min(1,this.externalPulse);if(i.pulse<=0)return 0;let e=i.bpm,r=t;i.loop>0&&(e=Math.max(1,Math.round(i.loop*e/60))*60/i.loop,r=t%i.loop);let n=r*e/60;return i.pulse*Math.pow(1-(n-Math.floor(n)),3)}bindMediaUniforms(t,i){let e=this.gl,r=this.r.media;e.activeTexture(e.TEXTURE0+i),e.bindTexture(e.TEXTURE_2D,this.tMedia.tex),e.uniform1i(l(e,t,"uMedia"),i),e.uniform2f(l(e,t,"uMediaSize"),this.mediaW,this.mediaH),e.uniform1i(l(e,t,"uFit"),r.fit==="cover"?0:r.fit==="contain"?1:2),e.uniform1f(l(e,t,"uZoom"),r.zoom),e.uniform2f(l(e,t,"uPan"),r.panX,r.panY),e.uniform1f(l(e,t,"uMirror"),r.mirror?1:0)}bindPointerUniforms(t){let i=this.gl,e=this.r.interact,r=this.ptr;i.uniform1i(l(i,t,"uIMode"),["none","light","ripple","lens","repel","swirl","erase","paint","scramble"].indexOf(e.mode)),i.uniform2f(l(i,t,"uPtr"),r.x,r.y),i.uniform1f(l(i,t,"uPtrOn"),r.on),i.uniform1f(l(i,t,"uIStr"),e.strength),i.uniform1f(l(i,t,"uIRad"),e.radius)}runSelect(t){let i=this.gl,e=this.r,r=this.pSel,n=this.atlas;i.bindFramebuffer(i.FRAMEBUFFER,this.fbSel),i.viewport(0,0,this.cols,this.rows),i.useProgram(r.prog),i.activeTexture(i.TEXTURE0),i.bindTexture(i.TEXTURE_2D,this.tField.tex),i.uniform1i(l(i,r,"uField"),0),i.activeTexture(i.TEXTURE1),i.bindTexture(i.TEXTURE_2D,this.tGrad.tex),i.uniform1i(l(i,r,"uGrad"),1),i.activeTexture(i.TEXTURE2),i.bindTexture(i.TEXTURE_2D,this.tMsg.tex),i.uniform1i(l(i,r,"uMsg"),2),i.activeTexture(i.TEXTURE3),i.bindTexture(i.TEXTURE_2D,this.tWords.tex),i.uniform1i(l(i,r,"uWords"),3);let c=this.timeQ();i.uniform2f(l(i,r,"uGrid"),this.cols,this.rows),i.uniform1f(l(i,r,"uTime"),c),i.uniform1f(l(i,r,"uN"),n.n),i.uniform1f(l(i,r,"uEdgeBase"),n.edgeBase),i.uniform1f(l(i,r,"uEdge"),e.glyph.edge),i.uniform1f(l(i,r,"uDither"),e.glyph.dither),i.uniform1i(l(i,r,"uDitherKind"),e.glyph.ditherKind==="bayer"?0:1),i.uniform1f(l(i,r,"uBright"),e.tone.bright),i.uniform1f(l(i,r,"uContrast"),e.tone.contrast),i.uniform1f(l(i,r,"uGamma"),e.tone.gamma),i.uniform1f(l(i,r,"uInvert"),e.tone.invert?1:0),i.uniform1f(l(i,r,"uLevels"),e.tone.levels),i.uniform1i(l(i,r,"uGMode"),["density","lines","scramble","words"].indexOf(e.glyph.mode)),i.uniform1f(l(i,r,"uJitter"),e.glyph.jitter),i.uniform1f(l(i,r,"uWordsN"),this.wordsN),i.uniform1i(l(i,r,"uCMode"),e.color.mode==="source"?1:0),i.uniform1i(l(i,r,"uMap"),["luma","x","y","radial","angle","noise"].indexOf(e.color.map)),i.uniform1i(l(i,r,"uIsMedia"),t==="media"?1:0),i.uniform1f(l(i,r,"uShift"),e.color.shift),i.uniform1f(l(i,r,"uCycle"),e.color.cycle),i.uniform1f(l(i,r,"uHue"),e.color.hue),i.uniform1f(l(i,r,"uSat"),e.color.sat),i.uniform1f(l(i,r,"uVivid"),e.color.vivid),i.uniform1f(l(i,r,"uShade"),e.color.shade),i.uniform1f(l(i,r,"uAspect"),this.ch/this.cw);let o=e.msg,s=this.msg;i.uniform1i(l(i,r,"uMsgOn"),o.on&&s?1:0);let d=[-9,-9],f=0;if(o.on&&s){let v=Le(o,s.count,this.t);i.uniform1i(l(i,r,"uMsgMode"),["static","type","decode","marquee"].indexOf(o.mode)),i.uniform1f(l(i,r,"uMsgProg"),v.prog),i.uniform1f(l(i,r,"uMsgWin"),6),i.uniform1f(l(i,r,"uMsgShift"),Math.floor(v.shift)),i.uniform1f(l(i,r,"uMsgW"),s.width),v.cursorOn&&v.cursor>=0&&s.cells.length&&(d=s.cells[Math.min(s.cells.length-1,v.cursor)],f=1)}let u=o.color?K(o.color):[1,1,1];i.uniform3f(l(i,r,"uMsgColor"),u[0],u[1],u[2]),i.uniform1f(l(i,r,"uMsgUseColor"),o.color?1:0),i.uniform2f(l(i,r,"uCursor"),d[0],d[1]),i.uniform1f(l(i,r,"uCursorOn"),f),i.uniform1f(l(i,r,"uBlockIdx"),n.blockIdx);let h=e.interact,g=this.ptr;i.uniform1i(l(i,r,"uIMode"),["none","light","ripple","lens","repel","swirl","erase","paint","scramble"].indexOf(h.mode)),i.uniform2f(l(i,r,"uPtrCell"),g.x/this.cw,g.y/this.ch),i.uniform1f(l(i,r,"uPtrOn"),g.on),i.uniform1f(l(i,r,"uIStr"),h.strength),i.uniform1f(l(i,r,"uIRadCells"),h.radius*this.H/this.cw),i.drawArrays(i.TRIANGLES,0,3)}runBloom(){let t=this.gl,i=this.pBlur,e=1+Math.round(this.r.fx.bloom);t.useProgram(i.prog),t.viewport(0,0,this.cols,this.rows),t.bindFramebuffer(t.FRAMEBUFFER,this.fbBloomA),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,this.tSelC.tex),t.uniform1i(l(t,i,"uSrc"),0),t.uniform2f(l(t,i,"uDir"),e,0),t.uniform1f(l(t,i,"uFromSelect"),1),t.drawArrays(t.TRIANGLES,0,3),t.bindFramebuffer(t.FRAMEBUFFER,this.fbBloomB),t.bindTexture(t.TEXTURE_2D,this.tBloomA.tex),t.uniform2f(l(t,i,"uDir"),0,e),t.uniform1f(l(t,i,"uFromSelect"),0),t.drawArrays(t.TRIANGLES,0,3)}compose(t,i){let e=this.gl,r=this.r,n=this.pComp,c=this.atlas;e.bindFramebuffer(e.FRAMEBUFFER,t),e.viewport(0,0,this.W,this.H),e.useProgram(n.prog),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.tSelC.tex),e.uniform1i(l(e,n,"uC"),0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,this.tSelG.tex),e.uniform1i(l(e,n,"uG"),1),e.activeTexture(e.TEXTURE2),e.bindTexture(e.TEXTURE_2D,this.tAtlas.tex),e.uniform1i(l(e,n,"uAtlas"),2),e.activeTexture(e.TEXTURE3),e.bindTexture(e.TEXTURE_2D,this.tBloomB.tex),e.uniform1i(l(e,n,"uBloom"),3);let o=this.prevT[this.prevIdx],s=o&&t!==this.prevFb[this.prevIdx]?o.tex:this.tField.tex;e.activeTexture(e.TEXTURE4),e.bindTexture(e.TEXTURE_2D,s),e.uniform1i(l(e,n,"uPrev"),4),e.activeTexture(e.TEXTURE5),e.bindTexture(e.TEXTURE_2D,this.tSim[this.simIdx].tex),e.uniform1i(l(e,n,"uSimT"),5),this.bindMediaUniforms(n,6),e.uniform2f(l(e,n,"uRes"),this.W,this.H),e.uniform2f(l(e,n,"uCell"),this.cw,this.ch),e.uniform2f(l(e,n,"uGrid"),this.cols,this.rows),e.uniform1f(l(e,n,"uAtlasCols"),c.cols),e.uniform1f(l(e,n,"uN"),c.n);let d=K(r.color.bg);e.uniform3f(l(e,n,"uBg"),d[0],d[1],d[2]);let f=Z(this.grad,1);e.uniform3f(l(e,n,"uAccent"),f[0],f[1],f[2]);let u=r.fx;e.uniform1f(l(e,n,"uCellBg"),u.cellBg),e.uniform1f(l(e,n,"uGlow"),u.glow),e.uniform1f(l(e,n,"uBloomAmt"),u.bloom),e.uniform1f(l(e,n,"uScan"),u.scan),e.uniform1f(l(e,n,"uVig"),u.vig),e.uniform1f(l(e,n,"uCurve"),u.curve),e.uniform1f(l(e,n,"uChroma"),this.q.simplify?0:u.chroma),e.uniform1f(l(e,n,"uGrain"),u.grain),e.uniform1f(l(e,n,"uFlicker"),u.flicker),e.uniform1f(l(e,n,"uGridAmt"),u.grid),e.uniform1f(l(e,n,"uTime"),this.realT),e.uniform1f(l(e,n,"uMsgBox"),r.msg.on?r.msg.box:0),e.uniform1f(l(e,n,"uTrans"),i);let h=this.transSpec;e.uniform1i(l(e,n,"uTransKind"),Be[h.kind]??0),e.uniform2f(l(e,n,"uTransOrigin"),h.origin?.[0]??.5,h.origin?.[1]??.5),e.uniform1f(l(e,n,"uTransDir"),h.dir??1),e.uniform1f(l(e,n,"uTransSeed"),h.seed??0),e.uniform1f(l(e,n,"uTransparent"),this.transparent?1:0);let g=this.mediaOK&&["image","video","camera"].includes(r.source);e.uniform1f(l(e,n,"uHasMedia"),g?1:0),e.uniform1f(l(e,n,"uReveal"),g?r.media.reveal:0),e.uniform1f(l(e,n,"uEraseReveal"),g&&r.interact.mode==="erase"?1:0),e.drawArrays(e.TRIANGLES,0,3)}};var De={},ct=()=>typeof matchMedia=="function"&&matchMedia("(prefers-reduced-motion: reduce)").matches;function ut(a){let t=typeof a=="string"?document.querySelector(a):a;if(!t)return null;if(t instanceof HTMLCanvasElement)return{canvas:t,created:!1};let i=document.createElement("canvas");return i.style.cssText="position:absolute;inset:0;width:100%;height:100%;display:block",i.setAttribute("aria-hidden","true"),getComputedStyle(t).position==="static"&&(t.style.position="relative"),t.appendChild(i),{canvas:i,created:!0}}function _e(a,t,i={}){let e=Y(t),r=ut(a);if(!r)return console.warn("Monotrama: no encuentro el elemento",a),null;let{canvas:n,created:c}=r,o=ct()||!!i.paused,s=u=>(o&&(u.interact.auto=!1),u),d=()=>{c&&n.remove()},f;try{f=new j(n,s(e),{library:{...De,...i.patterns??{}},googleFonts:!0,interactive:i.interactive??!0,pointerTarget:i.pointer??"window",observeVisibility:!0,reducedMotion:o,maxPixelRatio:1.5,adaptive:!0})}catch{return n.style.background=i.poster?`${e.color.bg} url(${JSON.stringify(i.poster)}) center / cover no-repeat`:e.color.bg,{engine:null,play(){},pause(){},set(){},destroy:d}}if(i.media&&(e.source==="image"||e.source==="video"))if(e.source==="image"){let u=new Image;u.crossOrigin="anonymous",u.onload=()=>f.setMedia("image",u),u.onerror=()=>console.warn("Monotrama: no se pudo cargar la imagen (\xBFruta o CORS?)",i.media),u.src=i.media}else{let u=document.createElement("video");u.crossOrigin="anonymous",u.muted=!0,u.loop=!0,u.playsInline=!0,u.autoplay=!o,u.setAttribute("playsinline",""),u.src=i.media,u.playbackRate=e.media.rate,o||u.play().catch(()=>{}),f.setMedia("video",u)}return{engine:f,play:()=>f.play(),pause:()=>f.pause(),set:u=>f.set(s(Y(u)),{transition:!0}),destroy:()=>{f.destroy(),d()}}}var oe=class extends HTMLElement{constructor(){super(...arguments);m(this,"ctl",null)}connectedCallback(){queueMicrotask(()=>{this.isConnected&&!this.ctl&&this.start()})}start(){let i=this.shadowRoot??this.attachShadow({mode:"open"});i.innerHTML="<style>:host{display:block;position:relative;min-height:120px}canvas{position:absolute;inset:0;width:100%;height:100%;display:block}</style>";let e=document.createElement("canvas");e.setAttribute("aria-hidden","true"),i.appendChild(e);let r={},n=this.getAttribute("recipe"),c=this.querySelector('script[type="application/json"]');try{r=JSON.parse(n??c?.textContent??"{}")}catch{}this.ctl=_e(e,r,{pointer:this.getAttribute("pointer")==="window"?"window":"canvas",interactive:!this.hasAttribute("static"),media:this.getAttribute("src")||void 0,paused:this.hasAttribute("paused"),poster:this.getAttribute("poster")||void 0})}disconnectedCallback(){this.ctl?.destroy(),this.ctl=null}},ke={version:"2.1.0",register:a=>{Object.assign(De,a)},mount:_e},q=window;q.Monotrama?q.Monotrama.register=q.Monotrama.register??ke.register:(q.Monotrama=ke,typeof customElements<"u"&&!customElements.get("monotrama-field")&&customElements.define("monotrama-field",oe));})();

Monotrama.register({"planeta":"\nfloat pl_ring(float rr, float an, float a, float t){\n  float r0 = .56, r1 = .66 + a * .36;\n  float x = (rr - r0) / (r1 - r0);\n  float band = smoothstep(0., .04, x) * smoothstep(1., .94, x);\n  float dens = .35 + .65 * vnoise(vec2(x * 36., 3.7));\n  dens *= 1. - .9 * exp(-(x - .62) * (x - .62) * 480.);\n  dens *= .82 + .18 * vnoise(vec2(an * 5. - t * .15, x * 6.));\n  return band * dens;\n}\nfloat P_planeta(vec2 p, float t, float a, float b){\n  mat3 R = rotXY(.12 + b * .75 + .04 * sin(t * .17), -.5 + t * .03);\n  vec3 ro = R * vec3(0., 0., -3.), rd = R * normalize(vec3(p, 1.7));\n  vec3 L = normalize(R * vec3(-.75, .35, -.45));\n  float bb = dot(ro, rd), h = bb * bb - dot(ro, ro) + .1521;\n  float ts = h > 0. ? -bb - sqrt(h) : 1e3;\n  float col = 0.;\n  if (ts \u003c 1e3){\n    vec3 ps = ro + rd * ts, n = ps / .39;\n    // cloud bands swirled by noise; the planet turns under them\n    float lon = atan(n.z, n.x) + t * .12;\n    float tex = .5 + .5 * sin(n.y * 15. + 2.6 * fbm(vec2(lon * 1.3, n.y * 4.)));\n    float dif = max(dot(n, L), 0.);\n    float sr = -ps.y / L.y;\n    if (sr > 0.){ vec3 q = ps + L * sr; dif *= 1. - .75 * pl_ring(length(q.xz), atan(q.z, q.x), a, t); }\n    col = .03 + dif * (.45 + .55 * tex) + .2 * pow(1. - max(dot(n, -rd), 0.), 2.) * dif;\n  } else {\n    col = .12 * exp(-(length(ro - rd * bb) - .39) * 22.);\n  }\n  float tr = -ro.y / rd.y;\n  if (tr > 0. && tr \u003c ts){\n    vec3 q = ro + rd * tr;\n    float den = pl_ring(length(q.xz), atan(q.z, q.x), a, t);\n    if (den > 0.){\n      // the planet's shadow falls across the rings\n      float b2 = dot(q, L), h2 = b2 * b2 - dot(q, q) + .1521;\n      float lit = h2 > 0. && -b2 - sqrt(h2) > 0. ? .15 : 1.;\n      col = mix(col, (.35 + .6 * den) * lit, min(den * 1.3, .95));\n    }\n  }\n  return sat(col);\n}","estrellas":"\nfloat P_estrellas(vec2 p, float t, float a, float b){\n  float v = 0.;\n  for (int k = 0; k \u003c 3; k++){\n    float fk = float(k);\n    vec2 g = p * (10. + fk * 9. + a * 14.) + vec2(t * (.05 + fk * .04), 0.);\n    vec2 i = floor(g);\n    float h = hash12(i + fk * 31.);\n    vec2 f = fract(g) - .5 - (hash22(i + 3.1) - .5) * .6;\n    float tw = .55 + .45 * sin(t * (2. + h * 4.) + h * 60.);\n    v += smoothstep(.22 + b * .2, 0., length(f)) * step(.82 - b * .1, h) * tw;\n  }\n  return sat(v);\n}"});
