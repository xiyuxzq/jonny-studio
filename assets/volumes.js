'use strict';
(() => {
  const canvases = [...document.querySelectorAll('.volume-canvas')];
  if (!canvases.length) return;
  const fogFs = `
    precision highp float;
    uniform vec2 uRes;
    uniform vec3 uSun;
    uniform float uTime;
    float sat(float x){return clamp(x,0.0,1.0);}
    vec2 boxHit(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax) {
      vec3 inv = 1.0 / rd;
      vec3 t0 = (bmin - ro) * inv;
      vec3 t1 = (bmax - ro) * inv;
      vec3 tsmaller = min(t0, t1);
      vec3 tbigger = max(t0, t1);
      float tnear = max(max(tsmaller.x, tsmaller.y), tsmaller.z);
      float tfar = min(min(tbigger.x, tbigger.y), tbigger.z);
      if (tfar < max(tnear, 0.0)) return vec2(1.0, -1.0);
      return vec2(tnear, tfar);
    }
    void main() {
      vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
      vec3 rd = normalize(vec3(uv.x, uv.y * 0.85 - 0.08, -1.2));
      vec3 ro = vec3(0.0, 1.4, 4.2);
      vec3 sun = normalize(uSun);
      float tGround = rd.y < -0.001 ? -ro.y / rd.y : 80.0;
      float tend = min(max(tGround, 0.2), 28.0);
      float hitBox = 80.0;
      vec2 a = boxHit(ro, rd, vec3(-1.2, 0.0, -1.0), vec3(-0.2, 1.3, 0.2));
      vec2 b = boxHit(ro, rd, vec3(0.5, 0.0, -2.2), vec3(1.6, 2.1, -1.0));
      if (a.y > a.x) hitBox = min(hitBox, a.x);
      if (b.y > b.x) hitBox = min(hitBox, b.x);
      tend = min(tend, hitBox);
      float t = 0.2;
      float transmit = 1.0;
      vec3 scatter = vec3(0.0);
      float mu = sat(dot(rd, sun));
      float phase = 0.18 + 0.82 * pow(mu, 8.0);
      for (int i = 0; i < 40; i++) {
        if (t > tend || transmit < 0.02) break;
        vec3 p = ro + rd * t;
        float dens = exp(-max(p.y, 0.0) * 0.62) * 0.42;
        float stepLen = 0.28;
        float od = dens * stepLen * 2.2;
        float sunOd = 0.0;
        for (int j = 0; j < 5; j++) {
          vec3 q = p + sun * (float(j) + 0.5) * 0.5;
          sunOd += exp(-max(q.y, 0.0) * 0.62);
        }
        vec3 sunCol = vec3(1.0, 0.62, 0.32) * exp(-sunOd * 0.28) * phase * 1.8;
        vec3 amb = vec3(0.28, 0.4, 0.58) * exp(-max(p.y, 0.0) * 0.25) * 0.28;
        float slice = 1.0 - exp(-od);
        scatter += transmit * (sunCol + amb) * slice;
        transmit *= 1.0 - slice;
        t += stepLen;
      }
      vec3 bg = tGround < hitBox ? vec3(0.07, 0.08, 0.075) : vec3(0.05, 0.07, 0.1);
      if (hitBox < 79.0 && hitBox <= tGround) bg = vec3(0.04, 0.045, 0.05);
      vec3 col = bg * transmit + scatter;
      col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
      gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(0.95)), 1.0);
    }
  `;
  const skyFs = `
    precision highp float;
    uniform vec2 uRes;
    uniform vec3 uSun;
    float sat(float x){return clamp(x,0.0,1.0);}
    void main() {
      vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
      vec3 rd = normalize(vec3(uv.x * 1.05, uv.y * 0.62 + 0.02, -1.0));
      vec3 sun = normalize(uSun);
      float mu = dot(rd, sun);
      vec3 betaR = vec3(0.24, 0.52, 1.15);
      vec3 betaM = vec3(0.06, 0.07, 0.08);
      vec3 sumR = vec3(0.0);
      vec3 sumM = vec3(0.0);
      for (int i = 0; i < 24; i++) {
        float s = (float(i) + 0.5) / 24.0;
        float h = max(rd.y, -0.02) * s * 1.6 + s * s * 0.35;
        h = max(h, 0.004);
        float densR = exp(-h / 0.22);
        float densM = exp(-h / 0.07);
        float sunH = max(h + sun.y * 0.45, 0.004);
        vec3 sunT = exp(-betaR * exp(-sunH / 0.22) * 0.55);
        vec3 viewT = exp(-(betaR * densR + betaM * densM) * 0.085);
        sumR += viewT * sunT * densR * betaR;
        sumM += viewT * sunT * densM;
      }
      float phaseR = 0.75 * (1.0 + mu * mu);
      float g = 0.78;
      float phaseM = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5);
      vec3 col = sumR * phaseR * 0.055 + sumM * phaseM * vec3(1.0, 0.85, 0.65) * 0.012;
      float disc = exp((mu - 1.0) * 2800.0);
      vec3 sunT0 = exp(-betaR * exp(-max(sun.y, 0.02) / 0.2) * 0.35);
      col += vec3(1.0, 0.9, 0.75) * disc * sunT0 * 3.0;
      if (rd.y < 0.0) {
        vec3 ground = vec3(0.05, 0.055, 0.05);
        float glare = pow(sat(dot(normalize(vec3(rd.x, 0.02, rd.z)), sun)), 6.0);
        ground += vec3(0.45, 0.22, 0.08) * glare * sat(-rd.y * 4.0);
        col = mix(ground, col, sat(rd.y * 18.0 + 0.35));
      }
      col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
      gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(0.95)), 1.0);
    }
  `;
  const vs = `attribute vec2 aPos; void main(){ gl_Position=vec4(aPos,0.0,1.0); }`;

  function start(canvas, source) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false });
    if (!gl) return;
    function compile(type, code) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, code);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        canvas.dataset.error = gl.getShaderInfoLog(shader) || 'compile failed';
        return null;
      }
      return shader;
    }
    const program = gl.createProgram();
    const vert = compile(gl.VERTEX_SHADER, vs);
    const frag = compile(gl.FRAGMENT_SHADER, source);
    if (!vert || !frag) return;
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(program);
    const uRes = gl.getUniformLocation(program, 'uRes');
    const uSun = gl.getUniformLocation(program, 'uSun');
    const uTime = gl.getUniformLocation(program, 'uTime');
    const sun = { az: 2.65, el: canvas.dataset.volume === 'sky' ? 0.14 : 0.42 };
    const stage = canvas.closest('.study-stage');
    if (stage) {
      stage.addEventListener('pointerdown', (event) => {
        stage.setPointerCapture(event.pointerId);
        stage.dataset.y = String(event.clientY);
      });
      stage.addEventListener('pointermove', (event) => {
        if (!stage.hasPointerCapture(event.pointerId)) return;
        sun.el = Math.min(1.15, Math.max(0.02, sun.el - (event.clientY - Number(stage.dataset.y)) * 0.004));
        stage.dataset.y = String(event.clientY);
      });
    }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    function frame(now) {
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(devicePixelRatio || 1, 1.4) * 0.75;
      const w = Math.max(2, Math.floor(rect.width * scale));
      const h = Math.max(2, Math.floor(rect.height * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      const ce = Math.cos(sun.el);
      gl.uniform2f(uRes, w, h);
      gl.uniform3f(uSun, Math.sin(sun.az) * ce, Math.sin(sun.el), Math.cos(sun.az) * ce);
      if (uTime) gl.uniform1f(uTime, reduced.matches ? 0.0 : now * 0.001);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  for (const canvas of canvases) start(canvas, canvas.dataset.volume === 'sky' ? skyFs : fogFs);
})();
