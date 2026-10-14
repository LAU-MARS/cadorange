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
    elif kind == "polygonR":
        return bd.RegularPolygon(op["radius"], op["sides"])
    elif kind == "sketchSlot":
        return bd.SlotCenterToCenter(op["length"], op["diameter"])
    elif kind == "rectOnXZ":
        shape = bd.Rectangle(op["width"], op["height"])
        u, v = op.get("at", [0, 0])
        return bd.Plane.XZ * bd.Pos(u, v) * shape
    elif kind == "extrudeSketch":
        return bd.extrude(shapes[op["target"]], amount=op["amount"])
    elif kind == "revolveSketch":
        return bd.revolve(shapes[op["target"]], axis=bd.Axis.Z, revolution_arc=op.get("angle", 360))
    elif kind == "padOnFace":
        base = shapes[op["target"]]
        top = base.faces().sort_by(bd.Axis.Z).last
        pad = bd.Plane(top) * bd.Rectangle(op["width"], op["height"])
        pad = bd.extrude(pad, amount=op["amount"])
        return base.fuse(pad)
    elif kind == "sketchCircle":
        return bd.Circle(op["radius"])
    elif kind == "sketchCircleAt":
        return bd.Pos(*op["origin"]) * bd.Circle(op["radius"])
    elif kind == "loftSketch":
        return bd.loft([shapes[i] for i in op["parts"]])
    elif kind == "shellOp":
        return bd.offset(shapes[op["target"]], -op["thickness"])
    elif kind == "holeOp":
        base = shapes[op["target"]]
        drill = bd.Cylinder(
            op["diameter"] / 2,
            base.bounding_box().max.Z + 2,
            align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN),
        ).translate((base.bounding_box().max.X / 2, base.bounding_box().max.Y / 2, -1))
        return base.cut(drill)
    elif kind == "wedge":
        base = bd.Box(op["dx"], op["dy"], op["dz"], align=(bd.Align.MIN,) * 3)
        tri = bd.Polygon(
            (op["dx"], -1, op["dz"]),
            (op["dx"], -1, 0),
            (0, -1, op["dz"]),
        )
        prism = bd.extrude(tri, op["dy"] + 2)
        return base.cut(prism)
    elif kind == "sketchEllipse":
        return bd.Ellipse(op["major"], op["minor"])
    elif kind == "lego":
        unit = 8
        pip_count = 6
        block_length = unit * pip_count
        block_width = 16
        wall = 1.2
        pip_height = 1.8
        pip_diameter = 4.8
        support_outer = 6.5
        support_inner = 4.8
        ridge_width = 0.6
        ridge_depth = 0.3
        base_height = 9.6
        plan = bd.Rectangle(block_length, block_width)
        plan -= bd.offset(plan, -wall, kind=bd.Kind.INTERSECTION)
        for loc in bd.GridLocations(0, unit, 1, 2):
            plan += loc * bd.Rectangle(block_length, ridge_width)
        for loc in bd.GridLocations(unit, 0, pip_count, 1):
            plan += loc * bd.Rectangle(ridge_width, block_width)
        plan -= bd.Rectangle(
            block_length - 2 * (wall + ridge_depth),
            block_width - 2 * (wall + ridge_depth),
        )
        for loc in bd.GridLocations(unit, 0, pip_count - 1, 1):
            ring = bd.Circle(support_outer / 2) - bd.Circle(support_inner / 2)
            plan += loc * ring
        part = bd.extrude(plan, amount=base_height - wall)
        part += bd.Pos(0, 0, part.vertices().sort_by().last.Z) * bd.Box(
            block_length, block_width, wall
        )
        top_z = base_height
        for loc in bd.GridLocations(unit, unit, pip_count, 2):
            part += bd.Pos(loc.position.X, loc.position.Y, top_z) * bd.Cylinder(
                pip_diameter / 2, pip_height,
                align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN),
            )
        return part
    elif kind == "assemblyRoundtrip":
        import os
        import tempfile

        plate = bd.Box(80, 60, 10, align=(bd.Align.MIN, bd.Align.MIN, bd.Align.MIN))
        plate.label = "plate"
        pin = bd.Pos(40, 30, 10) * bd.Cylinder(
            4, 30, align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN)
        )
        pin.label = "pin-1"
        asm = bd.Compound(children=[plate, bd.Compound(children=[pin])])
        path = os.path.join(tempfile.gettempdir(), "cadorange_parity_asm.step")
        bd.export_step(asm, path)
        return bd.import_step(path)
    elif kind == "offsetSolid":
        return bd.offset(shapes[op["target"]], op["distance"])
    elif kind == "mirror":
        part = shapes[op["target"]]
        ox, oy, oz, nx, ny, nz = op["plane"]
        about = bd.Plane(origin=(ox, oy, oz), z_dir=(nx, ny, nz))
        mirrored = bd.mirror([part], about)
        return mirrored[0] if isinstance(mirrored, (list, tuple)) else mirrored
    elif kind == "compound":
        return bd.Compound(children=[shapes[i] for i in op["parts"]])
    elif kind == "filletZ":
        part = shapes[op["target"]]
        return bd.fillet(part.edges().filter_by(bd.Axis.Z), op["radius"])
    elif kind == "chamferZ":
        part = shapes[op["target"]]
        length2 = op.get("length2")
        if length2 is not None:
            return bd.chamfer(part.edges().filter_by(bd.Axis.Z), op["distance"], length2)
        return bd.chamfer(part.edges().filter_by(bd.Axis.Z), op["distance"])
    else:
        raise ValueError(f"unknown op {kind!r}")
    return bd.Pos(*origin) * shape


def metrics(part, case) -> dict:
    bb = part.bounding_box()
    return {
        "volume": part.volume,
        "area": part.area,
        "bboxMin": [bb.min.X, bb.min.Y, bb.min.Z],
        "bboxMax": [bb.max.X, bb.max.Y, bb.max.Z],
        "faces": len(part.faces()),
        "edges": len(part.edges()),
        "vertices": len(part.vertices()),
        **(
            {"concaveEdges": len(part.edges().filter_by(bd.Convexity.CONCAVE)),
             "convexEdges": len(part.edges().filter_by(bd.Convexity.CONVEX))}
            if case["name"] == "l_bracket"
            else {}
        ),
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
            "metrics": metrics(result, case),
        }
        out = GOLDEN_DIR / f"{name}.json"
        out.write_text(json.dumps(golden, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {out.name}: volume={golden['metrics']['volume']:.4f}")


if __name__ == "__main__":
    main()
