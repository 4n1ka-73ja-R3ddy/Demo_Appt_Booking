/**
 * Marketing Model Prototype
 * Pure, simple tracker: Came -> Filled Form -> Attended Quiz
 * With Daily, Week-wise, and Month-wise aggregations.
 * ZERO dummy values. Starts clean.
 */

const STORAGE_KEY = 'clean_marketing_entries_v2';

// State: starts strictly empty with ZERO dummy values
let entries = [];
let currentMode = 'daily'; // 'daily' | 'weekly' | 'monthly'

// Load from LocalStorage (empty by default)
function loadEntries() {
  // Clear any old dummy datasets from previous runs
  localStorage.removeItem('marketing_prototype_leads_v1');
  localStorage.removeItem('marketing_prototype_links_v1');
  localStorage.removeItem('marketing_prototype_members_v1');

  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      entries = JSON.parse(raw);
    } catch (e) {
      entries = [];
    }
  } else {
    entries = [];
  }
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

// Formatters
function getWeekLabel(dateObj) {
  const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);

  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() - 3);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);

  const mStr = mon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const sStr = sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `Week ${weekNo} (${mStr} – ${sStr})`;
}

function getMonthLabel(dateObj) {
  return dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// Filter Entries
function getFilteredEntries() {
  const source = document.getElementById('filterSource').value;
  const timeRange = document.getElementById('filterDateRange').value;
  const now = new Date();

  return entries.filter(item => {
    if (source !== 'all' && item.source !== source) return false;

    const itemDate = new Date(item.date);
    if (timeRange === 'today') {
      const todayStr = now.toISOString().split('T')[0];
      if (item.date.split('T')[0] !== todayStr) return false;
    } else if (timeRange === '7days') {
      const diff = (now - itemDate) / (1000 * 3600 * 24);
      if (diff > 7) return false;
    } else if (timeRange === '30days') {
      const diff = (now - itemDate) / (1000 * 3600 * 24);
      if (diff > 30) return false;
    }

    return true;
  });
}

// Aggregation Engine: Groups by Daily, Week-wise, or Month-wise
function aggregateEntries(filteredList, mode) {
  const groups = {};

  filteredList.forEach(item => {
    const d = new Date(item.date);
    let key, sortKey, displayLabel;

    if (mode === 'daily') {
      key = item.date.split('T')[0];
      sortKey = key;
      displayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    } else if (mode === 'weekly') {
      displayLabel = getWeekLabel(d);
      const dUtc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const dayNum = dUtc.getUTCDay() || 7;
      dUtc.setUTCDate(dUtc.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(dUtc.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil((((dUtc - yearStart) / 86400000) + 1) / 7);
      sortKey = `${dUtc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
      key = sortKey;
    } else if (mode === 'monthly') {
      displayLabel = getMonthLabel(d);
      sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      key = sortKey;
    }

    if (!groups[key]) {
      groups[key] = {
        key,
        sortKey,
        label: displayLabel,
        came: 0,
        formFilled: 0,
        quizAttended: 0
      };
    }

    // Progression:
    // Every entry reached at least 'came'
    groups[key].came += 1;

    if (item.stage === 'form_filled' || item.stage === 'quiz_attended') {
      groups[key].formFilled += 1;
    }
    if (item.stage === 'quiz_attended') {
      groups[key].quizAttended += 1;
    }
  });

  return Object.values(groups).sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

// Master Render Function
function render() {
  const filtered = getFilteredEntries();

  // 1. Calculate Totals
  const totalCame = filtered.length;
  const totalForm = filtered.filter(x => x.stage === 'form_filled' || x.stage === 'quiz_attended').length;
  const totalQuiz = filtered.filter(x => x.stage === 'quiz_attended').length;

  const formPct = totalCame > 0 ? ((totalForm / totalCame) * 100).toFixed(1) : '0.0';
  const quizPct = totalForm > 0 ? ((totalQuiz / totalForm) * 100).toFixed(1) : '0.0';

  document.getElementById('countCame').textContent = totalCame;
  document.getElementById('countForm').textContent = totalForm;
  document.getElementById('countQuiz').textContent = totalQuiz;

  document.getElementById('subFormPct').textContent = `${formPct}% of visitors`;
  document.getElementById('subQuizPct').textContent = `${quizPct}% of form leads`;

  // 2. Render Time Breakdown Table
  const breakdownRows = aggregateEntries(filtered, currentMode);
  const periodTbody = document.getElementById('breakdownTableBody');
  const modeTitle = currentMode === 'daily' ? 'Daily Breakdown' : currentMode === 'weekly' ? 'Week-wise Breakdown' : 'Month-wise Breakdown';
  document.getElementById('breakdownTitle').textContent = modeTitle;

  if (breakdownRows.length === 0) {
    periodTbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-box">
          <span>📭</span>
          No data recorded yet.<br>
          <small>Click <strong>"+ Add Entry"</strong> above to record your first person.</small>
        </td>
      </tr>
    `;
  } else {
    periodTbody.innerHTML = breakdownRows.map(row => {
      const fRate = row.came > 0 ? ((row.formFilled / row.came) * 100).toFixed(1) : '0.0';
      const qRate = row.formFilled > 0 ? ((row.quizAttended / row.formFilled) * 100).toFixed(1) : '0.0';
      const ovRate = row.came > 0 ? ((row.quizAttended / row.came) * 100).toFixed(1) : '0.0';

      return `
        <tr>
          <td><strong>${row.label}</strong></td>
          <td><span class="badge came">${row.came}</span></td>
          <td><span class="badge form">${row.formFilled}</span></td>
          <td><span class="badge quiz">${row.quizAttended}</span></td>
          <td>${fRate}%</td>
          <td><strong>${ovRate}%</strong></td>
        </tr>
      `;
    }).join('');
  }

  // 3. Render Individual Entries Table
  const entriesTbody = document.getElementById('entriesTableBody');
  if (filtered.length === 0) {
    entriesTbody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-box">
          <span>👥</span>
          No entries found.<br>
          <small>Add people to start tracking them.</small>
        </td>
      </tr>
    `;
  } else {
    entriesTbody.innerHTML = filtered.map(item => {
      let stageBadge = '';
      let nextAction = '';

      if (item.stage === 'came') {
        stageBadge = '<span class="badge came">1. Came (Visited)</span>';
        nextAction = `<button class="btn btn-sm btn-outline" onclick="advanceStage('${item.id}', 'form_filled')">Mark Form Filled &rarr;</button>`;
      } else if (item.stage === 'form_filled') {
        stageBadge = '<span class="badge form">2. Filled Form</span>';
        nextAction = `<button class="btn btn-sm btn-primary" onclick="advanceStage('${item.id}', 'quiz_attended')">Mark Quiz Attended &rarr;</button>`;
      } else {
        stageBadge = '<span class="badge quiz">&#10003; Quiz Attended</span>';
        nextAction = '<span style="color:var(--quiz-color); font-weight:700; font-size:0.8rem;">Completed</span>';
      }

      const dateFmt = new Date(item.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

      return `
        <tr>
          <td><strong>${item.name}</strong></td>
          <td>${stageBadge}</td>
          <td><span class="badge source">${item.source}</span></td>
          <td style="color:var(--text-muted);">${dateFmt}</td>
          <td>
            <div style="display:flex; gap:8px; align-items:center;">
              ${nextAction}
              <button class="btn btn-sm btn-danger" title="Delete" onclick="deleteEntry('${item.id}')">&times;</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }
}

// Advance Stage of an Entry (e.g., Came -> Form Filled -> Quiz Attended)
function advanceStage(id, newStage) {
  const item = entries.find(x => x.id === id);
  if (!item) return;

  item.stage = newStage;
  saveEntries();
  render();
}

// Delete Entry
function deleteEntry(id) {
  entries = entries.filter(x => x.id !== id);
  saveEntries();
  render();
}

// Clear All Data
function clearAllEntries() {
  if (entries.length === 0) return;
  if (!confirm('Are you sure you want to clear all entered data?')) return;
  entries = [];
  saveEntries();
  render();
}

// Modal Handlers
function openModal() {
  document.getElementById('entryModal').style.display = 'flex';
  document.getElementById('entryName').value = '';
  document.getElementById('entryDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('entryStage').value = 'came';
  document.getElementById('entryName').focus();
}

function closeModal() {
  document.getElementById('entryModal').style.display = 'none';
}

// Handle Form Submission
function handleAddEntry(e) {
  e.preventDefault();

  const nameInput = document.getElementById('entryName').value.trim();
  const stage = document.getElementById('entryStage').value;
  const source = document.getElementById('entrySource').value;
  const dateInput = document.getElementById('entryDate').value;

  const now = new Date();
  const date = dateInput ? new Date(dateInput + 'T12:00:00').toISOString() : now.toISOString();

  const newEntry = {
    id: 'ENT-' + Date.now().toString().slice(-6),
    name: nameInput || `Person #${entries.length + 1}`,
    stage: stage,
    source: source,
    date: date
  };

  entries.unshift(newEntry);
  saveEntries();
  closeModal();
  render();
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  loadEntries();
  render();

  // Mode buttons (Daily, Weekly, Monthly)
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;
      render();
    });
  });

  // Filters
  document.getElementById('filterSource').addEventListener('change', render);
  document.getElementById('filterDateRange').addEventListener('change', render);

  // Modal form submit
  document.getElementById('addEntryForm').addEventListener('submit', handleAddEntry);

  // Close modal when clicking outside
  document.getElementById('entryModal').addEventListener('click', (e) => {
    if (e.target.id === 'entryModal') closeModal();
  });
});
