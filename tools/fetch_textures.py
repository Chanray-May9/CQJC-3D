"""Download CC0 PBR texture sets from ambientCG into assets/textures/.

Each set is fetched as a 1K JPG zip and unpacked to a flat folder per material,
keeping only the maps the web renderer actually uses (color / normal / roughness /
ambient occlusion). 1K is the sweet spot for browser delivery -- 2K quadruples the
payload for detail that is invisible at walking distance.
"""

import io
import json
import sys
import zipfile
from pathlib import Path
from urllib.request import urlopen, Request

ROOT = Path(__file__).resolve().parent.parent
# Under public/ so Vite copies the files verbatim into the build. Referenced at
# runtime as "assets/textures/...", which resolves the same in dev and in a
# built site served from a subpath.
OUT = ROOT / "public" / "assets" / "textures"

# asset id -> local folder name
SETS = {
    "Concrete034": "concrete",        # main building walls
    "Concrete048": "concrete_rough",  # secondary / weathered walls
    "Asphalt031": "asphalt",          # roads
    "Grass005": "grass",              # lawns, field turf
    "Bricks104": "brick",             # 红色实训楼
    "Concrete031": "plaza",           # plaza paving
}

# substrings identifying the maps we keep, mapped to a stable local name
WANTED = {
    "_color": "color",
    "_normalgl": "normal",
    "_roughness": "roughness",
    "_ambientocclusion": "ao",
}


def fetch(asset_id: str, folder: str) -> None:
    dest = OUT / folder
    if (dest / "color.jpg").exists():
        print(f"  {asset_id:14s} -> {folder:15s} already present, skipping")
        return None

    url = f"https://ambientcg.com/get?file={asset_id}_1K-JPG.zip"
    req = Request(url, headers={"User-Agent": "campus3d-asset-fetch"})
    with urlopen(req, timeout=120) as resp:
        payload = resp.read()

    dest.mkdir(parents=True, exist_ok=True)
    kept = []
    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
        for member in zf.namelist():
            stem = member.lower()
            for needle, local in WANTED.items():
                if needle in stem and stem.endswith(".jpg"):
                    (dest / f"{local}.jpg").write_bytes(zf.read(member))
                    kept.append(local)
                    break

    size_kb = sum(f.stat().st_size for f in dest.glob("*.jpg")) // 1024
    print(f"  {asset_id:14s} -> {folder:15s} {sorted(kept)} ({size_kb} KB)")


def write_manifest() -> None:
    """Record which maps each set actually has.

    Coverage is uneven across ambientCG sets -- Concrete034 ships without an
    ambient occlusion map, for instance. The renderer reads this manifest instead
    of assuming a fixed set, which is what stops it requesting files that 404.
    """
    manifest = {}
    for folder in sorted(SETS.values()):
        d = OUT / folder
        if not d.is_dir():
            continue
        manifest[folder] = sorted(f.stem for f in d.glob("*.jpg"))

    path = OUT / "manifest.json"
    path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"\nmanifest -> {path}")
    for name, maps in manifest.items():
        print(f"  {name:15s} {maps}")


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    print(f"downloading {len(SETS)} CC0 texture sets to {OUT}")
    failed = []
    for asset_id, folder in SETS.items():
        try:
            fetch(asset_id, folder)
        except Exception as exc:  # noqa: BLE001 - report and continue
            print(f"  {asset_id:14s} FAILED: {exc}")
            failed.append(asset_id)

    write_manifest()

    if failed:
        print(f"\n{len(failed)} set(s) failed: {', '.join(failed)}")
        return 1
    print("\nall texture sets ready")
    return 0


if __name__ == "__main__":
    sys.exit(main())
