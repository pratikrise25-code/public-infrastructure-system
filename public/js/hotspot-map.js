/**
 * AI Maintenance Hotspot Map Controller
 * Citizen View: Shows ONLY the logged-in citizen's uploaded complaints ("My Map").
 * Admin View: Shows all city complaints, recurring defect clusters, and risk zones.
 */
const HotspotMap = {
  citizenMap: null,
  citizenMarkersLayer: null,
  cityMap: null,
  cityMarkersLayer: null,
  cityHotspotsLayer: null,

  init() {
    // If citizen map element is visible on load, initialize
    const mapEl = document.getElementById('infrastructure-map');
    if (mapEl && mapEl.offsetParent !== null) {
      this.initCitizenMap();
    }
  },

  /**
   * Called whenever user clicks the "My Map" tab
   */
  onTabActivated(currentUser) {
    if (!this.citizenMap) {
      this.initCitizenMap();
    } else {
      this.invalidateCitizenDimensions();
    }
    this.loadCitizenMapData(currentUser || App.currentUser);
  },

  invalidateCitizenDimensions() {
    if (!this.citizenMap) return;
    [50, 150, 300, 600].forEach(delay => {
      setTimeout(() => {
        if (this.citizenMap) this.citizenMap.invalidateSize();
      }, delay);
    });
  },

  initCitizenMap() {
    const mapElement = document.getElementById('infrastructure-map');
    if (!mapElement || typeof L === 'undefined') return;

    if (this.citizenMap) {
      this.invalidateCitizenDimensions();
      return;
    }

    try {
      this.citizenMap = L.map('infrastructure-map', {
        center: [12.9716, 77.5946],
        zoom: 13,
        zoomControl: true,
        scrollWheelZoom: true
      });

      // Reliable OpenStreetMap CartoDB Dark Tiles
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(this.citizenMap);

      this.citizenMarkersLayer = L.layerGroup().addTo(this.citizenMap);
    } catch (err) {
      console.error('Citizen map initialization error:', err);
    }
  },

  /**
   * Load ONLY the logged-in citizen's complaints
   */
  async loadCitizenMapData(currentUser) {
    if (!this.citizenMap) return;

    const user = currentUser || App.currentUser;
    const userId = user ? user.id : 4;

    try {
      const res = await fetch(`/api/hotspots/map-data?userId=${userId}&role=citizen&userOnly=true`);
      const json = await res.json();
      if (!json.success) return;

      const complaints = json.data || [];

      // Update My Reports counter badge
      const countBadge = document.getElementById('my-map-reports-count');
      if (countBadge) countBadge.textContent = complaints.length;

      // Clear existing markers
      if (this.citizenMarkersLayer) {
        this.citizenMarkersLayer.clearLayers();
      }

      if (complaints.length === 0) {
        // User has 0 complaints
        App.showToast('My Reports: 0. You have not submitted any complaints yet.', 'info');
        this.citizenMap.setView([12.9716, 77.5946], 13);
        return;
      }

      const bounds = [];

      complaints.forEach(c => {
        if (!c.location || !c.location.latitude || !c.location.longitude) return;

        const lat = c.location.latitude;
        const lng = c.location.longitude;
        bounds.push([lat, lng]);

        const priorityLabel = c.priority?.level || 'MEDIUM';
        const markerColor = priorityLabel === 'CRITICAL' ? '#ef4444' :
                            priorityLabel === 'HIGH' ? '#f59e0b' :
                            priorityLabel === 'MEDIUM' ? '#38bdf8' : '#10b981';

        // Custom clean SVG icon
        const customIcon = L.divIcon({
          className: 'custom-map-pin',
          html: `
            <div style="background: ${markerColor}; width: 28px; height: 28px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 10px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; font-size: 13px; color: #fff;">
              ${App.getIssueEmoji(c.issueType)}
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          popupAnchor: [0, -14]
        });

        const marker = L.marker([lat, lng], { icon: customIcon });

        // Popup: issue type, date, status, priority (AI-Assisted)
        const popupHtml = `
          <div style="min-width: 220px; font-family: 'Inter', sans-serif;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <strong style="color: #0f172a; font-size: 0.95rem;">${App.getIssueEmoji(c.issueType)} ${c.issueType}</strong>
              <span class="badge-status ${c.status}" style="font-size: 0.68rem;">${c.status}</span>
            </div>

            <div style="font-size: 0.78rem; color: #475569; margin-bottom: 4px;">
              <strong>Date:</strong> ${App.formatDate(c.reportedAt)}
            </div>

            <div style="font-size: 0.78rem; color: #475569; margin-bottom: 4px;">
              <strong>Location:</strong> ${c.location.name}
            </div>

            <div style="display: flex; gap: 6px; align-items: center; margin: 6px 0;">
              <span class="badge-severity ${priorityLabel}" style="font-size: 0.68rem;">${priorityLabel} PRIORITY</span>
              <span style="font-size: 0.68rem; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-weight: 700;">AI-Assisted</span>
            </div>

            ${c.imageUrl ? `
              <div style="margin: 6px 0; border-radius: 4px; overflow: hidden; height: 90px;">
                <img src="${c.imageUrl}" style="width: 100%; height: 100%; object-fit: cover;">
              </div>
            ` : ''}

            <button type="button" class="btn-action-sm" onclick="App.trackComplaint('${c.complaintNumber}')" style="width: 100%; margin-top: 6px; justify-content: center;">
              <span>🔍</span> Track Repair Progress
            </button>
          </div>
        `;

        marker.bindPopup(popupHtml);
        this.citizenMarkersLayer.addLayer(marker);
      });

      if (bounds.length > 0) {
        this.citizenMap.fitBounds(L.latLngBounds(bounds).pad(0.2));
      }

    } catch (err) {
      console.error('Failed to load citizen map data:', err);
    }
  },

  /**
   * Initialize City-Wide Map for Administrator
   */
  async initCityMap() {
    const mapElement = document.getElementById('city-wide-map');
    if (!mapElement || typeof L === 'undefined') return;

    if (!this.cityMap) {
      this.cityMap = L.map('city-wide-map', {
        center: [12.9716, 77.5946],
        zoom: 13
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(this.cityMap);

      this.cityMarkersLayer = L.layerGroup().addTo(this.cityMap);
      this.cityHotspotsLayer = L.layerGroup().addTo(this.cityMap);
    }

    [50, 150, 300].forEach(delay => {
      setTimeout(() => {
        if (this.cityMap) this.cityMap.invalidateSize();
      }, delay);
    });

    try {
      // 1. Fetch all complaints
      const compRes = await fetch('/api/hotspots/map-data');
      const compJson = await compRes.json();
      const complaints = compJson.data || [];

      // 2. Fetch hotspot zones
      const hotRes = await fetch('/api/hotspots/analysis');
      const hotJson = await hotRes.json();
      const hotspots = hotJson.data || [];

      this.cityMarkersLayer.clearLayers();
      this.cityHotspotsLayer.clearLayers();

      // Render hotspot zones
      hotspots.forEach(h => {
        const circleColor = h.riskLevel === 'CRITICAL' ? '#ef4444' :
                            h.riskLevel === 'HIGH' ? '#f59e0b' : '#38bdf8';

        const circle = L.circle([h.latitude, h.longitude], {
          radius: h.radiusMeters || 250,
          color: circleColor,
          fillColor: circleColor,
          fillOpacity: 0.18,
          weight: 2
        });

        circle.bindPopup(`
          <div style="font-family: 'Inter', sans-serif;">
            <strong style="color: ${circleColor}; font-size: 0.95rem;">⚠️ Hotspot: ${h.area}</strong>
            <div style="font-size: 0.78rem; margin: 4px 0;">
              Risk: <strong>${h.riskLevel}</strong> • Complaints: <strong>${h.complaintCount}</strong>
            </div>
            <div style="font-size: 0.75rem; color: #475569;">
              ${h.explanation}
            </div>
          </div>
        `);
        this.cityHotspotsLayer.addLayer(circle);
      });

      // Render all markers
      complaints.forEach(c => {
        if (!c.location || !c.location.latitude) return;
        const marker = L.marker([c.location.latitude, c.location.longitude]);
        marker.bindPopup(`
          <div style="font-family: 'Inter', sans-serif;">
            <strong>${c.issueType}</strong> (${c.severity})<br>
            Status: ${c.status}<br>
            Ticket: #${c.complaintNumber}
          </div>
        `);
        this.cityMarkersLayer.addLayer(marker);
      });

    } catch (err) {
      console.error('Failed to load city map data:', err);
    }
  }
};

window.HotspotMap = HotspotMap;
document.addEventListener('DOMContentLoaded', () => HotspotMap.init());
