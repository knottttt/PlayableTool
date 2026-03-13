# PlayableTool UA

一个本地离线使用的 playable HTML 素材替换工具。

它主要用于：
- 解析 playable HTML 中的图片资源
- 替换单张或多张图片
- 统一替换跳转链接
- 重新生成可交付的 HTML 文件

## 当前版本

`v2.0.0`

## 适用场景

适合以下日常工作：
- 替换 playable 内的图片素材
- 快速调整 App Store 跳转链接
- 高频调试同一个 HTML playable
- 批量替换多张图片，减少重复点击上传

## 主要能力

- 支持解析 `ZIP`、`adapterZip`、`inline data:image` 等常见 playable 资源模式
- 支持单张图片替换
- 支持按文件名批量替换多张图片
- 自动重写常见跳转链接
- 自动注入 mraid 兜底逻辑
- 连续生成时避免注入内容重复叠加

## 2.0.0 更新内容

- 修复了连续生成后 HTML 文件体积不断变大的问题
- 修复了连续调试时历史修改重复叠加的问题
- 新增批量导入图片功能
- 新增批量替换结果提示
- 优化了高频调试同一个 playable 的稳定性

## 使用方式

1. 打开工具页面
2. 上传 playable HTML 文件
3. 点击“解析 HTML / 提取图片列表”
4. 按需替换单张图片，或使用批量导入图片
5. 填写目标跳转链接
6. 点击“生成修改后的 HTML 并下载”

## 使用提醒

- 批量替换主要适用于资源带文件名的模式
- `inline` 模式暂不支持按文件名批量替换
- 生成后的文件建议仍做一次页面效果和跳转检查

## 文件说明

- [index.html](/f:/PlayableTool_UI/index.html): 工具界面
- [main.js](/f:/PlayableTool_UI/main.js): 主要处理逻辑
- [CHANGELOG.md](/f:/PlayableTool_UI/CHANGELOG.md): 版本更新记录
