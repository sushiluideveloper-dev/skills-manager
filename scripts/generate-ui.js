#!/usr/bin/env node
/**
 * skills-manager: generate-ui.js
 * Scans ~/.claude/skills, installed plugins, and project .claude/skills dirs.
 * Generates a self-contained HTML manager, opens in browser.
 */

const fs   = require("fs");
const path = require("path");
const os   = require("os");
const { execSync } = require("child_process");

const HOME       = os.homedir();
const CLAUDE_DIR = path.join(HOME, ".claude");

// ── helpers ──────────────────────────────────────────────────────────────────

function safeRead(p) {
  try { return fs.readFileSync(p, "utf8"); } catch { return null; }
}
function safeReadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}
function fileTokens(p) {
  try { return Math.round(fs.statSync(p).size / 4); } catch { return 0; }
}
function parseSkillMd(skillDir) {
  const raw = safeRead(path.join(skillDir, "SKILL.md")) || "";
  const nameM = raw.match(/^name:\s*(.+)/m);
  const descM = raw.match(/^description:\s*(.+)/m);
  return {
    name: nameM ? nameM[1].trim().replace(/['"]/g, "") : path.basename(skillDir),
    desc: descM ? descM[1].trim().replace(/['">`|]/g, "").slice(0, 100) : "",
    tokens: fileTokens(path.join(skillDir, "SKILL.md")),
  };
}

// ── scan global skills ────────────────────────────────────────────────────────

function scanGlobalSkills() {
  const skillsDir = path.join(CLAUDE_DIR, "skills");
  if (!fs.existsSync(skillsDir)) return [];
  return fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => {
      if (d.isDirectory()) return true;
      if (d.isSymbolicLink()) { try { return fs.statSync(path.join(skillsDir, d.name)).isDirectory(); } catch { return false; } }
      return false;
    })
    .map(d => {
      const sd = path.join(skillsDir, d.name);
      const { name, desc, tokens } = parseSkillMd(sd);
      return {
        id: "g-" + d.name,
        name,
        folderName: d.name,
        proj: "global",
        src: "local",
        desc,
        tokens,
        rmcmd: `rm -rf ~/.claude/skills/${d.name}`,
      };
    });
}

// ── scan plugins ──────────────────────────────────────────────────────────────

function scanPlugins() {
  const pluginsJson = safeReadJSON(path.join(CLAUDE_DIR, "plugins", "installed_plugins.json"));
  const settingsJson = safeReadJSON(path.join(CLAUDE_DIR, "settings.json")) || {};
  const enabledPlugins = settingsJson.enabledPlugins || {};
  if (!pluginsJson || !pluginsJson.plugins) return [];

  return Object.entries(pluginsJson.plugins).map(([key, installs]) => {
    const inst = installs[0] || {};
    const [pname, ns] = key.split("@");
    const enabled = enabledPlugins[key] !== false;
    const installPath = inst.installPath || "";

    // get total tokens from all SKILL.md files in plugin
    let tokens = 0;
    const skillsDir = path.join(installPath, "skills");
    if (fs.existsSync(skillsDir)) {
      const walk = (dir) => {
        try {
          fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
            if (e.isDirectory()) walk(path.join(dir, e.name));
            else if (e.name === "SKILL.md") tokens += fileTokens(path.join(dir, e.name));
          });
        } catch {}
      };
      walk(skillsDir);
    }

    // get description from plugin.json
    const pluginJson = safeReadJSON(path.join(installPath, ".claude-plugin", "plugin.json")) || {};
    const desc = (pluginJson.description || "").slice(0, 100);

    return {
      id: "p-" + pname + "-" + ns,
      name: pname,
      ns,
      proj: "global",
      src: "plugin",
      ver: inst.version || "?",
      enabled,
      desc,
      tokens,
      rmcmd: `claude plugin remove ${key}`,
    };
  });
}

// ── scan project skills ───────────────────────────────────────────────────────

function findProjectClaudeDirs() {
  const results = [];
  const searchRoots = [
    path.join(HOME, "Desktop"),
    path.join(HOME, "Documents"),
    path.join(HOME, "Music"),
    path.join(HOME, "Projects"),
    path.join(HOME, "code"),
    path.join(HOME, "dev"),
    path.join(HOME, "workspace"),
    path.join(HOME, "Work"),
    HOME,
  ].filter(fs.existsSync);

  const SKIP = new Set([
    "node_modules", ".git", ".vscode", ".cursor",
    "Library", "Applications", ".npm", ".pnpm", "dist", "build",
    ".Trash", ".codex", ".nvm", ".antigravity",
  ]);

  function walk(dir, depth) {
    if (depth > 4) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      let isDir = e.isDirectory();
      if (!isDir && e.isSymbolicLink()) { try { isDir = fs.statSync(full).isDirectory(); } catch {} }
      if (!isDir) continue;
      if (e.name === ".claude") {
        const skillsDir = path.join(full, "skills");
        if (fs.existsSync(skillsDir) && full !== CLAUDE_DIR) {
          results.push({ claudeDir: full, projectDir: dir, skillsDir });
        }
        continue; // don't recurse into .claude
      }
      if (SKIP.has(e.name)) continue;
      walk(full, depth + 1);
    }
  }

  searchRoots.forEach(r => walk(r, 0));
  return results;
}

function scanProjectSkills() {
  const claudeDirs = findProjectClaudeDirs();
  const skills = [];
  const projectColors = ["#e74c3c","#3498db","#2ecc71","#e67e22","#9b59b6","#1abc9c","#f39c12","#e91e63"];
  let colorIdx = 0;

  for (const { projectDir, skillsDir } of claudeDirs) {
    const projName = path.basename(projectDir);
    const projId = projName.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const color = projectColors[colorIdx++ % projectColors.length];

    try {
      fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter(d => {
          if (d.isDirectory()) return true;
          if (d.isSymbolicLink()) { try { return fs.statSync(path.join(skillsDir, d.name)).isDirectory(); } catch { return false; } }
          return false;
        })
        .forEach(d => {
          const sd = path.join(skillsDir, d.name);
          const { name, desc, tokens } = parseSkillMd(sd);
          skills.push({
            id: projId + "-" + d.name,
            name,
            folderName: d.name,
            proj: projId,
            projLabel: projName,
            projColor: color,
            projPath: projectDir,
            src: "project",
            desc,
            tokens,
            rmcmd: `rm -rf '${sd}'`,
          });
        });
    } catch {}
  }
  return skills;
}

// ── assemble data ─────────────────────────────────────────────────────────────

const globalSkills  = scanGlobalSkills();
const plugins       = scanPlugins();
const projectSkills = scanProjectSkills();
const allSkills     = [...plugins, ...globalSkills, ...projectSkills];

// detect duplicates — group by name
const dupMap = {}; // name -> [skill, skill, ...]
allSkills.forEach(s => { (dupMap[s.name] = dupMap[s.name] || []).push(s); });

allSkills.forEach(s => {
  const peers = dupMap[s.name];
  s.isDup = peers.length > 1;
  if (!s.isDup) return;

  // peers info for display
  s.dupPeers = peers.map(p => ({
    proj:      p.proj,
    projLabel: p.projLabel || (p.proj === "global" ? "Global" : p.proj),
    projColor: p.projColor || "#888",
    src:       p.src,
  }));

  // move-to-global script: copy from this skill's dir, delete all project copies
  if (s.src === "project") {
    const skillFolder = s.folderName || s.name;
    const globalDest  = `~/.claude/skills/${skillFolder}`;
    // find the source dir (this instance's actual path from rmcmd)
    const srcDir = s.rmcmd.replace(/^rm -rf /, "").replace(/'/g, "");
    const projectCopies = peers
      .filter(p => p.src === "project")
      .map(p => `rm -rf '${p.rmcmd.replace(/^rm -rf /, "").replace(/'/g, "")}'`);

    s.movecmd = [
      `# Move ${skillFolder} → global (consolidate ${peers.length} copies)`,
      `if [ ! -d ${globalDest} ]; then`,
      `  cp -rL '${srcDir}' ${globalDest}`,
      `  echo "Copied ${skillFolder} to global"`,
      `fi`,
      ...projectCopies,
      `echo "✓ ${skillFolder} consolidated to global"`,
    ].join("\n");
  }
});

// build project list
const projectMap = {};
allSkills.forEach(s => {
  if (s.proj === "global") return;
  if (!projectMap[s.proj]) {
    projectMap[s.proj] = {
      id: s.proj,
      label: s.projLabel || s.proj,
      color: s.projColor || "#888",
      count: 0,
    };
  }
  projectMap[s.proj].count++;
});
const projects = [
  { id: "global", label: "Global (~/.claude)", color: "#888", count: plugins.length + globalSkills.length },
  ...Object.values(projectMap),
];

// ── generate HTML ─────────────────────────────────────────────────────────────

const dataJSON     = JSON.stringify(allSkills);
const projectsJSON = JSON.stringify(projects);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Claude Skills Manager</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'SF Mono', monospace; background: #0d0d0d; color: #e0e0e0; min-height: 100vh; padding: 24px 20px; }
h1 { font-size: 15px; font-weight: 600; color: #fff; letter-spacing: 0.04em; margin-bottom: 3px; }
.meta { font-size: 11px; color: #777; margin-bottom: 16px; }
.meta code { color: #888; }
.proj-panel { background: #111; border: 1px solid #1e1e1e; border-radius: 6px; padding: 12px 14px; margin-bottom: 16px; }
.proj-panel-header { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; display:flex; align-items:center; justify-content:space-between; }
.proj-panel-header button { font-size: 10px; padding: 2px 8px; border-radius: 3px; border: 1px solid #2a2a2a; background: transparent; color: #777; cursor: pointer; }
.proj-panel-header button:hover { color: #bbb; border-color: #555; }
.proj-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.proj-card { display: flex; align-items: center; gap: 7px; padding: 7px 11px; border-radius: 5px; border: 1px solid #1e1e1e; background: #0d0d0d; cursor: pointer; transition: all 0.12s; user-select: none; }
.proj-card:hover { border-color: #333; background: #141414; }
.proj-card.active { border-color: var(--pc); background: #141414; }
.proj-card input[type=checkbox] { width: 12px; height: 12px; accent-color: var(--pc, #888); cursor: pointer; flex-shrink:0; }
.proj-card .pc-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--pc); flex-shrink:0; }
.proj-card .pc-name { font-size: 11px; color: #aaa; font-weight: 500; }
.proj-card.active .pc-name { color: #eee; }
.proj-card .pc-count { font-size: 10px; color: #666; }
.proj-card.active .pc-count { color: #888; }
.pc-hide { font-size:12px; padding:0 3px; border:none; background:transparent; color:#333; cursor:pointer; border-radius:3px; line-height:1; margin-left:1px; opacity:0; transition:opacity 0.1s; }
.proj-card:hover .pc-hide { opacity:1; }
.pc-hide:hover { color:#aaa !important; background:rgba(255,255,255,0.08); }
.toolbar { display: flex; gap: 7px; flex-wrap: wrap; margin-bottom: 12px; align-items: center; }
.filters { display: flex; gap: 5px; flex-wrap: wrap; flex: 1; }
.filter-btn { font-size: 11px; padding: 4px 10px; border-radius: 4px; border: 1px solid #1e1e1e; background: #0d0d0d; color: #888; cursor: pointer; transition: all 0.1s; white-space: nowrap; }
.filter-btn:hover { border-color: #333; color: #999; }
.filter-btn.active { border-color: #3a3a3a; color: #ddd; background: #141414; }
.filter-btn.active.f-plugin { border-color: #5c3c1c; color: #e67e22; }
.filter-btn.active.f-dup    { border-color: #1c3c3c; color: #1abc9c; }
.filter-btn .dot { display:inline-block; width:5px; height:5px; border-radius:50%; margin-right:4px; vertical-align:middle; }
.search-box { font-size: 11px; padding: 5px 10px; border-radius: 4px; border: 1px solid #1e1e1e; background: #0d0d0d; color: #e0e0e0; outline: none; width: 180px; }
.search-box:focus { border-color: #444; }
.actions { display: flex; gap: 7px; margin-bottom: 10px; align-items: center; flex-wrap: wrap; }
.btn { font-size: 11px; padding: 5px 12px; border-radius: 4px; border: 1px solid #1e1e1e; background: #0d0d0d; color: #666; cursor: pointer; transition: all 0.1s; }
.btn:hover { border-color: #444; color: #ccc; }
.btn:disabled { opacity: 0.25; cursor: not-allowed; }
.btn-danger { border-color: #3d1212; color: #c0392b; }
.btn-danger:hover:not(:disabled) { border-color: #c0392b; color: #e74c3c; background: #120808; }
.btn-blue { border-color: #122233; color: #2980b9; }
.btn-blue:hover { border-color: #2980b9; color: #3498db; background: #080f1a; }
.sel-count { font-size: 11px; color: #e67e22; font-weight: 500; }
.stats { font-size: 11px; color: #777; margin-bottom: 12px; }
.stats span { color: #999; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
thead th { text-align: left; padding: 7px 10px; font-size: 10px; font-weight: 600; color: #666; letter-spacing: 0.08em; text-transform: uppercase; border-bottom: 1px solid #1a1a1a; background: #0d0d0d; position: sticky; top: 0; z-index: 2; cursor: pointer; }
thead th:hover { color: #aaa; }
tr { border-bottom: 1px solid #111; transition: background 0.08s; }
tr:hover { background: #101010; }
tr.hidden { display: none; }
tr.sel-row { background: #181000 !important; }
td { padding: 6px 10px; vertical-align: middle; }
td.cb-cell { width: 28px; }
input[type=checkbox] { accent-color: #e67e22; cursor: pointer; width: 12px; height: 12px; }
.skill-name { font-weight: 500; color: #ccc; font-size: 12px; }
.ns-label { color: #666; font-size: 10px; }
.disabled-badge { font-size: 9px; color: #777; border: 1px solid #333; border-radius: 3px; padding: 1px 5px; margin-left: 4px; }
.desc { color: #777; font-size: 11px; line-height: 1.4; max-width: 280px; }
.pill { display: inline-block; font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 3px; letter-spacing: 0.05em; text-transform: uppercase; white-space: nowrap; margin-right: 2px; }
.p-plugin { background: #181007; color: #e67e22; border: 1px solid #2e1e0d; }
.p-local  { background: #0d0d1a; color: #4a6fa5; border: 1px solid #141426; }
.p-dup    { background: #071818; color: #1abc9c; border: 1px solid #0d2e2e; }
.p-proj   { font-size: 9px; font-weight: 600; padding: 1px 6px; border-radius: 3px; text-transform: none; letter-spacing: 0; white-space: nowrap; }
/* dup peers */
.dup-peers { display:flex; flex-wrap:wrap; gap:3px; margin-top:4px; }
.dup-peer-badge { display:inline-flex; align-items:center; gap:2px; font-size: 9px; padding: 2px 7px; border-radius: 3px; white-space:nowrap; }
.dup-in-global { background:#0d1a0d; color:#27ae60; border:1px solid #1a3320; }
.badge-clickable { cursor:pointer; transition: filter 0.1s; }
.badge-clickable:hover { filter: brightness(1.4); }
/* row delete icon — shows on hover, near checkbox */
td.cb-cell { width: 44px; white-space:nowrap; }
.row-del-btn { display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:4px; border:none; background:transparent; color:#2a0a0a; cursor:pointer; padding:0; opacity:0; transition: opacity 0.12s, color 0.12s, background 0.12s; vertical-align:middle; margin-left:4px; flex-shrink:0; }
tr:hover .row-del-btn { opacity:1; color:#922b21; }
.row-del-btn:hover { background:rgba(192,57,43,0.15) !important; color:#e74c3c !important; }
.row-del-btn svg { pointer-events:none; }
/* badge dropdown menu */
.badge-menu { position:fixed; background:#1a1a1a; border:1px solid #2a2a2a; border-radius:6px; padding:4px; z-index:300; display:none; min-width:170px; box-shadow:0 6px 20px rgba(0,0,0,0.6); }
.badge-menu.show { display:block; }
.badge-menu-label { font-size:9px; color:#777; padding:3px 10px 2px; text-transform:uppercase; letter-spacing:0.07em; }
.badge-menu button { display:block; width:100%; text-align:left; padding:6px 10px; font-size:11px; background:transparent; border:none; border-radius:4px; cursor:pointer; color:#aaa; font-family:inherit; }
.badge-menu button:hover { background:#252525; color:#fff; }
.badge-menu .bm-rm { color:#c0392b; }
.badge-menu .bm-rm:hover { background:#1a0808; color:#e74c3c; }
.badge-menu .bm-global { color:#27ae60; }
.badge-menu .bm-global:hover { background:#0a1a0a; color:#2ecc71; }
/* move panel */
.move-panel { margin-top: 12px; background: #080808; border: 1px solid #0d2e0d; border-radius: 6px; overflow: hidden; }
.move-panel .cmd-header { border-bottom-color: #0d2e0d; }
.move-panel .cmd-body { color: #27ae60; }
/* confirm modal */
.confirm-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:100; align-items:center; justify-content:center; }
.confirm-overlay.show { display:flex; }
.confirm-box { background:#141414; border:1px solid #2a2a2a; border-radius:8px; padding:20px 24px; max-width:420px; width:90%; }
.confirm-box h3 { font-size:13px; color:#ddd; margin-bottom:8px; font-weight:600; }
.confirm-box p  { font-size:11px; color:#666; line-height:1.5; margin-bottom:16px; }
.confirm-box code { color:#e74c3c; font-family:'SF Mono',monospace; font-size:10px; }
.confirm-actions { display:flex; gap:8px; justify-content:flex-end; }
.confirm-yes { font-size:11px; padding:5px 14px; border-radius:4px; border:1px solid #c0392b; background:#120808; color:#e74c3c; cursor:pointer; }
.confirm-yes:hover { background:#1a0808; border-color:#e74c3c; }
.confirm-no  { font-size:11px; padding:5px 14px; border-radius:4px; border:1px solid #2a2a2a; background:transparent; color:#666; cursor:pointer; }
.confirm-no:hover { border-color:#555; color:#ccc; }
.tok-cell { width: 100px; }
.tok-wrap { display:flex; align-items:center; gap:5px; }
.tok-bar-bg { flex:1; height:3px; background:#161616; border-radius:2px; overflow:hidden; min-width:40px; }
.tok-bar-fill { height:100%; border-radius:2px; }
.tok-num { font-size:10px; color:#666; white-space:nowrap; min-width:34px; text-align:right; font-family:'SF Mono',monospace; }
.tok-high .tok-num { color:#e74c3c; }
.tok-med  .tok-num { color:#e67e22; }
.tok-low  .tok-num { color:#27ae60; }
.cmd-panel { margin-top: 18px; background: #080808; border: 1px solid #181818; border-radius: 6px; overflow: hidden; }
.cmd-header { display: flex; justify-content: space-between; align-items: center; padding: 8px 14px; background: #0f0f0f; border-bottom: 1px solid #181818; }
.cmd-header span { font-size: 10px; color: #777; text-transform: uppercase; letter-spacing: 0.08em; }
.copy-btn { font-size: 10px; padding: 3px 10px; border-radius: 3px; border: 1px solid #222; background: transparent; color: #666; cursor: pointer; transition: all 0.12s; }
.copy-btn:hover { border-color: #555; color: #ccc; }
.copy-btn.copied { border-color: #27ae60; color: #2ecc71; }
.cmd-body { padding: 12px 14px; font-size: 11px; color: #e74c3c; font-family: 'SF Mono', monospace; white-space: pre; overflow-x: auto; line-height: 1.8; }
.cmd-note { padding: 8px 14px; font-size: 10px; color: #333; border-top: 1px solid #141414; display:flex; align-items:center; justify-content:space-between; }
</style>
</head>
<body>
<!-- badge dropdown menu -->
<div class="badge-menu" id="badge-menu"></div>
<!-- confirm modal -->
<div class="confirm-overlay" id="confirm-overlay">
  <div class="confirm-box">
    <h3 id="confirm-title">Confirm removal</h3>
    <p id="confirm-msg"></p>
    <div class="confirm-actions">
      <button class="confirm-no" onclick="confirmNo()">Cancel</button>
      <button class="confirm-yes" id="confirm-yes-btn" onclick="confirmYes()">Remove</button>
    </div>
  </div>
</div>
<h1>Claude Skills Manager</h1>
<div class="meta">Select projects → check rows → Remove Selected → downloads <code>remove-skills.sh</code> → run <code>bash ~/Downloads/remove-skills.sh</code></div>
<div class="proj-panel">
  <div class="proj-panel-header">
    <span>Projects</span>
    <div style="display:flex;gap:6px">
      <button onclick="selectAllProjects()">Select All</button>
      <button onclick="clearAllProjects()">Clear</button>
    </div>
  </div>
  <div class="proj-grid" id="proj-grid"></div>
</div>
<div class="toolbar">
  <div class="filters">
    <button class="filter-btn active f-all" onclick="setFilter('all',this)">All <span id="cnt-all" style="color:#2a2a2a">0</span></button>
    <button class="filter-btn f-plugin" onclick="setFilter('plugin',this)"><span class="dot" style="background:#e67e22"></span>Plugins</button>
    <button class="filter-btn f-dup"    onclick="setFilter('dup',this)">   <span class="dot" style="background:#1abc9c"></span>Duplicates</button>
  </div>
  <input type="text" class="search-box" placeholder="search…" oninput="doSearch(this.value)">
</div>
<div class="actions">
  <button class="btn btn-blue" onclick="selectVisible()">Select Visible</button>
  <button class="btn" onclick="clearSel()">Clear</button>
  <button class="btn btn-danger" id="rm-btn" onclick="buildCmd()" disabled>↓ Download remove-skills.sh</button>
  <span class="sel-count" id="sel-count"></span>
</div>
<div class="stats">Showing <span id="vis-cnt">0</span> / <span id="tot-cnt">0</span> &nbsp;·&nbsp; Total visible: <span id="vis-tok">—</span> &nbsp;·&nbsp; <span id="sel-summary" style="color:#e67e22"></span></div>
<table>
  <thead>
    <tr>
      <th class="cb-cell"></th>
      <th onclick="sortBy('name')">Skill ↕</th>
      <th>Description</th>
      <th onclick="sortBy('src')">Source ↕</th>
      <th onclick="sortBy('proj')">Used In ↕</th>
      <th onclick="sortBy('tok')" class="tok-cell">Tokens ↕</th>
    </tr>
  </thead>
  <tbody id="tbody"></tbody>
</table>
<div class="cmd-panel" id="cmd-panel" style="display:none">
  <div class="cmd-header">
    <span>remove-skills.sh — <span id="cmd-count">0</span> commands</span>
    <div style="display:flex;gap:6px">
      <button class="copy-btn" id="copy-btn" onclick="copyCmd()">Copy</button>
      <button class="copy-btn" onclick="downloadScript()" style="border-color:#1c4d1c;color:#2ecc71">↓ Download .sh</button>
    </div>
  </div>
  <div class="cmd-body" id="cmd-body"></div>
  <div class="cmd-note">
    <span>After download: <code style="color:#555">bash ~/Downloads/remove-skills.sh</code></span>
    <span id="tok-saved" style="color:#2ecc71;font-size:10px"></span>
  </div>
</div>
<div class="move-panel" id="move-panel" style="display:none">
  <div class="cmd-header">
    <span>move-<span id="move-skill-name">skill</span>-to-global.sh — copies to ~/.claude/skills, removes project copies</span>
    <div style="display:flex;gap:6px">
      <button class="copy-btn" id="copy-move-btn" onclick="copyMove()">Copy</button>
      <button class="copy-btn" onclick="document.getElementById('move-panel').style.display='none'" style="border-color:#333">✕</button>
    </div>
  </div>
  <div class="cmd-body move-body" id="move-body" style="color:#27ae60"></div>
  <div class="cmd-note"><span>After download: <code style="color:#555">bash ~/Downloads/move-SKILL-to-global.sh</code></span></div>
</div>
<script>
const ALL_SKILLS = ${dataJSON};
const PROJECTS   = ${projectsJSON};
const MAX_TOK    = Math.max(...ALL_SKILLS.map(s => s.tokens||0), 1);
const PROJ_COLOR = Object.fromEntries(PROJECTS.map(p => [p.id, p.color]));
const activeProjects = new Set(["global"]);
const selected       = new Set();
let curFilter = "all", curSearch = "", sortCol = null, sortAsc = true;
let pendingConfirmAction = null;

function buildProjectCards() {
  const grid = document.getElementById("proj-grid");
  grid.innerHTML = "";
  PROJECTS.forEach(p => {
    const active = activeProjects.has(p.id);
    const card = document.createElement("div");
    card.className = "proj-card" + (active ? " active" : "");
    card.style.setProperty("--pc", p.color);
    card.id = "pc-" + p.id;
    card.innerHTML = \`<input type="checkbox" id="pchk-\${p.id}" \${active?"checked":""} onchange="toggleProject('\${p.id}',this)">
      <span class="pc-dot"></span><span class="pc-name">\${p.label}</span><span class="pc-count">\${p.count}</span><button class="pc-hide" title="Hide project" onclick="hideProject('\${p.id}',event)">×</button>\`;
    card.onclick = e => { if (e.target.tagName !== "INPUT") document.getElementById("pchk-"+p.id).click(); };
    grid.appendChild(card);
  });
}
function toggleProject(id, cb) {
  cb.checked ? activeProjects.add(id) : activeProjects.delete(id);
  document.getElementById("pc-"+id).classList.toggle("active", cb.checked);
  render();
}
function hideProject(id, event) {
  event.stopPropagation();
  activeProjects.delete(id);
  const card = document.getElementById("pc-"+id);
  if (card) { card.style.opacity="0"; card.style.transform="scale(0.8)"; setTimeout(()=>card.style.display="none",150); }
  render();
}
function selectAllProjects() { PROJECTS.forEach(p => { activeProjects.add(p.id); const cb=document.getElementById("pchk-"+p.id); if(cb) cb.checked=true; document.getElementById("pc-"+p.id)?.classList.add("active"); }); render(); }
function clearAllProjects()  { PROJECTS.forEach(p => { activeProjects.delete(p.id); const cb=document.getElementById("pchk-"+p.id); if(cb) cb.checked=false; document.getElementById("pc-"+p.id)?.classList.remove("active"); }); render(); }

function isVisible(s) {
  if (!activeProjects.has(s.proj)) return false;
  if (curFilter === "plugin" && s.src !== "plugin") return false;
  if (curFilter === "dup"    && !s.isDup)            return false;
  if (!curSearch) return true;
  return (s.name+s.desc+(s.ns||"")+(s.proj||"")).toLowerCase().includes(curSearch);
}
function srcPill(s) {
  if (s.src === "plugin") return \`<span class="pill p-plugin">Plugin\${s.ver&&s.ver!=="?" ? " "+s.ver : ""}</span>\${s.enabled===false ? '<span class="disabled-badge">disabled</span>' : ""}\`;
  return \`<span class="pill p-local">\${s.src==="project"?"Project":"Local"}</span>\`;
}
function esc(s) { return String(s).replace(/'/g,"\\\\'"); }
function projPill(s) {
  if (s.isDup && s.dupPeers) {
    const hasGlobal = s.dupPeers.some(p => p.proj === "global");
    const pills = s.dupPeers.map(p => {
      if (p.proj === "global") return \`<span class="dup-peer-badge dup-in-global" title="Already in global">global ✓</span>\`;
      const c = p.projColor || PROJ_COLOR[p.proj] || "#888";
      const isSelf = p.proj === s.proj;
      const peerSkill = ALL_SKILLS.find(x => x.name===s.name && x.proj===p.proj);
      const pid = peerSkill ? esc(peerSkill.id) : "";
      return \`<span class="dup-peer-badge badge-clickable" style="background:\${c}18;color:\${c};border:1px solid \${c}\${isSelf?"55":"22"};font-weight:\${isSelf?"700":"400"}" onclick="showBadgeMenu(event,'\${pid}',\${hasGlobal})" title="Options ▾">\${p.projLabel||p.proj}\${isSelf?" ←":""} ▾</span>\`;
    });
    return \`<span class="pill p-dup">Dup \${s.dupPeers.length}×</span><div class="dup-peers">\${pills.join("")}</div>\`;
  }
  const color = PROJ_COLOR[s.proj] || "#888";
  const label = PROJECTS.find(p=>p.id===s.proj)?.label || s.proj;
  return \`<span class="pill p-proj" style="background:\${color}18;color:\${color};border:1px solid \${color}33">\${label}</span>\`;
}
let badgeMenuSkillId = null;
function showBadgeMenu(event, skillId, hasGlobal) {
  event.stopPropagation();
  if (!skillId) return;
  badgeMenuSkillId = skillId;
  const s = ALL_SKILLS.find(x => x.id === skillId);
  if (!s) return;
  const label = s.projLabel || s.proj;
  let html = \`<div class="badge-menu-label">\${s.name}</div>\`;
  html += \`<button class="bm-rm" onclick="badgeMenuRemove()">✕ Remove from \${label}</button>\`;
  if (!hasGlobal && s.movecmd) html += \`<button class="bm-global" onclick="badgeMenuGlobal()">→ Move to Global</button>\`;
  document.getElementById("badge-menu").innerHTML = html;
  const rect = event.currentTarget.getBoundingClientRect();
  const menu = document.getElementById("badge-menu");
  const viewH = window.innerHeight;
  const menuH = 90;
  const top = rect.bottom + 4 + menuH > viewH ? rect.top - menuH - 2 : rect.bottom + 4;
  menu.style.top  = top + "px";
  menu.style.left = Math.min(rect.left, window.innerWidth - 180) + "px";
  menu.classList.add("show");
}
function hideBadgeMenu() { document.getElementById("badge-menu").classList.remove("show"); badgeMenuSkillId = null; }
function badgeMenuRemove() { const id = badgeMenuSkillId; hideBadgeMenu(); if (id) removeOne(id); }
function badgeMenuGlobal() { const id = badgeMenuSkillId; hideBadgeMenu(); if (id) moveToGlobal(id); }
document.addEventListener("click", e => { if (!document.getElementById("badge-menu").contains(e.target)) hideBadgeMenu(); });
function tokCell(s) {
  const t = s.tokens||0;
  const pct = Math.round(t/MAX_TOK*100);
  const cls = t>15000?"tok-high":t>5000?"tok-med":"tok-low";
  const color = t>15000?"#c0392b":t>5000?"#d35400":"#2d6a4f";
  const label = t>=1000?(t/1000).toFixed(1)+"k":t+"";
  return \`<div class="tok-wrap \${cls}"><div class="tok-bar-bg"><div class="tok-bar-fill" style="width:\${pct}%;background:\${color}"></div></div><span class="tok-num">\${label}</span></div>\`;
}
function render() {
  let data = ALL_SKILLS.filter(s => activeProjects.has(s.proj));
  if (sortCol) data.sort((a,b) => {
    if (sortCol==="tok") return sortAsc?(a.tokens||0)-(b.tokens||0):(b.tokens||0)-(a.tokens||0);
    const va = sortCol==="src"?a.src:sortCol==="proj"?a.proj:a.name;
    const vb = sortCol==="src"?b.src:sortCol==="proj"?b.proj:b.name;
    return sortAsc?va.localeCompare(vb):vb.localeCompare(va);
  });
  const tbody = document.getElementById("tbody");
  tbody.innerHTML = "";
  let vis = 0, visTok = 0;
  data.forEach(s => {
    const show = isVisible(s);
    if (show) { vis++; visTok += s.tokens || 0; }
    const tr = document.createElement("tr");
    tr.id = "tr-"+s.id;
    if (!show) tr.classList.add("hidden");
    if (selected.has(s.id)) tr.classList.add("sel-row");
    tr.innerHTML = \`
      <td class="cb-cell"><input type="checkbox" id="cb-\${s.id}" \${selected.has(s.id)?"checked":""} onchange="toggle('\${s.id}',this)"><button class="row-del-btn" title="Remove \${s.name}" onclick="removeOne('\${esc(s.id)}')"><svg width="12" height="12" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 3.5h12M5 3.5V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1M2.5 3.5l1 8.5h7l1-8.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 6.5v4M8.5 6.5v4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></button></td>
      <td><span class="skill-name">\${s.name}\${s.ns?\`<span class="ns-label"> · \${s.ns}</span>\`:""}</span></td>
      <td><span class="desc">\${s.desc||""}</span></td>
      <td>\${srcPill(s)}</td>
      <td>\${projPill(s)}</td>
      <td class="tok-cell">\${tokCell(s)}</td>\`;
    tbody.appendChild(tr);
  });
  document.getElementById("cnt-all").textContent = data.length;
  document.getElementById("vis-cnt").textContent  = vis;
  document.getElementById("tot-cnt").textContent  = data.length;
  document.getElementById("vis-tok").textContent  = visTok >= 1000 ? (visTok/1000).toFixed(1)+"k tokens" : visTok+" tokens";
  updateStats();
}
function toggle(id, cb) {
  cb.checked ? selected.add(id) : selected.delete(id);
  document.getElementById("tr-"+id)?.classList.toggle("sel-row", cb.checked);
  updateStats();
}
function selectVisible() {
  ALL_SKILLS.forEach(s => {
    if (!isVisible(s)) return;
    selected.add(s.id);
    const cb = document.getElementById("cb-"+s.id); if(cb) cb.checked=true;
    document.getElementById("tr-"+s.id)?.classList.add("sel-row");
  });
  updateStats();
}
function clearSel() {
  selected.clear();
  document.querySelectorAll("input[type=checkbox][id^='cb-']").forEach(c=>c.checked=false);
  document.querySelectorAll("tr.sel-row").forEach(t=>t.classList.remove("sel-row"));
  updateStats();
  document.getElementById("cmd-panel").style.display="none";
}
function updateStats() {
  const n = selected.size;
  document.getElementById("sel-count").textContent   = n ? n+" selected" : "";
  document.getElementById("sel-summary").textContent = n ? n+" skill"+(n>1?"s":"")+" queued" : "";
  document.getElementById("rm-btn").disabled = n===0;
}
function setFilter(f,el) { curFilter=f; document.querySelectorAll(".filter-btn").forEach(b=>b.classList.remove("active")); el.classList.add("active"); render(); }
function doSearch(q) { curSearch=q.toLowerCase().trim(); render(); }
function sortBy(col) { sortCol===col?sortAsc=!sortAsc:(sortCol=col,sortAsc=true); render(); }

function moveToGlobal(id) {
  const s = ALL_SKILLS.find(x => x.id === id);
  if (!s || !s.movecmd) return;
  const script = ["#!/bin/bash","# Move skill to global — consolidate duplicate",\`# Skill: \${s.name}  (\${(s.dupPeers||[]).length} copies)\`,"",s.movecmd].join("\\n");
  document.getElementById("move-body").textContent = script;
  document.getElementById("move-skill-name").textContent = s.name;
  document.getElementById("move-panel").style.display = "block";
  document.getElementById("move-panel").scrollIntoView({behavior:"smooth"});
  // auto-download
  const a = document.createElement("a");
  a.href = "data:text/plain;charset=utf-8,"+encodeURIComponent(script);
  a.download = "move-"+s.name+"-to-global.sh"; a.click();
}
function copyMove() {
  navigator.clipboard.writeText(document.getElementById("move-body").textContent).then(()=>{
    const btn=document.getElementById("copy-move-btn"); btn.textContent="Copied!"; btn.classList.add("copied");
    setTimeout(()=>{btn.textContent="Copy";btn.classList.remove("copied");},2000);
  });
}

function buildCmd() {
  const skills = ALL_SKILLS.filter(s=>selected.has(s.id));
  if (!skills.length) return;
  const totalTok = skills.reduce((a,s)=>a+(s.tokens||0),0);
  const script = ["#!/bin/bash","# Claude Skills Removal Script",\`# Generated: \${new Date().toLocaleString()}\`,\`# Skills: \${skills.length}  Tokens freed: ~\${totalTok>=1000?(totalTok/1000).toFixed(1)+"k":totalTok}\`,"",
    ...skills.map(s=>s.rmcmd),"",
    \`echo "Removed \${skills.length} skill\${skills.length>1?"s":""}. ~\${totalTok>=1000?(totalTok/1000).toFixed(1)+"k":totalTok} tokens freed."\`
  ].join("\\n");
  document.getElementById("cmd-body").textContent = script;
  document.getElementById("cmd-count").textContent = skills.length;
  document.getElementById("tok-saved").textContent = "~"+(totalTok>=1000?(totalTok/1000).toFixed(1)+"k":totalTok)+" tokens freed";
  document.getElementById("cmd-panel").style.display="block";
  document.getElementById("cmd-panel").scrollIntoView({behavior:"smooth"});
  downloadScript();
}
function downloadScript() {
  const text = document.getElementById("cmd-body").textContent;
  if (!text) return;
  const a = document.createElement("a");
  a.href = "data:text/plain;charset=utf-8,"+encodeURIComponent(text);
  a.download = "remove-skills.sh"; a.click();
}
function copyCmd() {
  navigator.clipboard.writeText(document.getElementById("cmd-body").textContent).then(()=>{
    const btn=document.getElementById("copy-btn"); btn.textContent="Copied!"; btn.classList.add("copied");
    setTimeout(()=>{btn.textContent="Copy";btn.classList.remove("copied");},2000);
  });
}
function downloadOneScript(s) {
  const loc = s.proj === "global" ? "~/.claude/skills/" : (s.projLabel || s.proj);
  const script = ["#!/bin/bash", \`# Remove: \${s.name}\`, \`# From: \${loc}\`, \`# Tokens freed: ~\${s.tokens>=1000?(s.tokens/1000).toFixed(1)+"k":s.tokens||0}\`, "", s.rmcmd, \`echo "✓ Removed \${s.name}"\`].join("\\n");
  const a = document.createElement("a");
  a.href = "data:text/plain;charset=utf-8," + encodeURIComponent(script);
  a.download = "remove-" + s.name + ".sh";
  a.click();
}
function removeOne(id) {
  const s = ALL_SKILLS.find(x => x.id === id);
  if (!s) return;
  const loc = s.proj === "global" ? "~/.claude/skills/" : (s.projLabel || s.proj);
  document.getElementById("confirm-title").textContent = "Remove " + s.name + "?";
  document.getElementById("confirm-msg").innerHTML = \`Remove from <strong>\${loc}</strong>?<br><br><code>\${s.rmcmd}</code>\`;
  pendingConfirmAction = () => downloadOneScript(s);
  const yesBtn = document.getElementById("confirm-yes-btn");
  yesBtn.disabled = true; yesBtn.style.opacity = "0.35";
  document.getElementById("confirm-overlay").classList.add("show");
  setTimeout(() => { yesBtn.disabled = false; yesBtn.style.opacity = "1"; }, 1200);
}
function confirmYes() {
  document.getElementById("confirm-overlay").classList.remove("show");
  if (pendingConfirmAction) { pendingConfirmAction(); pendingConfirmAction = null; }
}
function confirmNo() {
  document.getElementById("confirm-overlay").classList.remove("show");
  pendingConfirmAction = null;
}
buildProjectCards(); render();
</script>
</body>
</html>`;

// ── write and open ────────────────────────────────────────────────────────────

const outDir  = path.join(os.tmpdir(), "claude-skills-manager");
const outFile = path.join(outDir, `index-${Date.now()}.html`);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, html, "utf8");

console.log(`Skills scanned: ${allSkills.length} (${plugins.length} plugins, ${globalSkills.length} global, ${projectSkills.length} project)`);
console.log(`Projects found: ${projects.length}`);
console.log(`Opening: ${outFile}`);

const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
try { execSync(`${opener} "${outFile}"`); } catch {}
