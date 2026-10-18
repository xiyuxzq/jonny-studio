'use strict';
(() => {
 const base = document.body.dataset.base || '';
 const dialog = document.querySelector('#search-dialog');
 const field = document.querySelector('#search-input');
 const results = document.querySelector('.search-results');
 let content = [], loaded = false;
 async function search() {
  try {
   if (!loaded) { const response = await fetch(base + 'assets/content.json'); if (!response.ok) throw Error(); content = await response.json(); loaded = true; }
   const term = field.value.trim().toLocaleLowerCase();
   const matches = content.filter(x => [x.title, x.description, x.category, x.keywords || ''].join(' ').toLocaleLowerCase().includes(term));
   results.replaceChildren();
   if (!matches.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = '没有找到匹配内容，试试“材质”或“研究”。'; results.append(p); }
   matches.forEach(x => { const link = document.createElement('a'); link.className = 'search-result'; link.href = base + x.url; link.textContent = x.title; const sub = document.createElement('small'); sub.textContent = x.category + ' / ' + x.description; link.append(sub); results.append(link); });
  } catch (_) { results.textContent = '搜索暂时不可用。可以从首页浏览全部文章。'; }
 }
 function openSearch() { dialog.showModal(); search(); field.focus(); }
 document.querySelectorAll('[data-search]').forEach(x => x.addEventListener('click', openSearch));
 document.querySelector('.close-search')?.addEventListener('click', () => dialog.close());
 dialog?.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
 field?.addEventListener('input', search);
 document.addEventListener('keydown', e => { if (e.key === '/' && !dialog.open && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) {e.preventDefault(); openSearch();} });
 document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  document.querySelectorAll('.article-row').forEach(row => row.hidden = button.dataset.filter !== '全部' && row.dataset.category !== button.dataset.filter);
 }));
 document.querySelector('[data-share]')?.addEventListener('click', async () => {
  const toast = document.querySelector('#toast');
  try { await navigator.clipboard.writeText(location.href); toast.textContent = '文章链接已复制'; } catch (_) { toast.textContent = '请复制浏览器地址栏中的文章链接'; }
  toast.hidden = false; setTimeout(() => toast.hidden = true, 2600);
 });
 const canvas = document.querySelector('.material-canvas');
 if (!canvas) return;
 const gl = canvas.getContext('webgl', {antialias:false, alpha:false, powerPreference:'low-power'});
 if (!gl) return;
 const vertex = `attribute vec2 aPosition;void main(){gl_Position=vec4(aPosition,0.,1.);}`;
 const fragment = `precision highp float;
 uniform vec2 uResolution;uniform float uTime;uniform float uRoughness;uniform float uMaterial;uniform vec2 uPointer;
 mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
 float scene(vec3 p){p.xz=rot(-.25+uTime*.12)*p.xz;p.yz=rot(.78)*p.yz;p.xy=rot(.2)*p.xy;float a=atan(p.y,p.x);float ridge=.028*cos(a*48.);return length(vec2(length(p.xy)-.82,p.z))-(.315+ridge);}
 vec3 normalAt(vec3 p){vec2 h=vec2(.001,0.);return normalize(vec3(scene(p+h.xyy)-scene(p-h.xyy),scene(p+h.yxy)-scene(p-h.yxy),scene(p+h.yyx)-scene(p-h.yyx)));}
 vec3 env(vec3 r){vec3 c=mix(vec3(.025,.039,.018),vec3(.28,.35,.23),smoothstep(-.6,.6,r.y));float a=pow(max(0.,dot(r,normalize(vec3(-.7,.8,.3)))),20.);float b=pow(max(0.,dot(r,normalize(vec3(.9,.4,-.5)))),45.);c+=vec3(.95,1.,.83)*a*1.8+vec3(.6,.78,.43)*b;float stripe=smoothstep(.88,.95,dot(r,normalize(vec3(.8,.3,.7))));return c+stripe*.8;}
 void main(){vec2 uv=(gl_FragCoord.xy*2.-uResolution)/uResolution.y;vec3 ro=vec3(0.,0.,3.7);vec3 rd=normalize(vec3(uv,-2.65));float d=0.;vec3 p;bool hit=false;for(int i=0;i<76;i++){p=ro+rd*d;float h=scene(p);if(h<.0015){hit=true;break;}d+=h*.75;if(d>7.)break;}
 float vignette=1.-smoothstep(.0,1.9,length(uv));vec3 color=vec3(.066,.085,.052)+vignette*vec3(.048,.067,.038);float shadow=exp(-pow(uv.x*1.7,2.)-pow((uv.y+.76)*9.,2.));color*=1.-shadow*.47;
 if(hit){vec3 n=normalAt(p);vec3 v=-rd;vec3 l=normalize(vec3(-1.5+uPointer.x*2.,2.+uPointer.y,2.5));vec3 halfv=normalize(l+v);float ndl=max(dot(n,l),0.);float ndv=max(dot(n,v),0.);float spec=pow(max(dot(n,halfv),0.),mix(240.,8.,uRoughness));float fres=pow(1.-ndv,5.);vec3 refl=env(reflect(rd,n));vec3 tint=vec3(.76,.83,.68);if(uMaterial>.5)tint=vec3(.92,.48,.22);if(uMaterial>1.5){tint=vec3(.50,.70,.39);color=tint*(.14+ndl*.65)+vec3(.85,.95,.7)*spec*.4+refl*fres*.35;}else{color=refl*tint*(1.-uRoughness*.5)+tint*spec*(1.-uRoughness)*1.8+vec3(.07,.085,.05)*ndl;color+=fres*vec3(.24,.29,.19);}
 float ao=clamp(scene(p+n*.08)/.08,.2,1.);color*=.65+.35*ao;}
 color=vec3(1.)-exp(-color*1.05);color=pow(color,vec3(.4545));float grain=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);color+=(grain-.5)*.015;gl_FragColor=vec4(color,1.);}`;
 function shader(type, source) { const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('Material demo unavailable:', gl.getShaderInfoLog(s)); gl.deleteShader(s); return null; } return s; }
 const vs = shader(gl.VERTEX_SHADER, vertex), fs = shader(gl.FRAGMENT_SHADER, fragment);
 if (!vs || !fs) return;
 const program = gl.createProgram();gl.attachShader(program, vs);gl.attachShader(program, fs);gl.linkProgram(program);
 if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
 gl.useProgram(program);
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
 const pos=gl.getAttribLocation(program,'aPosition');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
 const uniforms={};['uResolution','uTime','uRoughness','uMaterial','uPointer'].forEach(n=>uniforms[n]=gl.getUniformLocation(program,n));
 let roughness=.28,material=0,pointer=[0,0],visible=true,paused=matchMedia('(prefers-reduced-motion: reduce)').matches,elapsed=0,last=0;
 function render(){gl.useProgram(program);gl.uniform2f(uniforms.uResolution,canvas.width,canvas.height);gl.uniform1f(uniforms.uTime,elapsed);gl.uniform1f(uniforms.uRoughness,roughness);gl.uniform1f(uniforms.uMaterial,material);gl.uniform2f(uniforms.uPointer,...pointer);gl.drawArrays(gl.TRIANGLES,0,6);}
 function resize(){const r=canvas.getBoundingClientRect(),scale=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.max(1,Math.round(r.width*scale));canvas.height=Math.max(1,Math.round(r.height*scale));gl.viewport(0,0,canvas.width,canvas.height);render();}
 new ResizeObserver(resize).observe(canvas);
 new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;}).observe(canvas);
 canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();pointer=[(e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2];render();});
 canvas.addEventListener('pointerleave',()=>{pointer=[0,0];render();});
 document.querySelectorAll('[data-material]').forEach(button=>button.addEventListener('click',()=>{material=Number(button.dataset.material);document.querySelectorAll('[data-material]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render();}));
 document.querySelector('#roughness')?.addEventListener('input',e=>{roughness=Number(e.target.value);document.querySelector('#rough-value').value=roughness.toFixed(2);render();});
 const toggle=document.querySelector('#motion-toggle');
 function syncToggle(){if(toggle){toggle.textContent=paused?'继续旋转 ▶':'暂停旋转 Ⅱ';toggle.setAttribute('aria-pressed',String(paused));}}
 toggle?.addEventListener('click',()=>{paused=!paused;syncToggle();render();});syncToggle();
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');reduced.addEventListener('change',e=>{paused=e.matches;syncToggle();render();});
 function frame(now){if(now-last>33){if(!paused&&visible&&!document.hidden){elapsed+=Math.min((now-last)/1000,.08);render();}last=now;}requestAnimationFrame(frame);}
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();canvas.style.display='none';});
 resize();document.querySelector('.stage .fallback').style.visibility='hidden';requestAnimationFrame(frame);
})();
