# ADR-0001: 与 occt.ts 的公开关系——对齐 build123d↔OCP 模式（开放逃生口）

- 状态: 已接受
- 日期: 2026-10-14

## 背景

build123d 与其内核绑定 OCP（cadquery-ocp）的关系是**共存而非包裹**（源码取证）：

1. OCP 是 build123d 的**公开依赖**（`cadquery-ocp >= 8.0, < 8.1` 版本窗口），
   用户代码可直接 `from OCP.BRep import ...` 与 build123d 混用；
2. `Shape.wrapped` **公开持有**底层 `TopoDS_Shape`（文档明言 "the OCP object"），
   任何时刻可下潜到原始对象做 build123d 没封装的事；
3. build123d 不试图把 OCP 藏起来——逃生口是产品特性而非泄露。

cadorange 此前的原则是"只有 `kernel/` 能 import occt.ts"（M0 脚手架决策，
动机是可换内核与 mock 测试）。但这把逃生口也封死了：用户遇到 cadorange
未覆盖的 OCCT 能力时无路可走，只能等我们排期。

## 决定

对齐 build123d↔OCP 的关系模式，**受支持地开放逃生口**：

1. 新增子路径导出 **`cadorange/occt`**：`getOcc()`（init 后的 OccSession）、
   `toRaw(shape)` / `fromRaw(raw)` 双向桥、`occ.module` 上的 152 个原始
   OCCT 类（gp/Geom/TopTools/ShapeUpgrade/…），以及相关类型 re-export。
2. `Shape.wrapped` 公开持有高层句柄 `OccShape`（类比 build123d 的
   `wrapped: TopoDS_Shape`）。
3. **内部实现不受影响**：`kernel/` 仍是实现层的唯一 occt.ts import 面
   （保留可换内核/mock 的能力）；`cadorange/occt` 是直通逃生口，
   与 `kernel/` 共同构成包内全部 occt.ts 引用点（两处，不多不少）。
4. 依赖窗口锁定大版本（`occt.ts: ^1.0.0`），与 build123d 锁 OCP 窗口同构。

## 后果

- 用户可以下潜：`toRaw` 拿 `Raw_TopoDS_Shape` 直接跑 152 类里的任何东西，
  `fromRaw` 桥回来继续用高层 API——build123d 用户沉淀的 OCP 片段可平移。
- **raw 层生命周期归用户**：`toRaw` 返回的 JS-owned 对象需自行 `.delete()`
  （子路径文档写明纪律）；`wrapped`/高层句柄仍由 cadorange 托管。
- cadorange 不承诺 raw 层 API 的跨版本兼容（那是 occt.ts 的语义版本责任），
  但承诺逃生口本身的存在与桥接语义稳定。
- `docs/architecture.md` 的"只有 kernel/ 能 import occt.ts"修订为
  "kernel/（实现）+ cadorange/occt（受支持逃生口）两处"。
