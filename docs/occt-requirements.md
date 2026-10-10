# occt.ts 需求契约

cadorange 的 kernel 层完全建立在 occt.ts 的高层 API（`OccSession`/`OccShape`）之上，
且两者同受我们控制。因此原则是：**缺口下沉到 occt.ts 修，不在 cadorange 侧绕**。
本文按 cadorange 里程碑排优先级；occt.ts 排期自主，但 P0 会阻塞对应里程碑。
cadorange 在需求落地前会采用表中标注的临时方案。

状态标记：`[ ]` 待做 · `[~]` 已确认接受 · 本文档是活文档，随对标推进增删。

## P0 — M0 期间必须处理

### R1 OCCT 控制台输出污染 stdout

- **证据**：Node 中 `writeStep()` 向 **stdout** 打印
  `Statistics on Transfer ... Step File Name : /mem/occt_out.step (776 ents) Write Done`
  （2026-10-10 冒烟测试实测；stderr 屏蔽后仍在，stdout 屏蔽后消失）。
- **影响**：`@cadorange/mcp` 的 stdio transport 协议流被污染（MCP 帧外的文本即致命）；
  `cado` CLI 输出不干净；agent 场景 stdout 常被当作结构化结果捕获。
- **建议**：默认静音（移除/降级 `Message_Printer`，或重定向 stderr）；
  如需诊断，`OccSession.create({ verbose: true })` 显式开启。
- **cadorange 临时方案**：无可靠 workaround（patch `process.stdout` 与 WASM 内部
  `printf` 不互通），MCP 端到端联调前必须修复。

## P1 — M1（草图与特征）前需要

### R2 子形状提取

- **理由**：build123d 中 `solid.faces()` 返回**一等 Face 对象**（可单独 tessellate、
  导出、参与布尔、在其上建 Plane 画草图）。M1 的 `.faces(">Z").workplane()` 链路
  需要把 face 取出来作为独立形状。目前 `WasmShape` 只能 `countSubShapes`，
  子形状拿不出来。
- **建议**：
  ```ts
  subShapes(shape: OccShape, type: "Solid" | "Face" | "Edge" | "Vertex"): OccShape[];
  faceWires(face: OccShape): { outer: OccShape; inners: OccShape[] }; // M1 草图内环
  ```
- **cadorange 临时方案**：M0 不需要——selectors/fillet 只用 `describe()` 元数据 +
  1-based 索引（已验证可行）。

### R3 不等距 chamfer

- **理由**：build123d `chamfer(obj, length, length2)` 支持双边不等距；occt.ts 只有
  等距 `chamfer(distance)`。
- **建议**：`EdgeBlendOptions` 增加 `length2?: number`（省略 = 等距，向后兼容）。
- **临时方案**：M0 只暴露等距。

### R4 mirror 与通用变换

- **理由**：build123d `mirror()` 是高频原语（对称件）。目前只有 translate/rotate/scale
  三个立即执行操作，无法表达镜像（负 scale 是点对称，不是镜像）。
- **建议**：
  ```ts
  mirror(shape, axisOrigin: Vec3, axisDir: Vec3): OccShape;      // 关于轴（2D 镜像）
  mirrorPlane(shape, origin: Vec3, normal: Vec3): OccShape;      // 关于平面（3D 镜像）
  ```
  或一个统一 `transform(shape, m: readonly number[])`（3×4 行主序，与
  `readStepDocument` 的 `transform` 同构）。
- **临时方案**：M0 对称件用"重建"绕过；不做镜像 API。

### R5 describe() 增加顶点

- **理由**：build123d `.vertices()` 选择器与 M1 草图端点捕捉需要顶点坐标；
  目前 `count("Vertex")` 有数字但 `describe()` 无顶点条目。
- **建议**：`GeometryDescription` 增加
  `vertices: Array<{ index: number; position: Vec3 }>`。
- **临时方案**：M0 不暴露 `.vertices()`。

### R6 compound 构造

- **理由**：阵列/多体（pattern、不相交 union）需要显式组合体；OCCT 的 fuse 对
  不相交体行为不保证。build123d/CadQuery 都有 Compound。
- **建议**：`compound(shapes: readonly OccShape[]): OccShape`（describe/tessellate
  对 compound 全树遍历即可）。
- **临时方案**：M0 单体模型，不涉及。

### R10 describe() 携带面/边质心（2026-10-10 实测发现，P0）

- **证据**：`PlaneFaceInfo.origin` 是**曲面参数原点（常在角落）**，不是面中心。
  居中盒（x∈[−40,40]）顶面的 origin 是 (−40,−30,10)——用它当中心，
  workplane 会锚到角上、`groupBy(Axis.Z)`/位置选择系统性错位。
- **建议**：每个 FaceInfo/EdgeInfo 增加 `center: Vec3`（面用 GProp 面积分质心，
  边用曲线积分中点）——build123d 的 `Shape.center()` 语义。
- **cadorange 临时方案**：kernel 适配层用"落在面平面内的边中点均值"逼近——
  对法向轴坐标是**精确**的（面内任意点法向坐标相同），面内位置是近似。
  已被 parity 与 workplane 测试覆盖，但曲面/含孔面精确质心需要此 API。

### R11 describe() 子形状枚举与 TopExp 对齐（P1）

- **证据**：同一"板开孔"模型，build123d `len(faces())` = 7，occt.ts
  `describe().faces` = 8；边数一致（15）。多出的面疑似圆柱面接缝拆分。
- **影响**：describe 是 fillet/chamfer 索引的基准；多计一个面说明枚举语义
  与 TopExp_Explorer 不完全一致，长此会影响索引稳定性。
- **建议**：审计 interrogate 的子形状遍历（去重/接缝处理），与
  `countSubShapes`/TopExp 对齐，并记录计数规则。

### R12 布尔结果做同域面合并（fuse unify same-domain，P0.5）

- **证据**：两个重叠盒 fuse，体积/面积与 build123d 一致，但 build123d 输出
  干净单箱（6 面 12 边），occt.ts 结果保留 12 面 28 边（原始面 + 相交边未合并）。
- **影响**：fuse 之后的面选择器会看到幽灵内立面/碎片面，`faces(">Z")` 类
  选择在融合件上语义劣化。
- **建议**：布尔输出过 `ShapeUpgrade_UnifySameDomain`（build123d/CadQuery 均如此），
  或暴露 `unify(shape)` 让上层调用。
- **cadorange 临时方案**：parity 对 fuse 用例放宽面/边计数容差（已在
  cases.json 标注）。

### R13 bounds() 用紧致包围盒（optimal bbox，P1）

- **证据**：Torus(20,5) 的体积/面积/面数与 build123d **逐位一致**，但
  bounds() 给 xy ∈ ±27.06（真实 ±25，+8.2% 外扩——样条控制点包络特征）。
- **建议**：`bounds()` 内部用 `BRepBndLib::AddOptimal`（或按需提供
  `bounds(shape, { optimal: true })`）。
- **cadorange 临时方案**：parity 对 torus 用例放宽 bbox 容差（已标注）；
  workplane 的通孔深度用对角线计算，外扩无碍。

## P2 — M2+（深度对标基建）

### R7 子形状跨操作身份

- **理由**：build123d label 系统的核心（"fillet 之后，哪个面原来是盒子的顶面"）。
  也让 cadorange 的 describe 缓存失效判断从"每次 op 后全量重建"降为按需。
- **建议**：`WasmShape.tag(): number`（TShape 指针哈希，同一拓扑子形状跨操作
  （未重建时）tag 稳定）；ops 返回新 shape 时保留未受影响子形状的 tag。
- **说明**：这是与 build123d 拉齐"对象身份"语义的长期基建，M2 前不阻塞；
  M0/M1 采用"边必须属于被操作的 shape"约束 + op 后全量重新 describe。

### R8 拓扑邻接查询

- **理由**：`edgeFaces(edge)` / `faceEdges(face)` 邻接关系支撑高级选择器
  （build123d 的邻接类选择）与诊断信息。
- **建议**：随 R2 的 subShapes 一起在 interrogate 层加邻接表输出。

### R9 边/面凹凸性（Convexity）

- **理由**：build123d `filterBy(Convexity)` 用于选凹/凸边（倒角通常只打凸边，
  检测凹边找配合面）。`describe()` 目前无凹凸信息。
- **建议**：interrogate 层为 edge 增加二面角/凹凸分类（相邻两面的法向关系，
  依赖 R8 的邻接表；曲面情形可用局部采样近似）。

## 已验证可用的能力（M0 清单核对，2026-10-10）

occt.ts 0.7.0 + OCCT 7.9.3，Node 端实测：

| M0 需求 | occt.ts 能力 | 状态 |
| --- | --- | --- |
| Box/Cylinder/Sphere/Cone/Torus | `makeBox/makeCylinder/...` | ✅ |
| 布尔 cut/fuse/intersect | `cut/fuse/common` | ✅ |
| fillet/chamfer/变半径 | `fillet/chamfer/variableFillet`（按 describe 索引选边） | ✅ |
| 选择器输入 | `describe()` 解析几何（法向/轴/半径/长度/面积/孔） | ✅ |
| STEP/BRep/GLB 导出 | `writeStep/writeBrep/writeGltf` | ✅ |
| STL 导出 | `meshToAsciiStl`（exporters 层，TS） | ✅（ascii） |
| 渲染输入 | `tessellate`（含边线段）、`hiddenLines`（HLR 工程图） | ✅ |
| 几何体检 | `volume/area/bounds/centroid/isValid/count` | ✅（bounds 见 R13） |

结论（2026-10-10 更新，经 parity 对拍实测）：**M0 能力可用，volume/area 与
build123d 逐位一致**；P0 缺口三个——R1（stdout 静音）、R10（面质心）、
R12（fuse 同域合并）——均已有 cadorange 侧临时方案与标注；其余缺口集中在
M1（子形状、mirror、顶点、compound、不等距 chamfer、optimal bbox）。
