# 新疆自驾地图规划

一个纯前端、本地可运行的新疆自驾路线规划网页。

## 功能

- 展示新疆知名景点和 0-10 综合推荐分。
- 自然景观使用绿色小点，人文景观使用红色小点。
- 支持北疆、南疆、伊犁、东疆支线等固定路线。
- 固定路线默认隐藏，点击“显示公路”后才显示。
- 已配置 Google Maps API key 时，路线使用 Google 驾车导航路径绘制。
- 未配置或路线服务不可用时，只保留本地距离/时间估算，不绘制点对点直线。
- 当前路线保存在浏览器 `localStorage`。

## 本地运行

```bash
python3 -m http.server 8080 --bind 127.0.0.1
```

然后打开：

```text
http://127.0.0.1:8080/index.html
```

## Google Maps API Key

不要把 API key 写入仓库。页面会把你输入的 key 保存在当前浏览器的
`localStorage` 中。

为了显示真实公路路线，请确认 key 可使用：

- Maps JavaScript API
- 路线/导航相关服务，例如 Directions API

建议给 key 设置 HTTP referrer 限制，例如：

```text
http://127.0.0.1:8080/*
```
