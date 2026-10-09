# parity — build123d 几何对照

CI 中用 Python build123d 作为参考实现对拍标量几何(体积、面积、bbox、惯量),
确保 cadorange 与 LLM 已熟知的参考结果一致。

- [`box_volume.py`](./box_volume.py) — 最小对拍样例
- 计划:每个 primitive / boolean / fillet 一组对拍,容差按量纲设定
- 运行:`pip install build123d && python parity/box_volume.py`

CI 中通过 `workflow_dispatch` 手动触发(job: `parity`),避免拖慢常规流水线。
