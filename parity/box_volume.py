"""Parity check: box volume from build123d (reference implementation).

Run: pip install build123d && python parity/box_volume.py
"""

try:
    from build123d import Box
except ImportError as exc:  # pragma: no cover
    raise SystemExit("build123d is not installed: pip install build123d") from exc

EXPECTED = 80 * 60 * 10
got = Box(80, 60, 10).volume

assert abs(got - EXPECTED) < 1e-6, f"volume mismatch: {got} != {EXPECTED}"
print(f"parity ok: box volume = {got}")
