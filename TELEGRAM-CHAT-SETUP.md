# Telegram 在线客服桥接

网站访客在页面内发消息，Vercel Function 将消息转发到 Telegram 私有客服群。客服人员直接回复该条 Bot 消息，回复会同步回访客网页。

## 1. 创建 Telegram Bot 与客服群

1. 在 Telegram 联系 `@BotFather`，使用 `/newbot` 创建 Bot 并保存 Token。
2. 新建一个私有客服群，将 Bot 加入群内。Bot 保持默认隐私模式即可接收对其消息的回复。
3. 在群内向 Bot 发送一条消息，再通过 Bot API `getUpdates` 获取群的 `chat.id`。超级群 ID 通常以 `-100` 开头。
4. 客服回复时必须使用 Telegram 的“回复”功能，直接回复访客对应的 Bot 消息。

## 2. 创建 Upstash Redis

在 Vercel Marketplace 添加 Upstash Redis，优先选择 Singapore 区域。将 REST URL 和 REST Token 绑定到当前项目。

## 3. 配置 Vercel 环境变量

在 Vercel 项目 `Settings → Environment Variables` 中添加 `.env.example` 里的变量。所有密钥至少应用到 Production；Preview 可按需添加。

- `TELEGRAM_BOT_TOKEN`：BotFather 提供的 Token
- `TELEGRAM_CHAT_ID`：私有客服群 ID
- `TELEGRAM_MESSAGE_THREAD_ID`：可选，客服群使用话题时填写话题 ID
- `TELEGRAM_WEBHOOK_SECRET`：32 位以上随机字母、数字、下划线或连字符
- `CHAT_SIGNING_SECRET`：32 位以上随机字符串
- `UPSTASH_REDIS_REST_URL` 与 `UPSTASH_REDIS_REST_TOKEN`：Upstash REST 凭据
- `SITE_URL`：`https://www.ifollow.me`

不要把真实密钥写入仓库或提交 `.env` 文件。

## 4. 部署并注册 Webhook

完成环境变量后重新部署，再在本机临时导出 `TELEGRAM_BOT_TOKEN`、`TELEGRAM_WEBHOOK_SECRET` 和 `SITE_URL`，执行：

```bash
npm run telegram:webhook
```

最后访问 `https://www.ifollow.me/api/chat/health`。返回 `ok: true` 后，从网页发送一条消息，并在客服群中直接回复它，确认双向同步。
