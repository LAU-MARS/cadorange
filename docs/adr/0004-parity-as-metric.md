# ADR-0004: 对齐度量——parity harness 是"对标进度"的唯一口径

- 状态: 已接受
- 日期: 2026-10-14（补录，实际建立于 2026-10-10）

## 背景

"快速对标 build123d"需要可度量的定义，否则进度是感觉。build123d 的
examples/tests 是现成的行为规格语料。

## 决定

1. **parity/ 是对标进度的唯一口径**：同一份 op 脚本
   （cases.json）在 Python build123d 侧生成 golden 标量（体积/面积/
   bbox/面边顶点数/凹凸计数/有效性），TS 侧执行同语义脚本断言一致。
2. 容差分层：解析面 rel 1e-4，blend 1e-3，bbox 1e-4，计数精确；
   已知行为差异必须显式标注在用例上并指向文档条目（如 Compound.volume
   差异、shell 语义），禁止静默放宽。
3. goldens 提交入库；CI 无 Python 时用例自动跳过，不阻塞常规流水线；
   重新生成是显式动作（gen_golden.py）。
4. 新 API 落地时必须带 parity 用例或解析断言测试之一。

## 后果

- 对标进度 = passed/total（当前 22/22），发布说明引用该数字。
- 与 build123d 的差异无处藏身：每次差异要么修齐、要么在 api-map 差异表
  立项并写明理由（我们是"按规格对齐"，不盲目复刻参照实现的怪癖，
  如 Compound.volume 只报单子体）。
- 代价：golden 再生成依赖本地 build123d 环境（.reference/venv），
  双 OCCT 版本差（Python 7.8 vs WASM 7.9）由容差吸收。
