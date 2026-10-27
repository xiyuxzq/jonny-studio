'use strict';
(() => {
  // Likes checked on Shadertoy, 2026-10-18, from public search sorted by love.
  // Queries were "pbr" and "material". This is not a live ranking.
  const materials = [
    { id: '4sSfzK', name: '[SH17C] Physically Based Shading', author: 'knarkowicz', likes: 627 },
    { id: 'lscBW4', name: 'Old watch (IBL)', author: 'reinder', likes: 288 },
    { id: 'XlKSDR', name: 'Physically-based SDF', author: 'romainguy', likes: 220 },
    { id: 'ld3SRr', name: 'Image Based PBR Material', author: 'Bers', likes: 218 },
    { id: '3tlBW7', name: 'PBR + IBL', author: 'alro', likes: 142 },
    { id: '4t2SzR', name: 'Normal Map Blending', author: 'ZigguratVertigo', likes: 108 },
    { id: 'XdyyDd', name: 'Disney Principled BRDF', author: 'markusm', likes: 104 },
    { id: 'XlscDH', name: 'Dispersion', author: 'tdhooper', likes: 102 },
    { id: '4s2GDV', name: 'Empty Glass', author: 'mu6k', likes: 93 },
    { id: '7dVGzz', name: 'Iridescence: Diffraction Grating', author: 'alro', likes: 90 }
  ];

  const shot = document.querySelector('.stage-shot');
  const preview = document.querySelector('.stage-preview');
  const canvas = document.querySelector('.home-canvas');
  const fallback = document.querySelector('.home-fallback');
  const kicker = document.querySelector('.stage-kicker');
  const credit = document.querySelector('.stage-credit');
  const nameEl = document.querySelector('.stage-name');
  const byEl = document.querySelector('.stage-by');
  if (!shot || !preview || !canvas || !credit) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  function dayKey(date) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  }

  function mix(n) {
    let x = n >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function indexFor(key) {
    return mix(Number(key.replaceAll('-', ''))) % materials.length;
  }

  function pick(now) {
    const today = dayKey(now);
    let index = indexFor(today);
    const yesterday = indexFor(dayKey(new Date(now.getTime() - 86400000)));
    if (index === yesterday) {
      const jump = 1 + (mix(Number(today.replaceAll('-', '')) ^ 0x9e3779b9) % (materials.length - 1));
      index = (index + jump) % materials.length;
    }
    return materials[index];
  }

  function showCredit(item) {
    const href = `https://www.shadertoy.com/view/${item.id}`;
    credit.href = href;
    credit.target = '_blank';
    credit.rel = 'noopener noreferrer';
    nameEl.textContent = item.name;
    byEl.textContent = `${item.author} · ${item.likes} 赞`;
    credit.title = `${item.name}，${item.author}。点赞数于 2026-10-18 在 Shadertoy 核对，不是实时数字。`;
    if (kicker) kicker.textContent = `SHADERTOY · ${dayKey(new Date()).slice(5)}`;
    shot.href = href;
    preview.alt = `${item.name}，作者 ${item.author}。这是 Shadertoy 的公开预览，点击后打开实时画面。`;
  }

  function showLocalCredit() {
    credit.href = 'lab.html';
    credit.removeAttribute('target');
    credit.rel = '';
    nameEl.textContent = '本站材质演示';
    byEl.textContent = '光 × 形体 × 材质';
    credit.title = 'Shadertoy 嵌入不可用，改为本站实时演示';
    if (kicker) kicker.textContent = 'LIVE WEBGL';
    canvas.setAttribute('aria-label', '实时 WebGL 演示：程序化环体随时间转动，移动指针改变金属表面的光照');
  }

  let localStarted = false;
  function startLocal() {
    if (localStarted) return;
    localStarted = true;
    shot.hidden = true;
    showLocalCredit();
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) {
      canvas.hidden = true;
      if (fallback) fallback.hidden = false;
      return;
    }
    canvas.hidden = false;
    if (fallback) fallback.hidden = true;

    const vertex = `attribute vec2 aPosition;void main(){gl_Position=vec4(aPosition,0.,1.);}`;
    const fragment = `precision highp float;
uniform vec2 uResolution;uniform float uTime;uniform float uRoughness;uniform float uMaterial;uniform vec2 uPointer;
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float scene(vec3 p){p.xz=rot(-.25+uTime*.12)*p.xz;p.yz=rot(.78)*p.yz;p.xy=rot(.2)*p.xy;float a=atan(p.y,p.x);float ridge=.028*cos(a*48.);return length(vec2(length(p.xy)-.82,p.z))-(.315+ridge);}
vec3 normalAt(vec3 p){vec2 h=vec2(.001,0.);return normalize(vec3(scene(p+h.xyy)-scene(p-h.xyy),scene(p+h.yxy)-scene(p-h.yxy),scene(p+h.yyx)-scene(p-h.yyx)));}
vec3 env(vec3 r){vec3 c=mix(vec3(.025),vec3(.32),smoothstep(-.6,.6,r.y));float a=pow(max(0.,dot(r,normalize(vec3(-.7,.8,.3)))),20.);float b=pow(max(0.,dot(r,normalize(vec3(.9,.4,-.5)))),45.);c+=vec3(1.)*a*1.8+vec3(.75)*b;float stripe=smoothstep(.88,.95,dot(r,normalize(vec3(.8,.3,.7))));return c+stripe*.8;}
void main(){vec2 uv=(gl_FragCoord.xy*2.-uResolution)/uResolution.y;vec3 ro=vec3(0.,0.,3.7);vec3 rd=normalize(vec3(uv,-2.65));float d=0.;vec3 p;bool hit=false;for(int i=0;i<76;i++){p=ro+rd*d;float h=scene(p);if(h<.0015){hit=true;break;}d+=h*.75;if(d>7.)break;}
float vignette=1.-smoothstep(.0,1.9,length(uv));vec3 color=vec3(.078)+vignette*vec3(.04);float shadow=exp(-pow(uv.x*1.7,2.)-pow((uv.y+.76)*9.,2.));color*=1.-shadow*.47;
if(hit){vec3 n=normalAt(p);vec3 v=-rd;vec3 l=normalize(vec3(-1.5+uPointer.x*2.,2.+uPointer.y,2.5));vec3 halfv=normalize(l+v);float ndl=max(dot(n,l),0.);float ndv=max(dot(n,v),0.);float spec=pow(max(dot(n,halfv),0.),mix(240.,8.,uRoughness));float fres=pow(1.-ndv,5.);vec3 refl=env(reflect(rd,n));vec3 tint=vec3(.82);color=refl*tint*(1.-uRoughness*.5)+tint*spec*(1.-uRoughness)*1.8+vec3(.075)*ndl;color+=fres*vec3(.27);float ao=clamp(scene(p+n*.08)/.08,.2,1.);color*=.65+.35*ao;}
color=vec3(1.)-exp(-color*1.05);color=pow(color,vec3(.4545));float grain=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);color+=(grain-.5)*.015;gl_FragColor=vec4(color,1.);}`;

    function shader(type, source) {
      const s = gl.createShader(type);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        gl.deleteShader(s);
        return null;
      }
      return s;
    }

    const vs = shader(gl.VERTEX_SHADER, vertex);
    const fs = shader(gl.FRAGMENT_SHADER, fragment);
    if (!vs || !fs) {
      canvas.hidden = true;
      if (fallback) fallback.hidden = false;
      return;
    }
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      canvas.hidden = true;
      if (fallback) fallback.hidden = false;
      return;
    }
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    const uniforms = {};
    ['uResolution', 'uTime', 'uRoughness', 'uMaterial', 'uPointer'].forEach((uniformName) => {
      uniforms[uniformName] = gl.getUniformLocation(program, uniformName);
    });

    let pointer = [0, 0];
    let visible = true;
    let paused = reduced.matches;
    let elapsed = paused ? 1.35 : 0;
    let last = 0;

    function render() {
      gl.useProgram(program);
      gl.uniform2f(uniforms.uResolution, canvas.width, canvas.height);
      gl.uniform1f(uniforms.uTime, elapsed);
      gl.uniform1f(uniforms.uRoughness, 0.22);
      gl.uniform1f(uniforms.uMaterial, 0);
      gl.uniform2f(uniforms.uPointer, pointer[0], pointer[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(devicePixelRatio || 1, 1.25);
      canvas.width = Math.max(1, Math.round(rect.width * scale));
      canvas.height = Math.max(1, Math.round(rect.height * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
      render();
    }

    new ResizeObserver(resize).observe(canvas);
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
    }).observe(canvas);
    canvas.addEventListener('pointermove', (event) => {
      const rect = canvas.getBoundingClientRect();
      pointer = [(event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2];
      render();
    });
    canvas.addEventListener('pointerleave', () => {
      pointer = [0, 0];
      render();
    });
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      canvas.hidden = true;
      if (fallback) fallback.hidden = false;
    });
    reduced.addEventListener('change', (event) => {
      paused = event.matches;
      if (paused) elapsed = 1.35;
      render();
    });
    function tick(now) {
      if (!paused && visible && !document.hidden && now - last > 33) {
        elapsed += Math.min((now - last) / 1000, 0.08);
        render();
        last = now;
      } else if (paused || !visible || document.hidden) {
        last = now;
      }
      requestAnimationFrame(tick);
    }
    resize();
    requestAnimationFrame(tick);
  }

  const today = pick(new Date());
  showCredit(today);
  preview.addEventListener('error', () => startLocal(), { once: true });
  preview.src = `https://www.shadertoy.com/media/shaders/${today.id}.jpg`;
})();
