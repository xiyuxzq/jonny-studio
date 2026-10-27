'use strict';
(() => {
  const canvas = document.querySelector('.raster-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: false });
  const width = 640;
  const height = 400;
  canvas.width = width;
  canvas.height = height;
  const color = new Uint8ClampedArray(width * height * 4);
  const depth = new Float32Array(width * height);
  const image = new ImageData(color, width, height);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const positions = [];
  const normals = [];
  const indices = [];
  const stacks = 16;
  const slices = 22;
  for (let y = 0; y <= stacks; y += 1) {
    const v = y / stacks;
    const phi = v * Math.PI;
    for (let x = 0; x <= slices; x += 1) {
      const theta = (x / slices) * Math.PI * 2;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      positions.push([nx * 0.85, ny * 0.85, nz * 0.85]);
      normals.push([nx, ny, nz]);
    }
  }
  const stride = slices + 1;
  for (let y = 0; y < stacks; y += 1) {
    for (let x = 0; x < slices; x += 1) {
      const i = y * stride + x;
      indices.push(i, i + stride, i + 1, i + 1, i + stride, i + stride + 1);
    }
  }

  const light = normalize([0.35, 0.85, 0.4]);

  function normalize(v) {
    const length = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / length, v[1] / length, v[2] / length];
  }

  function rotate(p, yaw, pitch) {
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const x = p[0] * cy + p[2] * sy;
    const z = -p[0] * sy + p[2] * cy;
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    return [x, p[1] * cp - z * sp, p[1] * sp + z * cp];
  }

  function project(world, normal) {
    const viewZ = 3.15 - world[2];
    if (viewZ < 0.25) return null;
    const focal = 430;
    return {
      x: width * 0.5 + (world[0] / viewZ) * focal,
      y: height * 0.5 - ((world[1] - 0.02) / viewZ) * focal,
      z: viewZ,
      n: normal
    };
  }

  function edge(a, b, x, y) {
    return (x - a.x) * (b.y - a.y) - (y - a.y) * (b.x - a.x);
  }

  function shade(normal) {
    const ndl = Math.max(normal[0] * light[0] + normal[1] * light[1] + normal[2] * light[2], 0);
    const half = normalize([light[0], light[1], light[2] + 1]);
    const ndh = Math.max(normal[0] * half[0] + normal[1] * half[1] + normal[2] * half[2], 0);
    const spec = ndh ** 36 * 0.45;
    const r = Math.min(255, (0.16 + ndl) * 168 + spec * 255);
    const g = Math.min(255, (0.16 + ndl) * 176 + spec * 255);
    const b = Math.min(255, (0.18 + ndl) * 190 + spec * 255);
    return [r, g, b];
  }

  function draw(now) {
    const angle = reduced.matches ? 0.6 : now * 0.00035;
    color.fill(0);
    for (let i = 0; i < color.length; i += 4) {
      color[i] = 16;
      color[i + 1] = 22;
      color[i + 2] = 32;
      color[i + 3] = 255;
    }
    depth.fill(1e9);

    const projected = positions.map((p, index) => project(rotate(p, angle, 0.35), rotate(normals[index], angle, 0.35)));
    for (let t = 0; t < indices.length; t += 3) {
      const a = projected[indices[t]];
      const b = projected[indices[t + 1]];
      const c = projected[indices[t + 2]];
      if (!a || !b || !c) continue;
      const area = edge(a, b, c.x, c.y);
      if (area >= -0.5) continue;
      const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
      const maxX = Math.min(width - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
      const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
      const maxY = Math.min(height - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const w0 = edge(b, c, x, y) / area;
          const w1 = edge(c, a, x, y) / area;
          const w2 = edge(a, b, x, y) / area;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const inv = w0 / a.z + w1 / b.z + w2 / c.z;
          const z = 1 / inv;
          const pixel = y * width + x;
          if (z >= depth[pixel]) continue;
          depth[pixel] = z;
          const n = normalize([
            (w0 * a.n[0] / a.z + w1 * b.n[0] / b.z + w2 * c.n[0] / c.z) / inv,
            (w0 * a.n[1] / a.z + w1 * b.n[1] / b.z + w2 * c.n[1] / c.z) / inv,
            (w0 * a.n[2] / a.z + w1 * b.n[2] / b.z + w2 * c.n[2] / c.z) / inv
          ]);
          const rgb = shade(n);
          const offset = pixel * 4;
          color[offset] = rgb[0];
          color[offset + 1] = rgb[1];
          color[offset + 2] = rgb[2];
        }
      }
    }
    ctx.putImageData(image, 0, 0);
    if (!reduced.matches) requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);
})();
