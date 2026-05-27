// HTML builders for the chart's node cards. Two kinds of node:
//  - "team":  a folder that has a team.yaml — shows team info + an inline member list
//  - "group": a folder without a team.yaml — shows the folder name + how many teams sit below
//
// nodeHeight() is shared with chart.js so the d3-org-chart node box and the card's
// fixed height agree (large teams get a capped height with an internal scroll area).

export const NODE_WIDTH = 300;

const GROUP_HEIGHT = 96;
const TEAM_HEADER_HEIGHT = 124;
const MEMBER_ROW_HEIGHT = 72;
const MAX_TEAM_HEIGHT = 470;

export function nodeHeight(record) {
  if (record.type !== 'team') return GROUP_HEIGHT;
  const count = Math.max((record.members || []).length, 1);
  return Math.min(TEAM_HEADER_HEIGHT + count * MEMBER_ROW_HEIGHT, MAX_TEAM_HEIGHT);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderNode(record) {
  return record.type === 'team' ? renderTeamCard(record) : renderGroupCard(record);
}

function renderGroupCard(record) {
  const count = record.childTeamCount ?? 0;
  const label = count === 1 ? '1 team below' : `${count} teams below`;
  return `
    <div class="node-card node-card--group">
      <div class="group-name">${escapeHtml(record.name)}</div>
      <div class="group-meta">${label}</div>
    </div>`;
}

function renderTeamCard(record) {
  const info = record.info || {};
  const members = record.members || [];

  const links = [];
  if (info.jira) {
    links.push(
      `<a class="jira-button" href="${escapeHtml(info.jira)}" target="_blank" rel="noopener noreferrer">Jira</a>`,
    );
  }
  if (info.email) {
    links.push(`<a class="team-email" href="mailto:${escapeHtml(info.email)}">${escapeHtml(info.email)}</a>`);
  }
  const linksHtml = links.length ? `<div class="team-links">${links.join('')}</div>` : '';
  const descHtml = info.description
    ? `<div class="team-desc">${escapeHtml(info.description)}</div>`
    : '';

  const membersHtml = members.length
    ? members.map(renderMemberRow).join('')
    : '<div class="member-empty">No members listed</div>';

  const acronymHtml = info.acronym
    ? `<span class="team-acronym">${escapeHtml(info.acronym)}</span>`
    : '';

  return `
    <div class="node-card node-card--team">
      <div class="team-header">
        <div class="team-name">
          <span class="team-name-text">${escapeHtml(record.name)}</span>
          ${acronymHtml}
        </div>
        ${descHtml}
        ${linksHtml}
        <div class="member-count">${members.length} member${members.length === 1 ? '' : 's'}</div>
      </div>
      <div class="member-list">${membersHtml}</div>
    </div>`;
}

function renderMemberRow(member) {
  const email = escapeHtml(member.email);
  const role = member.role ? `<span class="member-role">${escapeHtml(member.role)}</span>` : '';

  const metaParts = [];
  if (member.contract) metaParts.push(escapeHtml(member.contract));
  if (member.joindate) metaParts.push(`joined ${escapeHtml(member.joindate)}`);
  const meta = metaParts.length ? `<span class="member-meta">${metaParts.join(' · ')}</span>` : '';

  const emailLink = member.email
    ? `<a class="member-email" href="mailto:${email}">${email}</a>`
    : '';

  return `
    <div class="member-row" data-member-email="${email}">
      ${renderAvatar(member)}
      <div class="member-info">
        <div class="member-line">
          <span class="member-name">${escapeHtml(member.name)}</span>
          ${role}
        </div>
        <div class="member-line member-line--meta">${meta}</div>
        ${emailLink}
      </div>
    </div>`;
}

// A circular avatar: the photo URL (if any) layered over an initials fallback.
// If the image fails to load, onerror removes it and the initials show through.
function renderAvatar(member) {
  const init = escapeHtml(initials(member.name));
  const img = member.photo
    ? `<img class="member-avatar-img" src="${escapeHtml(member.photo)}" alt=""` +
      ' loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">'
    : '';
  return `<span class="member-avatar"><span class="member-avatar-initials">${init}</span>${img}</span>`;
}

function initials(name) {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
