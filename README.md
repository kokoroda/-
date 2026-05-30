# 以图搜图助手

一个 Manifest V3 浏览器扩展。点击扩展图标后，可以拖入图片或选择本地图片，扩展会自动调用可返回结构化结果的以图搜图平台，并按相似度排序展示图片、出处和来源链接。

## 下载

- [下载最新安装包（ZIP）](https://github.com/kokoroda/-/releases/download/v1.0.0/image-search-extension-v1.0.0.zip)

Chrome 和 Edge 不允许从 GitHub 直接安装未上架扩展。下载 ZIP 并解压后，只需要在扩展管理页选择解压后的文件夹。

## 已接入平台

- IQDB：无需 API Key，适合动漫图片站点的相似图片和出处搜索。支持 JPG、PNG、GIF，最大 8MB。
- ascii2d：无需 API Key，适合 Pixiv、Twitter/X 等插画来源搜索，会同时尝试色合搜索和特征搜索。
- SauceNAO：适合插画、动漫、Pixiv 出处搜索。无 API Key 时使用网页模式；填写 API Key 后使用 JSON API。
- trace.moe：适合动画截图识别。支持本地图片上传，返回番名、集数、时间点和预览图。
- Google Lens、Bing 视觉搜索、TinEye、Yandex Images、百度识图：默认参与搜索。它们使用网页/非公开端点做最佳努力解析，成功才会把结果合并到结果页，失败会静默跳过。

## 安装

1. 下载上方 ZIP 安装包并解压到任意文件夹。
2. 打开 Chrome 的 `chrome://extensions/` 或 Edge 的 `edge://extensions/`。
3. 打开“开发者模式”。
4. 选择“加载已解压的扩展程序”。
5. 选择刚刚解压出的文件夹。该文件夹内应当可以直接看到 `manifest.json`。

## 使用

1. 点击浏览器工具栏里的“以图搜图助手”。
2. 将图片拖到上传框，或点击“选择图片”。
3. 扩展只会打开一个等待页；如果等待页或结果页已经存在，会复用并刷新它。
4. 等待页负责搜索，搜索完成后会自动跳转到结果页。
5. 结果页只展示已完成的搜索结果，点击结果标题可以打开出处页面。

## 设置

在扩展弹窗右上角打开设置页：

- 可以启用或关闭 IQDB、ascii2d、SauceNAO、trace.moe。
- 默认启用 IQDB、ascii2d、SauceNAO、trace.moe、Google Lens、Bing、TinEye、Yandex、百度；SauceNAO 的 JSON API Key 可选，填写后会优先使用 API。
- 可以调整最低相似度和每个平台返回数量。

## 隐私说明

图片会被上传到启用的第三方搜图平台以完成搜索。IQDB、ascii2d、SauceNAO、trace.moe 会按各自规则处理上传图片；SauceNAO 的公开说明中提到，上传查询图片通常会短时间保存后删除。敏感图片不建议上传到第三方平台。
