# Jonny Studio

Jonny 的中文技术美术博客与个人作品站。深色编辑式布局，面向实时渲染、材质研究和创作记录。

## 预览

在本目录运行 `python3 -m http.server 8767`，打开 http://localhost:8767 。

## 内容与维护

- `index.html`：首页、作品入口、文章列表、个人简介。
- `lab.html`：可交互的 WebGL 材质演示，含粗糙度、材质切换与暂停。
- `articles/`：起始文章与角色卡通渲染技术综述。研究计划和视觉演示均明确标注，不声称已有研究成果。
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

## 角色卡通渲染综述维护

- 页面：`articles/stylized-character-rendering.html`。
- 正文片段：`docs/stylized-character-rendering.body.txt`，修改正文后需同步页面。
- 配图：`assets/toon/`，五张原创 SVG 技术示意，非引擎渲染结果。
- 交互：`assets/toon-study.js`，明暗分层球面的光向对比教学演示。
- 参考资料、适用范围与教学代码的边界均在正文中注明。无项目实测数据，不应在后续修改中把示意图标为真实效果验证。
