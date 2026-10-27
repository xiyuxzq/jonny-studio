(() => {
  const canvas = document.querySelector('.lookdev-canvas');
  if (!canvas) return;
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false });
  if (!gl) return;

  const fs = `
    precision highp float;
    uniform vec2 uRes;
    uniform vec3 uLight;
    uniform float uMat;
    uniform float uTime;
    float sat(float v) { return clamp(v, 0.0, 1.0); }
    float hash(vec3 p) {
      p = fract(p * 0.1031);
      p += dot(p, p.yzx + 33.33);
      return fract((p.x + p.y) * p.z);
    }
    float noise(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
            mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
        mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
            mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
        f.z);
    }
    float fbm(vec3 p) {
      return noise(p) * 0.55 + noise(p * 2.1) * 0.3 + noise(p * 4.3) * 0.15;
    }
    float hash2(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    float noise2(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x),
                 mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float fbm2(vec2 p) {
      return noise2(p) * 0.55 + noise2(p * 2.05) * 0.28 + noise2(p * 4.2) * 0.17;
    }
    float sphereT(vec3 ro, vec3 rd, float rad) {
      float b = dot(ro, rd);
      float c = dot(ro, ro) - rad * rad;
      float h = b * b - c;
      if (h < 0.0) return -1.0;
      h = sqrt(h);
      float t = -b - h;
      if (t < 0.02) t = -b + h;
      return t < 0.02 ? -1.0 : t;
    }
    vec3 skyLite(vec3 rd, vec3 sun) {
      float h = sat(rd.y);
      vec3 zenith = vec3(0.1, 0.24, 0.55);
      vec3 horizon = vec3(0.62, 0.7, 0.78);
      vec3 col = mix(horizon, zenith, pow(h, 0.55));
      float mu = sat(dot(rd, sun));
      col += vec3(1.0, 0.72, 0.42) * pow(mu, 8.0) * 0.35;
      col += vec3(1.0, 0.96, 0.9) * exp((mu - 1.0) * 1400.0);
      return col;
    }
    vec3 studio(vec3 ro, vec3 rd, vec3 light) {
      float ground = -1.02;
      if (rd.y < -0.02) {
        float t = (ground - ro.y) / rd.y;
        vec3 p = ro + rd * t;
        if (length(p.xz) < 6.0) {
          float tile = smoothstep(0.48, 0.5, abs(fract(p.x * 0.7) - 0.5)) * smoothstep(0.48, 0.5, abs(fract(p.z * 0.7) - 0.5));
          vec3 albedo = mix(vec3(0.34, 0.35, 0.37), vec3(0.22, 0.23, 0.25), tile);
          float occ = 1.0;
          if ((uMat > 0.5 && uMat < 5.5) || (uMat > 8.5 && uMat < 9.5)) {
            float ts = sphereT(p, light, 0.86);
            occ = ts > 0.0 ? 0.28 : 1.0;
          }
          float dist = length(p.xz);
          occ *= sat(1.15 - dist * 0.12);
          return albedo * (0.16 + 0.7 * sat(light.y) * occ);
        }
      }
      return skyLite(rd, light) * 0.55;
    }
    float hairSpec(vec3 T, vec3 H, float power) {
      float c = dot(T, H);
      float s = sqrt(max(1.0 - c * c, 0.0));
      return pow(s, power);
    }
    vec4 strand(vec3 ro, vec3 rd, vec2 center, float radius, float y0, float y1) {
      vec2 oc = ro.xz - center;
      vec2 d = rd.xz;
      float a = dot(d, d);
      if (a < 1e-4) return vec4(-1.0, 0.0, 1.0, 0.0);
      float b = 2.0 * dot(oc, d);
      float c = dot(oc, oc) - radius * radius;
      float disc = b * b - 4.0 * a * c;
      if (disc < 0.0) return vec4(-1.0, 0.0, 1.0, 0.0);
      float s = sqrt(disc);
      float t = (-b - s) / (2.0 * a);
      if (t < 0.02) t = (-b + s) / (2.0 * a);
      if (t < 0.02) return vec4(-1.0, 0.0, 1.0, 0.0);
      vec3 pos = ro + rd * t;
      if (pos.y < y0 || pos.y > y1) return vec4(-1.0, 0.0, 1.0, 0.0);
      vec2 n = (pos.xz - center) / radius;
      return vec4(t, n.x, 0.0, n.y);
    }
    float ggx(float NoH, float rough) {
      float a = rough * rough;
      float a2 = a * a;
      float d = NoH * NoH * (a2 - 1.0) + 1.0;
      return a2 / (3.14159 * d * d + 0.0004);
    }
    float ggxAniso(float NoH, float ToH, float BoH, float ax, float ay) {
      float d = ToH * ToH / (ax * ax) + BoH * BoH / (ay * ay) + NoH * NoH;
      return 1.0 / (3.14159 * ax * ay * d * d + 0.0004);
    }
    vec3 shadeSphere(vec3 p, vec3 n, vec3 rd, vec3 light, vec3 albedo, float rough, float f0, float scatter) {
      vec3 v = -rd;
      vec3 h = normalize(light + v);
      float ndl = sat(dot(n, light));
      float ndv = sat(dot(n, v));
      float ndh = sat(dot(n, h));
      float wrap = sat((dot(n, light) + scatter) / (1.0 + scatter));
      vec3 fill = normalize(vec3(-0.9, 0.35, 0.2));
      vec3 rimL = normalize(vec3(0.15, 0.4, -0.9));
      vec3 diffuse = albedo * (wrap * vec3(1.0, 0.96, 0.9) + sat(dot(n, fill)) * vec3(0.28, 0.34, 0.45) * 0.55 + 0.06);
      float fres = pow(1.0 - ndv, 5.0);
      float spec = ggx(ndh, rough) * (f0 + (1.0 - f0) * fres) * ndl;
      diffuse += albedo * pow(sat(dot(n, rimL)), 2.2) * 0.22;
      return diffuse + spec;
    }
    float waveH(vec2 xz) {
      return sin(xz.x * 1.7 + uTime * 1.1) * 0.06
        + sin(xz.y * 1.3 - uTime * 0.9) * 0.045
        + sin((xz.x + xz.y) * 3.4 + uTime * 1.6) * 0.018;
    }
    float plasterH(vec2 w) {
      return fbm2(w * 0.5) * 0.5 + sat(w.x * 0.42 + 0.05);
    }
    float terrainH(vec2 xz) {
      float n = fbm2(xz * 0.42);
      float ridge = pow(1.0 - abs(n * 2.0 - 1.0), 2.0);
      return ridge * 1.15 + fbm2(xz * 1.3) * 0.06;
    }
    void main() {
      vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
      vec3 light = normalize(uLight);
      vec3 col = vec3(0.0);

      if (uMat < 5.5) {
        vec3 ro = vec3(0.0, 0.05, 3.25);
        vec3 rd = normalize(vec3(uv.x * 0.92, uv.y * 0.92, -1.45));

        if (uMat < 0.5) {
          float best = 80.0;
          vec3 n = vec3(0.0, 1.0, 0.0);
          for (int i = 0; i < 17; i++) {
            float fi = float(i) - 8.0;
            float row = mod(fi, 2.0);
            vec2 c = vec2(fi * 0.048, row * 0.07);
            vec4 hit = strand(ro, rd, c, 0.042, -1.25, 1.2);
            if (hit.x > 0.0 && hit.x < best) {
              best = hit.x;
              n = vec3(hit.y, hit.z, hit.w);
            }
          }
          if (best > 70.0) {
            col = studio(ro, rd, light);
          } else {
            vec3 p = ro + rd * best;
            n = normalize(n + vec3(0.0, noise(p * 30.0) - 0.5, 0.0) * 0.12);
            vec3 T = normalize(vec3(0.12, -cos(p.y * 0.55), sin(p.y * 0.95)));
            vec3 v = -rd;
            float tl = asin(clamp(dot(T, light), -1.0, 1.0));
            float tv = asin(clamp(dot(T, v), -1.0, 1.0));
            float th = 0.5 * (tl + tv) + (noise(p * 12.0) - 0.5) * 0.05;
            float R = exp(-(th - 0.15) * (th - 0.15) / 0.014);
            float TT = exp(-(th + 0.12) * (th + 0.12) / 0.02);
            float TRT = exp(-(th + 0.38) * (th + 0.38) / 0.04);
            vec3 absorb = vec3(0.16, 0.055, 0.025);
            float root = sat((p.y + 1.2) / 2.3);
            absorb = mix(absorb * 0.4, absorb, root);
            float facing = sat(dot(n, light) * 0.7 + 0.3);
            float azi = pow(sat(dot(n, normalize(light + v))), 3.5);
            col = absorb * (0.12 + 0.45 * facing);
            col += vec3(0.95, 0.93, 0.88) * R * (0.2 + azi) * 1.5;
            col += vec3(0.75, 0.32, 0.1) * TT * facing * 1.5;
            col += vec3(0.4, 0.07, 0.025) * TRT * facing;
          }
        } else {
          float t = sphereT(ro, rd, 0.86);
          if (t < 0.0) {
            col = studio(ro, rd, light);
          } else {
            vec3 p = ro + rd * t;
            vec3 n = normalize(p);
            vec3 v = -rd;
            if (uMat < 1.5) {
              vec3 inside = refract(rd, n, 0.73);
              if (dot(inside, inside) < 0.5) inside = rd;
              vec3 irisP = p + inside * 0.2;
              float r = length(irisP.xy);
              float pupil = smoothstep(0.075, 0.09, r);
              float limbus = smoothstep(0.2, 0.215, r) * (1.0 - smoothstep(0.222, 0.245, r));
              vec3 sclera = vec3(0.9, 0.88, 0.85) * (0.96 - 0.04 * noise(p * 12.0));
              float ang = atan(irisP.y, irisP.x);
              float spokes = 0.45 + 0.55 * sin(ang * 28.0);
              spokes = mix(spokes, 0.5 + 0.5 * sin(ang * 9.0 + r * 30.0), 0.4);
              vec3 iris = mix(vec3(0.1, 0.32, 0.24), vec3(0.03, 0.07, 0.05), spokes);
              iris *= 0.82 + 0.18 * sin(r * 110.0);
              iris = mix(iris, vec3(0.42, 0.24, 0.08), smoothstep(0.14, 0.04, r));
              vec3 base = mix(iris, sclera, smoothstep(0.21, 0.235, r));
              base *= mix(1.0, 0.15, 1.0 - pupil);
              base *= mix(1.0, 0.25, limbus);
              float front = sat(dot(n, light) * 0.45 + 0.65);
              vec3 h = normalize(light + v);
              float catch = pow(sat(dot(n, h)), 900.0);
              float broad = pow(sat(dot(n, h)), 40.0);
              float fres = pow(1.0 - sat(dot(n, v)), 4.0);
              col = base * front + vec3(1.0) * catch * 1.6 + vec3(0.75, 0.85, 0.95) * broad * 0.18 + fres * 0.12;
            } else if (uMat < 2.5) {
              float pore = fbm(p * 18.0);
              vec3 n2 = normalize(n + (vec3(noise(p * 28.0), noise(p * 28.0 + 4.0), noise(p * 28.0 + 9.0)) - 0.5) * 0.07);
              float ndl = dot(n2, light);
              float curv = 0.35 + pore * 0.5;
              float band = exp(-ndl * ndl * (6.0 + curv * 16.0));
              vec3 skin = vec3(0.83, 0.52, 0.42);
              vec3 blood = vec3(0.62, 0.07, 0.04);
              vec3 diffuse = skin * sat(ndl * 0.5 + 0.5) + blood * band * 0.75 + blood * sat(-ndl) * 0.08;
              diffuse *= 0.92 + 0.08 * pore;
              vec3 h = normalize(light + v);
              float oil = ggx(sat(dot(n, h)), 0.09) * sat(dot(n, light));
              float broadS = ggx(sat(dot(n2, h)), 0.5) * sat(ndl) * 0.22;
              float fres = pow(1.0 - sat(dot(n, v)), 5.0);
              col = diffuse + vec3(1.0, 0.96, 0.9) * (oil * 0.35 + broadS * (0.65 + fres));
            } else if (uMat < 3.5) {
              float fu = abs(fract(p.x * 7.0) - 0.5);
              float fv = abs(fract(p.y * 7.0) - 0.5);
              float warp = smoothstep(0.48, 0.22, fu);
              float weft = smoothstep(0.48, 0.22, fv);
              float cloth = 0.8 + 0.2 * max(warp * 0.65, weft);
              cloth *= 0.94 + 0.06 * noise(p * 40.0);
              vec3 cotton = vec3(0.73, 0.69, 0.6) * cloth;
              float sheen = pow(1.0 - sat(dot(n, v)), 2.6);
              col = cotton * (0.16 + sat(dot(n, light) * 0.4 + 0.6));
              col += vec3(0.98, 0.92, 0.78) * sheen * 0.85;
            } else if (uMat < 4.5) {
              vec3 T = normalize(cross(n, vec3(0.15, 1.0, 0.02)));
              vec3 B = cross(n, T);
              vec3 h = normalize(light + v);
              float streak = ggxAniso(sat(dot(n, h)), dot(T, h), dot(B, h), 0.08, 0.55);
              vec3 silk = vec3(0.45, 0.06, 0.09);
              float weave = 0.9 + 0.1 * sin(dot(p, T) * 80.0);
              col = silk * weave * (sat(dot(n, light) * 0.35 + 0.25) + 0.08);
              col += vec3(1.0, 0.9, 0.85) * streak * sat(dot(n, light)) * 0.85;
            } else {
              float su = atan(p.z, p.x) * 16.0;
              float sv = asin(clamp(p.y / 0.86, -1.0, 1.0)) * 34.0;
              float yarn = smoothstep(0.28, 0.06, min(abs(fract(su) - 0.5), abs(fract(sv) - 0.5)));
              vec3 skinBehind = vec3(0.58, 0.3, 0.24);
              float through = sat(dot(n, light) * 0.35 + 0.6);
              vec3 h = normalize(light + v);
              float fres = pow(1.0 - sat(dot(n, v)), 3.0);
              float spec = pow(sat(dot(n, h)), 90.0) * sat(dot(n, light));
              col = mix(skinBehind * through, vec3(0.05, 0.045, 0.05), yarn * 0.82);
              col += vec3(0.22, 0.22, 0.24) * fres * (0.25 + yarn);
              col += vec3(0.85) * spec * 0.3;
            }
          }
        }
      } else if (uMat < 6.5) {
        vec2 wall = uv * vec2(1.7, 1.2);
        float rows = wall.y * 7.0;
        float row = floor(rows);
        float bu = wall.x * 5.5 + mod(row, 2.0) * 0.5;
        vec2 cell = vec2(fract(bu), fract(rows));
        float mortar = smoothstep(0.0, 0.06, cell.x) * smoothstep(1.0, 0.94, cell.x) * smoothstep(0.0, 0.08, cell.y) * smoothstep(1.0, 0.92, cell.y);
        vec3 brick = mix(vec3(0.42, 0.16, 0.1), vec3(0.58, 0.26, 0.14), hash2(floor(vec2(bu, rows)) + 4.0));
        brick *= 0.86 + 0.14 * noise2(wall * 20.0);
        vec3 brickLayer = mix(vec3(0.32, 0.3, 0.28), brick, mortar);
        float ph = plasterH(wall);
        float cover = smoothstep(0.5, 0.57, ph);
        float cx = smoothstep(0.5, 0.57, plasterH(wall + vec2(0.008, 0.0)));
        float cy = smoothstep(0.5, 0.57, plasterH(wall + vec2(0.0, 0.008)));
        vec3 n = normalize(vec3((cover - cx) * 10.0, (cover - cy) * 10.0, 1.0));
        n = normalize(n + vec3(cell.x - 0.5, cell.y - 0.5, 0.0) * (1.0 - mortar) * (1.0 - cover) * 0.8);
        vec3 plaster = vec3(0.8, 0.76, 0.68) * (0.92 + 0.08 * fbm2(wall * 9.0));
        vec3 albedo = mix(brickLayer, plaster, cover);
        vec3 sun = normalize(vec3(light.x, light.y, 0.45));
        float ndl = sat(dot(n, sun));
        float ao = mix(0.45, 1.0, mortar);
        col = albedo * (0.12 + ndl) * mix(ao, 1.0, cover);
      } else if (uMat < 7.5) {
        vec3 eye = vec3(0.2, 1.7, 3.2);
        vec3 view = normalize(vec3(uv.x * 1.15, uv.y * 0.8 - 0.02, -1.0));
        float t = 0.3;
        bool hit = false;
        for (int i = 0; i < 48; i++) {
          vec3 p = eye + view * t;
          if (p.y < terrainH(p.xz)) { hit = true; break; }
          t += 0.09 + t * 0.015;
          if (t > 18.0) break;
        }
        if (!hit) {
          col = skyLite(view, light);
        } else {
          float lo = 0.2;
          float hi = t;
          for (int j = 0; j < 6; j++) {
            float mid = 0.5 * (lo + hi);
            vec3 p = eye + view * mid;
            if (p.y < terrainH(p.xz)) hi = mid;
            else lo = mid;
          }
          vec3 p = eye + view * hi;
          float e = 0.05;
          vec3 n = normalize(vec3(terrainH(p.xz - vec2(e, 0.0)) - terrainH(p.xz + vec2(e, 0.0)), 2.0 * e, terrainH(p.xz - vec2(0.0, e)) - terrainH(p.xz + vec2(0.0, e))));
          float slope = sat(1.0 - n.y);
          vec3 grass = vec3(0.16, 0.34, 0.1) * (0.7 + 0.45 * fbm2(p.xz * 4.0));
          vec3 dirt = vec3(0.36, 0.24, 0.12);
          vec3 rock = vec3(0.42, 0.4, 0.37) * (0.75 + 0.35 * fbm2(p.xz * 2.2));
          vec3 albedo = mix(grass, dirt, smoothstep(0.12, 0.32, slope));
          albedo = mix(albedo, rock, smoothstep(0.28, 0.55, slope));
          albedo = mix(albedo, rock * 0.85, smoothstep(0.9, 1.35, p.y));
          float ndl = sat(dot(n, light));
          vec3 ambient = vec3(0.35, 0.45, 0.55) * 0.22;
          col = albedo * (ambient + vec3(1.0, 0.92, 0.78) * ndl);
          col = mix(col, skyLite(view, light), sat((hi - 4.0) / 12.0));
        }
      } else if (uMat < 8.5) {
        vec2 q = uv * vec2(1.3, 1.15) - vec2(0.0, 0.05);
        float leaf = q.x * q.x / 0.42 + q.y * q.y / 0.72;
        if (leaf > 1.0) {
          col = skyLite(normalize(vec3(uv, -1.0)), light) * 0.7;
        } else {
          vec3 n = normalize(vec3(q.x * 0.55, q.y * 0.2, 1.0));
          float mid = smoothstep(0.03, 0.0, abs(q.x));
          float sideA = smoothstep(0.012, 0.0, abs(q.x - 0.16 - q.y * 0.04));
          float sideB = smoothstep(0.012, 0.0, abs(q.x + 0.16 + q.y * 0.04));
          float vein = max(mid, max(sideA, sideB) * 0.7);
          vec3 sun = normalize(vec3(light.x, abs(light.y), -0.85));
          float back = sat(dot(-n, sun));
          float front = sat(dot(n, sun));
          vec3 body = mix(vec3(0.05, 0.22, 0.05), vec3(0.2, 0.45, 0.08), back);
          vec3 glow = vec3(0.65, 0.85, 0.15) * back * (1.0 - vein);
          col = body * (0.25 + front * 0.35) + glow * 0.95;
          col = mix(col, vec3(0.03, 0.1, 0.03), vein);
        }
      } else if (uMat < 9.5) {
        vec3 ro = vec3(0.0, 0.0, 3.1);
        vec3 rd = normalize(vec3(uv * 0.9, -1.45));
        float t = sphereT(ro, rd, 0.9);
        if (t < 0.0) col = studio(ro, rd, light);
        else {
          vec3 p = ro + rd * t;
          vec3 n = normalize(p);
          float e = 0.04;
          float b0 = fbm(p * 3.2);
          float bx = fbm((p + vec3(e, 0.0, 0.0)) * 3.2);
          float by = fbm((p + vec3(0.0, e, 0.0)) * 3.2);
          n = normalize(n + vec3(b0 - bx, b0 - by, b0 - fbm((p + vec3(0.0, 0.0, e)) * 3.2)) * 2.2);
          float cavity = sat(1.0 - b0 * 1.3);
          vec3 albedo = mix(vec3(0.28, 0.27, 0.26), vec3(0.48, 0.4, 0.32), noise(p * 2.0));
          float ndl = sat(dot(n, light));
          vec3 h = normalize(light - rd);
          float gloss = mix(0.55, 0.18, cavity);
          col = albedo * (0.12 + ndl) * mix(0.45, 1.0, cavity);
          col += vec3(0.85) * pow(sat(dot(n, h)), mix(8.0, 40.0, gloss)) * ndl * gloss;
        }
      } else {
        vec3 ro = vec3(0.0, 0.85, 2.6);
        vec3 rd = normalize(vec3(uv.x * 1.2, uv.y * 0.62 - 0.02, -1.0));
        if (rd.y > -0.02) {
          col = skyLite(rd, light);
        } else {
          float t = -ro.y / rd.y;
          vec3 p = ro + rd * t;
          for (int k = 0; k < 4; k++) {
            float h = waveH(p.xz);
            t = (h - ro.y) / rd.y;
            p = ro + rd * t;
          }
          float e = 0.08;
          float h0 = waveH(p.xz);
          vec3 n = normalize(vec3(h0 - waveH(p.xz + vec2(e, 0.0)), e, h0 - waveH(p.xz + vec2(0.0, e))));
          vec3 refl = skyLite(reflect(rd, n), light);
          float fres = pow(1.0 - sat(dot(n, -rd)), 4.0);
          fres = mix(0.04, 1.0, fres);
          vec3 into = refract(rd, n, 0.75);
          float depth = 1.4;
          if (into.y < -0.01) depth = min(2.4, ( -1.3 - p.y) / into.y);
          vec3 deep = vec3(0.02, 0.1, 0.12) * exp(-vec3(0.55, 0.18, 0.1) * depth);
          vec3 h = normalize(light - rd);
          float spec = pow(sat(dot(n, h)), 180.0) * sat(dot(n, light));
          col = mix(deep, refl, fres) + vec3(1.0, 0.96, 0.9) * spec;
        }
      }
      col = max(col, 0.0);
      col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
      gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(0.95)), 1.0);
    }
  `;

  const vs = `attribute vec2 aPos; void main(){ gl_Position=vec4(aPos,0.0,1.0); }`;
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
  const uMat = gl.getUniformLocation(program, 'uMat');
  const uTime = gl.getUniformLocation(program, 'uTime');
  const sets = {
    character: ['头发', '眼球', '皮肤', '棉布', '丝绸', '丝袜'],
    environment: ['建筑混合', '地形', '植物', '石头', '水']
  };
  const kind = canvas.dataset.kind === 'environment' ? 'environment' : 'character';
  const names = sets[kind];
  const base = kind === 'environment' ? 6 : 0;
  let material = base;
  const buttons = [...document.querySelectorAll('.switch button')];
  function show(index) {
    material = base + index;
    buttons.forEach((button, i) => button.setAttribute('aria-selected', i === index ? 'true' : 'false'));
    const next = '#' + ['hair', 'eye', 'skin', 'cotton', 'silk', 'stocking', 'building', 'terrain', 'plant', 'stone', 'water'][material];
    if (location.hash !== next) history.replaceState(null, '', next);
  }
  buttons.forEach((button, index) => button.addEventListener('click', () => show(index)));
  const named = ['hair', 'eye', 'skin', 'cotton', 'silk', 'stocking', 'building', 'terrain', 'plant', 'stone', 'water'].indexOf(location.hash.slice(1));
  show(named >= base && named < base + names.length ? named - base : 0);
  const light = { x: 0.45, y: 0.75, z: 0.55 };
  const stage = canvas.closest('.study-stage');
  if (stage) {
    stage.addEventListener('pointerdown', (event) => {
      stage.setPointerCapture(event.pointerId);
      stage.dataset.drag = `${event.clientX},${event.clientY}`;
    });
    stage.addEventListener('pointermove', (event) => {
      if (!stage.hasPointerCapture(event.pointerId)) return;
      const [px, py] = stage.dataset.drag.split(',').map(Number);
      light.x = Math.min(1.2, Math.max(-1.2, light.x + (event.clientX - px) * 0.004));
      light.y = Math.min(1.3, Math.max(0.05, light.y - (event.clientY - py) * 0.004));
      stage.dataset.drag = `${event.clientX},${event.clientY}`;
    });
  }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function frame(now) {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(devicePixelRatio || 1, 1.5);
    const width = Math.max(2, Math.floor(rect.width * scale));
    const height = Math.max(2, Math.floor(rect.height * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    gl.uniform2f(uRes, width, height);
    gl.uniform3f(uLight, light.x, light.y, light.z);
    gl.uniform1f(uMat, material);
    gl.uniform1f(uTime, reduced.matches ? 0.0 : now * 0.001);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
