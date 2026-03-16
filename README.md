# PlayableTool UA

一个本地离线使用的 playable HTML 素材替换工具。

它主要用于：
- 解析 playable HTML 中的图片资源
- 替换单张或多张图片
- 统一替换跳转链接
- 重新生成可交付的 HTML 文件

## 当前版本

`v3.1.0`

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

## 3.1.0 更新内容

- 新增更稳定的 `window.__zip` 解析与回写逻辑，支持 super-html 单段赋值和 `+=` 拼接
- 新增 `window.__res` 静态资源表兜底解析，补上部分 Cocos 3.x playable 的图片识别与替换
- 保留并增强批量换图能力，支持按文件名自动匹配 zip / 资源表图片
- 继续优化高频调试体验，生成时基于原始 HTML 并自动清理历史注入块
- 新增 `__zip` 重打包高压缩回写，统一使用 `DEFLATE`，避免替换素材或链接后文件体积异常膨胀

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
