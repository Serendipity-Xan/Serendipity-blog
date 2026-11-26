# Serendipity Blog

A deeply customized **Ghost 6** blog featuring an anime-inspired glassmorphism theme (`anime-glass-meteor`), a **rebuilt admin console** (`admin-gateway`), and a lightweight **1C1G-friendly Docker Compose** deployment stack.

[中文说明](#中文说明) · [English Guide](#english-guide)

---

## English Guide

### Features

- **Powered by Ghost 6 (`ghost:6-alpine`)**: Full Ghost data model, MySQL 8.0 storage, Admin/Content API, RSS, and SEO support.
- **Anime Glassmorphism Theme (`anime-glass-meteor`)**:
  - Dynamic wallpaper switcher with adaptive accent colors and light/dark reading depth.
  - Interactive atmosphere & sky effects (meteor shower, rain/mist/petals/fireflies, prism glass, card tilt, reading progress comet).
  - Dedicated sections for **Articles Archive** (`/articles/`), **Life & Photo Albums** (`/life/`), **Toolbox** (`/toolbox/`), and **Constellation Friend Links** (`/links/`).
- **Rebuilt Admin Console (`/admin/`)**:
  - **Bilingual UI (中文 / English)** switchable in real time from both the login screen and top bar.
  - **Split-pane Markdown editor** with bidirectional synchronized scrolling, draggable `1:9`–`9:1` divider (double-click to reset), clipboard paste & drag-and-drop image upload, and media library picker.
  - **Visual Customizer**: Configure hero copy, homepage photo strip, toolbox dock, constellation friend links, section tag rules, wallpapers, visual effects, tags, members, comments, and JSON backup/restore without touching code.
- **Lightweight Docker Setup**: Tuned MySQL 8.0 (`innodb-buffer-pool-size=64M`, `performance-schema=OFF`), running comfortably on a 1 vCPU / 1 GB RAM VPS (~325 MiB total container memory).

### Architecture

```text
Client / Reverse Proxy (Nginx / Caddy)
         │
         ▼ :8082
   blog-gateway (Node.js)
     ├── /admin/*  ──► Rebuilt bilingual admin console
     ├── /api/*    ──► Dynamic site-config, media & Ghost API bridge
     └── /*        ──► Transparent reverse proxy to Ghost (:2368)
                           │
                           ▼
                    blog-ghost (Ghost 6) ──► blog-ghost-db (MySQL 8.0)
```

### Quick Start

1. **Clone & configure environment variables**

   ```bash
   git clone https://github.com/Serendipity-Xan/Serendipity-blog.git
   cd Serendipity-blog
   cp .env.example .env
   ```

   Edit `.env` and set strong passwords for `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`, and your `PUBLIC_URL`.

   > On a 1 vCPU / 1 GB RAM server, set `MYSQL_BUFFER_POOL_SIZE=32M` in `.env`.

2. **Start the stack**

   ```bash
   docker compose up -d
   docker compose ps
   ```

3. **Initialize Ghost & activate the theme**

   - Open `http://localhost:8082/ghost/` (or your `PUBLIC_URL` + `/ghost/`) to create the initial owner account.
   - In Ghost Settings → **Design & branding**, activate the **`anime-glass-meteor`** theme.
   - Create custom pages in Ghost (or via `/admin/` → **Pages**) with slugs `articles`, `life`, `toolbox`, `links`, and `about` to match the navigation routes.

4. **Configure `GHOST_CONTENT_KEY` (required for `/life/`, `/toolbox/`, `/articles/` dynamic loading)**

   - In Ghost Admin (`/ghost/`), go to **Settings → Integrations → Add custom integration**, copy the **Content API Key**, and paste it into `.env` as `GHOST_CONTENT_KEY=...`.
   - Restart the gateway container:

     ```bash
     docker compose up -d gateway
     ```

5. **Open the Rebuilt Admin Console**

   - Visit `http://localhost:8082/admin/` and log in with your Ghost owner email & password.
   - Click the **`中 / EN`** button in the top bar anytime to switch between Chinese and English.

---

## 中文说明

### 核心特性

- **Ghost 6 稳定内核**：完整保留 Ghost 6 的 MySQL 存储、Admin/Content API、RSS 与 SEO 能力。
- **二次元毛玻璃主题（`anime-glass-meteor`）**：
  - 内置多套桌面/移动端壁纸预设，支持自动取色与阅读暗角深度调节；
  - 可自由开关流星雨、氛围粒子（雾/花瓣/雨丝/萤火虫）、卡片视差、阅读进度彗星等特效；
  - 独立内置 **文章归档**（`/articles/`）、**生活与相册**（`/life/`）、**工具箱**（`/toolbox/`）与 **星月友链图谱**（`/links/`）。
- **重建后台控制台（`/admin/`）**：
  - 支持 **中 / 英双语实时切换**（登录页与顶部栏均可一键切换）；
  - **Markdown 双栏实时编辑器**：支持左右双向同步滚动、中间分割线自由拖拽（最多偏移 `1:9`，双击复位）、截图粘贴与拖拽传图；
  - **全站可视化装修**：首屏文案、首页照片墙、工具箱入口、友链星图、壁纸预设、动效参数、标签/会员/评论管理及全站 JSON 备份恢复。
- **1C1G 轻量部署**：针对小内存 VPS 调优 MySQL 参数，三容器常驻内存仅约 325 MiB。

### 快速部署

```bash
git clone https://github.com/Serendipity-Xan/Serendipity-blog.git
cd Serendipity-blog
cp .env.example .env
# 修改 .env 中的数据库密码与 PUBLIC_URL
docker compose up -d
```

1. 访问 `<PUBLIC_URL>/ghost/` 完成 Ghost 初始化建站，并在 **Design** 中启用 `anime-glass-meteor` 主题；
2. 在 Ghost 后台 **Settings → Integrations** 新建自定义集成，将 **Content API Key** 填入 `.env` 的 `GHOST_CONTENT_KEY`，执行 `docker compose up -d gateway` 生效；
3. 访问 `<PUBLIC_URL>/admin/` 登录重建控制台，顶部栏可随时切换 **中 / EN** 与 **夜间/白天模式**。

### 目录结构

```text
├── admin-gateway/              # Node.js 网关与重建控制台前端
├── data/
│   ├── site-config.example.json# 站点配置脱敏模板
│   └── themes/
│       └── anime-glass-meteor/ # 二次元毛玻璃 Ghost 主题
├── docker-compose.yml          # 容器编排（gateway + ghost + mysql）
├── .env.example                # 环境变量模板
└── LICENSE                     # MIT
```
