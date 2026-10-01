/**
 * Global Application Controller
 * Handles user identity (Citizen vs Admin), navigation, and complaint tracking
 */
const App = {
  currentTab: 'home-tab',
  currentUser: {
    id: 4,
    name: 'Public Citizen',
    email: 'citizen@nagardrishti.gov',
    role: 'citizen',
    phone: '+91 98765 00000',
    department: 'Public Citizen',
    complaintCount: 0
  },
  assets: [],
  locations: [],

  init() {
    this.setupTabs();
    this.setupModals();
    this.loadMetadata();

    // Check saved user in localStorage
    const savedUser = localStorage.getItem('civic_user');
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        if (u.name && (!['Commissioner R. K. Sharma', 'Public Citizen'].includes(u.name) || (u.id === 4 && u.complaintCount > 0))) {
          localStorage.removeItem('civic_user');
          this.switchUser(4);
        } else {
          this.switchUser(u.id);
        }
      } catch (e) {
        localStorage.removeItem('civic_user');
        this.switchUser(4);
      }
    } else {
      this.switchUser(4);
    }
  },

  setupTabs() {
    document.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('.citizen-nav-btn');
      if (tabBtn) {
        const targetId = tabBtn.getAttribute('data-tab');
        this.switchTab(targetId);
      }
    });
  },

  setupModals() {
    // Close modal on click outside or on close buttons
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this.closeModals();
        }
      });
    });
  },

  closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.classList.remove('open');
      modal.style.display = 'none';
    });
  },

  openRegisterModal() {
    this.closeModals();
    const modal = document.getElementById('register-modal');
    if (modal) {
      modal.classList.add('open');
      modal.style.display = 'flex';
    }
  },

  async handleRegisterSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const phone = document.getElementById('reg-phone').value;

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to register account');
      }

      this.closeModals();
      this.setCurrentUser(json.user);
      this.showToast(`Welcome, ${json.user.name}! Your complaint counter starts at 0.`, 'success');
      this.switchTab('home-tab');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  async switchToNewCitizenDemo() {
    try {
      // Create or fetch the clean demo citizen
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Citizen Demo',
          email: 'new.citizen.zero@metro.local',
          phone: '+91 91234 56789'
        })
      });

      const json = await res.json();
      if (json.success) {
        this.setCurrentUser(json.user);
        this.showToast('Logged in as New Citizen! Your complaint count is 0.', 'info');
        this.switchTab('home-tab');
      }
    } catch (err) {
      console.error(err);
      this.showToast('Failed to switch to New Citizen demo', 'error');
    }
  },

  async switchUser(userId) {
    try {
      const res = await fetch(`/api/auth/me?userId=${userId}`);
      const json = await res.json();
      if (json.success) {
        this.setCurrentUser(json.user);
      }
    } catch (err) {
      console.error('Error switching user:', err);
    }
  },

  setCurrentUser(user) {
    this.currentUser = user;
    localStorage.setItem('civic_user', JSON.stringify(user));

    // Update UI Elements
    const nameEl = document.getElementById('current-user-name');
    const counterEl = document.getElementById('current-user-counter');
    const iconEl = document.getElementById('current-user-icon');

    if (nameEl) nameEl.textContent = user.name;
    if (counterEl) counterEl.textContent = `${user.complaintCount} Reports`;
    if (iconEl) iconEl.textContent = user.role === 'admin' ? '🛡️' : '👤';

    // Update Profile Tab info
    const profName = document.getElementById('profile-name');
    const profEmail = document.getElementById('profile-email');
    const profPhone = document.getElementById('profile-phone');
    const profCount = document.getElementById('profile-count');
    const profRole = document.getElementById('profile-role');

    if (profName) profName.textContent = user.name;
    if (profEmail) profEmail.textContent = user.email || 'None';
    if (profPhone) profPhone.textContent = user.phone || 'None';
    if (profCount) profCount.textContent = user.complaintCount;
    if (profRole) profRole.textContent = user.role === 'admin' ? 'Municipal Administrator' : 'Registered Public Citizen';

    // Update map counter badge
    const mapCountBadge = document.getElementById('my-map-reports-count');
    if (mapCountBadge) mapCountBadge.textContent = user.complaintCount;

    // Toggle Citizen vs Admin Mode in UI
    const isAdmin = user.role === 'admin';
    document.body.classList.toggle('admin-mode', isAdmin);

    document.querySelectorAll('.admin-only-tab').forEach(el => {
      el.style.display = isAdmin ? 'inline-flex' : 'none';
    });

    document.querySelectorAll('.citizen-only-tab').forEach(el => {
      el.style.display = isAdmin ? 'none' : 'inline-flex';
    });

    const portalLabel = document.getElementById('portal-mode-label');
    if (portalLabel) {
      portalLabel.textContent = isAdmin 
        ? 'Municipal Administrator Command Console' 
        : 'Citizen Complaint & Infrastructure Portal';
    }

    // Highlight user switcher button
    document.querySelectorAll('.btn-user-switch').forEach(btn => btn.classList.remove('active'));
    if (user.id === 1) {
      document.getElementById('btn-switch-admin')?.classList.add('active');
    } else {
      document.getElementById('btn-switch-citizen')?.classList.add('active');
    }

    // Refresh data
    this.loadMyComplaints();
    if (window.HotspotMap && this.currentTab === 'my-map-tab') {
      window.HotspotMap.onTabActivated(this.currentUser);
    }
  },

  switchTab(tabId) {
    this.currentTab = tabId;

    // Update nav buttons
    document.querySelectorAll('.citizen-nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });

    // Update panes
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === tabId);
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Hook tab activations
    if (tabId === 'my-map-tab' && window.HotspotMap) {
      window.HotspotMap.onTabActivated(this.currentUser);
    } else if (tabId === 'city-map-tab' && window.HotspotMap) {
      window.HotspotMap.initCityMap();
      window.HotspotMap.invalidateCityDimensions();
    } else if (tabId === 'my-complaints-tab') {
      this.loadMyComplaints();
    } else if (tabId === 'admin-tab' && window.AdminDashboard) {
      window.AdminDashboard.loadSummary();
    } else if (tabId === 'all-complaints-tab' && window.AdminDashboard) {
      window.AdminDashboard.loadComplaintsTable();
    }
  },

  async loadMetadata() {
    try {
      const [assetsRes, locsRes] = await Promise.all([
        fetch('/api/assets'),
        fetch('/api/locations')
      ]);

      const assetsData = await assetsRes.json();
      const locsData = await locsRes.json();

      if (assetsData.success) {
        this.assets = assetsData.data;
      }

      if (locsData.success) {
        this.locations = locsData.data;
        this.populateLocationDropdowns();
      }
    } catch (err) {
      console.error('Failed to load initial metadata:', err);
    }
  },

  populateLocationDropdowns() {
    const selects = document.querySelectorAll('.location-select-dropdown');
    selects.forEach(select => {
      const currentVal = select.value;
      select.innerHTML = '<option value="">-- Choose Street / Area / Ward --</option>';
      this.locations.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l.id;
        opt.textContent = `${l.name} (${l.ward_district})`;
        select.appendChild(opt);
      });
      if (currentVal) select.value = currentVal;
    });
  },

  async loadMyComplaints() {
    const tbody = document.getElementById('my-complaints-tbody');
    const container = document.getElementById('my-complaints-list');
    const userHeaderName = document.getElementById('my-complaints-user-name');
    if (userHeaderName) userHeaderName.textContent = this.currentUser.name;

    try {
      const res = await fetch(`/api/complaints?userId=${this.currentUser.id}&userOnly=true`);
      const json = await res.json();
      if (!json.success) return;

      const complaints = json.data || [];

      // Update counters
      const totalCount = complaints.length;
      this.currentUser.complaintCount = totalCount;
      const counterEl = document.getElementById('current-user-counter');
      if (counterEl) counterEl.textContent = `${totalCount} Reports`;

      const mapCountBadge = document.getElementById('my-map-reports-count');
      if (mapCountBadge) mapCountBadge.textContent = totalCount;

      const homeStatReports = document.getElementById('home-stat-my-reports');
      if (homeStatReports) homeStatReports.textContent = totalCount;

      const homeStatMap = document.getElementById('home-stat-map-count');
      if (homeStatMap) homeStatMap.textContent = totalCount;

      const inProg = complaints.filter(c => c.status === 'ASSIGNED' || c.status === 'IN_PROGRESS').length;
      const comp = complaints.filter(c => c.status === 'COMPLETED').length;

      const inProgEl = document.getElementById('home-stat-in-progress');
      if (inProgEl) inProgEl.textContent = inProg;

      const compEl = document.getElementById('home-stat-completed');
      if (compEl) compEl.textContent = comp;

      if (tbody) {
        if (complaints.length === 0) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-dim);">No complaints recorded yet. Click "Report New Issue" to file a complaint.</td></tr>';
        } else {
          tbody.innerHTML = complaints.map(c => {
            return `
              <tr>
                <td><strong>#${c.complaint_number}</strong></td>
                <td>
                  <img src="${c.image_url || '/assets/sample-pothole.jpg'}" alt="photo" style="width: 48px; height: 36px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border-color);">
                </td>
                <td>
                  <div style="font-weight: 700; color: var(--civic-dark);">${App.getIssueEmoji(c.issue_type)} ${c.issue_type}</div>
                  <div style="font-size: 0.75rem; color: var(--text-dim);">${c.department}</div>
                </td>
                <td>
                  <span class="badge-severity ${c.severity}">${c.severity}</span>
                </td>
                <td>
                  <div style="font-size: 0.85rem;">${c.location_name || 'Corridor'}</div>
                  <div style="font-size: 0.72rem; color: var(--text-dim);">${c.ward_district || 'District'}</div>
                </td>
                <td>
                  <div style="font-size: 0.8rem; color: var(--text-dim);">${App.formatDate(c.reported_at)}</div>
                </td>
                <td>
                  <span class="badge-status ${c.status}">${c.status.replace('_', ' ')}</span>
                </td>
                <td>
                  <button class="btn-action-sm" onclick="App.trackComplaint('${c.complaint_number}')">
                    🔍 Track
                  </button>
                </td>
              </tr>
            `;
          }).join('');
        }
      }

      if (!container) return;

      if (complaints.length === 0) {
        container.innerHTML = `
          <div class="empty-state-box">
            <div class="empty-state-icon">📭</div>
            <div class="empty-state-title">My Reports: 0</div>
            <div class="empty-state-desc">
              You haven't reported any public infrastructure defects yet. When you submit a complaint, it will appear here and on your private map.
            </div>
            <button type="button" class="btn-action-primary" onclick="App.switchTab('detection-tab')" style="display: inline-flex; align-items: center; gap: 8px;">
              <span>📸</span> Report Your First Issue
            </button>
          </div>
        `;
        return;
      }

      container.innerHTML = complaints.map(c => {
        const isReported = true;
        const isAssigned = c.status === 'ASSIGNED' || c.status === 'IN_PROGRESS' || c.status === 'COMPLETED';
        const isInProgress = c.status === 'IN_PROGRESS' || c.status === 'COMPLETED';
        const isCompleted = c.status === 'COMPLETED';

        const priorityLabel = c.priority_level || 'MEDIUM';

        return `
          <div class="complaint-citizen-card">
            <div class="complaint-card-header">
              <div>
                <div class="complaint-card-title">
                  <span>${this.getIssueEmoji(c.issue_type)}</span>
                  <span>${c.issue_type}</span>
                  <span class="badge-severity ${priorityLabel}" style="font-size: 0.72rem;">${priorityLabel}</span>
                  <span class="ai-assisted-tag" style="font-size: 0.68rem;">AI-Assisted</span>
                </div>
                <div class="complaint-card-meta">
                  Ticket #${c.complaint_number} • Reported on ${this.formatDate(c.reported_at)} • 📍 ${c.location_name || 'Civic Area'}
                </div>
              </div>
              <div>
                <span class="badge-status ${c.status}">${c.status.replace('_', ' ')}</span>
              </div>
            </div>

            <!-- Visual 4-Step Progress Tracker -->
            <div class="workflow-tracker">
              <div class="workflow-step-line"></div>
              
              <div class="workflow-step ${isReported ? (c.status === 'REPORTED' ? 'current' : 'completed') : ''}">
                <div class="workflow-step-circle">1</div>
                <div class="workflow-step-label">REPORTED</div>
              </div>

              <div class="workflow-step ${isAssigned ? (c.status === 'ASSIGNED' ? 'current' : 'completed') : ''}">
                <div class="workflow-step-circle">2</div>
                <div class="workflow-step-label">ASSIGNED</div>
              </div>

              <div class="workflow-step ${isInProgress ? (c.status === 'IN_PROGRESS' ? 'current' : 'completed') : ''}">
                <div class="workflow-step-circle">3</div>
                <div class="workflow-step-label">IN PROGRESS</div>
              </div>

              <div class="workflow-step ${isCompleted ? 'completed current' : ''}">
                <div class="workflow-step-circle">✓</div>
                <div class="workflow-step-label">COMPLETED</div>
              </div>
            </div>

            <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4; background: rgba(0,0,0,0.25); padding: 8px 12px; border-radius: var(--radius-sm);">
              <strong>Description:</strong> ${c.description || 'Public infrastructure issue reported.'}
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; flex-wrap: wrap; gap: 8px;">
              <div style="font-size: 0.78rem; color: var(--text-dim);">
                ${c.team_name ? `Assigned Crew: <strong>${c.team_name}</strong>` : 'Awaiting maintenance crew assignment'}
              </div>
              <button class="btn-action-sm" onclick="App.trackComplaint('${c.complaint_number}')">
                <span>🔍</span> Track Full Details
              </button>
            </div>
          </div>
        `;
      }).join('');

    } catch (err) {
      console.error('Failed to load my complaints:', err);
    }
  },

  async trackComplaintFromInput() {
    const input = document.getElementById('track-ticket-input');
    if (!input || !input.value.trim()) {
      this.showToast('Please enter a complaint ticket number.', 'warning');
      return;
    }
    await this.trackComplaint(input.value.trim());
  },

  
  handleTrackSubmit(e) {
    if (e) e.preventDefault();
    const input = document.getElementById('track-input');
    const val = (input?.value || '').trim();
    if (!val) {
      this.showToast('Please enter a complaint ticket number.', 'warning');
      return;
    }
    this.trackComplaint(val);
  },

  async trackComplaint(ticketOrId) {
    this.switchTab('track-tab');
    const container = document.getElementById('track-result-container');
    if (!container) return;

    container.style.display = 'block';
    container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Fetching complaint history...</div>';

    try {
      const res = await fetch(`/api/complaints/${ticketOrId}`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        container.innerHTML = `
          <div class="empty-state-box">
            <div class="empty-state-icon">❓</div>
            <div class="empty-state-title">Complaint Not Found</div>
            <div class="empty-state-desc">No complaint matching "${ticketOrId}" was found in the municipal registry.</div>
          </div>
        `;
        return;
      }

      const c = json.data;
      const isReported = true;
      const isAssigned = c.status === 'ASSIGNED' || c.status === 'IN_PROGRESS' || c.status === 'COMPLETED';
      const isInProgress = c.status === 'IN_PROGRESS' || c.status === 'COMPLETED';
      const isCompleted = c.status === 'COMPLETED';

      container.innerHTML = `
        <div class="card" style="margin-bottom: 1.5rem;">
          <div class="card-header">
            <div>
              <div style="font-size: 1.25rem; font-weight: 800; color: #fff;">
                ${this.getIssueEmoji(c.issue_type)} ${c.issue_type}
              </div>
              <div style="font-size: 0.8rem; color: var(--text-dim); margin-top: 4px;">
                Ticket #${c.complaint_number} • Reported on ${this.formatDate(c.reported_at)}
              </div>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <span class="badge-severity ${c.priority_level || 'MEDIUM'}">${c.priority_level || 'MEDIUM'} PRIORITY</span>
              <span class="ai-assisted-tag">AI-Assisted</span>
              <span class="badge-status ${c.status}">${c.status}</span>
            </div>
          </div>

          <!-- Progress Stepper -->
          <div class="workflow-tracker" style="margin: 1.5rem 0;">
            <div class="workflow-step-line"></div>
            
            <div class="workflow-step ${isReported ? (c.status === 'REPORTED' ? 'current' : 'completed') : ''}">
              <div class="workflow-step-circle">1</div>
              <div class="workflow-step-label">REPORTED</div>
            </div>

            <div class="workflow-step ${isAssigned ? (c.status === 'ASSIGNED' ? 'current' : 'completed') : ''}">
              <div class="workflow-step-circle">2</div>
              <div class="workflow-step-label">ASSIGNED</div>
            </div>

            <div class="workflow-step ${isInProgress ? (c.status === 'IN_PROGRESS' ? 'current' : 'completed') : ''}">
              <div class="workflow-step-circle">3</div>
              <div class="workflow-step-label">IN PROGRESS</div>
            </div>

            <div class="workflow-step ${isCompleted ? 'completed current' : ''}">
              <div class="workflow-step-circle">✓</div>
              <div class="workflow-step-label">COMPLETED</div>
            </div>
          </div>

          <!-- Details Grid -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin: 1rem 0;">
            <div style="background: rgba(15, 23, 42, 0.6); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
              <div style="font-size: 0.72rem; color: var(--text-dim);">Location</div>
              <div style="font-weight: 600; color: #fff; margin-top: 4px;">${c.location_name || 'Civic Area'} (${c.ward_district || 'District'})</div>
            </div>

            <div style="background: rgba(15, 23, 42, 0.6); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
              <div style="font-size: 0.72rem; color: var(--text-dim);">Assigned Maintenance Crew</div>
              <div style="font-weight: 600; color: #fff; margin-top: 4px;">${c.team_name || 'Not yet dispatched'}</div>
            </div>

            <div style="background: rgba(15, 23, 42, 0.6); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
              <div style="font-size: 0.72rem; color: var(--text-dim);">Scheduled Date</div>
              <div style="font-weight: 600; color: #fff; margin-top: 4px;">${c.scheduled_date || 'Standard operational queue'}</div>
            </div>
          </div>

          <!-- Initial Image vs Completion Image (AI Before / After) -->
          ${c.images && c.images.length > 0 ? `
            <div style="margin-top: 1.25rem;">
              <h4 style="font-size: 0.95rem; color: #fff; margin-bottom: 8px;">Inspection Imagery</h4>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem;">
                ${c.images.map(img => `
                  <div style="background: #000; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--border-color);">
                    <img src="${img.file_path}" alt="${img.image_type}" style="width: 100%; height: 180px; object-fit: cover;">
                    <div style="padding: 8px; font-size: 0.75rem; color: var(--text-muted); display: flex; justify-content: space-between;">
                      <span>${img.image_type.replace('_', ' ')}</span>
                      <span>${App.formatDate(img.uploaded_at)}</span>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Maintenance History Notes if Completed -->
          ${c.history && c.history.length > 0 ? `
            <div style="margin-top: 1.25rem; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: var(--radius-sm); padding: 1rem;">
              <div style="font-weight: 700; color: var(--success); font-size: 0.9rem; margin-bottom: 4px;">
                ✅ Certified Restoration Completed
              </div>
              <div style="font-size: 0.85rem; color: var(--text-muted);">
                Action Taken: ${c.history[0].action_taken}
              </div>
              <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 6px;">
                Certified by: ${c.history[0].performed_by} on ${App.formatDate(c.history[0].completed_at)}
              </div>
            </div>
          ` : ''}

        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="empty-state-box"><div class="empty-state-title">Error loading complaint details</div></div>`;
    }
  },

  getIssueEmoji(type) {
    if (!type) return '⚠️';
    const lower = type.toLowerCase();
    if (lower.includes('pothole')) return '🕳️';
    if (lower.includes('light')) return '💡';
    if (lower.includes('crack')) return '⚡';
    if (lower.includes('sidewalk') || lower.includes('footpath')) return '🚶';
    if (lower.includes('garbage') || lower.includes('waste')) return '🗑️';
    if (lower.includes('water') || lower.includes('leak')) return '💧';
    if (lower.includes('drain')) return '🚰';
    if (lower.includes('infrastructure') || lower.includes('building')) return '🏢';
    if (lower.includes('sign')) return '🛑';
    return '⚠️';
  },

  formatDate(dateStr) {
    if (!dateStr) return 'Recently';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    else if (type === 'error') icon = '❌';
    else if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }
};

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
