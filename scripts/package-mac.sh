#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo"

build_commit="$(git rev-parse --short HEAD)"
printf 'Build commit: %s\n' "$build_commit"
status="$(git status --porcelain)"
if [[ -n "$status" ]]; then
  dirty="$(printf '%s\n' "$status" | awk 'substr($0, 1, 2) != "??" { print; bad=1 } END { exit bad ? 0 : 1 }' || true)"
  if [[ -n "$dirty" ]]; then
    printf 'Tracked changes are present; commit or discard them before packaging.\n%s\n' "$dirty" >&2
    exit 1
  fi
fi

versions="$(node --input-type=module -e '
import { readFileSync } from "node:fs";
const tauri = JSON.parse(readFileSync("desktop/src-tauri/tauri.conf.json", "utf8")).version;
const manifest = readFileSync("desktop/src-tauri/Cargo.toml", "utf8");
const lock = readFileSync("desktop/src-tauri/Cargo.lock", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8")).version;
const cargo = manifest.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const cargoLock = lock.match(/\[\[package\]\]\s*\nname = "agent-office-desktop"\s*\nversion = "([^"]+)"/m)?.[1];
if (!cargo || !cargoLock) process.exit(2);
process.stdout.write([tauri, cargo, cargoLock, packageJson].join("\n"));
')"
if [[ "$(printf '%s\n' "$versions" | sort -u | wc -l | tr -d ' ')" != "1" ]]; then
  printf 'Version mismatch across tauri.conf.json, Cargo.toml, Cargo.lock and package.json:\n%s\n' "$versions" >&2
  exit 1
fi
version="$(printf '%s\n' "$versions" | head -n 1)"

target="${1:-${AGENT_OFFICE_MAC_TARGET:-}}"
if [[ -z "$target" ]]; then
  case "$(uname -m)" in
    arm64|aarch64) target='aarch64-apple-darwin' ;;
    x86_64|amd64) target='x86_64-apple-darwin' ;;
    *) printf 'Unsupported macOS architecture: %s\n' "$(uname -m)" >&2; exit 1 ;;
  esac
fi
case "$target" in
  aarch64-apple-darwin) node_arch='arm64'; artifact_arch='arm64' ;;
  x86_64-apple-darwin) node_arch='x64'; artifact_arch='x64' ;;
  *) printf 'Unsupported Rust target: %s\n' "$target" >&2; exit 1 ;;
esac

output="$repo/.package-mac"
mkdir -p "$output"
curl -fsSL 'https://nodejs.org/dist/index.json' -o "$output/index.json"
node_version="$(node -e 'const fs=require("node:fs"); const [arch,path]=process.argv.slice(1); const file=`osx-${arch}-tar`; const releases=JSON.parse(fs.readFileSync(path,"utf8")); const release=releases.find((item)=>item.version.startsWith("v24.")&&item.files.includes(file)); if(!release) process.exit(2); process.stdout.write(release.version);' "$node_arch" "$output/index.json")"
archive="node-${node_version}-darwin-${node_arch}.tar.gz"
base_url="https://nodejs.org/dist/${node_version}"
curl -fsSL "$base_url/$archive" -o "$output/$archive"
curl -fsSL "$base_url/SHASUMS256.txt" -o "$output/SHASUMS256.txt"
expected_hash="$(awk -v file="$archive" '$2 == file { print $1; exit }' "$output/SHASUMS256.txt")"
if [[ -z "$expected_hash" ]]; then
  printf 'Node.js checksum entry not found for %s\n' "$archive" >&2
  exit 1
fi
printf '%s  %s\n' "$expected_hash" "$output/$archive" | shasum -a 256 -c -
rm -rf "$output/extract"
mkdir -p "$output/extract"
tar -xzf "$output/$archive" -C "$output/extract"
cp "$output/extract/node-${node_version}-darwin-${node_arch}/bin/node" "$output/node"
chmod 755 "$output/node"

rustup target add "$target"
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const base = JSON.parse(readFileSync("desktop/src-tauri/tauri.conf.json", "utf8")).bundle.resources;
const config = { bundle: { resources: { ...base, [process.argv[1]]: "node" } } };
writeFileSync(process.argv[2], JSON.stringify(config));
' "$output/node" "$output/tauri-package.json"
cargo tauri build --bundles dmg --target "$target" --config "$output/tauri-package.json"

bundle_dir="$repo/desktop/src-tauri/target/$target/release/bundle/dmg"
shopt -s nullglob
images=("$bundle_dir"/*.dmg)
if [[ "${#images[@]}" -ne 1 ]]; then
  printf 'Expected exactly one DMG in %s, found %s\n' "$bundle_dir" "${#images[@]}" >&2
  exit 1
fi
artifact="$repo/AgentOffice_${version}_${artifact_arch}.dmg"
cp "${images[0]}" "$artifact"
shasum -a 256 "$artifact"
ls -lh "$artifact"
