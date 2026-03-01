#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

failure=0

check_for_placeholder_scripts() {
	echo "Checking workspace scripts for placeholders..."
	local package_file
	while IFS= read -r package_file; do
		local matches
		matches="$(jq -r '
			.scripts // {}
			| to_entries[]
			| select(.value | type == "string")
			| select(.value | test("placeholder|^echo\\b"; "i"))
			| "\(.key): \(.value)"
		' "$package_file")"
		if [[ -n "$matches" ]]; then
			echo "Placeholder scripts found in ${package_file}:"
			echo "$matches"
			failure=1
		fi
	done < <(find apps packages -mindepth 2 -maxdepth 2 -name package.json | sort)
}

check_for_nonexistent_turbo_tasks() {
	echo "Checking Turbo dry-runs for unresolved tasks..."
	local -a commands=(
		"bunx turbo run build --filter=!@synk-ai/config --dry"
		"bunx turbo run lint --filter=!@synk-ai/config --dry"
		"bunx turbo run lint:write --filter=!@synk-ai/config --dry"
		"bunx turbo run lint:unsafe --filter=!@synk-ai/config --dry"
		"bunx turbo run typecheck --filter=!@synk-ai/config --dry"
		"bunx turbo run test --filter=!@synk-ai/config --dry"
		"bunx turbo run dev --filter=./apps/* --dry"
	)

	local command
	for command in "${commands[@]}"; do
		local output
		output="$($command 2>&1 || true)"
		if grep -q "<NONEXISTENT>" <<<"$output"; then
			echo "Found <NONEXISTENT> tasks in: $command"
			grep "<NONEXISTENT>" <<<"$output"
			failure=1
		fi
	done
}

check_web_runtime_scripts() {
	echo "Checking web runtime scripts for Bun execution..."
	local required_scripts=("build" "dev" "start")
	local script_name
	for script_name in "${required_scripts[@]}"; do
		local script_value
		script_value="$(jq -r --arg script_name "$script_name" '.scripts[$script_name] // ""' apps/web/package.json)"
		if [[ "$script_value" != *"bunx --bun next"* ]]; then
			echo "apps/web script '$script_name' does not enforce Bun runtime: $script_value"
			failure=1
		fi
	done
}

check_docs_for_legacy_package_manager() {
	echo "Checking primary docs for stale pnpm instructions..."
	local -a docs_to_check=(
		"CONTRIBUTING.md"
		"docs/ROADMAP.md"
		"docs/PLAN.md"
		"docs/DATABASE.md"
	)

	local doc_file
	for doc_file in "${docs_to_check[@]}"; do
		if [[ ! -f "$doc_file" ]]; then
			echo "Expected documentation file is missing: $doc_file"
			failure=1
			continue
		fi

		if rg -n "\\bpnpm\\b" "$doc_file" >/dev/null 2>&1; then
			echo "Stale pnpm reference(s) in $doc_file"
			rg -n "\\bpnpm\\b" "$doc_file"
			failure=1
		fi
	done
}

check_for_placeholder_scripts
check_for_nonexistent_turbo_tasks
check_web_runtime_scripts
check_docs_for_legacy_package_manager

if [[ "$failure" -ne 0 ]]; then
	echo "Migration integrity checks failed."
	exit 1
fi

echo "Migration integrity checks passed."
