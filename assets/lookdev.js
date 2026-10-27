'use strict';
(() => {
  const canvas = document.querySelector('.lookdev-canvas');
  if (!canvas) return;
  const kind = canvas.dataset.kind === 'environment' ? 1 : 0;
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false });
  if (!gl) return;

  const sets = kind === 0
    ? [
        ['hair', '头发'],
        ['eye', '眼球'],
        ['skin', '皮肤'],
        ['cotton', '棉织物'],
        ['silk', '丝绸'],
        ['stocking', '丝袜']
      ]
    : [
        ['building', '建筑混合'],
        ['terrain', '地形'],
        ['plant', '植物'],
        ['stone', '石头'],
        ['water', '水体']
      ];

  const fs = `
    precision highp float;
    uniform vec2 uRes;
    uniform vec3 uLight;
    uniform float uTime;
    uniform float uKind;
    uniform float uMat;
    varying vec2 vUv;

    float hash31(vec3 p) {
      p = fract(p * vec3(0.1031, 0.11369, 0.13787));
      p += dot(p, p.yzx + 19.19);
      return fract((p.x + p.y) * p.z);
    }
    float noise(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(hash31(i), hash31(i+vec3(1,0,0)), f.x),
                     mix(hash31(i+vec3(0,1,0)), hash31(i+vec3(1,1,0)), f.x), f.y),
                 mix(mix(hash31(i+vec3(0,0,1)), hash31(i+vec3(1,0,1)), f.x),
                     mix(hash31(i+vec3(0,1,1)), hash31(i+vec3(1,1,1)), f.x), f.y), f.z);
    }
    float fbm(vec3 p) {
      float s = 0.0;
      float a = 0.5;
      for (int i = 0; i < 4; i++) {
        s += a * noise(p);
        p = p * 2.02 + 1.7;
        a *= 0.5;
      }
      return s;
    }
    float sat(float x) { return clamp(x, 0.0, 1.0); }
    float ggx(vec3 n, vec3 v, vec3 l, float rough, float f0) {
      vec3 h = normalize(v + l);
      float a = rough * rough;
      float NoH = sat(dot(n, h));
      float NoV = sat(dot(n, v));
      float NoL = sat(dot(n, l));
      float d = NoH * NoH * (a * a - 1.0) + 1.0;
      float D = a * a / (3.14159 * d * d);
      float k = (rough + 1.0);
      k = k * k * 0.125;
      float G = (NoV / (NoV * (1.0 - k) + k)) * (NoL / (NoL * (1.0 - k) + k));
      float F = f0 + (1.0 - f0) * pow(1.0 - sat(dot(v, h)), 5.0);
      return D * G * F / max(4.0 * NoV * NoL, 0.001);
    }
    vec3 sky(vec3 rd) {
      return mix(vec3(0.62, 0.72, 0.82), vec3(0.18, 0.32, 0.58), sat(rd.y * 0.8 + 0.2));
    }
    vec3 shadeSphere(vec3 n, vec3 v, vec3 l, vec3 albedo, float rough, float f0, float wrapAmt) {
      float ndl = dot(n, l);
      float wrap = sat((ndl + wrapAmt) / (1.0 + wrapAmt));
      return albedo * wrap + vec3(ggx(n, v, l, rough, f0)) * sat(ndl);
    }

    vec3 character(vec3 rd, vec3 ro) {
      vec3 l = normalize(uLight);
      float b = dot(ro, rd);
      float h2 = b * b - dot(ro, ro) + 1.0;
      vec3 card = ro + rd * (-ro.z / rd.z);
      bool hair = uMat < 0.5 && abs(card.x) < 0.72 && card.y > -1.05 && card.y < 1.05 && rd.z < 0.0;
      if (uMat < 0.5 && !hair) return sky(rd);
      if (uMat >= 0.5 && h2 < 0.0) return sky(rd);
      float t = hair ? (-ro.z / rd.z) : (-b - sqrt(max(h2, 0.0)));
      vec3 p = ro + rd * t;
      vec3 n = hair ? vec3(0.0, 0.0, 1.0) : normalize(p);
      vec3 v = -rd;

      if (uMat < 0.5) {
        float local = fract(card.x * 36.0);
        float strand = smoothstep(0.05, 0.22, local) * smoothstep(0.98, 0.62, local);
        float center = l.y * 0.55;
        float primary = exp(-pow((card.y - center) * 2.4, 2.0));
        float secondary = exp(-pow((card.y - center - 0.42) * 1.7, 2.0));
        vec3 col = vec3(0.16, 0.09, 0.06) * (0.4 + sat(dot(n, l))) * (0.35 + strand);
        col += vec3(0.95, 0.88, 0.72) * primary * strand;
        col += vec3(0.75, 0.32, 0.12) * secondary * strand * 0.85;
        return col;
      }
      if (uMat < 1.5) {
        float r = length(p.xy);
        float pupil = smoothstep(0.1, 0.07, r);
        float iris = smoothstep(0.27, 0.22, r);
        float limbus = smoothstep(0.18, 0.25, r) * smoothstep(0.32, 0.24, r);
        vec3 irisCol = mix(vec3(0.05, 0.16, 0.1), vec3(0.35, 0.55, 0.28), sat(r * 5.0));
        irisCol *= 0.65 + 0.35 * sin(atan(p.y, p.x) * 18.0);
        vec3 col = mix(vec3(0.78, 0.76, 0.74), irisCol, iris);
        col *= mix(1.0, pupil, iris);
        col *= 1.0 - limbus * 0.65;
        col *= 0.55 + 0.45 * sat(dot(n, l));
        col += vec3(1.0) * pow(sat(dot(n, normalize(v + l))), 70.0) * 0.8;
        col += vec3(0.7, 0.85, 1.0) * pow(1.0 - sat(dot(n, v)), 4.0) * 0.35;
        return col;
      }
      if (uMat < 2.5) {
        float ndl = dot(n, l);
        float wrap = sat((ndl + 0.55) / 1.55);
        vec3 scatter = vec3(0.75, 0.18, 0.1) * pow(sat(-ndl), 1.6) * 0.55;
        vec3 albedo = vec3(0.78, 0.48, 0.38) * (0.92 + 0.08 * noise(p * 18.0));
        vec3 col = albedo * wrap + scatter;
        col += vec3(ggx(n, v, l, 0.34, 0.028)) * 0.9;
        col += vec3(ggx(n, v, l, 0.62, 0.04)) * 0.35;
        return col;
      }
      if (uMat < 3.5) {
        float fuzz = pow(1.0 - sat(dot(n, v)), 3.5);
        vec3 albedo = vec3(0.52, 0.54, 0.58) * (0.85 + 0.15 * noise(p * 22.0));
        vec3 col = shadeSphere(n, v, l, albedo, 0.72, 0.04, 0.35);
        col += vec3(0.9) * fuzz * 0.28;
        return col;
      }
      if (uMat < 4.5) {
        vec3 tangent = normalize(cross(n, vec3(0.0, 1.0, 0.0)) + vec3(0.0, 0.001, 0.0));
        vec3 h = normalize(v + l);
        float silk = pow(sat(sqrt(max(1.0 - dot(tangent, h) * dot(tangent, h), 0.0))), 28.0);
        vec3 albedo = vec3(0.45, 0.12, 0.16);
        return albedo * sat(dot(n, l) * 0.7 + 0.3) + vec3(1.0, 0.82, 0.75) * silk;
      }
      float knit = 0.72 + 0.28 * sin(p.x * 70.0) * sin(p.y * 70.0);
      float fres = pow(1.0 - sat(dot(n, v)), 3.0);
      vec3 through = vec3(0.55, 0.28, 0.24) * sat(0.35 + dot(n, l));
      vec3 col = mix(through, vec3(0.08, 0.08, 0.09), 0.35 + fres * 0.4);
      col += vec3(0.85) * fres * 0.45;
      return col * knit;
    }

    vec3 environment(vec3 rd) {
      vec3 l = normalize(uLight);
      vec3 ro = vec3(0.0, 1.35, 2.4);
      if (uMat < 0.5 || uMat > 1.5 && uMat < 2.5) {
        float t = -ro.z / rd.z;
        vec3 p = ro + rd * t;
        if (t < 0.0 || abs(p.x) > 1.15 || p.y < -0.2 || p.y > 1.8) return sky(rd);
        vec3 n = vec3(0.0, 0.0, 1.0);
        vec3 v = -rd;
        if (uMat < 0.5) {
          vec2 uv = p.xy * vec2(4.0, 7.0);
          float row = step(0.12, fract(uv.y));
          float brick = step(0.08, fract(uv.x + step(0.5, fract(uv.y * 0.5))));
          vec3 masonry = mix(vec3(0.28, 0.12, 0.1), vec3(0.55, 0.5, 0.46), row * brick);
          float cover = smoothstep(0.42, 0.62, fbm(vec3(p.xy * 2.2, 1.0)));
          vec3 plaster = vec3(0.72, 0.68, 0.6) * (0.9 + 0.1 * noise(vec3(p.xy * 8.0, 3.0)));
          vec3 albedo = mix(masonry, plaster, cover);
          return shadeSphere(n, v, l, albedo, mix(0.7, 0.45, cover), 0.04, 0.05);
        }
        float vein = smoothstep(0.45, 0.7, fbm(vec3(p.xy * 3.0, 2.0)));
        float back = sat(-dot(n, l));
        vec3 leaf = vec3(0.12, 0.32, 0.08) * sat(dot(n, l) * 0.65 + 0.35);
        leaf += vec3(0.45, 0.7, 0.15) * back * 0.7;
        leaf *= mix(0.7, 1.0, vein);
        return leaf;
      }
      if (uMat < 1.5 || uMat > 3.5) {
        vec3 eye = vec3(0.0, 2.1, 2.4);
        vec3 view = normalize(vec3(rd.x, rd.y - 0.72, rd.z));
        float t = 0.05;
        for (int i = 0; i < 64; i++) {
          vec3 p = eye + view * t;
          float ground = uMat < 1.5
            ? fbm(vec3(p.x, 0.0, p.z) * 0.45) * 0.85
            : sin(p.x * 2.2 + uTime) * 0.06 + sin(p.z * 1.7 - uTime * 0.8) * 0.05;
          if (p.y < ground) {
            float hx = uMat < 1.5 ? fbm(vec3(p.x + 0.05, 0.0, p.z) * 0.45) * 0.85 : sin((p.x + 0.05) * 2.2 + uTime) * 0.06 + sin(p.z * 1.7 - uTime * 0.8) * 0.05;
            float hz = uMat < 1.5 ? fbm(vec3(p.x, 0.0, p.z + 0.05) * 0.45) * 0.85 : sin(p.x * 2.2 + uTime) * 0.06 + sin((p.z + 0.05) * 1.7 - uTime * 0.8) * 0.05;
            vec3 n = normalize(vec3((ground - hx) * 8.0, 0.07, (ground - hz) * 8.0));
            vec3 v = -view;
            if (uMat > 3.5) {
              float fres = pow(1.0 - sat(dot(n, v)), 4.0);
              float depth = sat((0.15 - ground) * 4.0);
              vec3 water = mix(vec3(0.08, 0.28, 0.3), vec3(0.02, 0.06, 0.1), depth);
              vec3 ref = sky(reflect(rd, n));
              return mix(water, ref, fres) + vec3(1.0, 0.95, 0.8) * pow(sat(dot(n, normalize(v + l))), 80.0) * 0.35;
            }
            float slope = 1.0 - n.y;
            float rock = smoothstep(0.25, 0.62, slope);
            float grass = smoothstep(0.45, 0.15, slope);
            vec3 albedo = mix(vec3(0.34, 0.26, 0.16), vec3(0.42, 0.42, 0.4), rock);
            albedo = mix(albedo, vec3(0.18, 0.32, 0.12), grass);
            return shadeSphere(n, v, l, albedo, mix(0.8, 0.45, rock), 0.04, 0.1);
          }
          t += 0.09;
        }
        return sky(rd);
      }
      float b = dot(ro, rd);
      float h2 = b * b - dot(ro, ro) + 1.0;
      if (h2 < 0.0) return sky(rd);
      vec3 p = ro + rd * (-b - sqrt(h2));
      vec3 n = normalize(p + (noise(p * 5.0) - 0.5) * 0.25);
      float cavity = sat(fbm(p * 3.0));
      vec3 albedo = vec3(0.45, 0.44, 0.42) * mix(0.45, 1.0, cavity);
      return shadeSphere(n, -rd, l, albedo, mix(0.75, 0.35, cavity), 0.05, 0.0);
    }

    void main() {
      vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
      vec3 rd = normalize(vec3(uv, -1.55));
      vec3 ro = vec3(0.0, 0.08, 2.7);
      vec3 col = uKind < 0.5 ? character(rd, ro) : environment(rd);
      col = pow(max(col, 0.0), vec3(0.4545));
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const vs = `attribute vec2 aPos; varying vec2 vUv; void main(){ vUv=aPos; gl_Position=vec4(aPos,0.0,1.0); }`;
  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      canvas.dataset.error = gl.getShaderInfoLog(shader) || 'compile failed';
      return null;
    }
    return shader;
  }
  const program = gl.createProgram();
  const vert = compile(gl.VERTEX_SHADER, vs);
  const frag = compile(gl.FRAGMENT_SHADER, fs);
  if (!vert || !frag) return;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    canvas.dataset.error = gl.getProgramInfoLog(program) || 'link failed';
    return;
  }
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  gl.useProgram(program);
  const uRes = gl.getUniformLocation(program, 'uRes');
  const uLight = gl.getUniformLocation(program, 'uLight');
  const uTime = gl.getUniformLocation(program, 'uTime');
  const uKind = gl.getUniformLocation(program, 'uKind');
  const uMat = gl.getUniformLocation(program, 'uMat');
  const light = { x: 0.45, y: 0.75, z: 0.55 };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let material = 0;
  const buttons = [...document.querySelectorAll('[data-mat]')];

  function select(id) {
    const index = sets.findIndex((item) => item[0] === id);
    material = index < 0 ? 0 : index;
    buttons.forEach((button, i) => button.setAttribute('aria-selected', i === material ? 'true' : 'false'));
  }
  buttons.forEach((button) => button.addEventListener('click', () => {
    select(button.dataset.mat);
    history.replaceState(null, '', `#${button.dataset.mat}`);
  }));
  select((location.hash || '').slice(1));
  window.addEventListener('hashchange', () => select(location.hash.slice(1)));

  const stage = canvas.closest('.study-stage');
  if (stage) {
    stage.addEventListener('pointerdown', (event) => {
      stage.setPointerCapture(event.pointerId);
      stage.dataset.x = String(event.clientX);
      stage.dataset.y = String(event.clientY);
    });
    stage.addEventListener('pointermove', (event) => {
      if (!stage.hasPointerCapture(event.pointerId)) return;
      light.x += (event.clientX - Number(stage.dataset.x)) * 0.01;
      light.y -= (event.clientY - Number(stage.dataset.y)) * 0.01;
      stage.dataset.x = String(event.clientX);
      stage.dataset.y = String(event.clientY);
    });
  }

  function frame(now) {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(devicePixelRatio || 1, 1.5) * 0.8;
    const w = Math.max(2, Math.floor(rect.width * scale));
    const h = Math.max(2, Math.floor(rect.height * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    const len = Math.hypot(light.x, light.y, light.z) || 1;
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform3f(uLight, light.x / len, light.y / len, light.z / len);
    gl.uniform1f(uTime, reduced.matches ? 1.2 : now * 0.001);
    gl.uniform1f(uKind, kind);
    gl.uniform1f(uMat, material);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
