'use strict';
(() => {
  const canvas = document.querySelector('.cloud-canvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance'
  });
  if (!gl) {
    canvas.replaceWith(Object.assign(document.createElement('p'), {
      className: 'work-note',
      textContent: '当前浏览器没有可用的 WebGL，体积云无法在本页实时绘制。'
    }));
    return;
  }

  const vsSource = `
    attribute vec2 aPos;
    void main() {
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  const fsSource = `
    precision highp float;
    uniform vec2 uRes;
    uniform vec3 uSun;
    uniform float uTime;

    float hash31(vec3 p) {
      p = fract(p * vec3(0.1031, 0.11369, 0.13787));
      p += dot(p, p.yzx + 19.19);
      return fract((p.x + p.y) * p.z);
    }

    float vnoise(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
      float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
      float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
      float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
      float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
      float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
      float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
      float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
      return mix(
        mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
        mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
        f.z
      );
    }

    float fbm(vec3 p) {
      float sum = 0.0;
      float amp = 0.5;
      float norm = 0.0;
      for (int i = 0; i < 5; i++) {
        sum += amp * vnoise(p);
        norm += amp;
        p = p * 2.02 + vec3(0.37, 1.7, 0.19);
        amp *= 0.5;
      }
      return sum / norm;
    }

    float henyey(float cosTheta, float g) {
      float g2 = g * g;
      float denom = 1.0 + g2 - 2.0 * g * cosTheta;
      return (1.0 - g2) / (4.0 * 3.14159265 * pow(denom, 1.5));
    }

    float puff(vec3 p, vec3 center, vec3 radius) {
      vec3 q = (p - center) / radius;
      return smoothstep(1.0, 0.22, dot(q, q));
    }

    float cloudShape(vec3 p) {
      p.x += uTime * 0.06;
      float density = 0.0;
      density += puff(p, vec3(0.2, 4.35, 9.0), vec3(3.5, 1.2, 2.5));
      density += puff(p, vec3(2.3, 4.85, 8.1), vec3(2.2, 1.55, 1.9));
      density += puff(p, vec3(-2.0, 4.6, 9.5), vec3(2.1, 1.25, 1.8));
      density += puff(p, vec3(0.6, 5.55, 8.5), vec3(1.8, 1.35, 1.6));
      density += puff(p, vec3(3.3, 4.05, 10.0), vec3(1.8, 0.9, 1.6));
      density += puff(p, vec3(-1.2, 3.85, 11.2), vec3(2.4, 0.85, 1.8));
      density += puff(p, vec3(-5.0, 6.0, 18.5), vec3(4.0, 1.5, 2.8));
      density += puff(p, vec3(-2.8, 6.7, 17.2), vec3(2.4, 1.4, 2.0));
      density += puff(p, vec3(-6.4, 5.45, 20.0), vec3(2.3, 1.05, 1.9));
      density += puff(p, vec3(1.4, 5.9, 7.6), vec3(1.1, 0.85, 1.0));
      density += puff(p, vec3(-0.8, 5.7, 8.0), vec3(1.0, 0.75, 0.9));
      density += puff(p, vec3(3.6, 4.7, 7.4), vec3(1.15, 0.8, 1.0));
      density += puff(p, vec3(-2.8, 5.05, 8.2), vec3(1.2, 0.8, 1.05));
      if (density <= 0.02) return 0.0;
      float detail = fbm(p * 1.25 + vec3(1.7, 0.4, 2.2));
      float lobe = fbm(p * 0.48 + vec3(0.2, 1.4, 0.7));
      density = clamp(density * (0.42 + 0.75 * lobe) - (1.0 - detail) * 0.38, 0.0, 1.0);
      return smoothstep(0.12, 0.48, density);
    }

    float cloudDensity(vec3 p) {
      return cloudShape(p);
    }

    float lightEnergy(vec3 p, vec3 sun) {
      float optical = 0.0;
      float stepLen = 0.42;
      for (int i = 0; i < 5; i++) {
        vec3 samplePos = p + sun * (float(i) + 0.5) * stepLen;
        optical += cloudShape(samplePos) * stepLen;
      }
      float thick = exp(-optical * 5.2);
      float soft = exp(-optical * 0.85);
      return mix(thick, soft, 0.42);
    }

    vec3 skyColor(vec3 rd, vec3 sun) {
      float up = clamp(rd.y, 0.0, 1.0);
      vec3 horizon = vec3(0.62, 0.78, 0.94);
      vec3 zenith = vec3(0.08, 0.27, 0.74);
      vec3 color = mix(horizon, zenith, smoothstep(0.0, 0.55, up));
      float mu = max(dot(rd, sun), 0.0);
      color += vec3(1.0, 0.78, 0.46) * pow(mu, 5.0) * 0.7;
      color += vec3(1.0, 0.98, 0.94) * pow(mu, 280.0);
      return color;
    }

    vec3 groundColor(vec3 rd, vec3 ro) {
      float t = -ro.y / min(rd.y, -0.0001);
      float depth = exp(-t * 0.03);
      vec3 earth = vec3(0.45, 0.62, 0.78);
      vec3 near = vec3(0.2, 0.28, 0.32);
      vec3 color = mix(earth, near, depth);
      float toHorizon = smoothstep(-0.28, -0.01, rd.y);
      return mix(color, vec3(0.62, 0.78, 0.94), toHorizon);
    }

    vec2 cloudSpan(vec3 ro, vec3 rd) {
      float y0 = 2.7;
      float y1 = 8.6;
      if (abs(rd.y) < 0.02) {
        if (ro.y > y0 && ro.y < y1) return vec2(0.0, 16.0);
        return vec2(1.0, -1.0);
      }
      float ta = (y0 - ro.y) / rd.y;
      float tb = (y1 - ro.y) / rd.y;
      return vec2(max(min(ta, tb), 0.0), max(ta, tb));
    }

    void main() {
      vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
      vec3 ro = vec3(-0.4, 1.55, 0.4);
      vec3 focus = vec3(1.2, 3.7, 10.0);
      vec3 ww = normalize(focus - ro);
      vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
      vec3 vv = cross(uu, ww);
      vec3 rd = normalize(uu * uv.x + vv * uv.y + ww * 1.45);
      vec3 sun = normalize(uSun);

      vec3 background = rd.y < 0.0 ? groundColor(rd, ro) : skyColor(rd, sun);
      vec2 span = cloudSpan(ro, rd);
      if (span.y <= span.x) {
        gl_FragColor = vec4(pow(background, vec3(0.4545)), 1.0);
        return;
      }

      float jitter = hash31(vec3(gl_FragCoord.xy, 3.1));
      float farT = min(span.y, span.x + 26.0);
      float stepLen = max((farT - span.x) / 60.0, 0.05);
      float t = span.x + jitter * stepLen * 0.45;
      float transmittance = 1.0;
      vec3 scatter = vec3(0.0);
      float cosTheta = dot(rd, sun);
      float phase = 0.42 + henyey(cosTheta, 0.58) * 16.0;
      vec3 sunColor = vec3(1.0, 0.97, 0.9);

      for (int i = 0; i < 64; i++) {
        if (t > farT || transmittance < 0.02) break;
        vec3 pos = ro + rd * t;
        float density = cloudDensity(pos);
        if (density > 0.012) {
          float height = clamp((pos.y - 3.0) / 3.8, 0.0, 1.0);
          float light = lightEnergy(pos, sun);
          float powder = mix(0.55, 1.0, 1.0 - exp(-density * 2.0));
          vec3 ambient = mix(vec3(0.2, 0.32, 0.5), vec3(0.92, 0.95, 1.0), smoothstep(0.2, 0.95, height));
          vec3 luminance = sunColor * light * phase * powder * 1.35 + ambient * (0.04 + height * 0.16);
          float optical = density * 2.6 * stepLen;
          float slice = 1.0 - exp(-optical);
          scatter += transmittance * luminance * slice;
          transmittance *= 1.0 - slice;
        }
        t += stepLen;
      }

      vec3 color = background * transmittance + scatter;
      color = pow(max(color, 0.0), vec3(0.4545));
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) || 'shader compile failed';
      gl.deleteShader(shader);
      throw new Error(log);
    }
    return shader;
  }

  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vsSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fsSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'program link failed');
    }
  } catch (error) {
    canvas.dataset.error = String(error.message || error);
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
  const uSun = gl.getUniformLocation(program, 'uSun');
  const uTime = gl.getUniformLocation(program, 'uTime');

  const sun = { az: 1.15, el: 0.58 };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let running = true;

  function sunVector() {
    const ce = Math.cos(sun.el);
    return [Math.sin(sun.az) * ce, Math.sin(sun.el), Math.cos(sun.az) * ce];
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio || 1, 1.25) * 0.72;
    const width = Math.max(2, Math.floor(rect.width * scale));
    const height = Math.max(2, Math.floor(rect.height * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function draw(now) {
    if (!running) return;
    resize();
    const time = reduced.matches ? 8.0 : now * 0.001;
    gl.uniform2f(uRes, canvas.width, canvas.height);
    const light = sunVector();
    gl.uniform3f(uSun, light[0], light[1], light[2]);
    gl.uniform1f(uTime, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    frame = requestAnimationFrame(draw);
  }

  const stage = canvas.closest('.cloud-stage');
  if (stage) {
    stage.addEventListener('pointerdown', (event) => {
      stage.setPointerCapture(event.pointerId);
      stage.classList.add('is-drag');
      stage.dataset.x = String(event.clientX);
      stage.dataset.y = String(event.clientY);
    });
    stage.addEventListener('pointermove', (event) => {
      if (!stage.classList.contains('is-drag')) return;
      const previousX = Number(stage.dataset.x);
      const previousY = Number(stage.dataset.y);
      sun.az += (event.clientX - previousX) * 0.005;
      sun.el = Math.min(1.05, Math.max(0.06, sun.el - (event.clientY - previousY) * 0.004));
      stage.dataset.x = String(event.clientX);
      stage.dataset.y = String(event.clientY);
    });
    const endDrag = () => stage.classList.remove('is-drag');
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(frame);
      return;
    }
    running = true;
    frame = requestAnimationFrame(draw);
  });

  frame = requestAnimationFrame(draw);
})();
