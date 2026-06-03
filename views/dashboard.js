import { state } from '../state.js';
import { esc, projStatusBadge, getProjectIssueCounts, typeBadge, priorityBadge, calcScore, scoreBadge } from '../utils.js';

const gripIcon = `<svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor"><circle cx="3" cy="2" r="1.5"/><circle cx="3" cy="8" r="1.5"/><circle cx="3" cy="14" r="1.5"/><circle cx="7" cy="2" r="1.5"/><circle cx="7" cy="8" r="1.5"/><circle cx="7" cy="14" r="1.5"/></svg>`;

function sortByOrder(a, b) {
  if (a.sortOrder != null && b.sortOrder != null) return a.sortOrder - b.sortOrder;
  if (a.sortOrder != null) return -1;
  if (b.sortOrder != null) return 1;
  return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
}

export function dashboardView() {
  const limit      = localStorage.getItem('dashboardProjectLimit') || 'all';
  const open       = [...state.projects]
    .filter(p => p.status === 'Planning' || p.status === 'In Progress')
    .sort(sortByOrder);
  const openCount  = state.issues.filter(i => i.status === 'Open').length;
  const progCount  = state.issues.filter(i => i.status === 'In Progress').length;
  const doneCount  = state.issues.filter(i => i.status === 'Done').length;
  const openTasks  = [...state.issues]
    .filter(i => i.status === 'Open')
    .sort((a, b) => calcScore(b) - calcScore(a))
    .slice(0, 5);

  const limitNum    = limit === '5' ? 5 : limit === '10' ? 10 : Infinity;
  const visible     = open.slice(0, limitNum);
  const hiddenCount = open.length - visible.length;

  return `
    <div class="view-content">

      <!-- ── Projects ───────────────────────────────────────── -->
      <div class="section-header">
        <h3>Projects <span class="count-pill">${open.length}</span></h3>
        <button class="btn btn-sm btn-primary" onclick="showProjectModal()">+ Add Project</button>
      </div>

      ${open.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M2 18a1 1 0 001 1h18a1 1 0 001-1v-2a1 1 0 00-1-1H3a1 1 0 00-1 1v2z"/>
              <path d="M10 10V5a2 2 0 014 0v5"/>
              <path d="M4 15v-3a8 8 0 0116 0v3"/>
            </svg>
          </div>
          <p>No projects yet.<br>Create one to get started.</p>
          <button class="btn btn-primary" onclick="showProjectModal()">Create Project</button>
        </div>
      ` : `
        <div class="dash-section-row">
          <p class="dashboard-section-label">Open projects</p>
          <div class="limit-selector">
            ${['5','10','all'].map(v => `
              <button class="limit-btn ${limit === v ? 'active' : ''}"
                      onclick="setDashboardProjectLimit('${v}')">${v === 'all' ? 'All' : v}</button>
            `).join('')}
          </div>
        </div>
        <div class="list" id="dash-open-projects">
          ${visible.map(p => openProjectRow(p)).join('')}
        </div>
        ${hiddenCount > 0 ? `
          <button class="btn btn-ghost btn-sm btn-block mt-2" onclick="navigate('projects')">
            View all ${open.length} open projects
          </button>
        ` : ''}
      `}

      <!-- ── Tasks ──────────────────────────────────────────── -->
      <div class="section-header mt-4">
        <h3>Tasks <span class="count-pill">${state.issues.length}</span></h3>
        <button class="btn btn-sm btn-primary" onclick="showIssueModal()">+ Add Task</button>
      </div>

      <div class="stats-bar">
        <div class="stat-item clickable" onclick="navigateIssuesByStatus('Open')">
          <span class="stat-value">${openCount}</span>
          <span class="stat-label">Open tasks</span>
        </div>
        <div class="stat-item clickable" onclick="navigateIssuesByStatus('In Progress')">
          <span class="stat-value">${progCount}</span>
          <span class="stat-label">In Progress tasks</span>
        </div>
        <div class="stat-item clickable" onclick="navigateIssuesByStatus('Done')">
          <span class="stat-value">${doneCount}</span>
          <span class="stat-label">Completed tasks</span>
        </div>
      </div>

      ${state.issues.length === 0 ? `
        <div class="empty-state empty-state-sm">
          <p>No tasks yet. Add one to get started.</p>
        </div>
      ` : openTasks.length === 0 ? `
        <div class="empty-state empty-state-sm">
          <p>No open tasks — nice work!</p>
        </div>
      ` : `
        <p class="dashboard-section-label">Open tasks</p>
        <div class="issue-list">
          ${openTasks.map(i => openTaskRow(i)).join('')}
        </div>
        ${openCount > 5 ? `
          <button class="btn btn-ghost btn-sm btn-block mt-2" onclick="navigateIssuesByStatus('Open')">
            View all ${openCount} open tasks
          </button>
        ` : ''}
      `}

    </div>`;
}

function openProjectRow(p) {
  const c = getProjectIssueCounts(p.id);
  return `
    <div class="list-item clickable" data-id="${esc(p.id)}" onclick="navigate('project', {projectId:'${esc(p.id)}'})">
      <span class="drag-handle" title="Drag to reorder">${gripIcon}</span>
      <div class="list-item-main">
        <div class="list-item-title">${esc(p.name)}</div>
        ${p.description ? `<div class="list-item-subtitle">${esc(p.description)}</div>` : ''}
        ${c.total > 0 ? `<div class="list-item-meta">${c.total} task${c.total !== 1 ? 's' : ''}${c.done > 0 ? ` · ${c.done} done` : ''}${c.inProgress > 0 ? ` · ${c.inProgress} in progress` : ''}</div>` : ''}
      </div>
      ${projStatusBadge(p.status)}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg>
    </div>`;
}

function openTaskRow(issue) {
  return `
    <div class="issue-card" onclick="showIssueModalById('${esc(issue.id)}')">
      <div class="issue-body">
        <div class="issue-name">${esc(issue.name)}</div>
        <div class="issue-meta">
          ${typeBadge(issue.type)}
          ${issue.priority ? priorityBadge(issue.priority) : ''}
        </div>
      </div>
      ${scoreBadge(issue)}
    </div>`;
}

export function projectCard(p) {
  const c = getProjectIssueCounts(p.id);
  return `
    <div class="project-card" onclick="navigate('project', {projectId:'${esc(p.id)}'})">
      <div class="project-card-header">
        <h4>${esc(p.name)}</h4>
        ${projStatusBadge(p.status)}
      </div>
      ${p.description ? `<p class="project-card-desc">${esc(p.description)}</p>` : ''}
      <div class="project-card-stats">
        <span>${c.total} task${c.total !== 1 ? 's' : ''}</span>
        ${c.done > 0 ? `<span>${c.done} done</span>` : ''}
        ${c.inProgress > 0 ? `<span>${c.inProgress} in progress</span>` : ''}
      </div>
    </div>`;
}
