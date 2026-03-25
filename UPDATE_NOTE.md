# PlayableTool 4.2.0 更新说明

## 本次重点

- 修复 `window.__adapter_zip__` 被拆成多段 `+=` 时无法完整解析的问题。
- 新增对同变量后续拼接段的全局收集，避免只读取首段导致 zlib 解压失败。
- 修复部分 adapterZip playable 明明有完整资源表却提示无法解析的情况。
- 保持现有 `script[type="text/base64"]`、zip 文本内嵌图识别与回写能力。
- 保留本地预览、批量替换和 `__zip` 高压缩回写能力。

## 适用场景

- `window.__adapter_zip__` 通过多段字符串拼接生成的大体积 playable。
- adapterZip 资源表被拆散到多个 script 段后，仍需完整提取图片资源。
- 需要兼容 super-html 与 adapterZip 多种历史变体的高频调试流程。
