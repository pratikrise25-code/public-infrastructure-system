/**
 * NagarDristi AI- AI-Powered Vision for Better Cities
 * Geospatial Maintenance Hotspot Map Controller
 * Features:
 *  - 100% Free OpenStreetMap Standard Tiles with Humanitarian OSM fallback (Zero API keys required)
 *  - Personal "My Map" tab: displays citizen's own reported complaints + city AI Hotspot cluster overlays
 *  - City-wide "AI Hotspot Map": interactive view of all 31+ municipal complaints and AI defect clusters
 *  - Interactive filter chips: All Hotspots, Critical Risk, Potholes, Water Leaks, Streetlights
 */
const HotspotMap = {
  citizenMap: null,
  citizenMarkersLayer: null,
  citizenHotspotLayer: null,
  showCitizenHotspotOverlay: true,

  cityMap: null,
  cityMarkersLayer: null,
  cityHotspotsLayer: null,
  allCityComplaints: [],
  allCityHotspots: [],
  activeFilter: 'ALL',

  init() {
    const citizenEl = document.getElementById('infrastructure-map');
    if (citizenEl && citizenEl.offsetParent !== null) {
      this.initCitizenMap();
    }
  },

  onTabActivated(currentUser) {
    if (!this.citizenMap) {
      this.initCitizenMap();
    } else {
      this.invalidateCitizenDimensions();
    }
    this.loadCitizenMapData(currentUser || (window.App ? window.App.currentUser : null));
  },

  invalidateCitizenDimensions() {
    if (!this.citizenMap) return;
    [30, 100, 250, 500, 800].forEach(delay => {
      setTimeout(() => {
        if (this.citizenMap) {
          this.citizenMap.invalidateSize();
          window.dispatchEvent(new Event('resize'));
        }
      }, delay);
    });
  },

  invalidateCityDimensions() {
    if (!this.cityMap) return;
    [30, 100, 250, 500, 800].forEach(delay => {
      setTimeout(() => {
        if (this.cityMap) {
          this.cityMap.invalidateSize();
          window.dispatchEvent(new Event('resize'));
        }
      }, delay);
    });
  },

  createTileLayer() {
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    });
    tiles.on('tileerror', (e) => {
      e.tile.src = `https://a.tile.openstreetmap.fr/hot/${e.coords.z}/${e.coords.x}/${e.coords.y}.png`;
    });
    return tiles;
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

      this.createTileLayer().addTo(this.citizenMap);
      this.citizenHotspotLayer = L.layerGroup().addTo(this.citizenMap);
      this.citizenMarkersLayer = L.layerGroup().addTo(this.citizenMap);

      this.invalidateCitizenDimensions();
    } catch (err) {
      console.error('Citizen map initialization error:', err);
    }
  },

  async toggleCitizenHotspotOverlay() {
    this.showCitizenHotspotOverlay = !this.showCitizenHotspotOverlay;
    const btn = document.getElementById('btn-toggle-my-map-hotspots');
    if (btn) {
      btn.classList.toggle('active', this.showCitizenHotspotOverlay);
      btn.innerHTML = this.showCitizenHotspotOverlay 
        ? '<span>🔥</span> Hide Hotspot Clusters' 
        : '<span>🔥</span> Overlay AI Hotspot Clusters';
    }

    if (!this.citizenHotspotLayer) return;
    this.citizenHotspotLayer.clearLayers();

    if (this.showCitizenHotspotOverlay) {
      try {
        const res = await fetch('/api/hotspots/analysis');
        const json = await res.json();
        const hotspots = json.data || [];

        hotspots.forEach(h => {
          const circleColor = h.riskLevel === 'CRITICAL' ? '#ef4444' :
                              h.riskLevel === 'HIGH' ? '#f59e0b' : '#38bdf8';

          const circle = L.circle([h.latitude, h.longitude], {
            radius: h.radiusMeters || 300,
            color: circleColor,
            fillColor: circleColor,
            fillOpacity: 0.16,
            weight: 2,
            dashArray: '4, 4'
          });

          circle.bindPopup(`
            <div style="font-family: 'Inter', sans-serif;">
              <strong style="color: ${circleColor}; font-size: 0.95rem;">⚠️ AI Hotspot Zone: ${h.area}</strong>
              <div style="font-size: 0.8rem; margin: 4px 0;">
                Risk Level: <strong>${h.riskLevel}</strong> • Clustered Complaints: <strong>${h.complaintCount}</strong>
              </div>
              <div style="font-size: 0.75rem; color: #475569;">
                ${h.explanation}
              </div>
            </div>
          `);
          this.citizenHotspotLayer.addLayer(circle);
        });
      } catch (err) {
        console.error('Failed to load hotspot overlay:', err);
      }
    }
  },

  async loadCitizenMapData(currentUser) {
    if (!this.citizenMap) return;

    const user = currentUser || (window.App ? window.App.currentUser : null);
    const userId = user ? user.id : 4;

    try {
      const res = await fetch(`/api/hotspots/map-data?userId=${userId}&role=citizen&userOnly=true`);
      const json = await res.json();
      if (!json.success) return;

      const complaints = json.data || [];

      // Update My Reports counter badge
      const countBadge = document.getElementById('my-map-reports-count');
      if (countBadge) countBadge.textContent = complaints.length;

      if (this.citizenMarkersLayer) {
        this.citizenMarkersLayer.clearLayers();
      }

      const emptyBanner = document.getElementById('my-map-empty-banner');
      if (emptyBanner) {
        emptyBanner.style.display = complaints.length === 0 ? 'block' : 'none';
      }

      // Always show city clusters so map is alive
      if (this.showCitizenHotspotOverlay) {
        this.toggleCitizenHotspotOverlay();
        this.showCitizenHotspotOverlay = true; // keep on
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

        const customIcon = L.divIcon({
          className: 'custom-map-pin',
          html: `
            <div style="background: ${markerColor}; width: 30px; height: 30px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 10px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; font-size: 14px; color: #fff;">
              ${window.App ? window.App.getIssueEmoji(c.issueType) : '📍'}
            </div>
          `,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
          popupAnchor: [0, -15]
        });

        const marker = L.marker([lat, lng], { icon: customIcon });

        const popupHtml = `
          <div style="min-width: 220px; font-family: 'Inter', sans-serif;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <strong style="color: #0f172a; font-size: 0.95rem;">${c.issueType}</strong>
              <span class="badge-status ${c.status}" style="font-size: 0.68rem;">${c.status}</span>
            </div>
            <div style="font-size: 0.78rem; color: #475569; margin-bottom: 4px;">
              <strong>Ticket:</strong> #${c.complaintNumber}
            </div>
            <div style="font-size: 0.78rem; color: #475569; margin-bottom: 4px;">
              <strong>Reported:</strong> ${new Date(c.reportedAt).toLocaleDateString()}
            </div>
            <div style="display: flex; gap: 6px; align-items: center; margin: 6px 0;">
              <span class="badge-severity ${priorityLabel}" style="font-size: 0.68rem;">${priorityLabel} PRIORITY</span>
              <span style="font-size: 0.68rem; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-weight: 700;">AI-Assisted</span>
            </div>
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
      } else {
        this.citizenMap.setView([12.9716, 77.5946], 13);
      }
    } catch (err) {
      console.error('Failed to load citizen map data:', err);
    }
  },

  async initCityMap() {
    const mapElement = document.getElementById('city-wide-map');
    if (!mapElement || typeof L === 'undefined') return;

    if (!this.cityMap) {
      this.cityMap = L.map('city-wide-map', {
        center: [12.9716, 77.5946],
        zoom: 13,
        zoomControl: true,
        scrollWheelZoom: true
      });

      this.createTileLayer().addTo(this.cityMap);
      this.cityHotspotsLayer = L.layerGroup().addTo(this.cityMap);
      this.cityMarkersLayer = L.layerGroup().addTo(this.cityMap);
    }

    this.invalidateCityDimensions();

    try {
      // 1. Fetch complaints
      const compRes = await fetch('/api/hotspots/map-data');
      const compJson = await compRes.json();
      this.allCityComplaints = compJson.data || [];

      // 2. Fetch hotspot zones
      const hotRes = await fetch('/api/hotspots/analysis');
      const hotJson = await hotRes.json();
      this.allCityHotspots = hotJson.data || [];

      // Update counters
      const countEl = document.getElementById('hotspot-stat-total-clusters');
      if (countEl) countEl.textContent = this.allCityHotspots.length;

      const incEl = document.getElementById('hotspot-stat-incidents');
      if (incEl) incEl.textContent = this.allCityComplaints.length;

      const critEl = document.getElementById('hotspot-stat-critical');
      if (critEl) {
        critEl.textContent = this.allCityHotspots.filter(h => h.riskLevel === 'CRITICAL').length;
      }

      this.renderCityMap();
    } catch (err) {
      console.error('Failed to load city map data:', err);
    }
  },

  filterCityMap(filterType) {
    this.activeFilter = filterType;
    document.querySelectorAll('.btn-hotspot-filter').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-filter') === filterType);
    });
    this.renderCityMap();
  },

  renderCityMap() {
    if (!this.cityMap || !this.cityMarkersLayer || !this.cityHotspotsLayer) return;

    this.cityMarkersLayer.clearLayers();
    this.cityHotspotsLayer.clearLayers();

    const bounds = [];

    // Render hotspot zones
    this.allCityHotspots.forEach(h => {
      if (this.activeFilter === 'CRITICAL' && h.riskLevel !== 'CRITICAL') return;
      if (this.activeFilter === 'POTHOLE' && !h.area.toLowerCase().includes('road') && !h.dominantIssue?.toLowerCase().includes('pothole')) return;
      if (this.activeFilter === 'WATER' && !h.area.toLowerCase().includes('water') && !h.dominantIssue?.toLowerCase().includes('water')) return;
      if (this.activeFilter === 'LIGHT' && !h.area.toLowerCase().includes('light') && !h.dominantIssue?.toLowerCase().includes('light')) return;

      const circleColor = h.riskLevel === 'CRITICAL' ? '#ef4444' :
                          h.riskLevel === 'HIGH' ? '#f59e0b' : '#38bdf8';

      const circle = L.circle([h.latitude, h.longitude], {
        radius: h.radiusMeters || 300,
        color: circleColor,
        fillColor: circleColor,
        fillOpacity: 0.22,
        weight: 3
      });

      circle.bindPopup(`
        <div style="font-family: 'Inter', sans-serif; min-width: 240px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <strong style="color: ${circleColor}; font-size: 1rem;">🔥 AI Hotspot Cluster</strong>
            <span style="font-size: 0.7rem; background: ${circleColor}22; color: ${circleColor}; padding: 2px 6px; border-radius: 4px; font-weight: 700;">
              ${h.riskLevel} RISK
            </span>
          </div>
          <div style="font-size: 0.88rem; font-weight: 600; color: #0f172a; margin-bottom: 4px;">
            📍 ${h.area}
          </div>
          <div style="font-size: 0.78rem; color: #475569; margin: 4px 0;">
            Clustered Complaints: <strong>${h.complaintCount}</strong> • Radius: <strong>${h.radiusMeters || 300}m</strong>
          </div>
          <div style="font-size: 0.75rem; color: #334155; background: #f8fafc; padding: 6px; border-radius: 4px; border-left: 3px solid ${circleColor}; margin-top: 6px;">
            ${h.explanation || 'High density of recurring public infrastructure defects detected by AI clustering.'}
          </div>
        </div>
      `);

      this.cityHotspotsLayer.addLayer(circle);
      bounds.push([h.latitude, h.longitude]);
    });

    // Render complaint markers
    const filteredComplaints = this.allCityComplaints.filter(c => {
      if (this.activeFilter === 'ALL') return true;
      if (this.activeFilter === 'CRITICAL') return c.priority?.level === 'CRITICAL';
      if (this.activeFilter === 'POTHOLE') return (c.issueType || '').toLowerCase().includes('pothole');
      if (this.activeFilter === 'WATER') return (c.issueType || '').toLowerCase().includes('water');
      if (this.activeFilter === 'LIGHT') return (c.issueType || '').toLowerCase().includes('light');
      return true;
    });

    filteredComplaints.forEach(c => {
      if (!c.location || !c.location.latitude || !c.location.longitude) return;

      const lat = c.location.latitude;
      const lng = c.location.longitude;
      bounds.push([lat, lng]);

      const priorityLabel = c.priority?.level || 'MEDIUM';
      const markerColor = priorityLabel === 'CRITICAL' ? '#ef4444' :
                          priorityLabel === 'HIGH' ? '#f59e0b' :
                          priorityLabel === 'MEDIUM' ? '#38bdf8' : '#10b981';

      const customIcon = L.divIcon({
        className: 'custom-map-pin',
        html: `
          <div style="background: ${markerColor}; width: 28px; height: 28px; border-radius: 50%; border: 2.5px solid #fff; box-shadow: 0 0 8px rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; font-size: 13px; color: #fff;">
            ${window.App ? window.App.getIssueEmoji(c.issueType) : '📍'}
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14]
      });

      const marker = L.marker([lat, lng], { icon: customIcon });

      const popupHtml = `
        <div style="min-width: 220px; font-family: 'Inter', sans-serif;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <strong style="color: #0f172a; font-size: 0.95rem;">${c.issueType}</strong>
            <span class="badge-status ${c.status}" style="font-size: 0.68rem;">${c.status}</span>
          </div>
          <div style="font-size: 0.78rem; color: #475569; margin-bottom: 4px;">
            <strong>Ticket:</strong> #${c.complaintNumber}
          </div>
          <div style="font-size: 0.78rem; color: #475569; margin-bottom: 4px;">
            <strong>Location:</strong> ${c.location.name}
          </div>
          <div style="display: flex; gap: 6px; align-items: center; margin: 6px 0;">
            <span class="badge-severity ${priorityLabel}" style="font-size: 0.68rem;">${priorityLabel} PRIORITY</span>
            <span style="font-size: 0.68rem; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-weight: 700;">AI-Assisted</span>
          </div>
          <button type="button" class="btn-action-sm" onclick="App.trackComplaint('${c.complaintNumber}')" style="width: 100%; margin-top: 6px; justify-content: center;">
            <span>🔍</span> Track Incident
          </button>
        </div>
      `;

      marker.bindPopup(popupHtml);
      this.cityMarkersLayer.addLayer(marker);
    });

    if (bounds.length > 0) {
      this.cityMap.fitBounds(L.latLngBounds(bounds).pad(0.12));
    }
  }
};

window.HotspotMap = HotspotMap;
