/**
 * 每日凌晨4点统计前一天的热门标签
 * 
 * 使用方法：
 * 1. 手动执行：pnpm tsx server/cron/calculate-hot-questions.ts
 * 2. 配置cron job：每天凌晨4点执行
 */

import { calculateHotQuestions } from "../db.js";

async function main() {
  console.log("[Cron] Starting hot questions calculation...");
  console.log("[Cron] Current time:", new Date().toISOString());
  
  try {
    await calculateHotQuestions();
    console.log("[Cron] Hot questions calculation completed successfully");
  } catch (error) {
    console.error("[Cron] Hot questions calculation failed:", error);
    process.exit(1);
  }
  
  process.exit(0);
}

main();
