# 超级小金 Web（Super King Agent Web）

基于 React + TypeScript + Vite + Tailwind CSS 构建的超级小金 AI 教学助手 Web 客户端。

## 功能特性

- **智能对话**：与 AI 教学助手实时交互，支持 Markdown 渲染和代码高亮
- **会话管理**：多会话切换，保留历史对话记录
- **文件处理**：支持 Word、PDF、Excel、图片等文件上传与解析
- **Skills 系统**：加载和管理本地技能扩展
- **Docker 部署**：通过 nginx 容器部署，反向代理 super-king 后端

## 技术栈

- React 19 + TypeScript 6 + Vite 8
- Tailwind CSS 3 + PostCSS
- Phosphor Icons + Framer Motion
- react-markdown + react-syntax-highlighter（Markdown 渲染）
- mammoth / pdf-parse / xlsx / jszip（文件解析）

## 快速开始

```bash
npm install
npm run dev        # 启动开发服务器 http://localhost:5173
```

## 构建

```bash
npm run build      # tsc -b && vite build，产物在 dist/
npm run preview    # 本地预览构建产物
npm run typecheck  # 类型检查
npm run lint       # ESLint
```

## 部署

构建后通过 Docker nginx 容器部署：

```bash
docker run -d --name v6_web \
  -p 80:80 \
  -v /opt/v6_web/dist:/usr/share/nginx/html:ro \
  -v /opt/v6_web/nginx.conf:/etc/nginx/conf.d/default.conf:ro \
  nginx:alpine
```

nginx 反向代理 `/superking-api/` 到 super-king 后端（端口 30142）。

## 后端

真实数据来自 super-king 后端（默认 `127.0.0.1:30142`），开发环境通过 Vite proxy 转发 `/superking-api` 前缀请求。
