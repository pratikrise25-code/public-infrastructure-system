/**
 * NagarDristi AI — Municipal Administrator Dashboard Controller
 * Handles crew assignment, status transitions, priority overrides, and issue corrections
 */
const AdminDashboard = {
  activeComplaints: [],
  selectedComplaintId: null,

  init() {
    this.loadSummary();
    this.loadComplaintsTable();
    this.loadAssetsTable();
  },

  async loadSummary() {
    try {
      const res = await fetch('/api/admin/summary');
      const json = await res.json();
      if (!json.success) return;

      const data = json.data;
      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      setVal('admin-stat-active', data.activeComplaints);
      setVal('admin-stat-critical', data.criticalComplaints);
      setVal('admin-stat-ai', data.aiDetectedComplaints);
      setVal('admin-stat-health', `${data.infrastructureHealthIndex}%`);
    } catch (err) {
      console.error('Failed to load admin summary:', err);
    }
  },

  async loadComplaintsTable() {
    const tbody = document.getElementById('admin-complaints-tbody');
    if (!tbody) return;

    try {
      const res = await fetch('/api/complaints?limit=100');
      const json = await res.json();
      if (!json.success) return;

      this.activeComplaints = json.data || [];

      if (this.activeComplaints.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 2rem; color: var(--text-dim);">No complaints registered yet.</td></tr>';
        return;
      }

      tbody.innerHTML = this.activeComplaints.map(c => {
        const priorityLabel = c.priority_level || 'MEDIUM';
        const isOverridden = Boolean(c.is_overridden);

        return `
          <tr>
            <td>
              <strong>#${c.complaint_number}</strong>
              <div style="font-size: 0.75rem; color: var(--text-dim);">${App.formatDate(c.reported_at)}</div>
            </td>
            <td>
              <div style="font-weight: 600;">${c.citizen_name || 'Public Citizen'}</div>
              <div style="font-size: 0.75rem; color: var(--text-dim);">${c.citizen_phone || ''}</div>
            </td>
            <td>
              <div style="font-weight: 700; color: var(--civic-dark);">${App.getIssueEmoji(c.issue_type)} ${c.issue_type}</div>
              <div style="font-size: 0.75rem; color: var(--text-dim);">${c.department}</div>
            </td>
            <td>
              <span class="badge-severity ${c.severity}">${c.severity}</span>
            </td>
            <td>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <span class="badge-severity ${priorityLabel}">${priorityLabel} (${Math.round(c.priority_score || 50)}/100)</span>
                <span style="font-size: 0.7rem; color: var(--text-dim); font-weight: 600;">
                  ${isOverridden ? '⚖️ Admin Calibrated' : '🤖 AI-Assisted'}
                </span>
              </div>
            </td>
            <td>
              <span style="font-size: 0.85rem; color: var(--text-main);">${c.department}</span>
            </td>
            <td>
              <span class="badge-status ${c.status}">${c.status.replace('_', ' ')}</span>
            </td>
            <td>
              <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                ${c.status === 'REPORTED' ? `
                  <button class="btn-action-sm" onclick="AdminDashboard.openAssignModal(${c.id})" title="Assign maintenance team">
                    👷 Assign
                  </button>
                ` : ''}

                ${c.status === 'ASSIGNED' ? `
                  <button class="btn-action-sm" onclick="AdminDashboard.updateStatus(${c.id}, 'IN_PROGRESS')" style="color: var(--primary);">
                    ▶ Start Work
                  </button>
                ` : ''}

                ${c.status === 'IN_PROGRESS' || c.status === 'ASSIGNED' ? `
                  <button class="btn-action-sm" onclick="AdminDashboard.openCompleteModal(${c.id})" style="color: var(--success);">
                    ✅ Complete
                  </button>
                ` : ''}

                <!-- Correct Detected Issue Button (Requirement 1) -->
                <button class="btn-action-sm" onclick="AdminDashboard.openCorrectModal(${c.id}, '${c.issue_type}', '${c.severity}', '${c.department}')" title="Correct AI detected issue">
                  ✏️ Correct
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

    } catch (err) {
      console.error('Failed to load complaints table:', err);
    }
  },

  async loadAssetsTable() {
    const tbody = document.getElementById('assets-tbody');
    if (!tbody) return;

    try {
      const res = await fetch('/api/assets');
      const json = await res.json();
      if (!json.success) return;

      tbody.innerHTML = (json.data || []).map(a => `
        <tr>
          <td><strong>${a.asset_tag}</strong></td>
          <td>${a.name}</td>
          <td>${a.asset_type}</td>
          <td>MG Road Sector</td>
          <td><span class="badge-severity ${a.condition === 'Good' ? 'LOW' : a.condition === 'Fair' ? 'MEDIUM' : 'CRITICAL'}">${a.condition}</span></td>
          <td>${a.last_inspection_date || 'N/A'}</td>
        </tr>
      `).join('');
    } catch (err) {
      console.error(err);
    }
  },

  openAssignModal(complaintId) {
    this.selectedComplaintId = complaintId;
    App.closeModals();
    const modal = document.getElementById('admin-assign-modal');
    const hiddenId = document.getElementById('assign-complaint-id');
    const dateInput = document.getElementById('assign-scheduled-date');

    if (hiddenId) hiddenId.value = complaintId;
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

    if (modal) {
      modal.classList.add('open');
      modal.style.display = 'flex';
    }
  },

  async handleAssignSubmit(e) {
    e.preventDefault();
    const complaintId = document.getElementById('assign-complaint-id')?.value || this.selectedComplaintId;
    const teamName = document.getElementById('assign-team-select')?.value;
    const scheduledDate = document.getElementById('assign-scheduled-date')?.value;
    const notes = document.getElementById('assign-notes')?.value;

    try {
      const res = await fetch(`/api/complaints/${complaintId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamName, scheduledDate, notes })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to assign team');
      }

      App.showToast(`Assigned to ${teamName}! Status moved to ASSIGNED.`, 'success');
      App.closeModals();
      this.loadSummary();
      this.loadComplaintsTable();
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  /**
   * Open the Correct Issue modal
   */
  openCorrectModal(complaintId, currentIssue, currentSeverity, currentDept) {
    this.selectedComplaintId = complaintId;
    App.closeModals();
    const modal = document.getElementById('admin-correct-modal');
    const hiddenId = document.getElementById('correct-complaint-id');
    const issueSelect = document.getElementById('correct-issue-type');
    const sevSelect = document.getElementById('correct-severity');
    const deptSelect = document.getElementById('correct-department');

    if (hiddenId) hiddenId.value = complaintId;
    if (issueSelect && currentIssue) issueSelect.value = currentIssue;
    if (sevSelect && currentSeverity) sevSelect.value = currentSeverity.toUpperCase();
    if (deptSelect && currentDept) deptSelect.value = currentDept;

    if (modal) {
      modal.classList.add('open');
      modal.style.display = 'flex';
    }
  },

  async handleCorrectIssueSubmit(e) {
    e.preventDefault();
    const complaintId = document.getElementById('correct-complaint-id')?.value || this.selectedComplaintId;
    const issueType = document.getElementById('correct-issue-type')?.value;
    const severity = document.getElementById('correct-severity')?.value;
    const department = document.getElementById('correct-department')?.value;
    const reason = document.getElementById('correct-reason')?.value;

    try {
      const res = await fetch(`/api/complaints/${complaintId}/correct-issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueType, severity, department, reason })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to correct issue');
      }

      App.showToast(json.message || 'Issue corrected successfully.', 'success');
      App.closeModals();
      this.loadSummary();
      this.loadComplaintsTable();
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  openCompleteModal(complaintId) {
    this.selectedComplaintId = complaintId;
    App.closeModals();
    const modal = document.getElementById('admin-complete-modal');
    const hiddenId = document.getElementById('complete-complaint-id');
    if (hiddenId) hiddenId.value = complaintId;

    if (modal) {
      modal.classList.add('open');
      modal.style.display = 'flex';
    }
  },

  useSampleRepaired() {
    App.showToast('Using verified municipal restoration sample photo.', 'info');
  },

  async handleCompleteSubmit(e) {
    e.preventDefault();
    const complaintId = document.getElementById('complete-complaint-id')?.value || this.selectedComplaintId;
    const actionTaken = document.getElementById('complete-action-taken')?.value;
    const performedBy = document.getElementById('complete-performed-by')?.value;
    const costEstimate = document.getElementById('complete-cost')?.value;
    const fileInput = document.getElementById('complete-image-input');

    const formData = new FormData();
    formData.append('actionTaken', actionTaken);
    formData.append('performedBy', performedBy);
    formData.append('costEstimate', costEstimate);

    if (fileInput && fileInput.files && fileInput.files[0]) {
      formData.append('completionImage', fileInput.files[0]);
    } else {
      formData.append('imagePath', '/assets/sample-repaired.jpg');
    }

    try {
      const res = await fetch(`/api/complaints/${complaintId}/complete`, {
        method: 'POST',
        body: formData
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to complete complaint');
      }

      App.showToast('Complaint verified and marked as COMPLETED!', 'success');
      App.closeModals();
      this.loadSummary();
      this.loadComplaintsTable();
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  async updateStatus(complaintId, status) {
    try {
      const res = await fetch(`/api/complaints/${complaintId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const json = await res.json();
      if (json.success) {
        App.showToast(`Complaint status updated to ${status}.`, 'success');
        this.loadSummary();
        this.loadComplaintsTable();
      }
    } catch (err) {
      App.showToast('Failed to update status', 'error');
    }
  }
};

window.AdminDashboard = AdminDashboard;
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('admin-complaints-tbody')) {
    AdminDashboard.init();
  }
});
