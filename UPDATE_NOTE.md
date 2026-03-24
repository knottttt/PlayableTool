# PlayableTool 4.1.0 更新说明

## 本次重点

- 修复 `script[type="text/base64"]` 形式 super-html 无法正确识别的问题。
- 新增 zip 内文本文件里的 `data:image` 扫描，补上 `2.js` 等脚本内嵌图场景。
- 支持将替换后的 zip 内嵌图片回写到原始文本条目，确保生成文件可正常使用。
- 优化解析状态文案，便于识别当前是 `window.__zip`、`scriptTag` 还是其他入口。
- 保留现有本地预览、批量替换和 `__zip` 高压缩回写能力。

## 适用场景

- zip 内图片不是独立文件，而是内嵌在脚本文本中的 playable。
- 使用 `text/base64` script 标签存放 zip 数据的 super-html 变体。
- 需要完整提取、替换并回写内嵌图的高频调试流程。
