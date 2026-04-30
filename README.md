# skills-manager

Visual manager for Claude Code skills and plugins.

## Features

### Browse & Audit
- All global skills, plugins, and project-level skills in one table
- Token cost bar per skill — color-coded (green/orange/red by size)
- Total visible token count in stats bar — updates as you filter
- Description column pulled from each skill's `SKILL.md`
- Sort by name, source, project, or token cost

### Project Selector
- Multi-project panel at top — check any combination of projects to load their skills
- Hover a project card → **×** to hide it for the session (re-run to restore)
- Select All / Clear buttons

### Filters & Search
- **All** — everything from selected projects
- **Plugins** — only installed Claude Code plugins
- **Duplicates** — skills installed in 2+ locations
- Live search across skill name, description, namespace, project

### Duplicate Detection
- `DUP Nx` badge shows how many copies exist
- Each copy shown as a clickable project badge — click to open dropdown:
  - **✕ Remove from [project]** — downloads single-skill removal script
  - **→ Move to Global** — downloads script to `cp -rL` to `~/.claude/skills/` and remove all project copies
- `global ✓` badge if already consolidated

### Remove Skills
**Batch remove:**
1. Check rows (or Select Visible)
2. Click **↓ Download remove-skills.sh**
3. Run: `bash ~/Downloads/remove-skills.sh`

**Single remove:**
- Hover any row → trash icon appears near checkbox → click → confirm dialog → downloads `remove-[name].sh`

**Confirm dialog:**
- Shows exact command before executing
- Remove button locked for 1.2s to prevent accidental confirm

## Install

```bash
claude plugin marketplace add sushiluideveloper-dev/skills-manager
claude plugin install skills-manager
```

## Update

Plugins do **not** auto-update. Run:

```bash
claude plugin update skills-manager
```

Or reinstall:

```bash
claude plugin remove skills-manager@sushiluideveloper-dev
claude plugin install skills-manager
```

## Local install

```bash
claude plugin install /path/to/skills-manager/plugin
```

## Usage

```
/skills-manager
```

Opens in browser. Scans your system automatically — no config needed.

## What gets scanned

| Source | Location |
|--------|----------|
| Global skills | `~/.claude/skills/` |
| Plugins | `~/.claude/plugins/installed_plugins.json` |
| Project skills | `.claude/skills/` under `~/Desktop`, `~/Documents`, `~/Projects`, `~/code`, etc. |

> Skills only consume tokens when explicitly invoked — they don't passively load.
