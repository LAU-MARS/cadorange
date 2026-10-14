# ADR-0003: 发布形态——单包 cadorange + 子路径导出

- 状态: 已接受
- 日期: 2026-10-14（补录，实际决策于 2026-10-10，取代当日的
  "@cadorange scope 子包"与"cadorange-* 前缀子包"两个过渡方案）

## 背景

M0 脚手架拆了四个 workspace 包（cadorange + runtime/render/mcp），意图
隔离 render/mcp 的重依赖。实践暴露：版本错配矩阵（core 0.2 配哪个
runtime？）、npm org 依赖、骨架包发布的诚实性问题。build123d 本体是
单包（pip install build123d 全量），内核绑定独立（cadquery-ocp）——
对应到我们即 cadorange 单包 + occt.ts 独立，两层各自成立。

## 决定

1. **npm 只发一个包 `cadorange`**，其余能力为子路径导出：
   `/workplane`（已发）、`/runtime`、`/render`、`/mcp`、`/occt`（逃生口，
   见 ADR-0001）。
2. `cado` CLI 是主包 bin；MCP 入口 `npx -y cadorange mcp`。
3. 仓库仍为 monorepo（packages/ 只剩 cadorange 一个可发布包），
     parity/bench/examples 留在根目录。
4. 将来重依赖（PNG 编码器、MCP SDK）用 optionalDependencies 或懒加载
   解决，不拆包。

## 后果

- 无版本错配矩阵，一条发布流水线（changesets → 0.x 递增）。
- 用户一步安装全量；子路径按需 tree-shake。
- 未实现模块（runtime/render/mcp 骨架）不承诺可用性，README 状态列标注。
