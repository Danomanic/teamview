import Fuse from 'fuse.js';

// Flatten the org node array into a single Fuse list of team + person records.
// Each result carries enough to drive the chart: a teamId to centre on, and for a
// person, the memberEmail so the matching row can be highlighted inside the card.
export function buildSearchData(nodes) {
  const records = [];

  for (const node of nodes) {
    if (node.type !== 'team') continue;

    records.push({
      kind: 'team',
      label: node.name,
      sublabel: [node.info?.acronym, node.info?.description].filter(Boolean).join(' · '),
      teamId: node.id,
      name: node.name,
      acronym: node.info?.acronym || '',
      description: node.info?.description || '',
      email: node.info?.email || '',
    });

    for (const member of node.members || []) {
      records.push({
        kind: 'person',
        label: member.name,
        sublabel: [member.role, node.name].filter(Boolean).join(' · '),
        teamId: node.id,
        memberEmail: member.email || '',
        name: member.name,
        role: member.role || '',
        email: member.email || '',
      });
    }
  }

  return records;
}

export function createSearch(records) {
  const fuse = new Fuse(records, {
    includeScore: true,
    threshold: 0.35,
    ignoreLocation: true,
    minMatchCharLength: 2,
    keys: [
      { name: 'name', weight: 0.6 },
      { name: 'acronym', weight: 0.5 },
      { name: 'role', weight: 0.2 },
      { name: 'email', weight: 0.15 },
      { name: 'description', weight: 0.05 },
    ],
  });

  return (query) => fuse.search(query, { limit: 12 }).map((result) => result.item);
}
