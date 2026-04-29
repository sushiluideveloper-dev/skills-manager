# skills-manager

Visual manager for Claude Code skills and plugins.

- Browse all global + project skills in one UI
- Token cost bar per skill (heavier = more context when loaded)
- Duplicate detection across projects
- Filter: Plugins / Duplicates / search
- Select → **↓ Download remove-skills.sh** → `bash ~/Downloads/remove-skills.sh`

## Install

```bash
claude plugin install github:sushiluidev/skills-manager
```

Or from local:

```bash
claude plugin install /path/to/skills-manager/plugin
```

## Usage

```
/skills-manager
```

Opens the UI in your browser, automatically scanning your `~/.claude/skills/`, installed plugins, and any project `.claude/skills/` directories found under your home folder.

## How Remove Works

1. Check skills in the table
2. Click **↓ Download remove-skills.sh**
3. File auto-downloads to `~/Downloads/`
4. Run: `bash ~/Downloads/remove-skills.sh`

The script includes a confirmation echo so you know what was removed.

## What gets scanned

| Source | Location |
|--------|----------|
| Global skills | `~/.claude/skills/` |
| Plugins | `~/.claude/plugins/installed_plugins.json` |
| Project skills | Any `.claude/skills/` found under `~/Desktop`, `~/Documents`, `~/Music`, `~/Projects`, etc. |
