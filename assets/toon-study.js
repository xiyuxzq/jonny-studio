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
 if (faceCanvas && faceCanvas.getContext('2d')) {
  const ctx = faceCanvas.getContext('2d');
  const az = doc.querySelector('#face-az'), el = doc.querySelector('#face-el');
  const azOut = doc.querySelector('#face-az-out'), elOut = doc.querySelector('#face-el-out');
  const size = 212, scale = 100, map = bakeThreshold(96, 15);
  // 预计算头部椭球 + 鼻梁凸起的法线；椭球半轴 (0.8, 1, 0.8)
  const pix = [];
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
   const x = (px - size / 2 + .5) / scale, y = -(py - size / 2 + .5) / scale, e = x * x / .64 + y * y;
   if (e > 1) continue;
   const z = .8 * Math.sqrt(1 - e);
   let nx = x / .64, ny = y, nz = z / .64, nl = Math.hypot(nx, ny, nz);
   nx /= nl; ny /= nl; nz /= nl;
   const bump = .22 * Math.exp(-((x / .13) ** 2 + ((y + .1) / .3) ** 2));
   nx += bump * 2 * x / .0169; ny += bump * 2 * (y + .1) / .09;
   nl = Math.hypot(nx, ny, nz);
   pix.push({ o: (py * size + px) * 4, x, y, nx: nx / nl, ny: ny / nl, nz: nz / nl, a: Math.round(Math.min(1, (1 - Math.sqrt(e)) * 80) * 255) });
  }
  const features = cx => {
   ctx.strokeStyle = 'rgba(25,25,25,.7)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
   for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + s * .3 * scale, 33 + size / 2 - .14 * scale, 13, 5, 0, 0, Math.PI * 2); ctx.stroke(); }
   ctx.beginPath(); ctx.moveTo(cx - 17, 33 + size / 2 + .5 * scale); ctx.quadraticCurveTo(cx, 33 + size / 2 + .55 * scale, cx + 17, 33 + size / 2 + .5 * scale); ctx.stroke();
  };
  const drawFace = () => {
   const psi = Number(az.value), elev = Number(el.value) * Math.PI / 180, a = psi * Math.PI / 180;
   azOut.value = psi + '°'; elOut.value = el.value + '°';
   const L = [Math.sin(a) * Math.cos(elev), Math.sin(elev), Math.cos(a) * Math.cos(elev)];
   const thr = Math.abs(psi) / 180;
   ctx.fillStyle = '#191919'; ctx.fillRect(0, 0, 900, 330);
   for (let mode = 0; mode < 3; mode++) {
    const data = ctx.createImageData(size, size);
    for (const p of pix) {
     let c;
     if (mode === 0) c = mixColor(smooth(-.02, .02, p.nx * L[0] + p.ny * L[1] + p.nz * L[2]));
     else {
      const t = sampleT(map, psi >= 0 ? p.x : -p.x, p.y);
      if (mode === 1) {
       const g = Math.round(toSRGB(t) * 255);
       c = Math.abs(t - thr) < .012 ? (t > .5 ? [0, 0, 0] : [255, 255, 255]) : [g, g, g];
      } else c = mixColor(faceLit(map, p.x, p.y, psi, .15));
     }
     data.data[p.o] = c[0]; data.data[p.o + 1] = c[1]; data.data[p.o + 2] = c[2]; data.data[p.o + 3] = p.a;
    }
    const cx = 160 + 290 * mode;
    ctx.putImageData(data, cx - size / 2, 33);
    features(cx);
    ctx.textAlign = 'center'; ctx.fillStyle = '#e4e4e4'; ctx.font = '25px system-ui';
    ctx.fillText(['法线 N·L', '阈值图 T', 'T 与角度比较'][mode], cx, 280);
    ctx.fillStyle = '#a0a0a0'; ctx.font = '16px monospace'; ctx.fillText(['N·L > 0', 'WHITE LINE: T = φ/π', 'T > φ/π'][mode], cx, 310);
   }
  };
  az.addEventListener('input', drawFace); el.addEventListener('input', drawFace); drawFace();
 }

 const progress = doc.createElement('div'); progress.className = 'reading-progress'; progress.setAttribute('aria-hidden', 'true'); doc.body.append(progress);
 const update = () => { const h = doc.documentElement.scrollHeight - innerHeight; progress.style.width = (h > 0 ? Math.min(100, scrollY / h * 100) : 0) + '%'; };
 addEventListener('scroll', update, { passive: true }); addEventListener('resize', update); update();
})();
