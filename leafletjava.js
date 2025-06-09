const map = L.map('map').setView([4.0, -56.0], 8);

// Geocoder
L.Control.geocoder({ defaultMarkGeocode: true }).addTo(map);

// Satellietlaag
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
  maxZoom: 20
}).addTo(map);

// Meet- en tekentools
map.pm.addControls({
  position: 'topleft',
  drawPolygon: true,
  drawMarker: false,
  drawPolyline: true,
  editMode: false,
  dragMode: true,
  cutmode: false,
  removalMode: true,
});

map.on('pm:create', e => {
  const layer = e.layer;
  if (layer instanceof L.Polygon) {
    const latlngs = layer.getLatLngs();
    if (latlngs.length > 0 && latlngs[0].length >= 3) {
      let coords = latlngs[0].map(latlng => [latlng.lng, latlng.lat]);
      const first = coords[0];
      const last = coords[coords.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) coords.push([...first]);
      const turfPolygon = turf.polygon([coords]);
      const area = turf.area(turfPolygon).toFixed(2);
      layer.bindPopup(`Oppervlakte: ${area} m²`).openPopup();
    }
  }

  if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
    const latlngs = layer.getLatLngs();
    let totalDistance = 0;
    for (let i = 0; i < latlngs.length - 1; i++) {
      totalDistance += latlngs[i].distanceTo(latlngs[i + 1]);
    }
    const distanceKm = totalDistance / 1000;
    layer.bindPopup(`Lengte: ${distanceKm.toFixed(2)} km`).openPopup();
  }
});

function getColorByType(type) {
  switch (type) {
    case 'PID': return '#93ec1e';
    case 'FIG': return '#1f78b4';
    case 'ONZ': return '#ecff0a';
    case 'Palen': return '#ff7f00';
    case 'OWV': return '#9026d6';
    default: return '#e31a1c';
  }
}

let polygonLayer;
let markerClusterGroup = L.markerClusterGroup({
  iconCreateFunction: cluster => L.divIcon({
    html: '',
    className: 'my-cluster-icon',
    iconSize: [30, 30]
  })
});
let markers = [];
const zoomThreshold = 16;

let geojsonData = null; // <-- Om data op te slaan voor zoekfunctie

fetch('data/polygons.geojson')
  .then(response => response.json())
  .then(data => {
    geojsonData = data; // <-- opslaan voor zoekbalk
    polygonLayer = L.geoJSON(data, {
    style: feature => ({
    color: getColorByType(feature.properties.type),
    weight: 2,
    opacity: 1,
    fillOpacity: 0.4
  }),
  pmIgnore: true,

  onEachFeature: function (feature, layer) {
    layer._isGeoJSONLayer = true;

    const columnNamesMap = {
      'ogc_fid': 'OGC FID',
      'id': 'ID number',
      'description': 'Description',
      'client': 'Client',
      'Typering': 'Measured',
      'type': 'Type',
      'projectno': 'Projectnumber',
    };

    let popupContent = `<div style="font-size: 18px; font-weight: bold; margin-bottom: 5px;">Information</div>`;
    for (let key in feature.properties) {
      const displayName = columnNamesMap[key] || key;
      popupContent += `<b>${displayName}:</b> ${feature.properties[key]}<br>`;
    }
    layer.bindPopup(popupContent);

    if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
      // Bind permanent label met projectno op polygon zelf
      layer.bindTooltip(feature.properties.projectno, {
        permanent: true,
        direction: 'center',
        className: 'projectno-label'
      });

      // Bestaande marker in het midden
      const centroid = layer.getBounds().getCenter();
      const marker = L.circleMarker(centroid, {
        radius: 6,
        fillColor: "#93ec1e",
        color: "white",
        weight: 2,
        opacity: 1,
        fillOpacity: 1
      });
      marker.bindPopup(popupContent);
      markers.push(marker);
    }

    layer.on('click', function () {
      if (navigationMode) {
        const center = layer.getBounds().getCenter();
        const url = `https://www.google.com/maps/dir/?api=1&destination=${center.lat},${center.lng}&travelmode=walking`;
        window.open(url, '_blank');
        navigationMode = false;
      }
    });
  }
});

    polygonLayer.addTo(map);

    markers.forEach(marker => markerClusterGroup.addLayer(marker));
    if (map.getZoom() < zoomThreshold) {
      markerClusterGroup.addTo(map);
      map.removeLayer(polygonLayer);
    }

    map.on('zoomend', function () {
      const currentZoom = map.getZoom();
      if (currentZoom >= zoomThreshold) {
        if (!map.hasLayer(polygonLayer)) map.addLayer(polygonLayer);
        if (map.hasLayer(markerClusterGroup)) map.removeLayer(markerClusterGroup);
      } else {
        if (map.hasLayer(polygonLayer)) map.removeLayer(polygonLayer);
        if (!map.hasLayer(markerClusterGroup)) map.addLayer(markerClusterGroup);
      }
    });
  })
  .catch(error => console.error('Fout bij laden van GeoJSON:', error));

const legendaControl = L.control({ position: 'bottomright' });

legendaControl.onAdd = function () {
  const div = L.DomUtil.create('div', 'info legend');
  const types = ['PID', 'FIG', 'ONZ', 'Palen', 'OWV', 'Overig'];
  const labels = types.map(type => {
    const color = getColorByType(type);
    return `<i style="background:${color}; width:18px; height:18px; display:inline-block; margin-right:5px; border:1px solid #000;"></i> ${type}`;
  });
  div.innerHTML = '<strong>Legenda</strong><br>' + labels.join('<br>');
  return div;
};

legendaControl.addTo(map);

let navigationMode = false;

document.getElementById('nav-toggle').addEventListener('click', () => {
  navigationMode = true;
  alert("Klik nu op een polygoon om ernaartoe te navigeren.");
});

// PM remove event
map.on('pm:remove', e => {
  const layer = e.layer;
  if (layer._isGeoJSONLayer) {
    map.addLayer(layer);
    alert('Verwijderen van GeoJSON-objecten is niet toegestaan!');
  } else {
    console.log('Zelf getekend object verwijderd.');
  }
});


// Zoekfunctie met inklapbare zoekbalk op 'projectno' met nummer-icoon
const searchControl = L.control({ position: 'topright' });

searchControl.onAdd = function () {
  const container = L.DomUtil.create('div', 'search-container');
  container.style.position = 'relative';

  container.innerHTML = `
    <button id="toggle-search" class="toggle-search-btn" title="Zoek op projectnummer">#</button>
    <input id="search-input" type="text" placeholder="Zoek op projectno..." style="display:none;">
  `;

  return container;
};

searchControl.addTo(map);

const toggleBtn = document.getElementById('toggle-search');
const searchInput = document.getElementById('search-input');

toggleBtn.addEventListener('click', function (e) {
  e.stopPropagation(); // Voorkom sluiten bij klikken op de knop
  const isVisible = searchInput.style.display === 'block';
  searchInput.style.display = isVisible ? 'none' : 'block';
  if (!isVisible) searchInput.focus();
});

// Inklappen bij klikken buiten de zoekbalk
document.addEventListener('click', function (e) {
  if (!searchInput.contains(e.target) && e.target.id !== 'toggle-search') {
    searchInput.style.display = 'none';
  }
});

// Zoekactie uitvoeren bij typen (exacte match)
document.addEventListener('input', function (e) {
  if (e.target && e.target.id === 'search-input') {
    const searchTerm = e.target.value.trim().toLowerCase();
    if (!geojsonData) return;

    polygonLayer.eachLayer(layer => {
      const projectno = String(layer.feature.properties.projectno || '').toLowerCase();
      if (searchTerm && projectno === searchTerm) {
        const bounds = layer.getBounds();
        map.fitBounds(bounds);
        layer.openPopup();
      }
    });
  }
});



