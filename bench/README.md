# bench — CADGenBench 适配

M2 里程碑接入 CADGenBench 的评测 harness(当前为占位)。

计划:

- 每个 prompt:生成代码 → `Session.run()` → `describe()` / `render()` 验证
- 指标:成功率、valid 率、平均 op 数、回滚次数、token 用量
- 输出:JSON 明细 + Markdown 摘要,CI 可选上传 artifact
- 结果驱动 M3 的 API 覆盖优先级
