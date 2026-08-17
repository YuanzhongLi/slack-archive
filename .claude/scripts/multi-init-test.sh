#!/usr/bin/env bash
# multi-init-test.sh — Test multi-init.sh worktree + tmux + port setup.
#
# Creates 3 test worktrees with --skip-claude (no Claude CLI launch), verifies
# tmux env / copied config files, then cleans up all artifacts on exit.
#
# Usage:
#   bash .claude/scripts/multi-init-test.sh

# -e is intentionally omitted: `((PASS++))` returns exit 1 when PASS=0, which
# would trigger script exit under set -e. Each assertion explicitly tracks
# pass/fail via PASS / FAIL counters instead.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MULTI_INIT="$SCRIPT_DIR/multi-init.sh"

# Expected worktree path format: <parent>/<project>-<branch>.
# Derived from the main worktree (not necessarily $REPO_ROOT when the test is run
# from inside a feature worktree), matching multi-init.sh's logic.
MAIN_REPO_ROOT="$(cd "$REPO_ROOT" && git worktree list --porcelain | awk '/^worktree / {print $2; exit}')"
EXPECTED_PARENT_DIR="$(dirname "$MAIN_REPO_ROOT")"
PROJECT_NAME="$(basename "$MAIN_REPO_ROOT")"

TEST_TASKS=("test-init-1" "test-init-2" "test-init-3")
TEST_BRANCHES=("test/multi-init-1" "test/multi-init-2" "test/multi-init-3")

PASS=0
FAIL=0
CREATED_WORKTREES=()
CREATED_SESSIONS=()
CREATED_BRANCHES=()
CREATED_INDICES=()
CREATED_STATUSES=()

# ── Helpers ───────────────────────────────────────────

red()   { printf '\033[0;31m%s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
bold()  { printf '\033[1m%s\033[0m\n' "$*"; }

assert_eq() {
    local label="$1" expected="$2" actual="$3"
    if [[ "$expected" == "$actual" ]]; then
        green "  PASS: $label"
        ((PASS++))
    else
        red "  FAIL: $label"
        red "    expected: $expected"
        red "    actual:   $actual"
        ((FAIL++))
    fi
    return 0
}

assert_file_exists() {
    local label="$1" path="$2"
    if [[ -e "$path" ]]; then
        green "  PASS: $label"
        ((PASS++))
    else
        red "  FAIL: $label ($path not found)"
        ((FAIL++))
    fi
    return 0
}

# ── Cleanup ───────────────────────────────────────────

cleanup() {
    bold ""
    bold "=== Cleanup ==="

    for session in "${CREATED_SESSIONS[@]:-}"; do
        if [[ -n "$session" ]] && tmux has-session -t "$session" 2>/dev/null; then
            tmux kill-session -t "$session"
            echo "  Killed tmux session: $session"
        fi
    done

    cd "$REPO_ROOT"
    local parents_to_clean=()
    for wt in "${CREATED_WORKTREES[@]:-}"; do
        if [[ -n "$wt" && -d "$wt" ]]; then
            git worktree remove --force "$wt" 2>/dev/null || true
            echo "  Removed worktree: $wt"
            parents_to_clean+=("$(dirname "$wt")")
        fi
    done

    # Remove empty parent dirs left behind by branch-nested worktree paths
    # (e.g. `test/multi-init-1` → parent `myproject-test/` stays empty after removal).
    #
    # ⚠️ WARNING: USE `rmdir` ONLY — NEVER REPLACE WITH `rm -rf`.
    # The intermediate parent dir (e.g. `myproject-feature/`) is SHARED across
    # all feature worktrees (`myproject-feature/issue-30`, `.../issue-51`, etc.).
    # During test runs it happens to contain only this test's own worktrees, but a
    # branch name collision with an active feature worktree is possible. `rmdir` is
    # safe because it fails atomically on non-empty directories — swapping to `rm -rf`
    # would silently nuke unrelated in-progress worktrees.
    for parent in "${parents_to_clean[@]:-}"; do
        if [[ -n "$parent" && -d "$parent" ]]; then
            rmdir "$parent" 2>/dev/null && echo "  Removed empty parent: $parent" || true
        fi
    done

    for branch in "${CREATED_BRANCHES[@]:-}"; do
        if [[ -n "$branch" ]] && git show-ref --verify --quiet "refs/heads/$branch" 2>/dev/null; then
            git branch -D "$branch" 2>/dev/null || true
            echo "  Deleted branch: $branch"
        fi
    done

    green "  Cleanup complete"
}

trap cleanup EXIT

# ── Main ──────────────────────────────────────────────

cd "$REPO_ROOT"

bold "=== Test multi-init.sh ==="
bold "  Repo: $REPO_ROOT"
echo ""

for i in "${!TEST_TASKS[@]}"; do
    task_id="${TEST_TASKS[$i]}"
    branch="${TEST_BRANCHES[$i]}"

    bold "--- Creating task $((i+1)): $task_id (branch: $branch) ---"

    output=$(bash "$MULTI_INIT" \
        --branch "$branch" \
        --task-id "$task_id" \
        --base-branch HEAD \
        --skip-claude \
        2>&1)

    echo "$output" | grep "^INFO:" | sed 's/^/  /' || true

    session=$(echo "$output" | grep -o '"session": "[^"]*"' | cut -d'"' -f4)
    worktree=$(echo "$output" | grep -o '"worktree": "[^"]*"' | cut -d'"' -f4)
    task_index=$(echo "$output" | grep -o '"task_index": [0-9]*' | grep -o '[0-9]*')
    port=$(echo "$output" | grep -o '"port": [0-9]*' | grep -o '[0-9]*')
    status=$(echo "$output" | grep -o '"status": "[^"]*"' | cut -d'"' -f4)

    CREATED_SESSIONS+=("$session")
    CREATED_WORKTREES+=("$worktree")
    CREATED_BRANCHES+=("$branch")
    CREATED_INDICES+=("$task_index")
    CREATED_STATUSES+=("$status")

    echo "  session=$session worktree=$worktree task_index=$task_index port=$port status=$status"
    echo ""
done

bold "=== Verifying worktrees and tmux env ==="
echo ""

for i in "${!CREATED_WORKTREES[@]}"; do
    wt="${CREATED_WORKTREES[$i]}"
    session="${CREATED_SESSIONS[$i]}"
    task_id="${TEST_TASKS[$i]}"
    actual_index="${CREATED_INDICES[$i]}"
    expected_port=$((4321 + actual_index * 100))

    bold "--- $task_id (auto-index=$actual_index, expected PORT=$expected_port) ---"

    # --skip-claude → status="skipped" contract
    assert_eq "status=skipped" "skipped" "${CREATED_STATUSES[$i]}"

    # Worktree path format: <parent>/<project>-<branch>
    expected_wt_path="$EXPECTED_PARENT_DIR/${PROJECT_NAME}-${TEST_BRANCHES[$i]}"
    assert_eq "worktree path format" "$expected_wt_path" "$wt"

    # Files always copied into worktree
    assert_file_exists ".claude/ copied" "$wt/.claude"
    assert_file_exists ".dev.vars copied" "$wt/.dev.vars"

    # Optional files: only assert if source has them
    for optional in ".mcp.json" ".env" ".env.local" ".envrc"; do
        if [[ -f "$REPO_ROOT/$optional" ]]; then
            assert_file_exists "$optional copied" "$wt/$optional"
        fi
    done

    # tmp/ transient content should be purged (only .gitkeep survives).
    # PR body drafts / stale issue notes from the source worktree shouldn't leak in.
    if [[ -d "$wt/.claude/tmp" ]]; then
        tmp_extras=$(find "$wt/.claude/tmp" -mindepth 1 ! -name '.gitkeep' | wc -l | tr -d ' ')
        assert_eq ".claude/tmp purged (only .gitkeep)" "0" "$tmp_extras"
    fi

    # tmux session env
    if tmux has-session -t "$session" 2>/dev/null; then
        tmux_port=$(tmux show-environment -t "$session" PORT 2>/dev/null | cut -d= -f2 || true)
        tmux_index=$(tmux show-environment -t "$session" TASK_INDEX 2>/dev/null | cut -d= -f2 || true)
        assert_eq "tmux PORT env" "$expected_port" "$tmux_port"
        assert_eq "tmux TASK_INDEX env" "$actual_index" "$tmux_index"

        # focus-events: attach 時の scrollback 汚染抑制に使う。off になっているはず。
        focus_events=$(tmux show-option -t "$session" focus-events 2>/dev/null | awk '{print $2}' || true)
        assert_eq "tmux focus-events off" "off" "$focus_events"

        # pane width: default 80 ではなく caller の端末サイズ（>= 80）に合わせている。
        # 80 ぴったりは default なので不可。
        pane_width=$(tmux display-message -p -t "$session" '#{pane_width}' 2>/dev/null || echo 0)
        if [[ "$pane_width" -gt 80 ]]; then
            green "  PASS: pane_width > 80 (actual=$pane_width)"
            ((PASS++))
        else
            red "  FAIL: pane_width > 80 (actual=$pane_width)"
            ((FAIL++))
        fi
    else
        red "  FAIL: tmux session '$session' not found"
        ((FAIL += 2))
    fi

    # Verify make dev actually passes --port to astro when PORT is set.
    # This catches Makefile escaping bugs (e.g. unescaped ${} being consumed by Make).
    if [[ -d "$wt" ]]; then
        dev_cmd=$(cd "$wt" && PORT=$expected_port make -n dev 2>&1)
        expanded=$(PORT=$expected_port bash -c "echo $dev_cmd")
        if echo "$expanded" | grep -q -- "--port $expected_port"; then
            green "  PASS: make dev passes --port $expected_port"
            ((PASS++))
        else
            red "  FAIL: make dev does not pass --port $expected_port"
            red "    make -n output: $dev_cmd"
            red "    expanded:       $expanded"
            ((FAIL++))
        fi
    fi

    # Worktree on the expected branch
    if [[ -d "$wt" ]]; then
        actual_branch=$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")
        assert_eq "worktree branch" "${TEST_BRANCHES[$i]}" "$actual_branch"
    else
        red "  FAIL: worktree directory '$wt' not found"
        ((FAIL++))
    fi

    # Monotonic indices
    if [[ "$i" -gt 0 ]]; then
        prev_index="${CREATED_INDICES[$((i-1))]}"
        if [[ "$actual_index" -gt "$prev_index" ]]; then
            green "  PASS: Monotonic index ($prev_index < $actual_index)"
            ((PASS++))
        else
            red "  FAIL: Monotonic index ($prev_index < $actual_index)"
            ((FAIL++))
        fi
    fi
    echo ""
done

# ── Summary ───────────────────────────────────────────

bold "=== Results ==="
green "  Passed: $PASS"
if [[ "$FAIL" -gt 0 ]]; then
    red "  Failed: $FAIL"
    exit 1
else
    echo "  Failed: 0"
    bold "  All tests passed!"
fi
