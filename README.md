# 🪞 认知镜

一个每天只能照 3 次的 AI 镜子——你丢问题进去，它帮你解耦，给一句金句点醒你。所有人的问题和答案长成一张不断生长的知识网络。

## 效果预览

- **镜子页**：暗色主题，输入问题 → 流式输出（打字机效果）→ 金句渐现
- **卡片墙**：随机抽卡，翻转动画，浏览所有人的问题和答案
- **知识网络**：d3.js 力导向图，节点 = 问题卡片/标签，拖拽缩放交互

## 技术栈

```
前端：原生 HTML + CSS + JS + d3.js（零框架依赖）
后端：Vercel Serverless Function（替代 Cloudflare Worker）
存储：Vercel KV
AI：DeepSeek API（流式 SSE）
部署：GitHub + Vercel（全免费，零服务器）
```

## 部署步骤

### 前置准备
1. GitHub 账号 + 仓库
2. Vercel 账号（用 GitHub 登录就行）
3. DeepSeek API key

### 三步上线

```bash
# 1. 登录 GitHub
gh auth login

# 2. 设置环境变量
export DEEPSEEK_API_KEY="sk-xxx"

# 3. 部署到 Vercel
cd ~/projects/cognitive-mirror
vercel --prod
```

---

## 项目结构

```
cognitive-mirror/
├── frontend/
│   └── index.html         # SPA 三个视图
├── api/
│   ├── mirror.js          # POST - 照镜子（限流 + AI 调用）
│   ├── cards.js           # GET  - 卡片墙数据
│   └── network.js         # GET  - 知识网络数据
├── vercel.json            # Vercel 配置
└── README.md
```
