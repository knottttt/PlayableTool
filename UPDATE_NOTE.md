# PlayableTool 4.3.0 更新说明

## 本次重点

- 配置区升级为双链接输入：`Apple App Store URL` + `Google Play URL`。
- 新增 Google Play URL 支持，覆盖 `play.google.com/store/apps/...` 跳转替换。
- 链接替换逻辑升级为分域名重写，Apple 与 Google Play 分别替换到对应目标链接。
- 注入跳转逻辑升级为按设备优先：Android 走 Google Play，iOS 走 App Store。
- 优化双输入框间距与说明文案，减少配置误解和填错概率。

## 适用场景

- 需要同时维护 iOS 与 Android 投放链接的 playable 调试场景。
- 需要将原始 HTML 中混合商店链接（App Store + Google Play）按平台拆分替换。
- 需要在同一份素材中保持跨端跳转兜底一致性（mraid / window.open）。
