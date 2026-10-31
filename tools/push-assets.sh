#!/usr/bin/env bash
# Pushes files to the orphan `assets` branch so this private repo's issues and PRs
# can show images, and prints one Markdown line per file (an image for .png/.svg).
#
# Usage: tools/push-assets.sh <folder> <file>...   (folder: issue-12, pr-15, …)
set -euo pipefail

[ $# -ge 2 ] || { echo "usage: $0 <folder> <file>..." >&2; exit 64; }
folder=$1; shift

remote=$(git remote get-url origin)
repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

if ! git clone -q --depth 1 --branch assets "$remote" "$tmp" 2>/dev/null; then
  git init -q -b assets "$tmp"
  git -C "$tmp" remote add origin "$remote"
fi

mkdir -p "$tmp/$folder"
cp "$@" "$tmp/$folder/"
git -C "$tmp" add "$folder"
git -C "$tmp" commit -q -m "chore(assets): add $folder files"
git -C "$tmp" push -q origin assets

for f in "$@"; do
  name=$(basename "$f")
  url="https://github.com/$repo/blob/assets/$folder/$name"
  case "$name" in
    *.png | *.svg) echo "![${name%.*}]($url?raw=true)" ;;
    *) echo "[$name]($url)" ;;
  esac
done
