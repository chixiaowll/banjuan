#!/bin/bash
# Install banjuan CLI skill for AI assistants
# Usage:
#   banjuan-install-skill          # interactive
#   banjuan-install-skill --local  # install to current project .claude/skills/
#   banjuan-install-skill --global # install to ~/.claude/skills/

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_FILE="$SCRIPT_DIR/skill/banjuan/SKILL.md"

if [ ! -f "$SKILL_FILE" ]; then
  SKILL_FILE="$SCRIPT_DIR/banjuan/SKILL.md"
fi
if [ ! -f "$SKILL_FILE" ]; then
  APP_RESOURCES="/Applications/半卷.app/Contents/Resources/cli"
  SKILL_FILE="$APP_RESOURCES/banjuan/SKILL.md"
fi
if [ ! -f "$SKILL_FILE" ]; then
  echo "Error: SKILL.md not found"
  exit 1
fi

install_to() {
  local dir="$1/banjuan"
  local label="$2"
  mkdir -p "$dir"
  cp "$SKILL_FILE" "$dir/SKILL.md"
  echo "✓ Installed to $dir/SKILL.md ($label)"
  echo "  In Claude Code, type /banjuan to load the skill."
}

MODE="$1"

if [ "$MODE" = "--local" ]; then
  install_to ".claude/skills" "当前项目"
elif [ "$MODE" = "--global" ]; then
  install_to "$HOME/.claude/skills" "全局"
elif [ -z "$MODE" ]; then
  echo "半卷闲书 CLI Skill 安装"
  echo ""
  echo "  1) 当前项目 (.claude/skills/banjuan/) — 仅在此项目中可用"
  echo "  2) 全局     (~/.claude/skills/banjuan/) — 所有项目都可用"
  echo ""
  printf "请选择 [1/2]: "
  read -r choice
  case "$choice" in
    1) install_to ".claude/skills" "当前项目" ;;
    2) install_to "$HOME/.claude/skills" "全局" ;;
    *) echo "取消安装"; exit 1 ;;
  esac
else
  echo "Usage: $0 [--local|--global]"
  exit 1
fi
