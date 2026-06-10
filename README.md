# AI × 新质生产力互动体验页

自有服务器部署版：`Express + Vite React + MySQL + Vercel AI SDK`。

## 目录

- `server/`：Node.js API、SSE 流式输出、Vercel AI Gateway 调用、MySQL 访问。
- `src/`：React 单页体验。
- `db/schema.sql`：MySQL 表结构。
- `scripts/init-db.js`：初始化表结构。
- `scripts/seed.js`：插入 100 条基础数据、基础评估和投票。
- `.env.example`：环境变量模板。

## 本地或服务器启动

```bash
npm install
copy .env.example .env
npm run db:init
npm run db:seed
npm run build
npm run start
```

开发模式：

```bash
npm run dev
```

开发模式前端默认 `http://localhost:5173`，后端默认 `http://localhost:3000`。
生产模式只需要访问 Node 服务端口，Express 会托管 `dist/` 页面和 `/api/*`。

## 宝塔部署建议

1. 在宝塔创建 MySQL 数据库，例如 `ai_productivity`。
2. 上传项目到服务器。
3. 在项目目录复制 `.env.example` 为 `.env`，填写 MySQL 和 `AI_GATEWAY_API_KEY`。
4. 执行：

```bash
npm install
npm run db:init
npm run db:seed
npm run build
npm run start
```

5. 用宝塔 Node 项目或 PM2 托管：

```bash
pm2 start server/index.js --name ai-productivity
pm2 save
```

6. Nginx 反向代理到 `127.0.0.1:3000`。

## 环境变量

优先使用：

```env
DATABASE_URL=mysql://db_user:db_password@127.0.0.1:3306/ai_productivity
AI_GATEWAY_API_KEY=your_vercel_ai_gateway_key
MODEL_DEEPSEEK=deepseek/deepseek-v4-pro
MODEL_GPT=openai/gpt-5.5
MODEL_CLAUDE=anthropic/claude-opus-4.6
MODEL_EVALUATOR=deepseek/deepseek-v4-pro
MODEL_RESONANCE=deepseek/deepseek-v4-pro
```

`MODEL_EVALUATOR` 已按要求默认使用 DeepSeek V4 Pro。实际模型 ID 需要替换成你 Vercel AI Gateway 里可用的精确 ID。

没有配置 `AI_GATEWAY_API_KEY` 且非生产环境时，会自动进入 mock 模式。也可以显式设置：

```env
AI_MOCK=true
```

## API

- `POST /api/ideas`：提交想法。
- `GET /api/stream-responses?idea_id=42`：SSE 同时流式输出三个匿名模型方案。
- `POST /api/votes`：提交投票并返回揭晓映射和历史票数。
- `GET /api/results?idea_id=42`：返回思想共振和 AI 评判卡片。
- `GET /api/health`：检查数据库连接、数据量和 mock 状态。

## 数据初始化

`npm run db:seed` 会确保至少存在 100 条 `seeded=1` 的基础想法，并同时插入基础评估和投票数据，避免初始用户看到空结果。

如需清空测试数据并重新生成基础数据：

```bash
npm run db:refresh
```

`db:refresh` 会清空 `ideas`、`model_runs`、`votes`、`evaluations` 四张业务表，然后重新插入 100 条基础数据。
