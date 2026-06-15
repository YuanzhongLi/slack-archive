#!/usr/bin/env bash
# multi-init.sh — Create worktree + tmux session + Claude CLI for a single task.
#
# Usage:
#   multi-init.sh \
#     --branch <name> --task-id <id> \
#     [--task-index <N>|auto] \
#     [--base-branch <branch>] \
#     [--task-url <url>] [--task-summary <text>] \
#     [--init-command <cmd>] [--skip-claude]
#
# Port conflict avoidance:
#   --task-index defaults to "auto" (scans existing tmux sessions for the next
#   available index). Explicit N can also be specified.
#   PORT = 4321 + N * 100.  (Astro dev server default is 4321)
#     index 0: astro dev 4321
#     index 1: astro dev 4421
#     index 2: astro dev 4521
#
#   The PORT env var is exported into the tmux session. The Makefile's `dev`
#   target reads it: `astro dev --port ${PORT:-4321}`.
#
# Output (JSON on stdout):
#   {"session": "...", "worktree": "...", "task_index": N, "port": <N>, "status": "ok|claude_timeout|skipped"}

set -euo pipefail

# ── Defaults ──────────────────────────────────────────
BRANCH=""
TASK_ID=""
TASK_INDEX="auto"
TASK_URL=""
TASK_SUMMARY=""
INIT_COMMAND=""
BASE_BRANCH=""
SKIP_CLAUDE=false

# ── Parse arguments ───────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --branch)       BRANCH="$2";       shift 2 ;;
        --task-id)      TASK_ID="$2";      shift 2 ;;
        --task-index)   TASK_INDEX="$2";   shift 2 ;;
        --task-url)     TASK_URL="$2";     shift 2 ;;
        --task-summary) TASK_SUMMARY="$2"; shift 2 ;;
        --init-command) INIT_COMMAND="$2"; shift 2 ;;
        --base-branch)  BASE_BRANCH="$2";  shift 2 ;;
        --skip-claude)  SKIP_CLAUDE=true;  shift ;;
        *)
            echo "ERROR: Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

if [[ -z "$BRANCH" || -z "$TASK_ID" ]]; then
    echo "ERROR: --branch and --task-id are required" >&2
    exit 1
fi

# ── Helper: find next available task index ────────────
next_available_index() {
    local used_indices=()
    for session in $(tmux list-sessions -F '#{session_name}' 2>/dev/null || true); do
        local idx
        idx=$(tmux show-environment -t "$session" TASK_INDEX 2>/dev/null | cut -d= -f2 || true)
        if [[ -n "$idx" && "$idx" =~ ^[0-9]+$ ]]; then
            used_indices+=("$idx")
        fi
    done
    local candidate=0
    while true; do
        local found=false
        for idx in "${used_indices[@]:-}"; do
            if [[ "$idx" == "$candidate" ]]; then
                found=true
                break
            fi
        done
        if [[ "$found" == "false" ]]; then
            echo "$candidate"
            return 0
        fi
        ((candidate++))
    done
}

# ── Auto-detect task index if not specified ───────────
if [[ "$TASK_INDEX" == "auto" ]]; then
    TASK_INDEX=$(next_available_index)
    echo "INFO: Auto-assigned task index: $TASK_INDEX" >&2
fi

# ── Port calculation (Astro dev server base: 4321) ────
PORT=$((4321 + TASK_INDEX * 100))

# ── Helper: create worktree + copy gitignored config ──
create_worktree() {
    local branch_name="$1"
    local base_branch="${2:-}"
    local repo_root
    repo_root=$(git rev-parse --show-toplevel)
    # Derive parent dir / project name from the MAIN worktree (not the current one).
    # `git worktree list --porcelain` always lists the main worktree first, so this
    # works whether multi-init is invoked from main or from another feature worktree.
    # Prefixing the branch with the project name (e.g. "air-volleyball-feature/issue-62")
    # prevents collisions with other projects that use the same `feature/issue-xxx`
    # naming convention under the same parent directory.
    local main_repo_root
    main_repo_root=$(git worktree list --porcelain | awk '/^worktree / {print $2; exit}')
    local parent_dir
    parent_dir=$(dirname "$main_repo_root")
    local project_name
    project_name=$(basename "$main_repo_root")
    local worktree_path="$parent_dir/${project_name}-${branch_name}"

    if git worktree list --porcelain | grep -qF "worktree $worktree_path"; then
        echo "WARN: Worktree already exists at $worktree_path" >&2
        echo "$worktree_path"
        return 0
    fi

    if git show-ref --verify --quiet "refs/heads/$branch_name" 2>/dev/null; then
        echo "INFO: Branch '$branch_name' already exists, reusing it" >&2
        git worktree add "$worktree_path" "$branch_name" >&2
    else
        if [[ -n "$base_branch" ]]; then
            git branch "$branch_name" "$base_branch" >&2
        else
            git branch "$branch_name" >&2
        fi
        git worktree add "$worktree_path" "$branch_name" >&2
    fi

    # gitignored but required for local dev
    [[ -d "$repo_root/.claude" ]]    && cp -r "$repo_root/.claude" "$worktree_path/"
    [[ -f "$repo_root/.mcp.json" ]]  && cp "$repo_root/.mcp.json"  "$worktree_path/"
    [[ -f "$repo_root/.dev.vars" ]]  && cp "$repo_root/.dev.vars"  "$worktree_path/"
    [[ -f "$repo_root/.env" ]]       && cp "$repo_root/.env"       "$worktree_path/"
    [[ -f "$repo_root/.env.local" ]] && cp "$repo_root/.env.local" "$worktree_path/"
    [[ -f "$repo_root/.envrc" ]]     && cp "$repo_root/.envrc"     "$worktree_path/"

    # Purge transient content under .claude/tmp/ (PR body drafts etc.).
    # .gitkeep は残す（tracked、ディレクトリ構造を保つため）。
    if [[ -d "$worktree_path/.claude/tmp" ]]; then
        find "$worktree_path/.claude/tmp" -mindepth 1 ! -name '.gitkeep' -delete 2>/dev/null || true
    fi

    echo "$worktree_path"
}

# ── Helper: unique tmux session name ──────────────────
unique_session_name() {
    local base="$1"
    local name="$base"
    local i=1
    while tmux has-session -t "$name" 2>/dev/null; do
        name="${base}-${i}"
        ((i++))
        if [[ $i -gt 30 ]]; then
            echo "ERROR: Too many sessions with base '$base'" >&2
            return 1
        fi
    done
    echo "$name"
}

# ── Helper: wait for shell prompt (zsh/bash) ──────────
wait_for_shell() {
    local session="$1"
    local max_wait=10
    local elapsed=0
    while [[ $elapsed -lt $max_wait ]]; do
        local pane
        pane=$(tmux capture-pane -t "$session" -p 2>/dev/null || true)
        if printf '%s' "$pane" | tail -n 1 | grep -qE '[\$%#>❯][[:space:]]*$'; then
            return 0
        fi
        sleep 0.3
        elapsed=$((elapsed + 1))
    done
    return 1
}

# ── Helper: wait for Claude CLI prompt ────────────────
wait_for_claude() {
    local session="$1"
    local max_wait=60
    local elapsed=0
    while [[ $elapsed -lt $max_wait ]]; do
        local pane_content
        pane_content=$(tmux capture-pane -t "$session" -p 2>/dev/null || true)
        if echo "$pane_content" | grep -qE 'Yes, I trust this folder'; then
            echo "INFO: Auto-accepting workspace trust prompt" >&2
            tmux send-keys -t "$session" Enter
            sleep 3
            ((elapsed += 3))
            continue
        fi
        if echo "$pane_content" | grep -qE '(^>|^claude>|❯|Tips:|What can I)'; then
            return 0
        fi
        sleep 2
        ((elapsed += 2))
    done
    echo "WARN: Claude prompt not detected in '$session' after ${max_wait}s" >&2
    return 1
}

# ── Main ──────────────────────────────────────────────

# 1. Create worktree
WORKTREE_PATH=$(create_worktree "$BRANCH" "$BASE_BRANCH")

# 2. Create tmux session with PORT / TASK_INDEX env.
if [[ -t 1 ]]; then
    PANE_COLS="$(tput cols  2>/dev/null || echo 200)"
    PANE_LINES="$(tput lines 2>/dev/null || echo 50)"
else
    PANE_COLS=200
    PANE_LINES=50
fi

SESSION=$(unique_session_name "$TASK_ID")
tmux new-session -d -s "$SESSION" -c "$WORKTREE_PATH" -x "$PANE_COLS" -y "$PANE_LINES"

tmux set-option -t "$SESSION" focus-events off >/dev/null

if ! wait_for_shell "$SESSION"; then
    echo "WARN: shell prompt not detected in '$SESSION' within timeout; sleeping 1s as fallback" >&2
    sleep 1
fi

tmux set-environment -t "$SESSION" PORT "$PORT"
tmux set-environment -t "$SESSION" TASK_INDEX "$TASK_INDEX"

# 3. Export env vars + (optionally) launch Claude CLI.
STATUS="ok"
if [[ "$SKIP_CLAUDE" == "true" ]]; then
    tmux send-keys -t "$SESSION" "export PORT=$PORT TASK_INDEX=$TASK_INDEX" Enter
    STATUS="skipped"
else
    tmux send-keys -t "$SESSION" "export PORT=$PORT TASK_INDEX=$TASK_INDEX && claude" Enter

    # 4. Wait for Claude to be ready
    if ! wait_for_claude "$SESSION"; then
        STATUS="claude_timeout"
    fi

    # 5. Send initial command
    send_to_claude() {
        local session="$1"
        local cmd="$2"
        tmux send-keys -t "$session" "$cmd"
        sleep 0.5
        tmux send-keys -t "$session" Enter
    }

    if [[ "$STATUS" == "ok" || "$STATUS" == "claude_timeout" ]]; then
        if [[ "$STATUS" == "claude_timeout" ]]; then
            echo "INFO: Sending initial command despite claude_timeout (Claude may still be starting)" >&2
            sleep 5
        fi
        if [[ -n "$INIT_COMMAND" ]]; then
            send_to_claude "$SESSION" "$INIT_COMMAND"
        else
            if [[ -f "$WORKTREE_PATH/.claude/skills/dev-start/SKILL.md" ]] \
                || [[ -f "$WORKTREE_PATH/.claude/commands/dev-start.md" ]]; then
                DEFAULT_CMD="/dev-start ${TASK_URL:-$TASK_SUMMARY}"
            else
                DEFAULT_CMD=""
                if [[ -n "$TASK_URL" ]]; then
                    DEFAULT_CMD="このタスクに取り組んでください: $TASK_URL"
                fi
                if [[ -n "$TASK_SUMMARY" ]]; then
                    DEFAULT_CMD="${DEFAULT_CMD:+$DEFAULT_CMD }($TASK_SUMMARY)"
                fi
                if [[ -z "$DEFAULT_CMD" ]]; then
                    DEFAULT_CMD="プロジェクトの .claude/README.md を読み、環境セットアップを行ってください。"
                fi
            fi
            send_to_claude "$SESSION" "$DEFAULT_CMD"
        fi
    fi
fi

# 6. Clear scrollback
tmux clear-history -t "$SESSION" 2>/dev/null || true

# 7. Output result as JSON
cat <<EOF
{
  "session": "$SESSION",
  "worktree": "$WORKTREE_PATH",
  "task_index": $TASK_INDEX,
  "port": $PORT,
  "status": "$STATUS"
}
EOF
