import { state } from './state.js';

export const el = id => document.getElementById(id);

export function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function showLoading(show) {
  el('loading-overlay').style.display = show ? 'flex' : 'none';
}

export function statusBadge(s) {
  const cls = { 'Open': 's-open', 'In Progress': 's-inprogress', 'Done': 's-done' };
  return `<span class="badge ${cls[s] || ''}">${esc(s)}</span>`;
}

export function typeBadge(t) {
  const cls = {
    'Fix': 't-fix', 'Clean': 't-clean', 'Replace': 't-replace',
    'Build': 't-build', 'Improve': 't-improve', 'Other': 't-other'
  };
  return `<span class="badge ${cls[t] || 't-other'}">${esc(t)}</span>`;
}

export function projStatusBadge(s) {
  const cls = { 'Planning': 'ps-planning', 'In Progress': 'ps-active', 'Complete': 'ps-complete' };
  return `<span class="badge ${cls[s] || ''}">${esc(s)}</span>`;
}

export function priorityBadge(p) {
  if (!p) return '';
  const cls = { 'Low': 'p-low', 'Medium': 'p-medium', 'High': 'p-high', 'Critical': 'p-critical' };
  return `<span class="badge ${cls[p] || ''}">${esc(p)}</span>`;
}

export function statusToggleClass(s) {
  const cls = { 'Open': 's-open', 'In Progress': 's-inprogress', 'Done': 's-done' };
  return cls[s] || 's-open';
}

export function statusToggleIcon(s) {
  if (s === 'Done') {
    return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20,6 9,17 4,12"/></svg>`;
  }
  if (s === 'In Progress') {
    return `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>`;
  }
  return '';
}

export function getAreaName(id) {
  const a = state.areas.find(a => a.id === id);
  return a ? a.name : '';
}

export function getProjectIssueCounts(projectId) {
  const list = state.issues.filter(i => i.projectId === projectId);
  return {
    total:      list.length,
    open:       list.filter(i => i.status === 'Open').length,
    inProgress: list.filter(i => i.status === 'In Progress').length,
    done:       list.filter(i => i.status === 'Done').length
  };
}

// ── Priority Score ────────────────────────────────────────────
// Score = priority pts (0-40) + effort pts (0-30) + cost pts (0-30) = 0-100
export function calcScore(issue) {
  const priorityPts = { 'Critical': 40, 'High': 30, 'Medium': 20, 'Low': 10 };
  const effortPts   = { 'Novice': 30, 'Apprentice': 20, 'Expert': 10, 'Pro': 0 };
  const costPts     = { 'Free': 30, '$': 20, '$$': 10, '$$$': 0 };
  return (priorityPts[issue.priority] || 0)
       + (effortPts[issue.effort]     || 0)
       + (costPts[issue.costTier]     || 0);
}

export function scoreBadge(issue) {
  const score = calcScore(issue);
  if (!score) return '';
  const cls = score >= 70 ? 'score-high' : score >= 40 ? 'score-mid' : 'score-low';
  return `<div class="issue-score-chip ${cls}" title="Priority score: ${score}/100">${score}</div>`;
}

export function iconEdit() {
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>`;
}

export function iconTrash() {
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <polyline points="3,6 5,6 21,6"/>
    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
  </svg>`;
}
