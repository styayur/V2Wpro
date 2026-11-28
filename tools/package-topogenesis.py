"""Package a stamped website, immutable producer sources and independently licensed game evidence."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess
from datetime import datetime, timezone
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

parser = argparse.ArgumentParser()
parser.add_argument("site", type=Path, help="Stamped site from the exact source commit")
parser.add_argument("consumer", type=Path, help="Skimmer checkout containing the evidence commit")
parser.add_argument("output", type=Path, help="New output directory")
args = parser.parse_args()
producer = Path(__file__).resolve().parents[1]

def git(root, *args):
    return subprocess.check_output(["git", "-C", str(root), "-c", "core.autocrlf=false", *args])

def blob(root, commit, name):
    return git(root, "show", f"{commit}:{name}")

def sha(data):
    return hashlib.sha256(data).hexdigest()

def read_site(name):
    path = (site / name).resolve(strict=True)
    if not path.is_relative_to(site) or not path.is_file():
        raise ValueError(f"Invalid packaged site path {name!r}")
    return path.read_bytes()

def archive(target, entries):
    with ZipFile(target, "x") as bundle:
        for name, data in sorted(entries.items()):
            member = ZipInfo(name, stamp)
            member.create_system = 3
            member.external_attr = 0o100644 << 16
            bundle.writestr(member, data, compress_type=ZIP_DEFLATED, compresslevel=8)

commit = git(producer, "rev-parse", "HEAD").decode().strip()
version = json.loads(blob(producer, commit, "package.json"))["version"]
timestamp = int(git(producer, "show", "-s", "--format=%ct", commit))
stamp = datetime.fromtimestamp(timestamp, timezone.utc).timetuple()[:6]
site = args.site.resolve(strict=True)
manifest_bytes = read_site("build-manifest.json")
manifest = json.loads(manifest_bytes)
if (manifest["commit"], manifest["version"]) != (commit, version):
    raise ValueError("Site manifest and release checkout identify different sources")
site_entries = {"build-manifest.json": manifest_bytes}
for name, digest in manifest["files"].items():
    data = read_site(name)
    if sha(data) != digest:
        raise ValueError(f"Site digest mismatch for {name}")
    site_entries[name] = data
contracts = json.loads(blob(producer, commit, "contracts/manifest.json"))
for entry in contracts["files"]:
    data = site_entries[entry["path"]]
    if len(data) != entry["bytes"] or sha(data) != entry["sha256"]:
        raise ValueError(f"Published protocol mismatch for {entry['path']}")

feedback = json.loads(blob(producer, commit, "evidence/topogenesis/engine-feedback.json"))
upstream = feedback["consumerEvidenceCommit"]
base = "acceptance/joint-flight/topogenesis/"
tools = ["scripts/" + name for name in (
    "measure-import-flight.py", "run-topogenesis.py", "flight_bench_metrics.py",
    "compare-flight-matrices.py", "summarize-topogenesis.py")]
stream = git(args.consumer, "archive", "--format=zip", upstream, "--", base, "LICENSE", *tools)
with ZipFile(io.BytesIO(stream)) as source:
    foreign = {"Skimmer-Scraper/"+item.filename: source.read(item)
               for item in source.infolist() if not item.is_dir()}
prefix = "Skimmer-Scraper/"+base
if sha(foreign[prefix+"matrix.json"]) != feedback["matrixSha256"]:
    raise ValueError("Frozen test matrix digest mismatch")
for row in feedback["rows"]:
    filename = row["report"].rsplit("/", 1)[1]
    if sha(foreign[prefix+row["batch"]+"/"+filename]) != row["reportSha256"]:
        raise ValueError("Game trace digest mismatch for "+filename)
foreign["Skimmer-Scraper/SOURCE.txt"] = (
    "Skimmer-Scraper game test harness and flight records\nAGPL-3.0-only\n"
    f"https://github.com/styayur/Skimmer-Scraper/tree/{upstream}\n"
    "The stock engine build and entry binary digest appear inside each controlled report.\n"
).encode()
foreign["V2Wpro/LICENSE"] = blob(producer, commit, "LICENSE")
foreign["V2Wpro/engine-feedback.json"] = blob(producer, commit, "evidence/topogenesis/engine-feedback.json")
out = args.output.resolve()
out.mkdir(parents=True, exist_ok=False)
stem = f"V2Wpro-v{version}"
archive(out/f"{stem}-offline-site.zip", site_entries)
git(producer, "archive", "--format=zip", "-o", str(out/f"{stem}-source.zip"), commit)
git(producer, "archive", "--format=zip", "-o", str(out/f"{stem}-worlds-and-contracts.zip"), commit,
    "--", "examples", "contracts", "schema", "LICENSE", "docs/topogenesis.md", "web/guide.html")
archive(out/f"{stem}-flight-evidence.zip", foreign)
assets = [{"name": p.name, "bytes": p.stat().st_size, "sha256": sha(p.read_bytes())}
          for p in sorted(out.glob("*.zip"))]
receipt = {"version": version, "sourceCommit": commit, "source": f"https://github.com/styayur/V2Wpro/tree/{commit}",
           "siteManifestSha256": sha(manifest_bytes), "consumerEvidenceCommit": upstream, "assets": assets}
receipt_bytes = (json.dumps(receipt, indent=2)+"\n").encode()
(out/"release-manifest.json").write_bytes(receipt_bytes)
lines = [f"{a['sha256']}  {a['name']}" for a in assets]
lines.append(sha(receipt_bytes)+"  release-manifest.json")
(out/"SHA256SUMS.txt").write_bytes(("\n".join(lines)+"\n").encode("ascii"))
print(f"Packaged {len(assets)} archives for {version} at {commit}")
