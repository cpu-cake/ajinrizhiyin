/**
 * Vercel Cron API 端点
 * 每天 UTC 20:00（北京时间凌晨4点）执行热门标签统计
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { calculateHotQuestions } from '../../server/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 验证请求来源（Vercel Cron 会带上 CRON_SECRET）
  const authHeader = req.headers.authorization;
  
  // 如果配置了 CRON_SECRET，验证请求
  if (process.env.CRON_SECRET) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  console.log('[Cron] Starting hot questions calculation...');
  console.log('[Cron] Current time:', new Date().toISOString());

  try {
    await calculateHotQuestions();
    console.log('[Cron] Hot questions calculation completed successfully');
    
    return res.status(200).json({
      success: true,
      message: 'Hot questions calculation completed',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cron] Hot questions calculation failed:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Hot questions calculation failed',
      timestamp: new Date().toISOString(),
    });
  }
}

