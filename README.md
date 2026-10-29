# 图降降 ImageSlim

> 免费 · 本地处理 · 保护隐私的在线图片降分辨率与压缩工具

图片太大？拖进来，一键批量降分辨率、压缩体积。支持 **按比例缩小** 和 **指定宽度** 两种模式，可转换 **JPG / WebP / PNG** 格式，并实时对比"处理前 → 处理后"的尺寸与体积变化。

**隐私承诺**：所有处理都在浏览器本地完成（HTML5 Canvas），图片**不会上传到任何服务器**，适合处理证件照、隐私照片等敏感图片。

---

## 功能特性

- ✅ 批量处理：一次拖入多张图片，统一处理
- ✅ 两种降分辨率模式：按比例（25% / 50% / 75% / 自定义）、指定目标宽度（高度自动等比）
- ✅ 三种输出格式：保持原格式 / JPEG / WebP / PNG
- ✅ 质量可调：JPEG / WebP 质量滑块（10–100）
- ✅ 实时对比：每张卡片显示 原尺寸→新尺寸、原体积→新体积、节省百分比
- ✅ 打包下载：一键将全部结果打包成 ZIP
- ✅ 纯前端实现：零服务器成本、零依赖安装、打开即用

## 在线体验

<!-- 部署到 GitHub Pages 后，把链接替换成你的正式地址 -->
🔗 在线体验：[https://你的用户名.github.io/image-slim](https://你的用户名.github.io/image-slim)（部署后生效）

## 快速开始

### 方式一：本地直接使用（最简单）

用浏览器打开 `index.html` 即可使用，无需任何安装。

### 方式二：部署到 GitHub Pages（推荐）

1. 把本仓库代码推到 GitHub（首次推送见 `docs/01-GitHub入门完全教程.md`）
2. 进入仓库 **Settings → Pages**，Source 选择 `Deploy from a branch`，Branch 选择 `main`，目录选 `/ (root)`
3. 保存后等待 1–2 分钟，即可通过 `https://你的用户名.github.io/image-slim` 访问

> 详细步骤（含命令行和 GitHub Desktop 两种方式）见 [`docs/01-GitHub入门完全教程.md`](docs/01-GitHub入门完全教程.md)

## 技术栈

| 类别 | 技术 |
| --- | --- |
| 语言 | HTML5 / CSS3 / 原生 JavaScript（ES2020+） |
| 图片处理 | Canvas 2D API（`drawImage` + `toBlob`） |
| 打包下载 | JSZip（CDN 引入，失败自动降级为逐个下载） |
| 部署 | GitHub Pages / 任意静态托管（Vercel、Netlify 均可） |

## 项目结构

```
image-slim/
├── index.html          # 页面结构
├── css/
│   └── style.css       # 样式
├── js/
│   └── app.js          # 核心逻辑（含详细中文注释）
├── docs/
│   ├── 00-从零到上线总路线.md      # 整体行动路线
│   ├── 01-GitHub入门完全教程.md     # GitHub 从注册到部署
│   ├── 02-盈利方案与推广路线.md     # 变现路径与流量渠道
│   └── 03-简历项目经历.md          # 简历条目与面试问答
├── README.md
└── LICENSE
```

## 功能截图

<!-- TODO: 部署后截图替换此处 -->
（截图待补充：上传区 / 处理设置 / 结果卡片 / 打包下载）

## 开发路线图

- [x] v0.1：基础降分辨率 + 压缩 + 批量 + ZIP 打包
- [ ] v0.2：拖拽排序、EXIF 方向修正、图片信息读取（拍摄参数等）
- [ ] v0.3：PWA 离线可用、Service Worker 缓存
- [ ] PRO（规划中）：按目标文件大小压缩、批量加水印、AI 超清修复
- [ ] 桌面版 / 浏览器插件（探索方向）

## 贡献指南

欢迎提交 Issue 和 Pull Request！请先阅读 [`docs/01-GitHub入门完全教程.md`](docs/01-GitHub入门完全教程.md) 了解 GitHub 协作流程。

## 许可证

[MIT License](LICENSE) © 2026 ImageSlim
