---
description: "Open the Skills Manager UI — browse all Claude skills and plugins, see token costs, filter, and generate removal scripts"
allowed-tools: ["Bash"]
---

Run the Skills Manager UI generator:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/generate-ui.js"
```

Tell the user:
- The UI just opened in their browser
- Select projects in the top panel to load project-level skills
- Use filter buttons to find Duplicates or Plugin-only skills  
- Check skills to remove → click "↓ Download remove-skills.sh"
- Run: `bash ~/Downloads/remove-skills.sh`
