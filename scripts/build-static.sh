#!/usr/bin/env bash
# Static build for GitHub Pages. API routes cannot be exported, so they are
# moved aside for the build and restored afterwards.
set -euo pipefail
cd "$(dirname "$0")/.."
trap 'if [ -d .api-stash ]; then rm -rf src/app/api; mv .api-stash src/app/api; fi' EXIT
mv src/app/api .api-stash
STATIC_EXPORT=1 NEXT_PUBLIC_STATIC=1 npx next build
touch out/.nojekyll
