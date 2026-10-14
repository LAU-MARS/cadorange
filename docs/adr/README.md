# ADR — 架构决策记录

记录 cadorange 的关键决策：背景、决定、后果。一旦写入即为**既定事实**，
后续推翻需新开 ADR 并标注取代关系（`Supersedes: ADR-00XX`）。

## 格式

```
# ADR-00NN: 标题

- 状态: 已接受 | 已被 ADR-00XX 取代
- 日期: YYYY-MM-DD

## 背景
## 决定
## 后果（含代价与反例）
```

## 索引

| ADR | 标题 | 状态 |
| --- | --- | --- |
| [0001](./0001-occt-relationship.md) | 与 occt.ts 的公开关系：对齐 build123d↔OCP 模式（开放逃生口） | 已接受 |
| [0002](./0002-algebra-mode-first.md) | API 形态：algebra mode 优先，builder 上下文不移植 | 已接受 |
| [0003](./0003-single-package.md) | 发布形态：单包 cadorange + 子路径导出 | 已接受 |
| [0004](./0004-parity-as-metric.md) | 对齐度量：parity harness 是"对标进度"的唯一口径 | 已接受 |
