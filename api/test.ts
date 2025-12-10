import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    message: 'Hello from Vercel Function!',
    env: {
      hasApiKey: !!process.env.BUILT_IN_FORGE_API_KEY,
      hasDbUrl: !!process.env.DATABASE_URL,
      nodeVersion: process.version,
    },
  });
}
