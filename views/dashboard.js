import { state } from '../state.js';
import { esc, projStatusBadge, getProjectIssueCounts, typeBadge, priorityBadge } from '../utils.js';

export function dashboardView() {
  const active      = state.projects.filter(p => p.status === 'In Progress');
  const other       = state.projects.filter(p => p.status !== 'In Progress');
  const openCount   = state.issues.filter(i => i.status === 'Open').length;
  const progCount   = state.issues.filter(i => i.status === 'In Progress').length;
  const doneCount   = state.issues.filter(i => i.status === 'Done').length;
  const openTasks   = state.issues.filter(i => i.status === 'Open').slice(0, 5);

  return `
    <div class="view-content">

      <!-- ── Projects ───────────────────────────────────────── -->
      <div class="section-header">
        <h3>Projects <span class="count-pill">${state.projects.length}</span></h3>
        <button class="btn btn-sm btn-primary" onclick="showProjectModal()">+ Add Project</button>
      </div>

      ${state.projects.length === 0 ? `
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
        ${active.length > 0 ? `
          <p class="dashboard-section-label">In Progress</p>
          <div class="project-grid">
            ${active.map(p => projectCard(p)).join('')}
          </div>
        ` : `
          <div class="empty-state empty-state-sm">
            <p>No projects in progress.<br>Mark a project as <strong>In Progress</strong> to see it here.</p>
          </div>
        `}

        ${other.length > 0 ? `
          <p class="dashboard-section-label mt-4">Planning &amp; Complete</p>
          <div class="list">
            ${other.map(p => `
              <div class="list-item clickable" onclick="navigate('project', {projectId:'${esc(p.id)}'})">
                <div class="list-item-main">
                  <div class="list-item-title">${esc(p.name)}</div>
                  ${p.description ? `<div class="list-item-subtitle">${esc(p.description)}</div>` : ''}
                </div>
                ${projStatusBadge(p.status)}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg>
              </div>
            `).join('')}
          </div>
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
