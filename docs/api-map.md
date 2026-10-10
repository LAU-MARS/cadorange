# cadorange ↔ build123d / CadQuery API 对照表

对标进度的度量物。`M0/M1/M2/M3` = 对应里程碑交付；`✘` = 明确不对标（有理由）。
状态随实现推进更新。命名规则先行，之后逐 API 落地。

## 命名与形态映射规则

| build123d (Python) | cadorange (TS) | 例 |
| --- | --- | --- |
| snake_case | camelCase | `filter_by` → `filterBy` |
| 运算符重载 | 方法 | `a - b` → `a.cut(b)`；`a + b` → `a.fuse(b)`；`a * b`(Location) → `a.locate(b)` |
| 关键字参数 | options 对象 | `Box(1, 2, 3, align=Align.CENTER)` → `Box(1, 2, 3, { align: "center" })` |
| Enum | 字符串字面量联合 | `Align.CENTER` → `"center"`；`GeomType.CYLINDER` → `"cylinder"` |
| 属性 | getter 方法/属性 | `solid.volume` → `solid.volume()`（注：`describe()` 统一出口） |
| 上下文管理器 builder | 不对标 | algebra mode 是唯一核心路线（见"不对标清单"） |

## 3D 原语（objects_part）

| build123d | cadorange | 里程碑 | 备注 |
| --- | --- | --- | --- |
| `Box(dx, dy, dz, align, mode)` | `Box(dx, dy, dz, loc?)` | **M0** | occt.ts `makeBox`；align 用 loc 表达 |
| `Cylinder(radius, height, arc_size, align, rotation)` | `Cylinder({ radius, height, loc? })` | **M0** | `makeCylinder` |
| `Sphere(radius, ...)` | `Sphere({ radius, loc? })` | **M0** | `makeSphere` |
| `Cone(bottom_radius, top_radius, height, ...)` | `Cone({ radius1, radius2, height, loc? })` | **M0** | `makeCone` |
| `Torus(major_radius, minor_radius, ...)` | `Torus({ radius1, radius2, loc? })` | **M0** | `makeTorus` |
| `Wedge`, `ConvexPolyhedron` | 同名函数 | M2 | |
| `Hole`, `CounterBoreHole`, `CounterSinkHole` | `hole()` 系列 | M1 | occt.ts `detectHoles` 可辅助 |
| `text` 3D 文本（`FontManager`） | — | M3 | 依赖字体资产，后置 |

## 草图与曲线（objects_sketch / objects_curve）

| build123d | cadorange | 里程碑 | 备注 |
| --- | --- | --- | --- |
| `Circle`, `Ellipse` | `Circle`/`Ellipse` | M1 | `makeCircle/makeEllipse` |
| `Rectangle`, `RectangleRounded` | 同名 | M1 | `makePolygon` 组合 |
| `RegularPolygon`, `Polygon`, `Triangle`, `Trapezoid` | 同名 | M1 | |
| `SlotArc/SlotCenterPoint/SlotCenterToCenter/SlotOverall` | `slot()` | M1 | |
| `Line`, `PolarLine`, `IntersectingLine`, `ThreePointArc`, `RadiusArc`, `SagittaArc`, `JernArc`, `CenterArc`, `Helix`, `Polyline`, `Spline`, `BSpline`, `Bezier` | 同名（camelCase） | M1 | occt.ts 有 `makeLine/makeArc/makeBspline(Through)/makePolygon`；Helix/JernArc 等纯数学部分直接移植 |
| `Text`, `Draft`(制图), `DimensionLine` 系 | — | M3 | drafting 整组后置 |

## 操作（operations_part / generic）

| build123d | cadorange | 里程碑 | 备注 |
| --- | --- | --- | --- |
| `a - b` / `a.fuse(b)` / `a.intersect(b)` | `cut/fuse/intersect` | **M0** | occt.ts `cut/fuse/common` |
| `fillet(objects, radius)` | `fillet(part, edges, radius)` | **M0** | 按索引下沉；变半径 `variableFillet` |
| `chamfer(objects, length, length2)` | `chamfer(part, edges, distance)` | **M0** | 不等距待 occt.ts R3 |
| `section(obj, by)` | `section(a, b)` | M0+ | `section` |
| `extrude`, `revolve`, `loft`, `sweep` | 同名 | M1 | occt.ts 均有 |
| `offset`, `shell`→`thicken`/`offset` | 同名 | M1 | `offsetSolid/shell` |
| `split`, `mirror` | 同名 | M1 | split=`split`；mirror 待 occt.ts R4 |
| `scale`, `rotate`, `translate`, `Pos`, `Rot` | 同名/`locate` | **M0**(立即烘焙) | 无惰性 Location 链（OCP 差异） |
| `make_face`, `make_hull`, `project`, `thicken`, `bounding_box` | 同名 | M1–M2 | |
| 钣金组 `bend/flange/hem/unfold/...` | — | M3+ | 大子系统，后置 |
| `pack` | — | ✘ | 打包排版，非建模核心 |

## 拓扑与几何（geometry / topology）

| build123d | cadorange | 里程碑 | 备注 |
| --- | --- | --- | --- |
| `ShapeList[T]` + `filter_by/group_by/sort_by/filter_by_position` | `ShapeList` 同名方法 | **M0** | 谓词建在 describe() 元数据上（见下） |
| `solids/faces/wires/edges/vertices`（复数选择器） | `part.solids()/faces()/edges()/vertices()` | **M0**(vertices 待 R5) | |
| `solid/face/edge/vertex`（单数，断言恰好一个） | 同名单数方法 | **M0** | 抛结构化错误 |
| `Shape`, `Solid`, `Face`, `Edge`, `Wire`, `Vertex`, `Shell`, `Compound`, `Part` | 同名类 | **M0**(核心四类) / M1(其余) | cadorange 子形状是"父 shape + 索引 + describe 缓存"视图对象（OCP 差异） |
| `Vector`, `Axis`, `Plane`, `Location`, `BoundBox`, `Matrix` | 同名 | **M0**(Vector/Axis/Plane/BBox) / M1(Matrix) | 纯 TS 实现 |
| `Rotation`/`Pos` 组合子 | `Location` 立即烘焙 | M1 | |
| `Curve`, `UVFrame`, `GeomEncoder` | — | M2 | |
| `topo_distance_to`, `topo_explore_*` | `distance()` | M2 | occt.ts `distance` 已有 |

## 选择器语义（谓词内核 = describe() 元数据）

**事实修正**：build123d **没有** CadQuery 字符串选择器（无 Selector 类），它的模型是
类型化 `filterBy`；字符串 DSL（`>Z`/`|Z`/`#face`）是 CadQuery 的。cadorange 谓词
内核实现一次，出两套皮：

| build123d filter | 语义 | describe() 数据源 |
| --- | --- | --- |
| `filterBy(Axis)` | 平面面法向 ∥ 轴；线边切向 ∥ 轴；其余排除 | `PlaneFaceInfo.normal` / `LineEdgeInfo.direction` |
| `filterBy(Plane)` | 面 ∥ 平面；边/线在该平面内 | normal + 原点距离；circle: center·axis |
| `filterBy(GeomType)` | 几何类型相等 | `curve` / `surface` 字面量 |
| `filterBy(Convexity)` | 凹/凸分类 | ⚠️ describe() 缺——已列入 occt.ts 需求 R8 |
| `filterBy((o) => bool)` | 自定义谓词 | 直接支持 |
| `filterByPosition(axis, min, max, inclusive)` | 中心投影过滤+排序 | `origin/center` 投影 |
| `groupBy(key)` / `sortBy(key, reverse)` | 分组/排序 | `length/radius/area/center` |

CadQuery 字符串语法（workplane 门面专用）：`>Z <Z |Z #face #edge >>Z <<Z`、
`and/or/not` 组合、`r1`(半径)等——解析为同一谓词内核。

## 导入导出（exporters）

| build123d | cadorange | 里程碑 |
| --- | --- | --- |
| `export_step/import_step` | `export/importStep` | **M0** |
| `export_stl/import_stl` | `exportStl`（ascii 先行）/ `importStl` | **M0** / M2 |
| `export_gltf` | `exportGlb` | **M0** |
| `export_brep/import_brep` | 同名 | M1 |
| `export_obj` | 同名 | M2 |
| DXF/SVG 2D 导出 | — | M3 |

## 明确不对标（✘）清单

| build123d 概念 | 理由 |
| --- | --- |
| `BuildPart/BuildSketch/BuildLine` builder 上下文 | TS 无 with/隐式当前对象；algebra mode 是核心路线。其"隐式状态+累积操作"语义由 runtime 的 OpLog/Session 承接（后期可做映射层） |
| `Joint` 装配关系族（Rigid/Revolute/...） | build123d 特色但非 LLM 高频；M3 后重估 |
| `Mesher`（gmsh 集成）、`import_dxf/svg`、钣金 | 依赖面大，M3 后重估 |
| 单位常量 `MM/IN/...`、物理属性（label 的 mass） | TS 数字字面量 + options 即可；不占 API 面 |

## 已知语义差异（迁移表核心）

1. **运算符 → 方法**：`a & b`→`a.intersect(b)`、`a | b`→`a.fuse(b)`、`a - b`→`a.cut(b)`。
2. **放置锚定**：`Box(dx,dy,dz)` 角点在原点、`Cylinder/Sphere/Cone/Torus` 基准在原点
   —— 相当于 build123d 的 `align=MIN`（build123d 默认 `CENTER`）。居中放置传
   `loc.origin` 或用 workplane 门面（CadQuery 语义：面内居中）。
3. **Location 立即烘焙**：occt.ts 变换立即执行返回新 shape；无 `Loc * Loc` 惰性链。
4. **子形状身份**：Edge/Face 是视图对象（父 shape + describe 索引），跨 op 不追踪
   （build123d label 系统待 occt.ts R7 tag 支撑）。M0 规则：blend 的边必须属于被操作的 shape。
5. **chamfer 暂等距 / 无 `.vertices()` / 无 mirror**：内核已就绪（0.10.0 的
   `length2`/`vertices`/`mirror`），cadorange 公开 API 待采纳（见
   occt-requirements.md 文末"待采纳"清单）。
6. **describe() 是统一体检出口**：`volume/area/bbox/center/isValid` 走 `describe()` 或
   显式方法，两处数值必须同源。
7. ~~fuse 结果不做同域合并~~：0.10.0 起布尔默认 clean（UnifySameDomain），
   与 build123d 行为一致；`{ clean: false }` 保留原始碎片拓扑。

## 实现进度（2026-10-10，occt.ts 0.10.0）

M0 核心垂直切片已落地并全绿：kernel 适配、geom（Axis/isParallel）、topo
（Shape/Solid/Face/Edge 视图/ShapeList）、五原语、布尔（默认 clean + 透传）、
fillet/chamfer、选择器谓词内核 + CadQuery 字符串解析、workplane 门面（README
示例可跑）、STEP/STL/GLB 导出 + STEP 导入、record() 全量记账。
对标度量基线（parity 10/10，最严容差）：**volume/area 与 build123d 逐位一致
（含 blend 用例），面/边计数完全一致**。已发布 `cadorange@0.1.0`。
