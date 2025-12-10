# 定时任务配置说明

## 热门标签统计

每天凌晨4点统计前一天最热门的5个标签。

### 手动执行

```bash
pnpm tsx server/cron/calculate-hot-questions.ts
```

### 配置cron job

在服务器上配置cron job，每天凌晨4点自动执行：

```bash
# 编辑crontab
crontab -e

# 添加以下行（请根据实际项目路径修改）
0 4 * * * cd /home/ubuntu/coin_fortune_analyzer && pnpm tsx server/cron/calculate-hot-questions.ts >> /var/log/hot-questions-cron.log 2>&1
```

### 验证cron job

```bash
# 查看当前的cron jobs
crontab -l

# 查看cron日志
tail -f /var/log/hot-questions-cron.log
```

## 注意事项

1. 确保服务器时区设置正确
2. 确保数据库连接正常
3. 定期检查日志文件，确保任务正常执行
4. 如果没有昨日数据，脚本会跳过统计，不会报错
