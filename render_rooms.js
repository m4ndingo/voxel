/* Renderiza un .vox.json a PNG isométrico (verificación visual, sin navegador).
   Uso: node render_rooms.js assets/taberna.vox.json out.png */
const fs=require('fs'), zlib=require('zlib');

const inFile=process.argv[2], outFile=process.argv[3]||'out.png';
const d=JSON.parse(fs.readFileSync(inFile,'utf8'));
const vox=d.voxels||{};
const hex=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];

const s=9, w=s, t=Math.round(s*0.5), h=s;          // geometría del cubo iso
const list=[];
for(const k in vox){ const [x,y,z]=k.split(',').map(Number); list.push({x,y,z,c:hex(vox[k])}); }
// orden pintor: (x+y) y luego z ascendente (lejos→cerca)
list.sort((a,b)=> (a.x+a.y)-(b.x+b.y) || a.z-b.z );

// encuadre
let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;
for(const v of list){ const cx=(v.x-v.y)*w, cy=(v.x+v.y)*t - v.z*h;
  minX=Math.min(minX,cx-w); maxX=Math.max(maxX,cx+w); minY=Math.min(minY,cy); maxY=Math.max(maxY,cy+2*t+h); }
const pad=12, W=Math.ceil(maxX-minX)+pad*2, H=Math.ceil(maxY-minY)+pad*2;
const ox=-minX+pad, oy=-minY+pad;
const buf=Buffer.alloc(W*H*3, 22);                  // fondo gris oscuro (#161616)

function px(x,y,r,g,b){ if(x<0||y<0||x>=W||y>=H)return; const i=(y*W+x)*3; buf[i]=r;buf[i+1]=g;buf[i+2]=b; }
function fillQuad(P,rgb){                            // P: 4 puntos [x,y] en orden
  let ymin=1e9,ymax=-1e9; for(const p of P){ ymin=Math.min(ymin,p[1]); ymax=Math.max(ymax,p[1]); }
  ymin=Math.floor(ymin); ymax=Math.ceil(ymax);
  for(let y=ymin;y<=ymax;y++){
    const xs=[];
    for(let i=0;i<4;i++){ const a=P[i],b=P[(i+1)%4];
      if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y)){ xs.push(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1])); } }
    if(xs.length<2) continue; xs.sort((m,n)=>m-n);
    for(let k=0;k<xs.length;k+=2){ for(let x=Math.floor(xs[k]);x<=Math.ceil(xs[k+1]);x++) px(x,y,rgb[0],rgb[1],rgb[2]); }
  }
}
const shade=(c,f)=>[Math.min(255,Math.round(c[0]*f)),Math.min(255,Math.round(c[1]*f)),Math.min(255,Math.round(c[2]*f))];

for(const v of list){
  const cx=ox+(v.x-v.y)*w, cy=oy+(v.x+v.y)*t - v.z*h;
  const Ptop=[cx,cy], Pr=[cx+w,cy+t], Pb=[cx,cy+2*t], Pl=[cx-w,cy+t];
  fillQuad([[cx-w,cy+t],[cx,cy+2*t],[cx,cy+2*t+h],[cx-w,cy+t+h]], shade(v.c,0.68));  // cara izq
  fillQuad([[cx+w,cy+t],[cx,cy+2*t],[cx,cy+2*t+h],[cx+w,cy+t+h]], shade(v.c,0.52));  // cara der
  fillQuad([Ptop,Pr,Pb,Pl], shade(v.c,1.0));                                          // cara superior
}

// --- PNG truecolor ---
function png(W,H,rgb){
  const raw=Buffer.alloc((W*3+1)*H);
  for(let y=0;y<H;y++){ raw[y*(W*3+1)]=0; rgb.copy(raw,y*(W*3+1)+1,y*W*3,(y+1)*W*3); }
  const idat=zlib.deflateSync(raw);
  const chunk=(type,data)=>{ const len=Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t=Buffer.concat([Buffer.from(type),data]); const crc=Buffer.alloc(4); crc.writeUInt32BE(crc32(t)>>>0);
    return Buffer.concat([len,t,crc]); };
  const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(W,0); ihdr.writeUInt32BE(H,4); ihdr[8]=8; ihdr[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR',ihdr), chunk('IDAT',idat), chunk('IEND',Buffer.alloc(0))]);
}
let CRC=null;
function crc32(buf){ if(!CRC){ CRC=[]; for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=c&1?0xedb88320^(c>>>1):c>>>1; CRC[n]=c;} }
  let c=0xffffffff; for(let i=0;i<buf.length;i++) c=CRC[(c^buf[i])&0xff]^(c>>>8); return c^0xffffffff; }

fs.writeFileSync(outFile, png(W,H,buf));
console.log('->',outFile, W+'x'+H, list.length+' voxels');
