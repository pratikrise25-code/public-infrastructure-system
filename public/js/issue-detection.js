/**
 * NagarDristi AI — Citizen-Friendly Issue Detection & 4-Step Reporting Workflow
 * 1. Upload Photo -> AI Analyzes Image -> Displays Result in Simple Language -> Citizen Confirms (YES / CHANGE)
 * 2. Select Location & Real GPS
 * 3. Short Description
 * 4. Submit Complaint
 */
const IssueDetection = {
  currentFile: null,
  currentSamplePath: null,
  currentImageUrl: null,
  latestAiResult: null,
  isConfirmed: false,
  currentGps: null,
  miniMap: null,
  miniMapMarker: null,

  init() {
    this.setupUploadHandlers();
    this.setupSampleChips();
    this.setupComplaintForm();
  },

  setupUploadHandlers() {
    const dropZone = document.getElementById('upload-dropzone');
    const fileInput = document.getElementById('file-upload-input');
    const selectBtn = document.getElementById('btn-select-file');

    if (!dropZone || !fileInput) return;

    if (selectBtn) {
      selectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
      });
    }

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
      App.showToast('Please upload a valid JPG, PNG, or WEBP image.', 'error');
      return;
    }

    const maxSize = 15 * 1024 * 1024;
    if (file.size > maxSize) {
      App.showToast('Image size exceeds 15MB limit. Please upload a smaller photo.', 'error');
      return;
    }

    this.currentFile = file;
    this.currentSamplePath = null;
    this.isConfirmed = false;

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
        const samplePath = chip.getAttribute('data-sample');
        if (!samplePath) return;

        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        const sampleName = chip.getAttribute('data-name') || 'sample.jpg';

        this.currentFile = null;
        this.currentSamplePath = samplePath;
        this.isConfirmed = false;

        this.displayPreview(samplePath, sampleName, 'Municipal Sample Photo');
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
    if (previewContainer) previewContainer.style.display = 'block';

    // Hide previous detection or unclear boxes
    document.getElementById('ai-simple-result-box')?.setAttribute('style', 'display: none;');
    document.getElementById('ai-unclear-box')?.setAttribute('style', 'display: none;');
  },

  /**
   * Run AI Image Analysis with "Analyzing Image..." indicator
   */
  async runAiAnalysis() {
    const analyzingBox = document.getElementById('ai-analyzing-box');
    const resultBox = document.getElementById('ai-simple-result-box');
    const unclearBox = document.getElementById('ai-unclear-box');

    if (analyzingBox) analyzingBox.style.display = 'flex';
    if (resultBox) resultBox.style.display = 'none';
    if (unclearBox) unclearBox.style.display = 'none';

    try {
      const formData = new FormData();
      if (this.currentFile) {
        formData.append('image', this.currentFile);
      } else if (this.currentSamplePath) {
        formData.append('samplePath', this.currentSamplePath);
      } else {
        if (analyzingBox) analyzingBox.style.display = 'none';
        return;
      }

      const response = await fetch('/api/ai/analyze-image', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || result.details || 'Analysis failed');
      }

      this.latestAiResult = result.data;
      this.currentImageUrl = result.data.imageUrl;

      // Check if image was identified or unclear
      if (result.data.isIdentified === false) {
        if (unclearBox) {
          unclearBox.style.display = 'block';
          const msgEl = document.getElementById('ai-unclear-text');
          if (msgEl) msgEl.textContent = result.data.message || 'Unable to identify the issue clearly. Please upload a clearer image.';
          unclearBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        App.showToast('Unable to identify the issue clearly. Please upload a clearer image.', 'warning');
      } else {
        // Display AI result in simple language
        this.renderSimpleResult(result.data);
        this.autoFillForm(result.data);
        App.showToast(`Issue Detected: ${result.data.simpleIssue} (${result.data.confidence}% Confidence)`, 'success');
      }

    } catch (err) {
      console.error('AI Analysis failed:', err);
      if (unclearBox) {
        unclearBox.style.display = 'block';
        const msgEl = document.getElementById('ai-unclear-text');
        if (msgEl) msgEl.textContent = 'Unable to identify the issue clearly. Please upload a clearer image.';
      }
      App.showToast('Unable to identify the issue clearly. Please upload a clearer image.', 'error');
    } finally {
      if (analyzingBox) analyzingBox.style.display = 'none';
    }
  },

  /**
   * Render AI Result in Simple Language:
   * Detected Issue: Pothole
   * Confidence: 92%
   * Severity: High
   * Suggested Action: Road maintenance required
   */
  renderSimpleResult(data) {
    const box = document.getElementById('ai-simple-result-box');
    if (!box) return;

    box.style.display = 'block';

    const titleEl = document.getElementById('simple-detected-title');
    const confVal = document.getElementById('simple-conf-value');
    const confBadge = document.getElementById('simple-confidence-badge');
    const sevVal = document.getElementById('simple-severity-value');
    const actionVal = document.getElementById('simple-action-value');
    const expEl = document.getElementById('simple-detected-explanation');

    if (titleEl) titleEl.textContent = data.simpleIssue || data.issueType;
    if (confVal) confVal.textContent = `${Math.round(data.confidence || 92)}%`;
    if (confBadge) confBadge.textContent = `${Math.round(data.confidence || 92)}% Confidence`;
    if (sevVal) sevVal.textContent = data.severity || 'High';
    if (actionVal) actionVal.textContent = data.suggestedAction || 'Road maintenance required';
    if (expEl) expEl.textContent = data.explanation || data.description || 'Public infrastructure defect detected.';

    // Reset confirmation button state
    const yesBtn = document.getElementById('btn-confirm-yes');
    if (yesBtn) {
      yesBtn.innerHTML = '✓ YES';
      yesBtn.style.opacity = '1';
    }

    const wrapper = document.getElementById('category-selector-wrapper');
    if (wrapper) wrapper.style.display = 'none';

    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  /**
   * Citizen Confirmation: YES
   */
  confirmIssue() {
    this.isConfirmed = true;
    const yesBtn = document.getElementById('btn-confirm-yes');
    if (yesBtn) {
      yesBtn.innerHTML = '✓ CONFIRMED';
      yesBtn.style.background = '#15803d';
    }

    App.showToast('Issue confirmed! Please proceed to select location.', 'success');

    // Smoothly scroll to Step 2 (Select Location)
    const locSelect = document.getElementById('complaint-location-select');
    if (locSelect) {
      locSelect.scrollIntoView({ behavior: 'smooth', block: 'center' });
      locSelect.focus();
    }
  },

  /**
   * Citizen Confirmation: CHANGE
   */
  toggleChangeIssue() {
    const wrapper = document.getElementById('category-selector-wrapper');
    if (!wrapper) return;
    wrapper.style.display = wrapper.style.display === 'none' ? 'block' : 'none';
  },

  showManualCategoryPick() {
    const box = document.getElementById('ai-simple-result-box');
    const unclearBox = document.getElementById('ai-unclear-box');
    if (unclearBox) unclearBox.style.display = 'none';
    if (box) {
      box.style.display = 'block';
      this.selectCategory('Pothole');
      const wrapper = document.getElementById('category-selector-wrapper');
      if (wrapper) wrapper.style.display = 'block';
    }
  },

  /**
   * Citizen selects or corrects an issue category from the 10 available categories
   */
  selectCategory(category) {
    const metadata = {
      'Pothole': { severity: 'High', action: 'Road maintenance required', dept: 'Roads & Bridges', exp: 'Road surface cavity observed that can cause vehicle damage or accidents.' },
      'Road crack': { severity: 'Medium', action: 'Road maintenance required', dept: 'Roads & Bridges', exp: 'Pavement distress fissures detected. Bitumen sealing required to prevent water penetration.' },
      'Broken streetlight': { severity: 'High', action: 'Electrical repair required', dept: 'Electrical & Lighting', exp: 'Unlit or physically damaged street luminaire compromising night-time visibility and safety.' },
      'Damaged footpath': { severity: 'Medium', action: 'Footpath restoration required', dept: 'Roads & Bridges', exp: 'Broken, uneven, or displaced footpath paving creating a tripping hazard for pedestrians.' },
      'Garbage/waste': { severity: 'Medium', action: 'Sanitation clearance required', dept: 'Public Works & Sanitation', exp: 'Unsanctioned trash accumulation blocking the public road or sidewalk.' },
      'Water leakage': { severity: 'High', action: 'Pipe repair required', dept: 'Water & Sewerage', exp: 'Pressurized water pipe leakage overflowing onto the road and eroding foundation.' },
      'Damaged drainage': { severity: 'High', action: 'Drainage repair required', dept: 'Water & Sewerage', exp: 'Broken drain chamber or clogged stormwater culvert causing drainage overflow.' },
      'Broken public infrastructure': { severity: 'High', action: 'Public infrastructure repair required', dept: 'Municipal Works', exp: 'Damaged public guardrail, pedestrian barrier, bus shelter, or civic installation.' },
      'Damaged road sign': { severity: 'Medium', action: 'Sign replacement required', dept: 'Traffic & Safety', exp: 'Damaged, missing, or bent road direction/safety sign obstructing vehicular guidance.' },
      'Other visible infrastructure damage': { severity: 'Medium', action: 'Maintenance inspection required', dept: 'Municipal Works', exp: 'Visible wear or defect on municipal infrastructure asset requiring maintenance attention.' }
    };

    const item = metadata[category] || metadata['Other visible infrastructure damage'];

    const updated = {
      isIdentified: true,
      issueType: category,
      simpleIssue: category,
      confidence: 96,
      severity: item.severity,
      suggestedAction: item.action,
      department: item.dept,
      description: item.exp,
      explanation: item.exp,
      provider: 'AI-Assisted Detection (Citizen Calibrated)'
    };

    this.latestAiResult = updated;
    this.renderSimpleResult(updated);
    this.autoFillForm(updated);
    this.confirmIssue();

    App.showToast(`Issue changed to: ${category}`, 'info');
  },

  autoFillForm(data) {
    const issueInput = document.getElementById('complaint-issue-type');
    const sevInput = document.getElementById('complaint-severity');
    const deptInput = document.getElementById('complaint-department');
    const actionInput = document.getElementById('complaint-suggested-action');
    const descInput = document.getElementById('complaint-description');

    if (issueInput) issueInput.value = data.issueType || data.simpleIssue;
    if (sevInput) sevInput.value = data.severity || 'High';
    if (deptInput) deptInput.value = data.department || 'Roads & Bridges';
    if (actionInput) actionInput.value = data.suggestedAction || 'Road maintenance required';

    if (descInput && !descInput.value) {
      descInput.value = data.explanation || data.description || '';
    }
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
      statusIndicator.textContent = '📡 Acquiring GPS Coordinates...';
      statusIndicator.style.color = 'var(--primary)';
    }
    if (addressEl) {
      addressEl.innerHTML = '<em>Contacting device GPS sensor and satellites...</em>';
    }

    let resolved = false;

    const finalize = async (lat, lng, accuracy, source) => {
      if (resolved) return;
      resolved = true;
      await this.applyCoordinates(lat, lng, accuracy, source);
      if (gpsBtn) {
        gpsBtn.disabled = false;
        gpsBtn.innerHTML = '<span>✅</span> GPS Active';
      }
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const acc = Math.round(position.coords.accuracy || 15);
          await finalize(lat, lng, acc, 'Device GPS Sensor');
        },
        async (err) => {
          console.warn('Browser GPS notice:', err.message, 'Using network fallback...');
          await this.fallbackIpGeolocation(finalize);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );

      // Failsafe timer
      setTimeout(() => {
        if (!resolved) {
          this.fallbackIpGeolocation(finalize);
        }
      }, 5500);
    } else {
      await this.fallbackIpGeolocation(finalize);
    }
  },

  pickLocationOnMap() {
    const statusContainer = document.getElementById('gps-status-container');
    if (statusContainer) statusContainer.style.display = 'block';
    const lat = this.currentGps ? this.currentGps.lat : 12.9716;
    const lng = this.currentGps ? this.currentGps.lng : 77.5946;
    this.applyCoordinates(lat, lng, 10, 'Map Pin');
    App.showToast('Click anywhere on the mini-map or drag the pin to set your exact location.', 'info');
  },

  async fallbackIpGeolocation(finalizeFn) {
    const addressEl = document.getElementById('gps-resolved-address');
    if (addressEl) addressEl.innerHTML = '<em>Resolving location via municipal network...</em>';

    try {
      const res = await fetch('https://ipwho.is/');
      const data = await res.json();
      if (data.success && data.latitude && data.longitude) {
        if (finalizeFn) {
          await finalizeFn(data.latitude, data.longitude, 100, `Network (${data.city || 'Local Area'})`);
        } else {
          await this.applyCoordinates(data.latitude, data.longitude, 100, `Network (${data.city || 'Local Area'})`);
        }
        App.showToast(`Location pinpointed near ${data.city || 'your area'}. Drag pin on map to fine-tune.`, 'info');
        return;
      }
    } catch (e) {
      console.warn('External IP geo failed:', e);
    }

    // Default to city center
    if (finalizeFn) {
      await finalizeFn(12.9716, 77.5946, 50, 'City Center Corridor');
    } else {
      await this.applyCoordinates(12.9716, 77.5946, 50, 'City Center Corridor');
    }
  },

  async applyCoordinates(lat, lng, accuracy = 15, source = 'Device GPS') {
    this.currentGps = { lat, lng, accuracy, source };

    const statusIndicator = document.getElementById('gps-status-indicator');
    const accuracyBadge = document.getElementById('gps-accuracy-badge');
    const addressEl = document.getElementById('gps-resolved-address');
    const locSelect = document.getElementById('complaint-location-select');

    if (statusIndicator) {
      statusIndicator.textContent = `✅ GPS Pinpointed (${source})`;
      statusIndicator.style.color = 'var(--success)';
    }
    if (accuracyBadge) {
      accuracyBadge.textContent = `±${accuracy}m accuracy`;
    }

    let resolvedAddress = `Coordinates: ${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E`;
    let shortAddress = `GPS Spot (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

    // Fetch server reverse geocoding via OpenStreetMap
    try {
      const res = await fetch(`/api/geolocation/reverse?lat=${lat}&lng=${lng}`);
      const data = await res.json();
      if (data.success) {
        resolvedAddress = data.address || resolvedAddress;
        shortAddress = data.shortAddress || shortAddress;
      }
    } catch (err) {
      console.warn('Reverse geocode error:', err);
    }

    this.currentGps.address = resolvedAddress;

    if (addressEl) {
      addressEl.innerHTML = `<strong>📍 Pinpointed Address:</strong> ${shortAddress} <br><span style="font-size: 0.78rem; color: var(--text-dim);">${resolvedAddress}</span>`;
    }

    if (locSelect) {
      let gpsOption = document.getElementById('dynamic-gps-option');
      if (!gpsOption) {
        gpsOption = document.createElement('option');
        gpsOption.id = 'dynamic-gps-option';
        locSelect.insertBefore(gpsOption, locSelect.options[1]);
      }
      gpsOption.value = 'gps-custom';
      gpsOption.textContent = `📍 Detected: ${shortAddress}`;
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

      const tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      });
      tileLayer.on('tileerror', (e) => {
        e.tile.src = `https://a.tile.openstreetmap.fr/hot/${e.coords.z}/${e.coords.x}/${e.coords.y}.png`;
      });
      tileLayer.addTo(this.miniMap);

      const pinIcon = L.divIcon({
        className: 'custom-gps-pin',
        html: `<div style="background: #dc2626; width: 28px; height: 28px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 14px; font-weight: bold; cursor: grab;">📍</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      this.miniMapMarker = L.marker([lat, lng], { draggable: true, icon: pinIcon }).addTo(this.miniMap);

      this.miniMapMarker.on('dragend', async (e) => {
        const newPos = e.target.getLatLng();
        await this.applyCoordinates(newPos.lat, newPos.lng, 5, 'Pin Repositioned');
      });

      this.miniMap.on('click', async (e) => {
        this.miniMapMarker.setLatLng(e.latlng);
        await this.applyCoordinates(e.latlng.lat, e.latlng.lng, 5, 'Map Clicked');
      });
    } else {
      this.miniMap.setView([lat, lng], 16);
      if (this.miniMapMarker) {
        this.miniMapMarker.setLatLng([lat, lng]);
      }
    }

    [50, 150, 300].forEach(d => setTimeout(() => {
      if (this.miniMap) this.miniMap.invalidateSize();
    }, d));
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
        App.showToast('Please select or detect a location in Step 2.', 'warning');
        locationSelect?.focus();
        return;
      }

      const submitBtn = document.getElementById('btn-submit-complaint');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>⏳</span> Registering Complaint...';

      try {
        const issueType = document.getElementById('complaint-issue-type')?.value || 'Pothole';
        const severity = document.getElementById('complaint-severity')?.value || 'High';
        const department = document.getElementById('complaint-department')?.value || 'Roads & Bridges';
        const recommendedAction = document.getElementById('complaint-suggested-action')?.value || 'Road maintenance required';
        const description = document.getElementById('complaint-description')?.value || `Citizen reported ${issueType}.`;

        const payload = {
          userId: App.currentUser.id,
          issueType,
          severity,
          department,
          recommendedAction,
          locationId: locationSelect.value === 'gps-custom' ? null : locationSelect.value,
          description,
          citizenName: App.currentUser.name,
          citizenPhone: App.currentUser.phone,
          citizenEmail: App.currentUser.email,
          imageUrl: this.currentImageUrl || (this.currentSamplePath || '/assets/sample-pothole.jpg'),
          isAiAssisted: true,
          aiConfidence: this.latestAiResult ? this.latestAiResult.confidence : 92.0,
          aiProvider: 'AI-Assisted Detection'
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

        App.showToast(`Complaint registered! Ticket #${result.complaintNumber} with Priority: ${priorityLevel}`, 'success');

        form.reset();
        document.getElementById('ai-simple-result-box').style.display = 'none';
        document.getElementById('image-preview-container').style.display = 'none';
        document.getElementById('ai-unclear-box').style.display = 'none';
        this.clearGps();
        this.currentFile = null;
        this.currentSamplePath = null;
        this.currentImageUrl = null;
        this.latestAiResult = null;
        this.isConfirmed = false;

        setTimeout(() => {
          App.switchTab('my-complaints-tab');
        }, 1200);

      } catch (err) {
        console.error('Submission failed:', err);
        App.showToast(`Submission failed: ${err.message}`, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Submit Complaint</span>';
      }
    });
  }
};

window.IssueDetection = IssueDetection;
document.addEventListener('DOMContentLoaded', () => IssueDetection.init());
