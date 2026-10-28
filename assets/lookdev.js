(() => {
  const canvas = document.querySelector('.lookdev-canvas');
  if (!canvas) return;
  const gl = canvas.getContext('webgl', { alpha: false, antialias: true, depth: true });
  if (!gl) return;
  gl.getExtension('OES_standard_derivatives');
  gl.getExtension('OES_element_index_uint');

  const fs = `
    #extension GL_OES_standard_derivatives : enable
    precision highp float;
    uniform vec3 uLight;
    uniform vec3 uCam;
    uniform vec3 uEyeA;
    uniform vec3 uEyeB;
    uniform float uShade;
    uniform sampler2D uMap;
    uniform sampler2D uNrm;
    uniform sampler2D uArm;
    uniform float uHasMap;
    uniform float uHasNrm;
    uniform float uHasArm;
    uniform float uRoughOnly;
    varying vec3 vN;
    varying vec3 vW;
    varying vec3 vObj;
    varying vec2 vUv;
    float sat(float x) { return clamp(x, 0.0, 1.0); }
    float ggx(float NoH, float rough) {
      float a = rough * rough;
      float a2 = a * a;
      float d = NoH * NoH * (a2 - 1.0) + 1.0;
      return a2 / (3.14159 * d * d + 0.0008);
    }
    vec3 tonemap(vec3 c) {
      c = max(c, 0.0);
      c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
      return pow(clamp(c, 0.0, 1.0), vec3(0.95));
    }
    vec3 albedo() {
      if (uHasMap < 0.5) return vec3(0.72, 0.68, 0.62);
      return pow(texture2D(uMap, vUv).rgb, vec3(2.2));
    }
    vec3 shadeNormal(vec3 n) {
      if (uHasNrm < 0.5) return n;
      vec3 tn = texture2D(uNrm, vUv).xyz * 2.0 - 1.0;
      tn.y = -tn.y;
      vec3 dp1 = dFdx(vW);
      vec3 dp2 = dFdy(vW);
      vec2 du1 = dFdx(vUv);
      vec2 du2 = dFdy(vUv);
      vec3 t = dp1 * du2.y - dp2 * du1.y;
      if (dot(t, t) < 1e-8) return n;
      t = normalize(t);
      vec3 b = cross(n, t);
      return normalize(t * tn.x + b * tn.y + n * tn.z);
    }
    void main() {
      vec3 nGeom = normalize(vN);
      if (!gl_FrontFacing) nGeom = -nGeom;
      vec3 n = shadeNormal(nGeom);
      vec3 l = normalize(uLight);
      vec3 v = normalize(uCam - vW);
      vec3 h = normalize(l + v);
      float ndl = sat(dot(n, l));
      float ndv = sat(dot(n, v));
      vec3 alb = albedo();
      float ao = 1.0;
      float rough = 0.55;
      if (uHasArm > 0.5) {
        vec3 arm = texture2D(uArm, vUv).rgb;
        rough = clamp(arm.g, 0.08, 1.0);
        if (uRoughOnly < 0.5) ao = arm.r;
      }
      vec3 col = vec3(0.0);
      if (uShade < 0.5) {
        float curv = clamp(length(fwidth(nGeom)) * 6.0, 0.0, 1.5);
        float nd = dot(n, l);
        float band = exp(-nd * nd * (5.0 + curv * 14.0));
        vec3 blood = vec3(0.5, 0.06, 0.035);
        col = alb * sat(nd * 0.42 + 0.58) + blood * band * 0.55 + blood * sat(-nd) * 0.06;
        float oil = ggx(sat(dot(nGeom, h)), 0.1) * sat(dot(nGeom, l));
        float broad = ggx(sat(dot(n, h)), 0.45) * ndl * 0.2;
        col += vec3(1.0, 0.94, 0.88) * (oil * 0.28 + broad);
      } else if (uShade < 1.5) {
        vec3 q = normalize(vObj);
        float irisR = length(q.xy);
        float inIris = (1.0 - smoothstep(0.2, 0.26, irisR)) * smoothstep(0.15, 0.45, q.z);
        float pupil = 1.0 - smoothstep(0.07, 0.1, irisR);
        float spokes = 0.8 + 0.2 * sin(atan(q.y, q.x) * 12.0);
        vec3 iris = mix(vec3(0.04, 0.2, 0.14), vec3(0.02, 0.06, 0.04), spokes);
        iris = mix(iris, vec3(0.01, 0.008, 0.006), pupil);
        vec3 sclera = vec3(0.8, 0.76, 0.72) * (0.5 + 0.6 * ndl);
        vec3 base = mix(sclera, iris, inIris);
        float catch = pow(sat(dot(nGeom, h)), 900.0);
        float fres = pow(1.0 - ndv, 3.5);
        col = base + vec3(1.0) * catch * 1.5 + fres * 0.16;
      } else if (uShade < 2.5) {
        float fu = abs(fract(vUv.x * 18.0) - 0.5);
        float fv = abs(fract(vUv.y * 18.0) - 0.5);
        float weave = 0.78 + 0.22 * max(smoothstep(0.48, 0.2, fu), smoothstep(0.48, 0.2, fv));
        float sheen = pow(1.0 - ndv, 2.4);
        col = alb * weave * (0.18 + sat(dot(n, l) * 0.35 + 0.65)) * ao;
        col += vec3(0.95, 0.9, 0.78) * sheen * 0.55;
      } else if (uShade < 3.5) {
        vec3 dp1 = dFdx(vW);
        vec3 dp2 = dFdy(vW);
        vec2 du1 = dFdx(vUv);
        vec2 du2 = dFdy(vUv);
        vec3 t = dp1 * du2.y - dp2 * du1.y;
        if (dot(t, t) < 1e-8) t = vec3(1.0, 0.0, 0.0);
        t = normalize(t);
        vec3 b = normalize(cross(n, t));
        float ax = 0.08;
        float ay = 0.55;
        float dh = dot(t, h) / ax;
        float bh = dot(b, h) / ay;
        float nh = sat(dot(n, h));
        float dd = dh * dh + bh * bh + nh * nh;
        float streak = 1.0 / (3.14159 * ax * ay * dd * dd + 0.001);
        col = alb * (0.07 + ndl * 0.28) + vec3(1.0, 0.94, 0.88) * streak * ndl * 0.28;
      } else if (uShade < 4.5) {
        float thread = min(abs(fract(vUv.x * 16.0) - 0.5), abs(fract(vUv.y * 28.0) - 0.5));
        float yarn = 1.0 - smoothstep(0.02, 0.08, thread);
        vec3 skin = vec3(0.58, 0.3, 0.22) * sat(dot(n, l) * 0.35 + 0.7);
        col = mix(skin, vec3(0.07, 0.06, 0.06), yarn * 0.82);
        col += vec3(0.9, 0.88, 0.84) * pow(sat(dot(n, h)), 70.0) * ndl * 0.4;
        col += vec3(0.22) * pow(1.0 - ndv, 3.0);
      } else if (uShade < 5.5) {
        vec3 dp1 = dFdx(vW);
        vec3 dp2 = dFdy(vW);
        vec2 du1 = dFdx(vUv);
        vec2 du2 = dFdy(vUv);
        vec3 tv = dp1 * du2.x - dp2 * du1.x;
        if (dot(tv, tv) < 1e-8) tv = vec3(0.0, 1.0, 0.0);
        vec3 T = normalize(tv);
        float tl = asin(clamp(dot(T, l), -1.0, 1.0));
        float tvv = asin(clamp(dot(T, v), -1.0, 1.0));
        float th = 0.5 * (tl + tvv);
        float R = exp(-(th - 0.08) * (th - 0.08) / 0.012);
        float TT = exp(-(th + 0.18) * (th + 0.18) / 0.02);
        float TRT = exp(-(th + 0.4) * (th + 0.4) / 0.045);
        float facing = sat(dot(n, l) * 0.6 + 0.4);
        col = vec3(0.16, 0.06, 0.03) * (0.4 + facing);
        col += vec3(0.95, 0.92, 0.86) * R * 1.15;
        col += vec3(0.75, 0.32, 0.08) * TT * facing * 1.5;
        col += vec3(0.4, 0.08, 0.03) * TRT * facing;
      } else if (uShade < 6.5) {
        col = alb * ao * (0.12 + ndl);
        col += vec3(0.9) * pow(sat(dot(n, h)), mix(40.0, 6.0, rough)) * ndl * (1.0 - rough) * 0.25;
      } else if (uShade < 7.5) {
        float slope = sat(1.0 - n.y);
        vec3 tint = mix(vec3(0.55, 0.85, 0.4), vec3(0.75, 0.62, 0.45), smoothstep(0.12, 0.38, slope));
        tint = mix(tint, vec3(0.7, 0.68, 0.64), smoothstep(0.34, 0.62, slope));
        col = mix(alb, alb * tint, 0.55) * ao * (0.32 + ndl * 1.05);
      } else if (uShade < 8.5) {
        vec3 sun = normalize(vec3(0.2, 0.55, -0.8));
        float key = sat(dot(n, sun));
        float back = sat(dot(-n, sun));
        col = alb * (0.18 + key * 0.75) + alb * vec3(1.3, 1.6, 0.4) * back * 1.1;
      } else if (uShade < 9.5) {
        float cavity = sat(n.y * 0.5 + 0.5);
        if (uHasNrm > 0.5) cavity *= sat(0.35 + texture2D(uNrm, vUv).b);
        float fill = sat(dot(n, normalize(vec3(-0.45, 0.4, 0.35))));
        col = alb * (0.22 + ndl * 0.8 + fill * 0.3) * mix(0.55, 1.0, cavity) * ao;
        col += vec3(0.8) * pow(sat(dot(n, h)), mix(8.0, 48.0, 1.0 - rough)) * ndl * (1.0 - rough) * 0.35;
      } else {
        vec3 wn = cross(dFdx(vW), dFdy(vW));
        if (dot(wn, wn) > 1e-8) n = normalize(wn);
        float fres = mix(0.04, 1.0, pow(1.0 - sat(dot(n, v)), 4.0));
        vec3 refl = mix(vec3(0.08, 0.16, 0.28), vec3(0.55, 0.68, 0.82), sat(reflect(-v, n).y));
        vec3 deep = vec3(0.02, 0.08, 0.1);
        float spec = pow(sat(dot(n, h)), 140.0) * sat(dot(n, l));
        col = mix(deep, refl, fres) + vec3(1.0, 0.96, 0.9) * spec;
      }
      gl_FragColor = vec4(tonemap(col), 1.0);
    }
  `;
  const vs = `
    attribute vec3 aPos;
    attribute vec3 aNrm;
    attribute vec2 aUv;
    uniform mat4 uMvp;
    uniform mat4 uModel;
    uniform mat3 uNrmMat;
    uniform float uShade;
    uniform float uTime;
    varying vec3 vN;
    varying vec3 vW;
    varying vec3 vObj;
    varying vec2 vUv;
    void main() {
      vec3 p = aPos;
      if (uShade > 9.5) {
        p.y += sin(p.x * 14.0 + uTime * 1.4) * 0.008 + sin(p.z * 11.0 - uTime * 1.1) * 0.006;
      }
      vec4 w = uModel * vec4(p, 1.0);
      vW = w.xyz;
      vObj = p;
      vN = normalize(uNrmMat * aNrm);
      vUv = aUv;
      gl_Position = uMvp * vec4(p, 1.0);
    }
  `;

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
  gl.useProgram(program);
  const loc = {
    mvp: gl.getUniformLocation(program, 'uMvp'),
    model: gl.getUniformLocation(program, 'uModel'),
    nrm: gl.getUniformLocation(program, 'uNrmMat'),
    light: gl.getUniformLocation(program, 'uLight'),
    cam: gl.getUniformLocation(program, 'uCam'),
    eyeA: gl.getUniformLocation(program, 'uEyeA'),
    eyeB: gl.getUniformLocation(program, 'uEyeB'),
    shade: gl.getUniformLocation(program, 'uShade'),
    time: gl.getUniformLocation(program, 'uTime'),
    map: gl.getUniformLocation(program, 'uMap'),
    nmap: gl.getUniformLocation(program, 'uNrm'),
    arm: gl.getUniformLocation(program, 'uArm'),
    hasMap: gl.getUniformLocation(program, 'uHasMap'),
    hasNrm: gl.getUniformLocation(program, 'uHasNrm'),
    hasArm: gl.getUniformLocation(program, 'uHasArm'),
    roughOnly: gl.getUniformLocation(program, 'uRoughOnly')
  };
  const aPos = gl.getAttribLocation(program, 'aPos');
  const aNrm = gl.getAttribLocation(program, 'aNrm');
  const aUv = gl.getAttribLocation(program, 'aUv');

  function ident() {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  }
  function mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
    }
    return o;
  }
  function trs(t, r, s) {
    const x = r[0], y = r[1], z = r[2], w = r[3];
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    const m = ident();
    m[0] = (1 - (yy + zz)) * s[0];
    m[1] = (xy + wz) * s[0];
    m[2] = (xz - wy) * s[0];
    m[4] = (xy - wz) * s[1];
    m[5] = (1 - (xx + zz)) * s[1];
    m[6] = (yz + wx) * s[1];
    m[8] = (xz + wy) * s[2];
    m[9] = (yz - wx) * s[2];
    m[10] = (1 - (xx + yy)) * s[2];
    m[12] = t[0];
    m[13] = t[1];
    m[14] = t[2];
    return m;
  }
  function nodeMatrix(node) {
    if (node.matrix) return new Float32Array(node.matrix);
    return trs(node.translation || [0, 0, 0], node.rotation || [0, 0, 0, 1], node.scale || [1, 1, 1]);
  }
  function transformPoint(m, x, y, z) {
    return [
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14]
    ];
  }
  function transformNormal(m, x, y, z) {
    const nx = m[0] * x + m[4] * y + m[8] * z;
    const ny = m[1] * x + m[5] * y + m[9] * z;
    const nz = m[2] * x + m[6] * y + m[10] * z;
    const len = Math.hypot(nx, ny, nz) || 1;
    return [nx / len, ny / len, nz / len];
  }
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const m = new Float32Array(16);
    m[0] = f / aspect;
    m[5] = f;
    m[10] = (far + near) / (near - far);
    m[11] = -1;
    m[14] = (2 * far * near) / (near - far);
    return m;
  }
  function lookAt(eye, target, up) {
    const zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    const zl = Math.hypot(zx, zy, zz) || 1;
    const z0 = zx / zl, z1 = zy / zl, z2 = zz / zl;
    let xx = up[1] * z2 - up[2] * z1;
    let xy = up[2] * z0 - up[0] * z2;
    let xz = up[0] * z1 - up[1] * z0;
    const xl = Math.hypot(xx, xy, xz) || 1;
    xx /= xl; xy /= xl; xz /= xl;
    const yx = z1 * xz - z2 * xy, yy = z2 * xx - z0 * xz, yz = z0 * xy - z1 * xx;
    const m = ident();
    m[0] = xx; m[1] = yx; m[2] = z0;
    m[4] = xy; m[5] = yy; m[6] = z1;
    m[8] = xz; m[9] = yz; m[10] = z2;
    m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    m[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
    return m;
  }
  function rotateY(a) {
    const m = ident();
    const c = Math.cos(a), s = Math.sin(a);
    m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
    return m;
  }
  function rotateX(a) {
    const m = ident();
    const c = Math.cos(a), s = Math.sin(a);
    m[5] = c; m[6] = -s; m[9] = s; m[10] = c;
    return m;
  }

  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const bytesOf = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  function readAccessor(gltf, bins, index) {
    const acc = gltf.accessors[index];
    const view = gltf.bufferViews[acc.bufferView];
    const bin = bins[view.buffer];
    const n = comps[acc.type];
    const stride = view.byteStride || n * bytesOf[acc.componentType];
    const start = (view.byteOffset || 0) + (acc.byteOffset || 0);
    const out = new Float32Array(acc.count * n);
    const src = new DataView(bin);
    for (let i = 0; i < acc.count; i++) {
      const o = start + i * stride;
      for (let k = 0; k < n; k++) {
        const p = o + k * bytesOf[acc.componentType];
        let v = 0;
        if (acc.componentType === 5126) v = src.getFloat32(p, true);
        else if (acc.componentType === 5123) v = src.getUint16(p, true);
        else if (acc.componentType === 5125) v = src.getUint32(p, true);
        else if (acc.componentType === 5121) v = src.getUint8(p);
        else if (acc.componentType === 5122) v = src.getInt16(p, true);
        out[i * n + k] = v;
      }
    }
    return out;
  }
  function loadImage(url) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = url;
    });
  }
  function makeTexture(image) {
    if (!image) return null;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    const pot = (v) => (v & (v - 1)) === 0;
    if (pot(image.width) && pot(image.height)) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return tex;
  }
  async function loadGltf(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(url);
    const dir = url.slice(0, url.lastIndexOf('/') + 1);
    let gltf;
    let bins;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46) {
      const view = new DataView(bytes.buffer);
      const jsonLength = view.getUint32(12, true);
      gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
      const binStart = 20 + jsonLength;
      const binLength = view.getUint32(binStart, true);
      bins = [bytes.buffer.slice(binStart + 8, binStart + 8 + binLength)];
    } else {
      gltf = JSON.parse(new TextDecoder().decode(bytes));
      bins = [];
      for (const buffer of gltf.buffers) {
        const buf = await fetch(dir + buffer.uri);
        bins.push(await buf.arrayBuffer());
      }
    }
    const imageNames = (gltf.images || []).map((image) => `${image.name || ''} ${image.uri || ''}`);
    const images = [];
    for (const image of gltf.images || []) {
      if (image.uri) images.push(await loadImage(dir + image.uri));
      else images.push(null);
    }
    const textures = (gltf.textures || []).map((texture) => makeTexture(images[texture.source]));
    const parts = [];
    const partSamples = [];
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    function bake(mesh, matrix) {
      for (const prim of mesh.primitives) {
        const pos = readAccessor(gltf, bins, prim.attributes.POSITION);
        const nrm = prim.attributes.NORMAL != null ? readAccessor(gltf, bins, prim.attributes.NORMAL) : null;
        const uv = prim.attributes.TEXCOORD_0 != null ? readAccessor(gltf, bins, prim.attributes.TEXCOORD_0) : null;
        const idx = prim.indices != null ? readAccessor(gltf, bins, prim.indices) : null;
        const count = pos.length / 3;
        const inter = new Float32Array(count * 8);
        const samples = [];
        for (let i = 0; i < count; i++) {
          const p = transformPoint(matrix, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
          const nn = nrm ? transformNormal(matrix, nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) : [0, 1, 0];
          inter.set(p, i * 8);
          inter.set(nn, i * 8 + 3);
          inter[i * 8 + 6] = uv ? uv[i * 2] : 0;
          inter[i * 8 + 7] = uv ? uv[i * 2 + 1] : 0;
          for (let k = 0; k < 3; k++) {
            min[k] = Math.min(min[k], p[k]);
            max[k] = Math.max(max[k], p[k]);
          }
          if (i % 3 === 0) samples.push({ x: p[0], y: p[1], z: p[2], nx: nn[0], ny: nn[1], nz: nn[2] });
        }
        partSamples.push(samples);
        let indices;
        if (idx) indices = idx;
        else {
          indices = new Float32Array(count);
          for (let i = 0; i < count; i++) indices[i] = i;
        }
        const mat = (gltf.materials || [])[prim.material] || {};
        const pbr = mat.pbrMetallicRoughness || {};
        const doubleSided = !!mat.doubleSided;
        const map = pbr.baseColorTexture ? textures[pbr.baseColorTexture.index] : null;
        const nmap = mat.normalTexture ? textures[mat.normalTexture.index] : null;
        const arm = pbr.metallicRoughnessTexture ? textures[pbr.metallicRoughnessTexture.index] : null;
        const armSource = pbr.metallicRoughnessTexture ? gltf.textures[pbr.metallicRoughnessTexture.index].source : -1;
        const roughOnly = armSource >= 0 && /rough/i.test(imageNames[armSource] || '') && !/arm/i.test(imageNames[armSource] || '');
        parts.push({ inter, indices, count: indices.length, doubleSided, map, nmap, arm, roughOnly });
      }
    }
    const nodes = gltf.nodes || [];
    function walk(index, parent) {
      const node = nodes[index];
      if (!node) return;
      const world = mul(parent, nodeMatrix(node));
      if (node.mesh != null) bake(gltf.meshes[node.mesh], world);
      for (const child of node.children || []) walk(child, world);
    }
    const scene = gltf.scenes?.[gltf.scene || 0];
    const roots = scene?.nodes?.length ? scene.nodes : nodes.map((_, i) => i).filter((i) => nodes[i].mesh != null);
    for (const index of roots) walk(index, ident());
    if (!parts.length) {
      nodes.forEach((node, index) => { if (node.mesh != null) walk(index, ident()); });
    }
    const center = min.map((v, i) => (v + max[i]) * 0.5);
    const radius = Math.hypot(max[0] - center[0], max[1] - center[1], max[2] - center[2]) * 0.5 || 1;
    const samples = [];
    for (const group of partSamples) {
      for (const s of group) {
        samples.push({
          x: s.x - center[0], y: s.y - center[1], z: s.z - center[2],
          nx: s.nx, ny: s.ny, nz: s.nz
        });
      }
    }
    for (const part of parts) {
      for (let i = 0; i < part.inter.length; i += 8) {
        part.inter[i] -= center[0];
        part.inter[i + 1] -= center[1];
        part.inter[i + 2] -= center[2];
      }
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, part.inter, gl.STATIC_DRAW);
      const indexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      const maxIndex = part.indices.reduce((m, v) => Math.max(m, v), 0);
      const typed = maxIndex > 65535 ? new Uint32Array(part.indices) : new Uint16Array(part.indices);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, typed, gl.STATIC_DRAW);
      part.buffer = buffer;
      part.indexBuffer = indexBuffer;
      part.indexType = maxIndex > 65535 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
      part.inter = null;
    }
    return { parts, radius, center, samples };
  }

  function gridMesh(width, depth, nx, nz, y) {
    const inter = new Float32Array((nx + 1) * (nz + 1) * 8);
    const indices = new Uint16Array(nx * nz * 6);
    let v = 0;
    for (let z = 0; z <= nz; z++) {
      for (let x = 0; x <= nx; x++) {
        const px = (x / nx - 0.5) * width;
        const pz = (z / nz - 0.5) * depth;
        const o = v * 8;
        inter[o] = px; inter[o + 1] = y; inter[o + 2] = pz;
        inter[o + 3] = 0; inter[o + 4] = 1; inter[o + 5] = 0;
        inter[o + 6] = x / nx; inter[o + 7] = z / nz;
        v++;
      }
    }
    let t = 0;
    for (let z = 0; z < nz; z++) {
      for (let x = 0; x < nx; x++) {
        const a = z * (nx + 1) + x;
        indices.set([a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2], t);
        t += 6;
      }
    }
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, inter, gl.STATIC_DRAW);
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    return { buffer, indexBuffer, indexType: gl.UNSIGNED_SHORT, count: indices.length, doubleSided: true, map: null, nmap: null, arm: null };
  }

  function eyeMesh() {
    const rings = 28;
    const slices = 36;
    const inter = new Float32Array(rings * slices * 8);
    const indices = new Uint16Array((rings - 1) * slices * 6);
    let v = 0;
    for (let i = 0; i < rings; i++) {
      const vAngle = Math.PI * (i / (rings - 1) - 0.5);
      const y = Math.sin(vAngle);
      const r = Math.cos(vAngle);
      for (let j = 0; j < slices; j++) {
        const a = j / slices * Math.PI * 2;
        const nx = Math.cos(a) * r;
        const nz = Math.sin(a) * r;
        const o = v * 8;
        inter[o] = nx; inter[o + 1] = y; inter[o + 2] = nz;
        inter[o + 3] = nx; inter[o + 4] = y; inter[o + 5] = nz;
        inter[o + 6] = j / slices; inter[o + 7] = i / (rings - 1);
        v++;
      }
    }
    let k = 0;
    for (let i = 0; i < rings - 1; i++) {
      for (let j = 0; j < slices; j++) {
        const a = i * slices + j;
        const b = i * slices + (j + 1) % slices;
        indices.set([a, a + slices, b, b, a + slices, b + slices], k);
        k += 6;
      }
    }
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, inter, gl.STATIC_DRAW);
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    return { buffer, indexBuffer, indexType: gl.UNSIGNED_SHORT, count: indices.length, doubleSided: false, map: null, nmap: null, arm: null };
  }

  function legMesh() {
    const rings = 28;
    const slices = 20;
    const inter = new Float32Array(rings * slices * 8);
    const indices = new Uint16Array((rings - 1) * slices * 6);
    let v = 0;
    for (let i = 0; i < rings; i++) {
      const t = i / (rings - 1);
      const y = (t - 0.5) * 2.2;
      const calf = Math.exp(-(((t - 0.42) / 0.18) ** 2)) * 0.07;
      const r = 0.16 + t * 0.12 + calf;
      for (let j = 0; j < slices; j++) {
        const a = j / slices * Math.PI * 2;
        const o = v * 8;
        const nx = Math.cos(a), nz = Math.sin(a);
        inter[o] = nx * r; inter[o + 1] = y; inter[o + 2] = nz * r;
        inter[o + 3] = nx; inter[o + 4] = 0; inter[o + 5] = nz;
        inter[o + 6] = j / slices; inter[o + 7] = t;
        v++;
      }
    }
    let k = 0;
    for (let i = 0; i < rings - 1; i++) {
      for (let j = 0; j < slices; j++) {
        const a = i * slices + j;
        const b = i * slices + (j + 1) % slices;
        indices.set([a, a + slices, b, b, a + slices, b + slices], k);
        k += 6;
      }
    }
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, inter, gl.STATIC_DRAW);
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    return { buffer, indexBuffer, indexType: gl.UNSIGNED_SHORT, count: indices.length, doubleSided: false, map: null, nmap: null, arm: null, radius: 1.3 };
  }

  const base = new URL('../assets/models/', location.href).href;
  const kind = canvas.dataset.kind === 'environment' ? 'environment' : 'character';
  const entries = kind === 'character'
    ? [
        { file: 'head/LeePerrySmith.glb', shade: 5, hair: true, yaw: 0.85, pitch: 0.28, fit: 3.5 },
        { generated: 'eye', shade: 1, yaw: 0.0, pitch: 0.0, distance: 2.15 },
        { file: 'head/LeePerrySmith.glb', shade: 0, yaw: 0.55, pitch: 0.06, fit: 3.3 },
        { file: 'pillows/throw_pillows_01_1k.gltf', shade: 2, yaw: 0.7, pitch: 0.42, fit: 3.1 },
        { file: 'pillows/throw_pillows_01_1k.gltf', shade: 3, yaw: 0.9, pitch: 0.48, fit: 3.1 },
        { generated: 'leg', shade: 4, yaw: 0.7, pitch: 0.15, distance: 3.2 }
      ]
    : [
        { file: 'facade/modular_urban_apartments_facade_1k.gltf', shade: 6, yaw: 0.2, pitch: 0.08, fit: 2.5 },
        { file: 'terrain/mountainside_1k.gltf', shade: 7, yaw: 0.55, pitch: 0.42, fit: 2.7 },
        { file: 'fern/fern_02_1k.gltf', shade: 8, yaw: 0.35, pitch: 0.35, fit: 2.5 },
        { file: 'rock/rock_09_1k.gltf', shade: 9, yaw: 0.5, pitch: 0.85, fit: 2.6 },
        { file: 'rock/rock_09_1k.gltf', shade: 10, water: true, yaw: 0.35, pitch: 0.55, fit: 3.2 }
      ];
  const cache = new Map();
  async function modelFor(entry) {
    if (entry.generated === 'leg') return { parts: [legMesh()], radius: 1.3 };
    if (entry.generated === 'eye') return { parts: [eyeMesh()], radius: 1 };
    if (cache.has(entry.file)) return cache.get(entry.file);
    const pending = loadGltf(base + entry.file);
    cache.set(entry.file, pending);
    return pending;
  }

  const names = kind === 'character'
    ? ['hair', 'eye', 'skin', 'cotton', 'silk', 'stocking']
    : ['building', 'terrain', 'plant', 'stone', 'water'];
  let index = Math.max(0, names.indexOf(location.hash.slice(1)));
  const buttons = [...document.querySelectorAll('.switch button')];
  function show(i) {
    index = i;
    buttons.forEach((button, n) => button.setAttribute('aria-selected', n === i ? 'true' : 'false'));
    const next = '#' + names[i];
    if (location.hash !== next) history.replaceState(null, '', next);
  }
  buttons.forEach((button, i) => button.addEventListener('click', () => show(i)));
  show(index);

  const view = { yaw: 0.4, pitch: 0.2 };
  const stage = canvas.closest('.study-stage');
  if (stage) {
    stage.addEventListener('pointerdown', (event) => {
      stage.setPointerCapture(event.pointerId);
      stage.dataset.drag = `${event.clientX},${event.clientY}`;
    });
    stage.addEventListener('pointermove', (event) => {
      if (!stage.hasPointerCapture(event.pointerId)) return;
      const [px, py] = stage.dataset.drag.split(',').map(Number);
      view.yaw += (event.clientX - px) * 0.008;
      view.pitch = Math.max(-0.8, Math.min(1.1, view.pitch + (event.clientY - py) * 0.006));
      stage.dataset.drag = `${event.clientX},${event.clientY}`;
    });
  }
  const light = [0.45, 0.85, 0.55];
  const eyeA = [-0.88, 1.63, 1.66];
  const eyeB = [0.77, 1.64, 1.63];
  const white = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, white);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));

  function bindPart(part) {
    gl.bindBuffer(gl.ARRAY_BUFFER, part.buffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, part.indexBuffer);
    gl.enableVertexAttribArray(aPos);
    gl.enableVertexAttribArray(aNrm);
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 32, 0);
    gl.vertexAttribPointer(aNrm, 3, gl.FLOAT, false, 32, 12);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 32, 24);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, part.map || white);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, part.nmap || white);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, part.arm || white);
    gl.uniform1f(loc.hasMap, part.map ? 1 : 0);
    gl.uniform1f(loc.hasNrm, part.nmap ? 1 : 0);
    gl.uniform1f(loc.hasArm, part.arm ? 1 : 0);
    gl.uniform1f(loc.roughOnly, part.roughOnly ? 1 : 0);
    if (part.doubleSided) gl.disable(gl.CULL_FACE);
    else {
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
    }
  }

  function hairCards(samples) {
    let scalp = (samples || []).filter((s) => s.y > 2.55 && s.ny > 0.62 && s.z < 1.15);
    if (scalp.length < 12) scalp = (samples || []).filter((s) => s.y > 2.1 && s.ny > 0.45);
    const roots = [];
    const step = Math.max(1, Math.floor(scalp.length / 52));
    for (let i = 0; i < scalp.length && roots.length < 52; i += step) roots.push(scalp[i]);
    const segs = 8;
    const inter = new Float32Array(Math.max(1, roots.length) * (segs + 1) * 2 * 8);
    const indices = new Uint16Array(Math.max(1, roots.length) * segs * 6);
    let v = 0;
    let t = 0;
    for (const root of roots) {
      const side = [root.nz, 0, -root.nx];
      const sl = Math.hypot(side[0], side[2]) || 1;
      side[0] /= sl;
      side[2] /= sl;
      const base = v;
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const awayX = root.x;
        const awayZ = root.z;
        const awayLen = Math.hypot(awayX, awayZ) || 1;
        const dx = root.nx * 0.35 + (awayX / awayLen) * 0.8;
        const dz = root.nz * 0.35 + (awayZ / awayLen) * 0.8;
        const px = root.x + dx * (0.2 + u * 1.5);
        const py = root.y + 0.08 - u * u * 2.6;
        const pz = root.z + dz * (0.2 + u * 1.5);
        const w = 0.14 * (1.0 - u * 0.35);
        for (let s = 0; s < 2; s++) {
          const o = v * 8;
          const m = s ? 1 : -1;
          inter[o] = px + side[0] * w * m;
          inter[o + 1] = py;
          inter[o + 2] = pz + side[2] * w * m;
          inter[o + 3] = root.nx;
          inter[o + 4] = 0.15;
          inter[o + 5] = root.nz;
          inter[o + 6] = s;
          inter[o + 7] = u;
          v++;
        }
        if (i < segs) {
          const a = base + i * 2;
          indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], t);
          t += 6;
        }
      }
    }
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, inter, gl.STATIC_DRAW);
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    return { buffer, indexBuffer, indexType: gl.UNSIGNED_SHORT, count: t, doubleSided: true, map: null, nmap: null, arm: null };
  }

  let current = null;
  let currentKey = '';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function frame(now) {
    const entry = entries[index];
    const key = `${entry.file || entry.generated}:${entry.shade}:${entry.hair ? 1 : 0}:${entry.water ? 1 : 0}`;
    if (key !== currentKey) {
      currentKey = key;
      current = null;
      view.yaw = entry.yaw;
      view.pitch = entry.pitch;
      modelFor(entry).then((model) => {
        if (`${entry.file || entry.generated}:${entry.shade}:${entry.hair ? 1 : 0}:${entry.water ? 1 : 0}` !== currentKey) return;
        if (entry.hair && !model.hair) model.hair = hairCards(model.samples);
        if (entry.water && !model.water) model.water = gridMesh(model.radius * 2.8, model.radius * 2.8, 40, 40, -model.radius * 0.02);
        current = model;
      }).catch((error) => {
        canvas.dataset.error = String(error);
      });
    }
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(devicePixelRatio || 1, 1.5);
    const width = Math.max(2, Math.floor(rect.width * scale));
    const height = Math.max(2, Math.floor(rect.height * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    gl.clearColor(0.12, 0.13, 0.15, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    if (current) {
      const radius = current.radius || 1;
      const dist = entry.distance || radius * (entry.fit || 2.9);
      const rot = mul(rotateY(view.yaw), rotateX(view.pitch));
      const offset = transformPoint(rot, 0, radius * 0.08, dist);
      const aim = entry.aim || [0, 0, 0];
      const eye = [aim[0] + offset[0], aim[1] + offset[1], aim[2] + offset[2]];
      const proj = perspective(0.7, width / height, Math.max(0.05, dist * 0.02), dist * 12);
      const viewM = lookAt(eye, aim, [0, 1, 0]);
      const model = ident();
      const mvp = mul(proj, mul(viewM, model));
      const nrm = new Float32Array([model[0], model[1], model[2], model[4], model[5], model[6], model[8], model[9], model[10]]);
      gl.useProgram(program);
      gl.uniformMatrix4fv(loc.mvp, false, mvp);
      gl.uniformMatrix4fv(loc.model, false, model);
      gl.uniformMatrix3fv(loc.nrm, false, nrm);
      gl.uniform3f(loc.light, light[0], light[1], light[2]);
      gl.uniform3f(loc.cam, eye[0], eye[1], eye[2]);
      gl.uniform3f(loc.eyeA, eyeA[0], eyeA[1], eyeA[2]);
      gl.uniform3f(loc.eyeB, eyeB[0], eyeB[1], eyeB[2]);
      gl.uniform1i(loc.map, 0);
      gl.uniform1i(loc.nmap, 1);
      gl.uniform1i(loc.arm, 2);
      gl.uniform1f(loc.time, reduced.matches ? 0 : now * 0.001);
      const draws = [];
      for (const part of current.parts) draws.push([part, entry.hair ? 0 : entry.water ? 9 : entry.shade]);
      if (entry.hair && current.hair) draws.push([current.hair, 5]);
      if (entry.water && current.water) draws.push([current.water, 10]);
      for (const [part, shade] of draws) {
        gl.uniform1f(loc.shade, shade);
        bindPart(part);
        gl.drawElements(gl.TRIANGLES, part.count, part.indexType, 0);
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
