---
name: skills-manager
description: Open the visual Skills Manager UI to browse, audit, and remove Claude Code skills and plugins. Shows token cost per skill, duplicate detection across projects, and generates executable removal scripts. Use when user types /skills-manager or asks to manage/audit/clean up Claude skills and plugins.
---

# Skills Manager

## Steps

1. Run the generator:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/generate-ui.js"
   ```

2. Tell the user:
   - UI opened in browser — scanned their system automatically
   - Select projects in top panel to include project-level skills
   - Use **Duplicates** filter to find same skill installed in multiple projects
   - Use **Plugins** filter to review installed plugins
   - Check skills → **↓ Download remove-skills.sh** → run `bash ~/Downloads/remove-skills.sh`

## If the user wants to remove specific skills directly (no UI)

For local skills:
```bash
rm -rf ~/.claude/skills/<skill-name>
```

For plugins:
```bash
claude plugin remove <name>@<namespace>
```

## Notes

- Skills only consume tokens when explicitly invoked — they don't passively load
- Heavy skills (ship ~28k, plan-ceo-review ~27k) are fine to keep if you use them
- Safe to remove: .NET skills if not on .NET, glab if not on GitLab, elasticsearch if no ES stack
- `claude-mem` plugin is typically redundant if built-in auto-memory is configured
