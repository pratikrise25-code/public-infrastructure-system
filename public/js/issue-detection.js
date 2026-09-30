/**
 * NagarDrishti AI — AI Issue Detection & Citizen Reporting Workflow
 * Upload Photo -> AI Detects Issue -> AI Shows Severity in Simple Words -> Real GPS Location Pinpointed -> Complaint Created -> Added to My Map
 */
const IssueDetection = {
  currentFile: null,
  currentSamplePath: null,
  currentImageUrl: null,
  latestAiResult: null,
  currentGps: null,
  miniMap: null,
  miniMapMarker: null,

  init() {
    this.setupUploadHandlers();
    this.setupSampleChips();
    this.setupComplaintForm();
    this.checkStoredApiKey();
  },

  checkStoredApiKey() {
    const key = localStorage.getItem('nagardrishti_gemini_key');
    const btn = document.getElementById('btn-config-ai-key');
    if (btn && key) {
      btn.innerHTML = '<span>⚡</span> Live Gemini Active';
      btn.style.borderColor = '#10b981';
      btn.style.color = '#10b981';
    }
  },

  openApiKeyModal() {
    const modal = document.getElementById('gemini-key-modal');
    const input = document.getElementById('input-gemini-key');
    if (modal) modal.style.display = 'flex';
    if (input) input.value = localStorage.getItem('nagardrishti_gemini_key') || '';
  },

  closeApiKeyModal() {
    const modal = document.getElementById('gemini-key-modal');
    if (modal) modal.style.display = 'none';
  },

  saveApiKey() {
    const input = document.getElementById('input-gemini-key');
    const val = (input?.value || '').trim();
    if (val) {
      localStorage.setItem('nagardrishti_gemini_key', val);
      App.showToast('Google Gemini Live Vision AI activated!', 'success');
    } else {
      localStorage.removeItem('nagardrishti_gemini_key');
      App.showToast('Using NagarDrishti Built-in Vision Engine', 'info');
    }
    this.checkStoredApiKey();
    this.closeApiKeyModal();
  },

  clearApiKey() {
    localStorage.removeItem('nagardrishti_gemini_key');
    const input = document.getElementById('input-gemini-key');
    if (input) input.value = '';
    const btn = document.getElementById('btn-config-ai-key');
    if (btn) {
      btn.innerHTML = '<span>⚙️</span> AI Vision Key';
      btn.style.borderColor = 'rgba(56,189,248,0.4)';
      btn.style.color = '';
    }
    App.showToast('API Key removed. Switched to Built-in Vision Engine.', 'info');
    this.closeApiKeyModal();
  },

  setupUploadHandlers() {
    const dropZone = document.getElementById('upload-dropzone');
    const fileInput = document.getElementById('file-upload-input');
    const selectBtn = document.getElementById('btn-select-file');

    if (!dropZone || !fileInput) return;

    selectBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });

    dropZone.addEventListener('click', () => {
      fileInput.click();
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('dragover');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        this.handleFileSelected(files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        this.handleFileSelected(e.target.files[0]);
      }
    });
  },

  handleFileSelected(file) {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      App.showToast('Please upload a JPG, JPEG, or PNG image photo.', 'error');
      return;
    }

    const maxSize = 15 * 1024 * 1024;
    if (file.size > maxSize) {
      App.showToast('Image size exceeds 15MB limit. Please upload a smaller photo.', 'error');
      return;
    }

    this.currentFile = file;
    this.currentSamplePath = null;

    const reader = new FileReader();
    reader.onload = (e) => {
      this.displayPreview(e.target.result, file.name, (file.size / 1024).toFixed(1) + ' KB');
      this.runAiAnalysis();
    };
    reader.readAsDataURL(file);

    document.querySelectorAll('.sample-chip').forEach(c => c.classList.remove('active'));
  },

  setupSampleChips() {
    const chips = document.querySelectorAll('.sample-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', (e) => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        const samplePath = chip.getAttribute('data-sample');
        const sampleName = chip.getAttribute('data-name');

        this.currentFile = null;
        this.currentSamplePath = samplePath;

        this.displayPreview(samplePath, sampleName, 'Municipal Sample Asset');
        this.runAiAnalysis();
      });
    });
  },

  displayPreview(src, filename, sizeLabel) {
    const previewContainer = document.getElementById('image-preview-container');
    const previewImg = document.getElementById('image-preview-element');
    const previewName = document.getElementById('preview-file-name');
    const previewSize = document.getElementById('preview-file-size');

    if (previewImg) previewImg.src = src;
    if (previewName) previewName.textContent = filename || 'photo.jpg';
    if (previewSize) previewSize.textContent = sizeLabel || '';
    if (previewContainer) previewContainer.style.display = 'flex';
  },

  async runAiAnalysis() {
    const scanOverlay = document.getElementById('scan-overlay-element');
    if (scanOverlay) scanOverlay.classList.add('scanning');
    App.showToast('AI Vision analyzing infrastructure defect...', 'info');

    try {
      const formData = new FormData();
      if (this.currentFile) {
        formData.append('image', this.currentFile);
      } else if (this.currentSamplePath) {
        formData.append('samplePath', this.currentSamplePath);
      } else {
        return;
      }

      const headers = {};
      const userKey = localStorage.getItem('nagardrishti_gemini_key');
      if (userKey) {
        headers['x-gemini-api-key'] = userKey;
      }

      const response = await fetch('/api/ai/analyze-image', {
        method: 'POST',
        headers,
        body: formData
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || result.details || 'Analysis failed');
      }

      this.latestAiResult = result.data;
      this.currentImageUrl = result.data.imageUrl;

      // Render Simple Words Result Panel
      this.renderSimpleResult(result.data);

      // Pre-fill the 5-field form automatically
      this.autoFillForm(result.data);

      App.showToast(`AI Detected: ${result.data.simpleIssue || result.data.issueType} (${result.data.severity} Severity)`, 'success');
    } catch (err) {
      console.error('AI Analysis failed:', err);
      App.showToast(`AI Analysis error: ${err.message}`, 'error');
    } finally {
      if (scanOverlay) scanOverlay.classList.remove('scanning');
    }
  },

  renderSimpleResult(data) {
    const box = document.getElementById('ai-simple-result-box');
    if (!box) return;

    box.style.display = 'block';

    const titleEl = document.getElementById('simple-detected-title');
    const sevBadge = document.getElementById('simple-severity-badge');
    const confEl = document.getElementById('simple-confidence-badge');
    const expEl = document.getElementById('simple-detected-explanation');
    const provEl = document.getElementById('simple-provider-info');

    if (titleEl) titleEl.textContent = data.simpleIssue || `${data.issueType} Detected`;
    
    if (sevBadge) {
      const sev = data.severity || 'MEDIUM';
      sevBadge.className = `badge-severity ${sev}`;
      sevBadge.textContent = `${sev} SEVERITY`;
    }

    if (confEl) {
      confEl.textContent = `${Math.round(data.confidence || 92)}% Confidence`;
    }

    if (expEl) {
      expEl.textContent = data.simpleExplanation || data.description || 'Defect detected by visual inspection.';
    }

    if (provEl) {
      provEl.textContent = `Analyzed by: ${data.provider || 'AI Vision Engine'} (AI-Assisted)`;
    }

    // Highlight matching chip
    document.querySelectorAll('.btn-category-chip').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-issue') === data.issueType);
    });

    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  autoFillForm(data) {
    const issueSelect = document.getElementById('complaint-issue-type');
    if (issueSelect) {
      const val = data.issueType;
      let matched = false;
      for (let i = 0; i < issueSelect.options.length; i++) {
        if (issueSelect.options[i].value.toLowerCase() === val.toLowerCase()) {
          issueSelect.selectedIndex = i;
          matched = true;
          break;
        }
      }
      if (!matched && issueSelect.options.length > 0) {
        issueSelect.value = val;
      }
    }

    const sevInput = document.getElementById('complaint-severity');
    if (sevInput) sevInput.value = data.severity;

    const deptInput = document.getElementById('complaint-department');
    if (deptInput) deptInput.value = data.department;

    const descInput = document.getElementById('complaint-description');
    if (descInput) {
      descInput.value = data.simpleExplanation || data.description || '';
    }
  },

  /**
   * 1-Tap Category Override & Calibration
   */
  overrideCategory(issueType) {
    const severities = {
      'Pothole': 'CRITICAL',
      'Water leakage': 'CRITICAL',
      'Broken streetlight': 'HIGH',
      'Damaged public building': 'HIGH',
      'Road crack': 'MEDIUM',
      'Damaged sidewalk': 'MEDIUM',
      'Garbage accumulation': 'MEDIUM',
      'Other infrastructure damage': 'MEDIUM'
    };

    const departments = {
      'Pothole': 'Roads & Bridges',
      'Road crack': 'Roads & Bridges',
      'Damaged sidewalk': 'Roads & Bridges',
      'Broken streetlight': 'Electrical & Lighting',
      'Water leakage': 'Water & Sewerage',
      'Garbage accumulation': 'Public Works & Sanitation',
      'Damaged public building': 'Municipal Buildings'
    };

    const explanations = {
      'Pothole': 'Road surface cavity observed. Urgent cold-asphalt patching required to prevent vehicle rim fractures.',
      'Road crack': 'Longitudinal pavement distress fissures detected. Bitumen sealing needed to prevent water seepage.',
      'Broken streetlight': 'Damaged or unlit street luminaire fixture compromising nighttime citizen safety.',
      'Water leakage': 'Pressurized municipal water line seepage or drain overflow flooding road foundation.',
      'Damaged sidewalk': 'Uneven or fractured interlocking paving blocks creating pedestrian trip hazard.',
      'Garbage accumulation': 'Civic waste pile obstructing pedestrian thoroughfare and storm drains.',
      'Damaged public building': 'Visible masonry spalling or plaster fracture on municipal civic facility.'
    };

    const sev = severities[issueType] || 'MEDIUM';
    const dept = departments[issueType] || 'Roads & Bridges';
    const exp = explanations[issueType] || 'Defect verified by citizen calibration.';

    const updated = {
      issueType,
      severity: sev,
      department: dept,
      confidence: 97.0,
      description: exp,
      simpleIssue: `${issueType} detected`,
      simpleSeverity: `${sev} Priority`,
      simpleExplanation: exp,
      provider: 'NagarDrishti Calibrated Vision Model'
    };

    this.latestAiResult = { ...(this.latestAiResult || {}), ...updated };
    this.renderSimpleResult(updated);
    this.autoFillForm(updated);

    App.showToast(`Issue calibrated to: ${issueType} (${sev} Priority)`, 'success');
  },

  /**
   * REAL-TIME GPS GEOLOCATION ENGINE
   */
  async useCurrentLocation() {
    const gpsBtn = document.getElementById('btn-use-gps');
    const statusContainer = document.getElementById('gps-status-container');
    const statusIndicator = document.getElementById('gps-status-indicator');
    const addressEl = document.getElementById('gps-resolved-address');

    if (gpsBtn) {
      gpsBtn.disabled = true;
      gpsBtn.innerHTML = '<span>📡</span> Detecting GPS...';
    }

    if (statusContainer) statusContainer.style.display = 'block';
    if (statusIndicator) {
      statusIndicator.textContent = '📡 Acquiring GPS Satellites...';
      statusIndicator.style.color = '#38bdf8';
    }
    if (addressEl) {
      addressEl.innerHTML = '<em>Contacting device GPS sensor and satellites...</em>';
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const acc = Math.round(position.coords.accuracy || 15);

          await this.applyCoordinates(lat, lng, acc, 'Real Device GPS');

          if (gpsBtn) {
            gpsBtn.disabled = false;
            gpsBtn.innerHTML = '<span>✅</span> GPS Active';
          }
        },
        async (err) => {
          console.warn('HTML5 Geolocation error:', err.message, 'Falling back to IP geolocation...');
          await this.fallbackIpGeolocation();
          if (gpsBtn) {
            gpsBtn.disabled = false;
            gpsBtn.innerHTML = '<span>📍</span> Use My GPS Location';
          }
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    } else {
      await this.fallbackIpGeolocation();
      if (gpsBtn) {
        gpsBtn.disabled = false;
        gpsBtn.innerHTML = '<span>📍</span> Use My GPS Location';
      }
    }
  },

  async fallbackIpGeolocation() {
    const addressEl = document.getElementById('gps-resolved-address');
    const statusIndicator = document.getElementById('gps-status-indicator');
    if (addressEl) addressEl.innerHTML = '<em>Device GPS permission unavailable. Estimating location via Network IP...</em>';

    try {
      const res = await fetch('https://ipwho.is/');
      const data = await res.json();
      if (data.success && data.latitude && data.longitude) {
        await this.applyCoordinates(data.latitude, data.longitude, 500, 'Network IP (Approximate)');
        App.showToast(`Approximate location found: ${data.city || 'Your City'}. Click map to refine.`, 'info');
      } else {
        throw new Error('IP Geolocation not available');
      }
    } catch (e) {
      await this.applyCoordinates(12.9716, 77.5946, 100, 'City Center');
      App.showToast('Location estimated. Please click on the mini-map to pinpoint the exact spot.', 'info');
    }
  },

  async applyCoordinates(lat, lng, accuracy, source) {
    this.currentGps = { lat, lng, accuracy };

    const statusIndicator = document.getElementById('gps-status-indicator');
    const accuracyBadge = document.getElementById('gps-accuracy-badge');
    const addressEl = document.getElementById('gps-resolved-address');
    const locSelect = document.getElementById('complaint-location-select');

    if (statusIndicator) {
      statusIndicator.textContent = `✅ GPS Pinpointed (${source})`;
      statusIndicator.style.color = '#10b981';
    }
    if (accuracyBadge) {
      accuracyBadge.textContent = `±${accuracy}m accuracy`;
    }

    let resolvedAddress = `GPS Coordinates: ${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E`;
    try {
      const nomRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, {
        headers: { 'Accept': 'application/json' }
      });
      const nomData = await nomRes.json();
      if (nomData && nomData.display_name) {
        resolvedAddress = nomData.display_name;
      }
    } catch (err) {
      console.warn('Reverse lookup failed:', err);
    }

    this.currentGps.address = resolvedAddress;

    if (addressEl) {
      const shortAddr = resolvedAddress.split(',').slice(0, 3).join(', ');
      addressEl.innerHTML = `<strong>📍 Real Location:</strong> ${shortAddr} <br><span style="font-size: 0.74rem; color: var(--text-dim);">${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E</span>`;
    }

    if (locSelect) {
      let gpsOption = document.getElementById('dynamic-gps-option');
      if (!gpsOption) {
        gpsOption = document.createElement('option');
        gpsOption.id = 'dynamic-gps-option';
        locSelect.insertBefore(gpsOption, locSelect.options[1]);
      }
      gpsOption.value = 'gps-custom';
      gpsOption.textContent = `📍 Real GPS: ${resolvedAddress.split(',')[0]} (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
      locSelect.value = 'gps-custom';
    }

    this.renderMiniMap(lat, lng);
  },

  renderMiniMap(lat, lng) {
    const mapEl = document.getElementById('gps-mini-map');
    if (!mapEl || typeof L === 'undefined') return;

    if (!this.miniMap) {
      this.miniMap = L.map('gps-mini-map', {
        center: [lat, lng],
        zoom: 16,
        zoomControl: true,
        attributionControl: false
      });

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(this.miniMap);

      const pinIcon = L.divIcon({
        className: 'custom-gps-pin',
        html: `<div style="background: #ef4444; width: 26px; height: 26px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 10px rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 13px; font-weight: bold;">📍</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });

      this.miniMapMarker = L.marker([lat, lng], { draggable: true, icon: pinIcon }).addTo(this.miniMap);

      this.miniMapMarker.on('dragend', async (e) => {
        const newPos = e.target.getLatLng();
        await this.applyCoordinates(newPos.lat, newPos.lng, 10, 'Pin Repositioned');
      });

      this.miniMap.on('click', async (e) => {
        this.miniMapMarker.setLatLng(e.latlng);
        await this.applyCoordinates(e.latlng.lat, e.latlng.lng, 10, 'Map Clicked');
      });
    } else {
      this.miniMap.setView([lat, lng], 16);
      if (this.miniMapMarker) {
        this.miniMapMarker.setLatLng([lat, lng]);
      }
    }

    setTimeout(() => {
      if (this.miniMap) this.miniMap.invalidateSize();
    }, 250);
  },

  clearGps() {
    this.currentGps = null;
    const container = document.getElementById('gps-status-container');
    if (container) container.style.display = 'none';
    const dynamicOpt = document.getElementById('dynamic-gps-option');
    if (dynamicOpt) dynamicOpt.remove();
    const locSelect = document.getElementById('complaint-location-select');
    if (locSelect) locSelect.selectedIndex = 0;
    const gpsBtn = document.getElementById('btn-use-gps');
    if (gpsBtn) {
      gpsBtn.disabled = false;
      gpsBtn.innerHTML = '<span>📍</span> Use My GPS Location';
    }
    App.showToast('GPS reset. Please select a ward.', 'info');
  },

  setupComplaintForm() {
    const form = document.getElementById('citizen-complaint-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!this.currentImageUrl && !this.currentFile && !this.currentSamplePath) {
        App.showToast('Please upload a photo of the problem first.', 'warning');
        return;
      }

      const locationSelect = document.getElementById('complaint-location-select');
      if (!locationSelect || !locationSelect.value) {
        App.showToast('Please select or detect a location.', 'warning');
        locationSelect?.focus();
        return;
      }

      const submitBtn = document.getElementById('btn-submit-complaint');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>⏳</span> Registering Complaint & Calculating AI Priority...';

      try {
        const payload = {
          userId: App.currentUser.id,
          issueType: document.getElementById('complaint-issue-type').value,
          severity: document.getElementById('complaint-severity')?.value || 'MEDIUM',
          department: document.getElementById('complaint-department')?.value || 'Roads & Bridges',
          locationId: locationSelect.value === 'gps-custom' ? null : locationSelect.value,
          description: document.getElementById('complaint-description')?.value || 'Citizen reported infrastructure defect.',
          citizenName: App.currentUser.name,
          citizenPhone: App.currentUser.phone,
          citizenEmail: App.currentUser.email,
          imageUrl: this.currentImageUrl || (this.currentSamplePath || '/assets/sample-pothole.jpg'),
          isAiAssisted: true,
          aiConfidence: this.latestAiResult ? this.latestAiResult.confidence : 92.0,
          aiProvider: this.latestAiResult ? this.latestAiResult.provider : 'AI Vision Module'
        };

        if (this.currentGps) {
          payload.latitude = this.currentGps.lat;
          payload.longitude = this.currentGps.lng;
          payload.address = this.currentGps.address;
        }

        const response = await fetch('/api/complaints', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': String(App.currentUser.id)
          },
          body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to submit complaint');
        }

        App.currentUser.complaintCount = result.userComplaintCount;
        const counterEl = document.getElementById('current-user-counter');
        if (counterEl) counterEl.textContent = `${result.userComplaintCount} Reports`;

        const mapCountBadge = document.getElementById('my-map-reports-count');
        if (mapCountBadge) mapCountBadge.textContent = result.userComplaintCount;

        const priorityLevel = result.priority?.priorityLevel || 'MEDIUM';

        App.showToast(`Complaint registered! Ticket #${result.complaintNumber} with Priority: ${priorityLevel} (AI-Assisted)`, 'success');

        form.reset();
        document.getElementById('ai-simple-result-box').style.display = 'none';
        document.getElementById('image-preview-container').style.display = 'none';
        this.clearGps();
        this.currentFile = null;
        this.currentSamplePath = null;
        this.currentImageUrl = null;
        this.latestAiResult = null;

        setTimeout(() => {
          App.switchTab('my-complaints-tab');
        }, 1200);

      } catch (err) {
        console.error('Submission failed:', err);
        App.showToast(`Submission failed: ${err.message}`, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>🚀</span> Submit Complaint';
      }
    });
  }
};

window.IssueDetection = IssueDetection;
document.addEventListener('DOMContentLoaded', () => IssueDetection.init());
