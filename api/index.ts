import express from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { createServer } from '@vercel/node';
// 在 ESM 模块中，使用 .js 扩展名（运行时扩展名）
import { appRouter } from '../server/routers.js';
import { createContext } from '../server/_core/context.js';
import { registerOAuthRoutes } from '../server/_core/oauth.js';

const app = express();

// Configure body parser with larger size limit for file uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// OAuth callback under /api/oauth/callback
registerOAuthRoutes(app);

// tRPC API
app.use(
  '/api/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError: ({ path, error }) => {
      console.error(`[tRPC Error] Path: ${path}, Error:`, error);
    },
  })
);

// 使用 @vercel/node 的 createServer 来确保在 Vercel 环境中正确工作
export default createServer(app);
