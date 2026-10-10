# cadorange 架构(M0 骨架)

本仓库 M0 核心垂直切片已落地(2026-10-10):kernel 适配层、geom/topo/selectors、
五原语、布尔、fillet/chamfer、workplane 门面、STEP/STL/GLB IO、record() 记账,
以及 parity 对拍 harness(10/10 通过)。`runtime`/`render`/`mcp` 仍是接口骨架。
本文记录既定架构决策,实现时不要偏离。

> 关键事实:occt.ts 是**高层 API**(非 OCP 式类树镜像)——子形状按 describe() 的
> 1-based 索引寻址而非句柄、变换立即执行、审问走 JSON 元数据。Kernel 接口已按
> 此现实修订;缺口(子形状句柄、质心、同域合并等)统一登记在
> [occt-requirements.md](./occt-requirements.md),往下推、不在上层绕。

## 1. 仓库结构

```
cadorange/
├─ packages/
│  ├─ cadorange/            # 核心建模 API
│  │  ├─ src/
│  │  │  ├─ kernel/         # occt.ts 适配层(唯一直接碰 OCCT 的地方)
│  │  │  ├─ geom/           # Vector, Axis, Plane, Location
│  │  │  ├─ topo/           # Shape, Solid, Face, Edge, ShapeList
│  │  │  ├─ primitives/     # Box, Cylinder, Sphere, Cone, Torus
│  │  │  ├─ ops/            # boolean, fillet, chamfer, extrude, revolve...
│  │  │  ├─ selectors/      # filterBy/groupBy/sortBy + 字符串选择器解析
│  │  │  ├─ io/             # STEP/STL/GLB/BREP
│  │  │  └─ workplane/      # CadQuery 风格外观(子路径导出 cadorange/workplane)
│  ├─ runtime/              # Session, OpLog, Snapshot, OpError, 沙箱
│  ├─ render/               # 无头多视图渲染
│  └─ mcp/                  # MCP server + `cado` CLI
├─ examples/
├─ bench/                   # CADGenBench 适配、成功率统计
├─ parity/                  # CI 中用 Python build123d 做几何对照
├─ docs/
├─ NOTICE  LICENSE  biome.json  pnpm-workspace.yaml  .changeset/
```

**原则:只有 `kernel/` 能 import occt.ts**,其余代码都通过 `Kernel` 接口访问
(`packages/cadorange/src/kernel/types.ts`)。这样以后升级 occt.ts、做 mock 测试或换内核
都不受影响,也能明确知道 occt.ts 缺哪些 API。

## 2. 工具链

| 项 | 选择 | 备注 |
| --- | --- | --- |
| 包管理 | pnpm workspace | `pnpm-workspace.yaml` |
| 构建 | tsdown | 只发 ESM,`exports` 子路径,`publishConfig` 发版时切到 dist |
| 测试 | vitest + browser mode(Playwright) | Node 与 Chromium 双跑 |
| Lint/格式 | Biome | `biome.json` |
| 发版 | Changesets | **发布策略(2026-10-10 定)**:不注册 npm org,子包用无 scope 的 `cadorange-*` 前缀;npm 只发真实现(骨架不发);GitHub Release 挂本仓库 |
| CI | GitHub Actions | lint → typecheck → test(node) → test(browser) → parity(手动) |
| TS | strict, target ES2022, moduleResolution bundler | 根 `tsconfig.json` |

## 3. 核心接口

### 3.1 Kernel 适配层

见 `packages/cadorange/src/kernel/types.ts`。要点:`ShapeHandle` 不透明、
`hash()` 用于确定性校验和缓存、`dispose()` 负责 WASM 内存回收。

### 3.2 内存管理

WASM 对象不会被 GC 自动回收,这是 TS 版 OCCT 绕不开的坑(replicad 同样)。方案:

1. `Shape` 持有 handle,注册 `FinalizationRegistry` 兜底;
2. Session 内的对象统一由 OpLog 缓存持有,回滚或丢弃时**批量 dispose**;
3. 支持 `using`(TS 5.2 显式资源管理),供高级用户使用。

### 3.3 Runtime

见 `packages/runtime/src/types.ts`(Op / OpLog / Snapshot / OpError / RunResult)与
`packages/runtime/src/index.ts`(Session)。

**record() 规则(第一天就定死)**:`run()` 和 `apply()` 最后都写进同一个 OpLog;
核心 API 的每个操作都要能被记录,所以**每个 op 都经过同一个 `record()` 入口**。
后面再补会很痛苦。

## 4. WASM 加载 — 最大的工程风险

`init()` 必须在 Node、浏览器和 Web Worker 里都能用,并支持显式传入 `wasmUrl`
(`packages/cadorange/src/kernel/occt.ts`)。**M0 第一周就要验证三端加载**。

## 5. 开发期 exports 约定

包的 `exports` 在开发期直接指向 `src/*.ts`(workspace 内免构建、类型直达);
`publishConfig.exports` 在发版时改写为 `dist`。**首次 `changeset publish` 前确认
publishConfig 生效**(发布产物必须指向 dist)。

## 6. parity

CI 的 `parity` job 仅 `workflow_dispatch` 手动触发:Python build123d 为参考实现,
对拍体积/面积/bbox/面边数等标量。流程:`parity/cases.json`(两侧共用的 op 脚本)
→ `gen_golden.py` 生成 `parity/golden/*.json` → `packages/cadorange/test/parity.test.ts`
断言。goldens 缺失的用例自动跳过,所以无 Python 环境也能跑常规 CI。
"对标"的度量口径就是它:passed/total。
