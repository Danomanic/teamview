import './styles.css';
import { createChart } from './chart.js';
import { buildSearchData, createSearch } from './search.js';
import { escapeHtml } from './nodeTemplate.js';

// Vite's BASE_URL makes the fetch work under a GitLab Pages sub-path
// (https://<group>.gitlab.io/<project>/).
const DATA_URL = `${import.meta.env.BASE_URL}org.json`;

async function init() {
  const container = document.getElementById('chart');

  let data;
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
  } catch (err) {
    container.innerHTML =
      `<div class="load-error">Could not load org data (${escapeHtml(err.message)}).` +
      ' Run <code>npm run build:org</code> to generate it.</div>';
    return;
  }

  const chart = createChart(container, data);
  const runSearch = createSearch(buildSearchData(data));

  wireControls(chart);
  wireSearch(chart, runSearch);
}

function wireControls(chart) {
  document.getElementById('expand-all').addEventListener('click', () => {
    chart.expandAll();
    chart.fit();
  });
  document.getElementById('collapse-all').addEventListener('click', () => {
    chart.collapseAll();
    chart.fit();
  });
  document.getElementById('zoom-in').addEventListener('click', () => chart.zoomIn());
  document.getElementById('zoom-out').addEventListener('click', () => chart.zoomOut());
  document.getElementById('zoom-fit').addEventListener('click', () => chart.fit());
}

function wireSearch(chart, runSearch) {
  const input = document.getElementById('search');
  const results = document.getElementById('results');
  let debounce;

  const close = () => {
    results.innerHTML = '';
    results.classList.remove('open');
  };

  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const query = input.value.trim();
      if (query.length < 2) {
        close();
        return;
      }
      renderResults(runSearch(query));
    }, 150);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      close();
      input.blur();
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target !== input && !results.contains(e.target)) close();
  });

  function renderResults(items) {
    if (!items.length) {
      results.innerHTML = '<li class="result-empty">No matches</li>';
      results.classList.add('open');
      return;
    }

    results.innerHTML = items
      .map(
        (item) => `
        <li class="result result--${item.kind}">
          <span class="result-kind">${item.kind === 'team' ? 'Team' : 'Person'}</span>
          <span class="result-label">${escapeHtml(item.label)}</span>
          <span class="result-sub">${escapeHtml(item.sublabel || '')}</span>
        </li>`,
      )
      .join('');
    results.classList.add('open');

    [...results.querySelectorAll('.result')].forEach((el, i) => {
      el.addEventListener('click', () => {
        selectResult(chart, items[i]);
        close();
        input.value = items[i].label;
      });
    });
  }
}

function selectResult(chart, item) {
  chart.clearHighlighting();
  chart.setCentered(item.teamId).setHighlighted(item.teamId).render();
  if (item.kind === 'person' && item.memberEmail) {
    highlightMember(item.teamId, item.memberEmail);
  }
}

// The chart rebuilds node DOM on render (with an ~800ms transition), so re-apply the
// member highlight after it settles. dataset.memberEmail is the decoded email.
function highlightMember(teamId, email) {
  const apply = () => {
    document
      .querySelectorAll('.member-row.highlighted-member')
      .forEach((el) => el.classList.remove('highlighted-member'));

    for (const row of document.querySelectorAll('.member-row')) {
      if (row.dataset.memberEmail === email) {
        row.classList.add('highlighted-member');
        row.scrollIntoView({ block: 'nearest' });
        break;
      }
    }
  };
  setTimeout(apply, 60);
  setTimeout(apply, 850);
}

init();
