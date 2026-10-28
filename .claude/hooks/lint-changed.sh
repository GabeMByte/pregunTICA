#!/usr/bin/env bash
# PostToolUse hook: lints every .ts/.tsx file Claude edits.
# Exit code 2 sends the errors back to Claude so it fixes them on its own.

input=$(cat)
file=$(printf '%s' "$input" | node -e '
  let d = "";
  process.stdin.on("data", c => d += c).on("end", () => {
    try { process.stdout.write(JSON.parse(d).tool_input?.file_path ?? ""); } catch {}
  });
')

case "$file" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

cd "$CLAUDE_PROJECT_DIR" || exit 0
[ -d node_modules ] || exit 0   # nothing to lint with yet (day 1, before install)

if ! out=$(npx --no-install eslint --max-warnings=0 "$file" 2>&1); then
  echo "ESLint encontró problemas en $file:" >&2
  echo "$out" >&2
  exit 2
fi
exit 0
