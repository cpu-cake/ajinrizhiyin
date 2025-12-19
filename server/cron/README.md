# 定时任务配置说明

## 热门标签统计

每天北京时间凌晨4点（UTC 20:00）统计前一天最热门的5个标签。

### 手动执行

```bash
pnpm tsx server/cron/calculate-hot-questions.ts
```

### 配置cron job

在服务器上配置cron job，每天 UTC 20:00（北京时间凌晨4点）自动执行：

```bash
# 编辑crontab
crontab -e

# 添加以下行（请根据实际项目路径修改）
# UTC 20:00 = 北京时间 04:00
0 20 * * * cd /home/ubuntu/coin_fortune_analyzer && pnpm tsx server/cron/calculate-hot-questions.ts >> /var/log/hot-questions-cron.log 2>&1
```

### Vercel Cron 配置

如果使用 Vercel 部署，在 `vercel.json` 中添加：

```json
{
  "crons": [
    {
      "path": "/api/cron/hot-questions",
      "schedule": "0 20 * * *"
    }
  ]
}
```

### 验证cron job

```bash
# 查看当前的cron jobs
crontab -l

# 查看cron日志
tail -f /var/log/hot-questions-cron.log
```

## 注意事项

1. **时区说明**：cron 使用 UTC 时区，UTC 20:00 = 北京时间 04:00
2. 确保数据库连接正常
3. 定期检查日志文件，确保任务正常执行
4. 如果没有昨日数据，脚本会跳过统计，不会报错
