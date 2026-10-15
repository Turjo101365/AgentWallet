"""Package locally trained checkpoints for distribution without committing binaries.

python scripts/package_models.py --output experiments/agentwallet-models.zip
Extract the archive into rl-engine/models before docker compose build.
SB3 archives contain serialized Python objects: use only trusted checkpoints.
"""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile


def package(models, output):
    manifest = {}
    files = []
    for name in ("ppo", "dqn"):
        folder = models / name
        checkpoint = folder / "best_model.zip"
        metadata_file = folder / "metadata.json"
        metadata = json.loads(metadata_file.read_text(encoding="utf-8"))
        digest = hashlib.sha256(checkpoint.read_bytes()).hexdigest()
        if metadata.get("checkpoint_sha256") != digest:
            raise ValueError(f"{name}: missing or incorrect checkpoint_sha256")
        manifest[name] = {"version": metadata["version"], "checkpoint_sha256": digest,
                          "metadata_sha256": hashlib.sha256(metadata_file.read_bytes()).hexdigest()}
        files.extend([checkpoint, metadata_file])
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for file in files:
            archive.write(file, file.relative_to(models).as_posix())
        archive.writestr("manifest.json", json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"output": str(output), "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
                      "models": manifest}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", type=Path, default=Path(__file__).resolve().parents[1] / "models")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    package(args.models, args.output)
