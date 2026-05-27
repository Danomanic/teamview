#!/usr/bin/env node
// Walks the org/ folder tree, validates every team.yaml, and compiles a single
// flat node array (id/parentId, d3-org-chart stratify-ready) to static/org.json.
//
// A folder WITH a team.yaml becomes a "team" node; a folder WITHOUT one becomes a
// "group" node labelled by its folder name. Depth is unlimited. d3-org-chart needs
// exactly one root, so a synthetic "__root__" is added when there are multiple
// top-level org folders.
//
// Validation errors fail the build (exit 1) so CI never publishes broken data.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import yaml from 'js-yaml';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ORG_DIR = path.join(ROOT, 'org');
const OUT_FILE = path.join(ROOT, 'static', 'org.json');

const errors = [];
const warnings = [];
const nodes = [];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value) {
  return EMAIL_RE.test(String(value));
}

// js-yaml parses `2026-01-01` into a JS Date (YAML timestamp). Normalise both
// Date objects and strings to a clean YYYY-MM-DD string; return null if unparseable.
function normalizeDate(value) {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function normalizeInfo(info) {
  if (!info || typeof info !== 'object') {
    return { name: '', acronym: '', description: '', jira: '', email: '' };
  }
  const str = (v) => (v == null ? '' : String(v));
  return {
    name: str(info.name),
    acronym: str(info.acronym),
    description: str(info.description),
    jira: str(info.jira),
    email: str(info.email),
  };
}

function normalizeMember(member, index, relPath) {
  if (!member || typeof member !== 'object') {
    errors.push({ file: relPath, message: `members[${index}] must be a mapping.` });
    return { name: '', email: '', role: '', contract: '', joindate: '' };
  }
  if (!member.name || typeof member.name !== 'string' || !member.name.trim()) {
    errors.push({ file: relPath, message: `members[${index}] is missing the required \`name\`.` });
  }
  if (member.email != null && member.email !== '' && !isValidEmail(member.email)) {
    warnings.push({ file: relPath, message: `members[${index}] (${member.name}) has a suspicious email: ${member.email}` });
  }
  const joindate = normalizeDate(member.joindate);
  if (member.joindate != null && member.joindate !== '' && joindate == null) {
    warnings.push({ file: relPath, message: `members[${index}] (${member.name}) has an unparseable joindate: ${member.joindate}` });
  }
  const str = (v) => (v == null ? '' : String(v));
  return {
    name: str(member.name),
    email: str(member.email),
    role: str(member.role),
    contract: str(member.contract),
    joindate: joindate ?? str(member.joindate),
    photo: str(member.photo),
  };
}

function parseTeamYaml(filePath) {
  const relPath = path.relative(ROOT, filePath);
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    errors.push({ file: relPath, message: `Cannot read file: ${e.message}` });
    return null;
  }

  let doc;
  try {
    doc = yaml.load(raw);
  } catch (e) {
    errors.push({ file: relPath, message: `YAML parse error: ${e.message}` });
    return null;
  }

  if (doc == null || typeof doc !== 'object' || Array.isArray(doc)) {
    errors.push({ file: relPath, message: 'File is empty or not a YAML mapping.' });
    return null;
  }

  if (!doc.info || typeof doc.info !== 'object') {
    errors.push({ file: relPath, message: 'Missing required `info` section.' });
  } else if (!doc.info.name || typeof doc.info.name !== 'string' || !doc.info.name.trim()) {
    errors.push({ file: relPath, message: 'Missing required `info.name`.' });
  }

  let members = [];
  if (doc.members != null) {
    if (!Array.isArray(doc.members)) {
      errors.push({ file: relPath, message: '`members` must be a list.' });
    } else {
      members = doc.members.map((m, i) => normalizeMember(m, i, relPath));
    }
  }

  return { info: normalizeInfo(doc.info), members };
}

// Recursively build one node per directory, depth-first.
function walk(dirAbs, idRel, parentId) {
  const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  const folderName = path.basename(dirAbs);
  const hasYaml = entries.some((e) => e.isFile() && e.name === 'team.yaml');

  if (hasYaml) {
    const parsed = parseTeamYaml(path.join(dirAbs, 'team.yaml'));
    nodes.push({
      id: idRel,
      parentId,
      type: 'team',
      name: parsed?.info?.name?.trim() || folderName,
      info: parsed?.info ?? normalizeInfo(null),
      members: parsed?.members ?? [],
    });
  } else {
    nodes.push({ id: idRel, parentId, type: 'group', name: folderName });
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const childId = idRel ? `${idRel}/${entry.name}` : entry.name;
      walk(path.join(dirAbs, entry.name), childId, idRel);
    }
  }
}

function countTeamDescendants(id, childrenOf, byId) {
  let count = 0;
  for (const childId of childrenOf.get(id) ?? []) {
    if (byId.get(childId).type === 'team') count += 1;
    count += countTeamDescendants(childId, childrenOf, byId);
  }
  return count;
}

function main() {
  if (!fs.existsSync(ORG_DIR)) {
    console.error(`❌ Content directory not found: ${path.relative(ROOT, ORG_DIR)}`);
    process.exit(1);
  }

  const topFolders = fs
    .readdirSync(ORG_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory());

  if (topFolders.length === 0) {
    console.error(`❌ No org folders found under ${path.relative(ROOT, ORG_DIR)}/`);
    process.exit(1);
  }

  // d3-org-chart needs a single root. One top folder => it is the root (parentId "").
  // Multiple => wrap them under a synthetic "__root__".
  const multipleRoots = topFolders.length > 1;
  const topParentId = multipleRoots ? '__root__' : '';

  for (const folder of topFolders) {
    walk(path.join(ORG_DIR, folder.name), folder.name, topParentId);
  }

  if (multipleRoots) {
    nodes.unshift({ id: '__root__', parentId: '', type: 'group', name: 'Organisation' });
  }

  // Annotate group nodes with how many teams sit beneath them.
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map();
  for (const n of nodes) {
    if (!childrenOf.has(n.parentId)) childrenOf.set(n.parentId, []);
    childrenOf.get(n.parentId).push(n.id);
  }
  for (const n of nodes) {
    if (n.type === 'group') {
      n.childTeamCount = countTeamDescendants(n.id, childrenOf, byId);
    }
  }

  if (warnings.length) {
    console.warn(`\n⚠️  ${warnings.length} warning(s):`);
    for (const w of warnings) console.warn(`  - ${w.file}: ${w.message}`);
  }

  if (errors.length) {
    console.error(`\n❌ ${errors.length} error(s) — build aborted, org.json not written:`);
    for (const e of errors) console.error(`  - ${e.file}: ${e.message}`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(nodes, null, 2)}\n`, 'utf8');

  const teamCount = nodes.filter((n) => n.type === 'team').length;
  console.log(
    `✅ Wrote ${path.relative(ROOT, OUT_FILE)} — ${nodes.length} node(s) (${teamCount} team(s)).`,
  );
}

main();
