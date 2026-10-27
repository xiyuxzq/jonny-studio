// Desktop OpenGL 4.1 core. Draws a lit mesh into an offscreen framebuffer.
// Rasterization and the depth test are the GPU's. This file owns the mesh,
// the matrices, and the Blinn-Phong fragment shader.
//
// Build on macOS, using a Command Line Tools SDK that still ships OpenGL headers:
//   clang++ -std=c++17 -DGL_SILENCE_DEPRECATION -isysroot "$(xcrun --show-sdk-path)" \
//     offscreen.mm -framework OpenGL -framework Foundation -o offscreen
//   ./offscreen frame.ppm
#define GL_SILENCE_DEPRECATION

#include <OpenGL/OpenGL.h>
#include <OpenGL/gl3.h>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

namespace {

constexpr int kWidth = 960;
constexpr int kHeight = 540;

struct Vec3 { float x, y, z; };
struct Mat4 { float m[16]; };

Vec3 add(Vec3 a, Vec3 b) { return {a.x + b.x, a.y + b.y, a.z + b.z}; }
Vec3 scale(Vec3 a, float s) { return {a.x * s, a.y * s, a.z * s}; }
Vec3 norm(Vec3 a) {
  float l = std::sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
  return l > 0.f ? scale(a, 1.f / l) : a;
}

Mat4 mul(const Mat4& a, const Mat4& b) {
  Mat4 r{};
  for (int c = 0; c < 4; ++c) {
    for (int row = 0; row < 4; ++row) {
      r.m[c * 4 + row] =
          a.m[row] * b.m[c * 4] +
          a.m[4 + row] * b.m[c * 4 + 1] +
          a.m[8 + row] * b.m[c * 4 + 2] +
          a.m[12 + row] * b.m[c * 4 + 3];
    }
  }
  return r;
}

Mat4 perspective(float fovy, float aspect, float n, float f) {
  float t = std::tan(fovy * 0.5f);
  Mat4 r{};
  r.m[0] = 1.f / (aspect * t);
  r.m[5] = 1.f / t;
  r.m[10] = (f + n) / (n - f);
  r.m[11] = -1.f;
  r.m[14] = (2.f * f * n) / (n - f);
  return r;
}

Mat4 look_at(Vec3 eye, Vec3 at, Vec3 up) {
  Vec3 f = norm({at.x - eye.x, at.y - eye.y, at.z - eye.z});
  Vec3 s = norm({f.y * up.z - f.z * up.y, f.z * up.x - f.x * up.z, f.x * up.y - f.y * up.x});
  Vec3 u = {s.y * f.z - s.z * f.y, s.z * f.x - s.x * f.z, s.x * f.y - s.y * f.x};
  Mat4 r{};
  r.m[0] = s.x; r.m[4] = s.y; r.m[8] = s.z;
  r.m[1] = u.x; r.m[5] = u.y; r.m[9] = u.z;
  r.m[2] = -f.x; r.m[6] = -f.y; r.m[10] = -f.z;
  r.m[12] = -(s.x * eye.x + s.y * eye.y + s.z * eye.z);
  r.m[13] = -(u.x * eye.x + u.y * eye.y + u.z * eye.z);
  r.m[14] = f.x * eye.x + f.y * eye.y + f.z * eye.z;
  r.m[15] = 1.f;
  return r;
}

Mat4 rotation_y(float a) {
  Mat4 r{};
  r.m[0] = std::cos(a); r.m[8] = std::sin(a);
  r.m[5] = 1.f;
  r.m[2] = -std::sin(a); r.m[10] = std::cos(a);
  r.m[15] = 1.f;
  return r;
}

void sphere(std::vector<float>& verts, std::vector<unsigned>& idx, Vec3 center, float radius, int stacks, int slices) {
  unsigned base = static_cast<unsigned>(verts.size() / 6);
  for (int y = 0; y <= stacks; ++y) {
    float v = float(y) / float(stacks);
    float phi = v * 3.14159265f;
    for (int x = 0; x <= slices; ++x) {
      float u = float(x) / float(slices);
      float theta = u * 6.2831853f;
      Vec3 n{std::sin(phi) * std::cos(theta), std::cos(phi), std::sin(phi) * std::sin(theta)};
      Vec3 p = add(center, scale(n, radius));
      verts.insert(verts.end(), {p.x, p.y, p.z, n.x, n.y, n.z});
    }
  }
  int stride = slices + 1;
  for (int y = 0; y < stacks; ++y) {
    for (int x = 0; x < slices; ++x) {
      unsigned i = base + y * stride + x;
      idx.insert(idx.end(), {i, i + stride, i + 1, i + 1, i + stride, i + stride + 1});
    }
  }
}

GLuint compile(GLenum type, const char* src) {
  GLuint shader = glCreateShader(type);
  glShaderSource(shader, 1, &src, nullptr);
  glCompileShader(shader);
  GLint ok = 0;
  glGetShaderiv(shader, GL_COMPILE_STATUS, &ok);
  if (!ok) {
    char log[1024];
    glGetShaderInfoLog(shader, sizeof log, nullptr, log);
    std::cerr << log << "\n";
  }
  return shader;
}

bool write_ppm(const char* path, const std::vector<uint8_t>& rgba) {
  std::ofstream out(path, std::ios::binary);
  if (!out) return false;
  out << "P6\n" << kWidth << " " << kHeight << "\n255\n";
  for (int y = kHeight - 1; y >= 0; --y) {
    for (int x = 0; x < kWidth; ++x) {
      const uint8_t* p = rgba.data() + (y * kWidth + x) * 4;
      out.write(reinterpret_cast<const char*>(p), 3);
    }
  }
  return static_cast<bool>(out);
}

}  // namespace

int main(int argc, char** argv) {
  const char* out_path = argc > 1 ? argv[1] : "frame.ppm";
  CGLPixelFormatAttribute attrs[] = {
      kCGLPFAOpenGLProfile, (CGLPixelFormatAttribute)kCGLOGLPVersion_GL4_Core,
      kCGLPFAColorSize, (CGLPixelFormatAttribute)24,
      kCGLPFAAlphaSize, (CGLPixelFormatAttribute)8,
      kCGLPFADepthSize, (CGLPixelFormatAttribute)24,
      kCGLPFAAccelerated,
      (CGLPixelFormatAttribute)0};
  CGLPixelFormatObj format = nullptr;
  GLint count = 0;
  if (CGLChoosePixelFormat(attrs, &format, &count) != kCGLNoError || format == nullptr) {
    std::cerr << "OpenGL 4.1 pixel format unavailable\n";
    return 1;
  }
  CGLContextObj ctx = nullptr;
  if (CGLCreateContext(format, nullptr, &ctx) != kCGLNoError || ctx == nullptr) {
    std::cerr << "OpenGL context failed\n";
    CGLDestroyPixelFormat(format);
    return 1;
  }
  CGLSetCurrentContext(ctx);
  CGLDestroyPixelFormat(format);

  const char* vs = R"(#version 410 core
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNrm;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProj;
out vec3 vN;
out vec3 vP;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vP = world.xyz;
  vN = mat3(uModel) * aNrm;
  gl_Position = uProj * uView * world;
}
)";
  const char* fs = R"(#version 410 core
in vec3 vN;
in vec3 vP;
out vec4 frag;
void main() {
  vec3 n = normalize(vN);
  vec3 l = normalize(vec3(0.45, 0.85, 0.35));
  vec3 v = normalize(vec3(0.0, 0.35, 2.8) - vP);
  vec3 h = normalize(l + v);
  float ndl = max(dot(n, l), 0.0);
  float ndh = max(dot(n, h), 0.0);
  vec3 albedo = vec3(0.62, 0.66, 0.72);
  vec3 color = albedo * (0.08 + ndl) + vec3(1.0) * pow(ndh, 48.0) * 0.35;
  color = pow(color, vec3(1.0 / 2.2));
  frag = vec4(color, 1.0);
}
)";

  GLuint program = glCreateProgram();
  glAttachShader(program, compile(GL_VERTEX_SHADER, vs));
  glAttachShader(program, compile(GL_FRAGMENT_SHADER, fs));
  glLinkProgram(program);
  GLint linked = 0;
  glGetProgramiv(program, GL_LINK_STATUS, &linked);
  if (!linked) {
    char log[1024];
    glGetProgramInfoLog(program, sizeof log, nullptr, log);
    std::cerr << log << "\n";
    return 1;
  }

  std::vector<float> verts;
  std::vector<unsigned> idx;
  sphere(verts, idx, {0.f, 0.05f, 0.f}, 0.72f, 36, 48);
  sphere(verts, idx, {-0.95f, -0.28f, 0.35f}, 0.34f, 24, 32);

  GLuint vao = 0, vbo = 0, ebo = 0;
  glGenVertexArrays(1, &vao);
  glBindVertexArray(vao);
  glGenBuffers(1, &vbo);
  glBindBuffer(GL_ARRAY_BUFFER, vbo);
  glBufferData(GL_ARRAY_BUFFER, verts.size() * sizeof(float), verts.data(), GL_STATIC_DRAW);
  glGenBuffers(1, &ebo);
  glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, ebo);
  glBufferData(GL_ELEMENT_ARRAY_BUFFER, idx.size() * sizeof(unsigned), idx.data(), GL_STATIC_DRAW);
  glEnableVertexAttribArray(0);
  glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 6 * sizeof(float), reinterpret_cast<void*>(0));
  glEnableVertexAttribArray(1);
  glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, 6 * sizeof(float), reinterpret_cast<void*>(3 * sizeof(float)));

  GLuint color = 0, depth = 0, fbo = 0;
  glGenTextures(1, &color);
  glBindTexture(GL_TEXTURE_2D, color);
  glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, kWidth, kHeight, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);
  glGenRenderbuffers(1, &depth);
  glBindRenderbuffer(GL_RENDERBUFFER, depth);
  glRenderbufferStorage(GL_RENDERBUFFER, GL_DEPTH_COMPONENT24, kWidth, kHeight);
  glGenFramebuffers(1, &fbo);
  glBindFramebuffer(GL_FRAMEBUFFER, fbo);
  glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, color, 0);
  glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_RENDERBUFFER, depth);
  if (glCheckFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE) {
    std::cerr << "framebuffer incomplete\n";
    return 1;
  }

  glViewport(0, 0, kWidth, kHeight);
  glEnable(GL_DEPTH_TEST);
  glClearColor(0.10f, 0.13f, 0.18f, 1.f);
  glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
  glUseProgram(program);
  Mat4 model = rotation_y(0.5f);
  Mat4 view = look_at({0.f, 0.35f, 2.8f}, {0.f, 0.f, 0.f}, {0.f, 1.f, 0.f});
  Mat4 proj = perspective(0.85f, float(kWidth) / float(kHeight), 0.1f, 20.f);
  glUniformMatrix4fv(glGetUniformLocation(program, "uModel"), 1, GL_FALSE, model.m);
  glUniformMatrix4fv(glGetUniformLocation(program, "uView"), 1, GL_FALSE, view.m);
  glUniformMatrix4fv(glGetUniformLocation(program, "uProj"), 1, GL_FALSE, proj.m);
  glDrawElements(GL_TRIANGLES, static_cast<GLsizei>(idx.size()), GL_UNSIGNED_INT, nullptr);

  std::vector<uint8_t> pixels(kWidth * kHeight * 4);
  glReadPixels(0, 0, kWidth, kHeight, GL_RGBA, GL_UNSIGNED_BYTE, pixels.data());
  if (!write_ppm(out_path, pixels)) {
    std::cerr << "could not write " << out_path << "\n";
    return 1;
  }
  std::cerr << "wrote " << out_path << "\n";
  CGLSetCurrentContext(nullptr);
  CGLDestroyContext(ctx);
  return 0;
}
