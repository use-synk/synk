#!/usr/bin/env bash
set -euo pipefail

BASE_REF="${1:-origin/main}"
TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

if ! git show "${BASE_REF}:apps/api/openapi/openapi.json" > "$TMP_FILE" 2>/dev/null; then
	echo "No baseline OpenAPI spec found at ${BASE_REF}:apps/api/openapi/openapi.json"
	exit 0
fi

has_unsupported_version() {
	local spec_path="$1"
	grep -q '"openapi":[[:space:]]*"3\.1\.' "$spec_path"
}

if has_unsupported_version "$TMP_FILE" || has_unsupported_version "apps/api/openapi/openapi.json"; then
	echo "Skipping openapi-diff: installed CLI does not support OpenAPI 3.1 specs."
	exit 0
fi

openapi-diff "$TMP_FILE" apps/api/openapi/openapi.json
