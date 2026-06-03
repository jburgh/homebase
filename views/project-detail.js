import { state } from '../state.js';
import { esc, projStatusBadge } from '../utils.js';
import { issueCard } from './tasks.js';
import { projectSupplyCost, projectOutstandingCost, formatCurrency } from './supplies.js';

export function projectView() {
  const project = state.projects.find(p => p.id === state.currentProjectId);
  if (!project) return `<div class="view-content"><p class="text-muted">Project not found.</p></div>`;

  const projIssues = state.issues
    .filter(i => i.projectId === project.id)
    .sort((a, b) => {
      if (a.sortOrder != null && b.sortOrder != null) return a.sortOrder - b.sortOrder;
      if (a.sortOrder != null) return -1;
      if (b.sortOrder != null) return 1;
      return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
    });
  const open       = projIssues.filter(i => i.status === 'Open').length;
  const inProg     = projIssues.filter(i => i.status === 'In Progress').length;
  const done       = projIssues.filter(i => i.status === 'Done').length;
  const totalCost       = projectSupplyCost(project.id);
  const outstandingCost = projectOutstandingCost(project.id);

  return `
    <div class="view-content">
      <div class="project-detail-card">
        <div class="project-detail-header">
          <h3>${esc(project.name)}</h3>
          ${projStatusBadge(project.status)}
        </div>
        ${project.description ? `<p class="project-detail-desc">${esc(project.description)}</p>` : ''}
        <div class="project-card-stats mt-2">
          <span>${projIssues.length} task${projIssues.length !== 1 ? 's' : ''}</span>
          ${open > 0 ? `<span>${open} open</span>` : ''}
          ${inProg > 0 ? `<span>${inProg} in progress</span>` : ''}
          ${done > 0 ? `<span>${done} done</span>` : ''}
        </div>
        ${totalCost > 0 ? `
          <div class="project-cost-row">
            <span class="project-cost-label">Estimated materials cost</span>
            <span class="project-cost-value">${formatCurrency(totalCost)}</span>
          </div>
          ${outstandingCost > 0 ? `
          <div class="project-cost-row">
            <span class="project-cost-label">Still to purchase</span>
            <span class="project-cost-value outstanding">${formatCurrency(outstandingCost)}</span>
          </div>
          ` : ''}
        ` : ''}
        <div class="project-detail-actions">
          <button class="btn btn-sm btn-secondary" onclick="showProjectModal('${esc(project.id)}')">Edit Project</button>
          <button class="btn btn-sm btn-danger" onclick="confirmDeleteProject('${esc(project.id)}','${esc(project.name)}')">Delete</button>
        </div>
      </div>

      <div class="section-header">
        <h3>Tasks</h3>
        <button class="btn btn-sm btn-primary"
                onclick="showIssueModal(null,'${esc(project.id)}')">+ Add Task</button>
      </div>

      ${projIssues.length === 0 ? `
        <div class="empty-state">
          <p>No tasks linked to this project yet.</p>
          <button class="btn btn-primary" onclick="showIssueModal(null,'${esc(project.id)}')">Add a Task</button>
        </div>
      ` : `
        <div class="issue-list" id="project-task-list">
          ${projIssues.map(i => issueCard(i, { draggable: true })).join('')}
        </div>
      `}
    </div>`;
}
