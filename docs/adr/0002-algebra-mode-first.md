# ADR-0002: API 形态——algebra mode 优先，builder 上下文不移植

- 状态: 已接受
- 日期: 2026-10-14（补录，实际决策于 2026-10-09 M0 启动时）

## 背景

build123d 有两种 API 形态：builder mode（`with BuildPart() as part:`
上下文管理器 + 隐式当前对象）和 algebra mode（显式对象 + 运算符重载，
`a - b`、`plane * obj`）。CadQuery 则是 Workplane 链式。

TypeScript 没有上下文管理器和运算符重载；builder mode 的"隐式状态 +
累积操作"语义天然水土不服。

## 决定

1. **核心 API 只做 algebra mode**：显式对象，运算符转方法
   （`a - b` → `a.cut(b)`、`a & b` → `a.intersect(b)`）。
2. **builder 语义的承接者**是 runtime 的 OpLog/Session（"隐式状态 + 累积
   操作"与操作日志天然同构），不是 API 层的语法模仿。
3. CadQuery 风格由 `cadorange/workplane` 薄门面承接（字符串选择器 DSL），
   每个方法 1:1 映射核心 op，op 记录同源。
4. 后期若做 builder 映射层，是 runtime 之上的便利层，不进核心。

## 后果

- 从 build123d builder 示例转译需要"展开上下文"为显式调用（语料转译的
  固定套路，examples/_algebra 版本几乎免改）。
- LLM 迁移成本：运算符习惯需查迁移表（api-map 已维护），方法名与
  build123d 语义一一对应抵消大部分成本。
- 选择器语义（filterBy/groupBy/sortBy/Convexity）与形态无关，全量移植。
