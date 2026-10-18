# Jonny Studio

Jonny 的中文技术美术博客与个人作品站。黑白灰主色的深色编辑式布局，面向实时渲染、材质研究和创作记录。

## 预览

在本目录运行 `python3 -m http.server 8767`，打开 http://localhost:8767 。

## 内容与维护

- `index.html`：首页、作品入口、文章列表、个人简介。
- `lab.html`：可交互的 WebGL 材质演示，含粗糙度、材质切换与暂停。
- `articles/`：起始文章与日式角色卡通渲染技术笔记。研究计划和视觉演示均明确标注，不声称已有研究成果。
- `assets/content.json`：站内搜索索引与 RSS 条目；新增文章时同步更新。
- `assets/style.css`：响应式视觉样式，无外部字体或依赖。
- `assets/app.js`：搜索、分类、复制链接、WebGL 演示。
- `build-metadata.mjs`：RSS、站点地图、robots 文件生成。新增文章后执行 `node build-metadata.mjs`。

新增文章：复制 `articles/` 中的文章模板，修改标题、日期、摘要、正文、阅读时长和页面元数据；同步首页列表、搜索索引，再生成元数据。

## GitHub Pages

仓库：`https://github.com/xiyuxzq/jonny-studio`（发布状态以 GitHub 为准）。

使用 GitHub Pages 原生分支发布：仓库 Settings → Pages → Source 选择 Deploy from a branch，分支 main，目录 /(root)。随后每次 push 到 main 自动发布。无需新增 workflow 权限。仓库中的文件均是可公开的站点文件和维护资料。

`docs/pages-workflow.yml.example` 保留可选的 Actions 配置示例，不会执行；只有未来确需独立构建并具备相应权限时才启用。

如更换仓库地址或使用自定义域名：本地可用 `PAGES_BASE_URL=https://example.com/ node build-metadata.mjs` 更新元数据。

## 实现与边界

不依赖 npm 包。需要支持 WebGL 的现代浏览器运行实时演示；不支持时展示原创 SVG。演示为艺术化着色，并非物理精确的 PBR 验证。支持键盘操作、减少动态效果偏好与移动设备。

无分析追踪、登录、表单或后端，不存储访客个人信息。网站中的资料仅含个人公开介绍和独立研究计划；不含公司代码、项目截图、内部数据或私人笔记。

原创网站代码与原创 SVG 随工程提供，未自动选择开源许可证。公开仓库不等于授权他人任意再利用。未来接入第三方资产时单独记录来源与许可。

## 角色卡通渲染文章维护

- 页面：`articles/stylized-character-rendering.html`。
- 正文片段：`docs/stylized-character-rendering.body.txt`，修改正文后需同步页面。
- 配图：`assets/toon/`，两张原创 SVG 示意（`face.svg` 面部阈值图流程、`pipeline.svg` 着色组成），非引擎渲染结果。
- 交互：`assets/toon-study.js`，两个教学演示：明暗分层；面部阈值图（程序合成的头部，用与文中 Python 相同的流程在浏览器里烘焙）。
- 文中 HLSL 为示意代码，未在引擎内编译；Python 烘焙代码已用合成数据验证。关于终末地的说法在正文中按来源标注，不应在后续修改中把复现或个人观察写成官方实现。

## 文章图表与公式

角色渲染文章包含三张 Mermaid 流程图及四组 LaTeX 公式。Mermaid 源码保存在正文的 `pre.mermaid` 中，LaTeX 保存在 `.latex-display` 中；页面和 `docs/stylized-character-rendering.body.txt` 需同步维护。`assets/article-notation.js` 负责渲染，样式为 `assets/article-notation.css`。Mermaid 与 KaTeX 及公式字体随站点保存在 `assets/vendor/`，版本和许可见该目录 README；无需在读者浏览时访问外部 CDN。窄屏下图表、长公式可在块内横向滑动。

## 原创角色教学图

`assets/toon/anime-face-base.png` 与 `anime-material-study.png` 为 AI 辅助生成的原创概念资产，不是游戏截图或本文 Shader 实装。`face-process` 和 `toon-face` 在 Canvas 中以同一底图叠加程序阴影：仅对识别到的面部皮肤区域处理，头发、眼睛和颈部保留插画底图。法线对照来自解析场近似，并非模型法线。面部阈值数据由现有关键帧烘焙函数生成。
