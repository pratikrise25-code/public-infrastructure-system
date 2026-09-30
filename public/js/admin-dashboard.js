/**
 * Admin Dashboard & Maintenance Pipeline Workflow Controller
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

      setVal('kpi-total-assets', data.totalAssets);
      setVal('kpi-active-complaints', data.activeComplaints);
      setVal('kpi-critical-complaints', data.criticalComplaints);
      setVal('kpi-ai-detected', data.aiDetectedComplaints);
      setVal('kpi-in-progress', data.inProgressMaintenance);
      setVal('kpi-completed', data.completedMaintenance);
      setVal('kpi-health-index', `${data.infrastructureHealthIndex}%`);

      this.renderTopHotspots(data.topHotspots || []);
      this.renderPreventiveRecommendations(data.preventiveRecommendations || []);
    } catch (err) {
      console.error('Failed to load admin summary:', err);
    }
  },

  renderTopHotspots(hotspots) {
    const container = document.getElementById('top-hotspots-summary-list');
    if (!container) return;

    if (hotspots.length === 0) {
      container.innerHTML = '<div style="font-size: 0.85rem; color: var(--text-dim); padding: 10px;">No critical hotspots recorded.</div>';
      return;
    }

    container.innerHTML = hotspots.slice(0, 4).map(h => `
      <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 10px 14px; margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="color: #fff; font-size: 0.9rem;">${h.area}</strong>
          <span class="badge-severity ${h.riskLevel}">${h.riskLevel} RISK</span>
        </div>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">
          Dominant Issue: <strong>${h.dominantIssue}</strong> (${h.complaintCount} total complaints) • Trend: <strong>${h.trend}</strong>
        </div>
      </div>
    `).join('');
  },

  renderPreventiveRecommendations(recs) {
    const container = document.getElementById('preventive-recommendations-list');
    if (!container) return;

    if (recs.length === 0) {
      container.innerHTML = '<div style="font-size: 0.85rem; color: var(--text-dim); padding: 10px;">No critical preventive alerts at this time. All sectors normal.</div>';
      return;
    }

    container.innerHTML = recs.map(r => `
      <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid ${r.isAcknowledged ? 'var(--border-color)' : 'rgba(245, 158, 11, 0.35)'}; border-radius: var(--radius-md); padding: 1rem; margin-bottom: 0.85rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
          <div>
            <div style="font-weight: 700; color: #fff; font-size: 0.95rem;">${r.area}</div>
            <div style="font-size: 0.75rem; color: var(--text-dim);">Period: ${r.timePeriodUsed}</div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <span class="badge-severity ${r.riskLevel}">${r.riskLevel} RISK</span>
            <span style="font-size: 0.75rem; background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 2px 6px; border-radius: 4px;">
              ${r.confidence}% Conf. (${r.uncertaintyMargin})
            </span>
          </div>
        </div>

        <div style="font-size: 0.82rem; color: var(--text-muted); margin: 6px 0; line-height: 1.45;">
          ${r.warning}
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px;">
          <div style="font-size: 0.72rem; color: var(--text-dim); font-style: italic;">
            ${r.disclaimer}
          </div>
          <button class="btn-action-sm" onclick="AdminDashboard.acknowledgeRecommendation('${r.locationId}', ${!r.isAcknowledged})">
            ${r.isAcknowledged ? 'Dismissed' : 'Acknowledge & Schedule'}
          </button>
        </div>
      </div>
    `).join('');
  },

  async acknowledgeRecommendation(locationId, state) {
    try {
      await fetch(`/api/hotspots/preventive-recommendations/${locationId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledged: state })
      });
      App.showToast('Preventive alert status updated.', 'info');
      this.loadSummary();
    } catch (err) {
      console.error(err);
    }
  },

  async loadComplaintsTable() {
    const tbody = document.getElementById('complaints-table-body');
    if (!tbody) return;

    try {
      const res = await fetch('/api/complaints?limit=100');
      const json = await res.json();
      if (!json.success) return;

      this.activeComplaints = json.data || [];

      if (this.activeComplaints.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 2rem;">No complaints registered yet.</td></tr>';
        return;
      }

      tbody.innerHTML = this.activeComplaints.map(c => {
        const priorityLabel = c.priority_level || 'MEDIUM';
        const isOverridden = Boolean(c.is_overridden);

        return `
          <tr>
            <td>
              <strong style="color: #fff;">#${c.complaint_number}</strong>
              <div style="font-size: 0.72rem; color: var(--text-dim);">${App.formatDate(c.reported_at)}</div>
            </td>
            <td>
              <img src="${c.image_url || '/assets/sample-pothole.jpg'}" alt="defect" style="width: 50px; height: 38px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border-color);">
            </td>
            <td>
              <div>${App.getIssueEmoji(c.issue_type)} ${c.issue_type}</div>
              <div style="font-size: 0.72rem; color: var(--text-dim);">${c.department}</div>
            </td>
            <td>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <span class="badge-severity ${priorityLabel}">${priorityLabel} (${Math.round(c.priority_score || 50)}/100)</span>
                <span style="font-size: 0.68rem; color: ${isOverridden ? '#f59e0b' : '#38bdf8'}; font-weight: 600;">
                  ${isOverridden ? '⚖️ Admin Overridden' : '🤖 AI-Assisted'}
                </span>
              </div>
            </td>
            <td>
              <span class="badge-status ${c.status}">${c.status.replace('_', ' ')}</span>
            </td>
            <td>
              <div style="font-size: 0.85rem; color: #fff;">${c.location_name || 'Corridor'}</div>
              <div style="font-size: 0.72rem; color: var(--text-dim);">${c.ward_district || 'District'}</div>
            </td>
            <td>
              <div style="font-size: 0.82rem; color: ${c.team_name ? '#fff' : 'var(--text-dim)'};">
                ${c.team_name || 'Unassigned'}
              </div>
            </td>
            <td>
              <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                ${c.status === 'REPORTED' ? `
                  <button class="btn-action-sm" onclick="AdminDashboard.openAssignModal(${c.id})" title="Assign maintenance team">
                    👷 Assign
                  </button>
                ` : ''}

                ${c.status === 'ASSIGNED' ? `
                  <button class="btn-action-sm" onclick="AdminDashboard.updateStatus(${c.id}, 'IN_PROGRESS')" style="color: #38bdf8; border-color: rgba(56, 189, 248, 0.4);">
                    ▶ Start Work
                  </button>
                ` : ''}

                ${c.status === 'IN_PROGRESS' || c.status === 'ASSIGNED' ? `
                  <button class="btn-action-sm" onclick="AdminDashboard.openCompleteModal(${c.id})" style="color: #10b981; border-color: rgba(16, 185, 129, 0.4);">
                    ✅ Complete
                  </button>
                ` : ''}

                <button class="btn-action-sm" onclick="AdminDashboard.openOverrideModal(${c.id}, '${priorityLabel}', ${c.priority_score || 50})" title="Override AI priority">
                  ⚖️ Override
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
    const tbody = document.getElementById('assets-table-body');
    if (!tbody) return;

    try {
      const res = await fetch('/api/assets');
      const json = await res.json();
      if (!json.success) return;

      tbody.innerHTML = (json.data || []).map(a => `
        <tr>
          <td><strong style="color: #fff;">${a.asset_tag}</strong></td>
          <td>${a.name}</td>
          <td>${a.asset_type}</td>
          <td><span class="badge-severity ${a.condition === 'Good' ? 'LOW' : a.condition === 'Fair' ? 'MEDIUM' : 'CRITICAL'}">${a.condition}</span></td>
          <td>Score ${a.importance_score}/5</td>
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
    const modal = document.getElementById('assign-modal');
    if (modal) {
      modal.classList.add('open');
      modal.style.display = 'flex';
      const dateInput = document.getElementById('assign-scheduled-date');
      if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
      }
    }
  },

  async submitAssignment() {
    if (!this.selectedComplaintId) return;

    const teamName = document.getElementById('assign-team-name')?.value;
    const scheduledDate = document.getElementById('assign-scheduled-date')?.value;
    const notes = document.getElementById('assign-notes')?.value;

    try {
      const res = await fetch(`/api/complaints/${this.selectedComplaintId}/assign`, {
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
  },

  openCompleteModal(complaintId) {
    this.selectedComplaintId = complaintId;
    App.closeModals();
    const modal = document.getElementById('complete-modal');
    if (modal) {
      modal.classList.add('open');
      modal.style.display = 'flex';
    }
  },

  async submitCompletion() {
    if (!this.selectedComplaintId) return;

    const actionTaken = document.getElementById('complete-action-taken')?.value;
    const performedBy = document.getElementById('complete-performed-by')?.value;
    const fileInput = document.getElementById('complete-image-file');

    const formData = new FormData();
    formData.append('actionTaken', actionTaken);
    formData.append('performedBy', performedBy);

    if (fileInput && fileInput.files && fileInput.files[0]) {
      formData.append('completionImage', fileInput.files[0]);
    }

    try {
      const res = await fetch(`/api/complaints/${this.selectedComplaintId}/complete`, {
        method: 'POST',
        body: formData
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to complete complaint');
      }

      let toastMsg = 'Complaint marked as COMPLETED! Maintenance history recorded.';
      if (json.comparisonResult && json.comparisonResult.changeDetected) {
        toastMsg += ` AI Before/After Analysis: ${json.comparisonResult.changeDetected}.`;
      }

      App.showToast(toastMsg, 'success');
      App.closeModals();
      this.loadSummary();
      this.loadComplaintsTable();
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  openOverrideModal(complaintId, currentLevel, currentScore) {
    this.selectedComplaintId = complaintId;
    App.closeModals();
    const modal = document.getElementById('override-modal');
    if (modal) {
      modal.classList.add('open');
      modal.style.display = 'flex';
      const levelSelect = document.getElementById('override-level');
      if (levelSelect) levelSelect.value = currentLevel || 'HIGH';
      const scoreInput = document.getElementById('override-score');
      if (scoreInput) scoreInput.value = currentScore || 85;
      const reasonInput = document.getElementById('override-reason');
      if (reasonInput) reasonInput.value = '';
    }
  },

  async submitOverride() {
    if (!this.selectedComplaintId) return;

    const priorityLevel = document.getElementById('override-level')?.value;
    const priorityScore = document.getElementById('override-score')?.value;
    const reason = document.getElementById('override-reason')?.value;

    if (!reason || !reason.trim()) {
      App.showToast('Please provide a justification for overriding the AI priority.', 'warning');
      return;
    }

    try {
      const res = await fetch(`/api/complaints/${this.selectedComplaintId}/override-priority`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priorityLevel, priorityScore, reason })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to override priority');
      }

      App.showToast(`Priority successfully overridden to ${priorityLevel} by Administrator.`, 'success');
      App.closeModals();
      this.loadComplaintsTable();
      this.loadSummary();
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  openWeightsModal() {
    App.closeModals();
    const modal = document.getElementById('weights-modal');
    if (modal) {
      modal.classList.add('open');
      modal.style.display = 'flex';
    }
  }
};

window.AdminDashboard = AdminDashboard;
