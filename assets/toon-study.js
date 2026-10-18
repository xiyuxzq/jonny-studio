'use strict';
(() => {
 const doc = typeof document === 'undefined' ? null : document;
 const clamp01 = x => Math.max(0, Math.min(1, x));
 const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
 const toLinear = x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
 const toSRGB = x => x <= .0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - .055;
 const lit = [.9, .77, .61].map(toLinear), shadow = [.43, .35, .41].map(toLinear);
 const mixColor = w => [0, 1, 2].map(c => Math.round(toSRGB(shadow[c] * (1 - w) + lit[c] * w) * 255));

 /* ---- 面部阈值图：关键帧二值图 -> 有符号距离场 -> 插值 -> 每个像素的“进入阴影角度” ----
    坐标：x 向画面右，y 向上，均在 [-1, 1]；光从画面右侧来，方位角 phi：0 正面光，PI/2 正侧光，PI 背光。 */
 const rowRadius = y => .8 * Math.sqrt(Math.max(0, 1 - y * y));
 // 美术对明暗交界线的逐行修正：下颌处推进得更快，鼻梁一带更晚被阴影越过。phi' = phi + warp * sin(phi) 保持单调。
 const rowWarp = y => .3 * smooth(-.25, -.85, y) - .3 * Math.exp(-(((y + .12) / .15) ** 2));
 const terminatorX = (y, phi) => -Math.cos(phi + rowWarp(y) * Math.sin(phi)) * rowRadius(y);

 function signedDistance(litMask, N) {
  const boundLit = [], boundDark = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
   const i = y * N + x, v = litMask[i];
   if ((x > 0 && litMask[i - 1] !== v) || (x < N - 1 && litMask[i + 1] !== v) || (y > 0 && litMask[i - N] !== v) || (y < N - 1 && litMask[i + N] !== v)) (v ? boundLit : boundDark).push(x, y);
  }
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
   const i = y * N + x, other = litMask[i] ? boundDark : boundLit;
   let best = Infinity;
   for (let k = 0; k < other.length; k += 2) {
    const dx = other[k] - x, dy = other[k + 1] - y, d2 = dx * dx + dy * dy;
    if (d2 < best) best = d2;
   }
   const d = best === Infinity ? N * 2 : Math.sqrt(best) - .5;
   out[i] = litMask[i] ? d : -d;
  }
  return out;
 }

 function bakeThreshold(N = 96, stepDeg = 15) {
  const frames = [];
  for (let a = stepDeg; a < 180; a += stepDeg) frames.push(a * Math.PI / 180);
  const K = frames.length;
  const fields = frames.map(phi => {
   const mask = new Uint8Array(N * N);
   for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const px = (x + .5) / N * 2 - 1, py = 1 - (y + .5) / N * 2;
    mask[y * N + x] = px > terminatorX(py, phi) ? 1 : 0;
   }
   return signedDistance(mask, N);
  });
  const T = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
   let angle = null;
   if (fields[0][i] <= 0) angle = frames[0] / 2;                         // 第一帧之前就已进入阴影
   else if (fields[K - 1][i] > 0) angle = (frames[K - 1] + Math.PI) / 2; // 最后一帧仍受光
   else for (let k = 0; k < K - 1; k++) {
    const a = fields[k][i], b = fields[k + 1][i];
    if (a > 0 && b <= 0) { angle = frames[k] + a / (a - b) * (frames[k + 1] - frames[k]); break; }
   }
   T[i] = angle / Math.PI;
  }
  return { T, N, frames };
 }

 function sampleT(map, x, y) {
  const N = map.N, u = (x + 1) / 2 * N - .5, v = (1 - y) / 2 * N - .5;
  const x0 = Math.max(0, Math.min(N - 2, Math.floor(u))), y0 = Math.max(0, Math.min(N - 2, Math.floor(v)));
  const fx = clamp01(u - x0), fy = clamp01(v - y0), T = map.T, i = y0 * N + x0;
  return (T[i] * (1 - fx) + T[i + 1] * fx) * (1 - fy) + (T[i + N] * (1 - fx) + T[i + N + 1] * fx) * fy;
 }

 // 运行时判定：返回 1 受光 / 0 阴影。psiDeg 为带符号方位，>0 光在画面右侧。
 function faceLit(map, x, y, psiDeg, feather) {
  const thr = Math.abs(psiDeg) / 180, t = sampleT(map, psiDeg >= 0 ? x : -x, y);
  const w = feather * Math.min(thr, 1 - thr); // 过渡带向两端收窄
  return w > 1e-4 ? smooth(thr - w, thr + w, t) : (t > thr ? 1 : 0);
 }

 if (typeof module !== 'undefined') module.exports = { bakeThreshold, sampleT, faceLit, terminatorX, rowRadius, rowWarp };
 if (!doc) return;

 /* ---- 演示一：明暗分层 ---- */
 const rampCanvas = doc.querySelector('#toon-ramp');
 if (rampCanvas && rampCanvas.getContext('2d')) {
  const ctx = rampCanvas.getContext('2d');
  const slider = doc.querySelector('#toon-light'), output = doc.querySelector('#toon-angle');
  const drawRamp = () => {
   const angle = Number(slider.value) * Math.PI / 180;
   output.value = slider.value + '°';
   const l = [Math.sin(angle), .25, Math.cos(angle)], len = Math.hypot(...l);
   for (let i = 0; i < 3; i++) l[i] /= len;
   ctx.fillStyle = '#191919'; ctx.fillRect(0, 0, 900, 330);
   const size = 212, radius = 102;
   for (let mode = 0; mode < 3; mode++) {
    const data = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
     const nx = (x - size / 2 + .5) / radius, ny = -(y - size / 2 + .5) / radius, r = nx * nx + ny * ny;
     if (r > 1) continue;
     const nz = Math.sqrt(1 - r), s = nx * l[0] + ny * l[1] + nz * l[2];
     const weight = mode === 0 ? Math.max(0, s) : mode === 1 ? (s > .05 ? 1 : 0) : smooth(-.01, .11, s);
     const o = (y * size + x) * 4, c = mixColor(weight);
     data.data[o] = c[0]; data.data[o + 1] = c[1]; data.data[o + 2] = c[2];
     data.data[o + 3] = Math.round(Math.min(1, (1 - Math.sqrt(r)) * radius) * 255);
    }
    const cx = 160 + 290 * mode;
    ctx.putImageData(data, cx - size / 2, 33);
    ctx.textAlign = 'center'; ctx.fillStyle = '#e4e4e4'; ctx.font = '25px system-ui';
    ctx.fillText(['连续响应', '硬阈值', '带过渡分层'][mode], cx, 280);
    ctx.fillStyle = '#a0a0a0'; ctx.font = '16px monospace'; ctx.fillText(['CONTINUOUS', 'HARD STEP', 'SOFT BAND'][mode], cx, 310);
   }
  };
  slider.addEventListener('input', drawRamp); drawRamp();
 }

 /* ---- 演示二：法线 N·L 与面部阈值图并排 ---- */
 const faceCanvas = doc.querySelector('#toon-face');
 const processCanvas = doc.querySelector('#face-process');
 if (faceCanvas || processCanvas) {
  const map = bakeThreshold(96, 15), size = 320;
  const base = doc.createElement('canvas'); base.width = size; base.height = 348;
  const bx = base.getContext('2d', {willReadFrequently:true});
  const portrait = new Image();
  portrait.onload = () => {
   bx.drawImage(portrait, 0, 0, size, 348);
   const source = bx.getImageData(0, 0, size, 348);
   const pixels = [];
   for (let py=0;py<348;py++) for(let px=0;px<size;px++) {
    const i=(py*size+px)*4, r=source.data[i], g=source.data[i+1], b=source.data[i+2];
    const x=(px/size-.512)/.31, y=(.53-py/348)/.30;
    // Restrict shading to the exposed peach-colored facial skin; hair and eyes retain their base appearance.
    if(source.data[i+3]>180 && r>g+8 && g>b+5 && r>150 && x*x+y*y<1.2) pixels.push({i,x,y});
   }
   const render = (mode, angle, elevation=0) => {
    const output=doc.createElement('canvas'); output.width=size;output.height=348;
    const ox=output.getContext('2d'), data=new ImageData(new Uint8ClampedArray(source.data),size,348);
    const a=angle*Math.PI/180, e=elevation*Math.PI/180, L=[Math.sin(a)*Math.cos(e),Math.sin(e),Math.cos(a)*Math.cos(e)];
    for(const p of pixels) {
     let light, t=sampleT(map,angle>=0?p.x:-p.x,p.y);
     if(mode==='threshold') {
      const gray=Math.round(t*255), edge=Math.abs(t-Math.abs(angle)/180)<.012;
      data.data[p.i]=edge?255:gray;data.data[p.i+1]=edge?255:gray;data.data[p.i+2]=edge?255:gray;
      continue;
     }
     if(mode==='normal') {
      const nx=p.x,ny=p.y,nz=Math.sqrt(Math.max(.01,1-p.x*p.x-p.y*p.y));
      light=smooth(-.03,.03,nx*L[0]+ny*L[1]+nz*L[2]);
     } else light=faceLit(map,p.x,p.y,angle,mode==='key'?0:.12);
     const factors=[.53+.47*light,.49+.51*light,.61+.39*light];
     for(let c=0;c<3;c++)data.data[p.i+c]=Math.round(source.data[p.i+c]*factors[c]);
    }
    ox.putImageData(data,0,0);return output;
   };
   if(processCanvas) {
    const c=processCanvas.getContext('2d'); c.fillStyle='#191919';c.fillRect(0,0,1400,690);
    c.fillStyle='#eee';c.font='500 24px system-ui';
    c.fillText('01 关键帧阴影',30,45);c.fillText('02 角度阈值 T',610,45);c.fillText('03 运行时受光',1025,45);
    [30,60,90,120,150].forEach((angle,k)=>{
     const x=28+(k%3)*175,y=80+Math.floor(k/3)*270;
     c.drawImage(render('key',angle),x,y,162,176);
     c.fillStyle='#bbb';c.font='18px system-ui';c.textAlign='center';c.fillText(angle+'°',x+81,y+205);
    });
    c.drawImage(render('threshold',70),590,125,320,348);
    c.drawImage(render('shade',70),1010,125,320,348);
    c.textAlign='center';c.fillStyle='#bbb';c.font='18px system-ui';
    c.fillText('灰度 = 进入阴影的角度 / 180°',750,525);c.fillText('光源水平角 70°',1170,525);
    c.strokeStyle='#aaa';c.lineWidth=2;
    for(const x of [550,940]){c.beginPath();c.moveTo(x,300);c.lineTo(x+40,300);c.lineTo(x+30,294);c.moveTo(x+40,300);c.lineTo(x+30,306);c.stroke();}
    c.textAlign='left';c.fillStyle='#8f8f8f';c.font='17px system-ui';
    c.fillText('同一角色底图 · 程序计算的面部遮罩 · 发型与眼睛保持底图表现',30,635);
    c.fillText('二维插画教学合成；灰度为线性数据直接显示，并非游戏资产或三维实机渲染。',30,666);
   }
   if(faceCanvas) {
    faceCanvas.width=1200;faceCanvas.height=490;
    const c=faceCanvas.getContext('2d'),az=doc.querySelector('#face-az'),el=doc.querySelector('#face-el');
    const draw=()=>{
     doc.querySelector('#face-az-out').value=az.value+'°';doc.querySelector('#face-el-out').value=el.value+'°';
     c.fillStyle='#191919';c.fillRect(0,0,1200,490);
     ['normal','threshold','shade'].forEach((mode,k)=>{
      c.drawImage(render(mode,Number(az.value),Number(el.value)),40+k*400,12,320,348);
      c.textAlign='center';c.fillStyle='#eee';c.font='22px system-ui';
      c.fillText(['解析法线近似','角度阈值图','设计阴影'][k],200+k*400,408);
      c.fillStyle='#999';c.font='17px system-ui';c.fillText(['非真实模型法线','白线：当前阈值等值线','仅按水平光向变化'][k],200+k*400,444);
     });
    };az.addEventListener('input',draw);el.addEventListener('input',draw);draw();
   }
  };
  portrait.src=new URL('toon/anime-face-base.png',doc.currentScript?.src || new URL('assets/toon-study.js',doc.baseURI)).href;
 }

 const progress = doc.createElement('div'); progress.className = 'reading-progress'; progress.setAttribute('aria-hidden', 'true'); doc.body.append(progress);
 const update = () => { const h = doc.documentElement.scrollHeight - innerHeight; progress.style.width = (h > 0 ? Math.min(100, scrollY / h * 100) : 0) + '%'; };
 addEventListener('scroll', update, { passive: true }); addEventListener('resize', update); update();
})();
