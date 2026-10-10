"""Parity golden generator — runs every case in cases.json through Python
build123d and records scalar metrics (volume, area, bbox, counts) as golden
JSON for the TypeScript side to assert against.

Usage:
    python gen_golden.py            # regenerate parity/golden/*.json
    python gen_golden.py box torus  # regenerate selected cases

Requires: pip install build123d
"""

import json
import sys
from pathlib import Path

import build123d as bd

HERE = Path(__file__).parent
GOLDEN_DIR = HERE / "golden"


def build(op: dict, shapes: dict):
    kind = op["op"]
    origin = op.get("origin", [0, 0, 0])
    if kind == "box":
        shape = bd.Box(
            op["dx"], op["dy"], op["dz"], align=(bd.Align.MIN, bd.Align.MIN, bd.Align.MIN)
        )
    elif kind == "cylinder":
        shape = bd.Cylinder(
            op["radius"],
            op["height"],
            align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN),
        )
    elif kind == "sphere":
        shape = bd.Sphere(op["radius"])
    elif kind == "cone":
        shape = bd.Cone(
            op["radius1"],
            op["radius2"],
            op["height"],
            align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN),
        )
    elif kind == "torus":
        shape = bd.Torus(op["radius1"], op["radius2"])
    elif kind in ("cut", "fuse", "common"):
        a, b = shapes[op["target"]], shapes[op["tool"]]
        shape = {"cut": a.cut(b), "fuse": a.fuse(b), "common": a.intersect(b)}[kind]
        # build123d's intersect returns a ShapeList — the single result
        if not isinstance(shape, bd.Shape):
            shape = shape[0]
        return shape
    elif kind == "filletZ":
        part = shapes[op["target"]]
        return bd.fillet(part.edges().filter_by(bd.Axis.Z), op["radius"])
    elif kind == "chamferZ":
        part = shapes[op["target"]]
        return bd.chamfer(part.edges().filter_by(bd.Axis.Z), op["distance"])
    else:
        raise ValueError(f"unknown op {kind!r}")
    return bd.Pos(*origin) * shape


def metrics(part) -> dict:
    bb = part.bounding_box()
    return {
        "volume": part.volume,
        "area": part.area,
        "bboxMin": [bb.min.X, bb.min.Y, bb.min.Z],
        "bboxMax": [bb.max.X, bb.max.Y, bb.max.Z],
        "faces": len(part.faces()),
        "edges": len(part.edges()),
        "valid": part.is_valid,
    }


def main() -> None:
    only = set(sys.argv[1:])
    cases = json.loads((HERE / "cases.json").read_text(encoding="utf-8"))["cases"]
    GOLDEN_DIR.mkdir(exist_ok=True)
    for case in cases:
        name = case["name"]
        if only and name not in only:
            continue
        shapes: dict = {}
        for op in case["ops"]:
            shapes[op["id"]] = build(op, shapes)
        result = shapes[case["result"]]
        golden = {
            "name": name,
            "meta": {
                "reference": "build123d",
                "build123d": bd.__version__,
            },
            "metrics": metrics(result),
        }
        out = GOLDEN_DIR / f"{name}.json"
        out.write_text(json.dumps(golden, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {out.name}: volume={golden['metrics']['volume']:.4f}")


if __name__ == "__main__":
    main()
