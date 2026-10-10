# parity — build123d 几何对拍

对标进度的度量物：同一份 op 脚本在 Python build123d 与 cadorange 两侧执行，
标量指标（体积/面积/bbox/面边数/有效性）在容差内一致即通过。

## 结构

- [`cases.json`](./cases.json) — 对拍用例（op 脚本，两侧共用一份语义）
- [`gen_golden.py`](./gen_golden.py) — Python 端：跑 build123d 生成 `golden/*.json`
- `golden/*.json` — 基准指标（生成物，提交入库供 TS 端断言）
- `packages/cadorange/test/parity.test.ts` — TS 端：跑 cadorange 对比 golden

## 用法

```bash
# 生成/更新 goldens（需要 python + build123d）
pip install build123d
python parity/gen_golden.py            # 全部
python parity/gen_golden.py box torus  # 指定用例

# TS 端对拍（goldens 缺失的用例自动跳过）
pnpm vitest run packages/cadorange/test/parity.test.ts
```

## 语义约定

- 放置语义按 cadorange 锚定规则（Box 角点/圆柱底面圆心在 origin）；
  build123d 侧用 `align=MIN` 对齐到同一语义。
- 容差：解析面 rel 1e-4，blend（fillet/chamfer）rel 1e-3，bbox abs 1e-4；
  已知内核行为差异用用例级容差标注（`bboxTolerance` 等，对应
  docs/occt-requirements.md 的 R 编号，底层修复后应收紧）。

## 当前状态（2026-10-10）

10/10 通过。两处已标注待收紧项：fuse 的面/边计数（R12 同域合并）、
torus bbox（R13 optimal bounds）。体积/面积与 build123d 全部一致
（含 fillet/chamfer blend 用例）。
