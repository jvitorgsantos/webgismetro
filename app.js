// Initialize map and move zoom controls to bottom-left to avoid the logo
const map = L.map('map', {
    zoomControl: false // Disable default
}).setView([-23.5505, -46.6333], 11);

// Add custom zoom control at bottom-left
L.control.zoom({
    position: 'bottomleft'
}).addTo(map);

// Define Tile Layers
const basemaps = {
    "Google Satellite": L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',{
        maxZoom: 20,
        subdomains:['mt0','mt1','mt2','mt3'],
        attribution: 'Map data &copy; Google'
    }),
    "Escuro (Dark)": L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20
    }),
    "Claro (Light)": L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20
    })
};

basemaps["Escuro (Dark)"].addTo(map);
L.control.layers(basemaps, {}, { position: 'bottomright' }).addTo(map);

// Color Mapping from color.csv
const colorMap = {
    0: "#000000", 1: "#19159d", 2: "#007b5f", 3: "#ec3138", 4: "#fcc918",
    5: "#874ec1", 6: "#f94c01", 7: "#ac0250", 8: "#929489", 9: "#00aa86",
    10: "#007581", 11: "#dc4f00", 12: "#051972", 13: "#1ea544", 14: "#342b24",
    15: "#8b8b8b", 16: "#791c6c", 17: "#e47802", 18: "#aa6015", 19: "#1976d1",
    20: "#ed3c82", 21: "#af004f", 22: "#64361b", 23: "#a9cf52", 24: "#f7c9c9",
    25: "#d2b994", 26: "#5a4265"
};

// Common style function for lines and polygons
function getFeatureStyle(feature) {
    const color = feature.properties.Color || colorMap[feature.properties.N_Linha] || "#ffffff";
    const isPolygon = feature.geometry.type.includes("Polygon");
    
    if (isPolygon) {
        return {
            color: color,
            fillColor: color,
            fillOpacity: 0.5,
            weight: 2
        };
    } else {
        return {
            color: color,
            weight: 5,
            opacity: 0.9,
            lineCap: 'round'
        };
    }
}

// Common popup function
function bindFeaturePopup(feature, layer) {
    const p = feature.properties;
    const name = p.Name || p.Nm_Linha || "Sem nome";
    const desc = p.description || "";
    const modal = p.Modal || "Metroferroviário";
    
    layer.bindPopup(`
        <div style="font-family: 'Inter', sans-serif;">
            <h3 style="margin: 0; font-size: 16px; margin-bottom: 5px;">${name}</h3>
            <span style="background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 4px; font-size: 11px;">${modal}</span>
            <p style="margin: 10px 0 0 0; font-size: 12px; color: #D6E3E6;">${desc}</p>
        </div>
    `);
}

// --- DYNAMIC FILTERS & RENDERING ---
let allLayers = L.layerGroup().addTo(map);
const datasets = [linhasData, poligonosData, pontosData];

// 1. Extract unique Modals and Lines
const modals = new Set();
const lines = new Map(); // N_Linha -> Nm_Linha (or Name fallback)

datasets.forEach(dataset => {
    dataset.features.forEach(f => {
        const p = f.properties;
        if (p.Modal) modals.add(p.Modal);
        if (p.N_Linha !== undefined) {
            let lineName = p.Nm_Linha;
            if (!lineName && p.Name) {
                // Extract just the line name before ">"
                lineName = p.Name.split('>')[0].trim();
            }
            if (!lines.has(p.N_Linha)) {
                lines.set(p.N_Linha, lineName || `Linha ${p.N_Linha}`);
            }
        }
    });
});

// 2. Generate Checkboxes
const modalContainer = document.getElementById('filter-modal');
modals.forEach(modal => {
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" value="${modal}" class="filter-modal-cb" checked> ${modal}`;
    modalContainer.appendChild(label);
});

const linesContainer = document.getElementById('filter-lines');
// Sort lines by N_Linha numerically
Array.from(lines.keys()).sort((a,b) => a-b).forEach(nLinha => {
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" value="${nLinha}" class="filter-line-cb" checked> <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background-color:${colorMap[nLinha] || '#fff'};"></span> ${lines.get(nLinha)}`;
    linesContainer.appendChild(label);
});

// 3. Render Function
function renderLayers() {
    allLayers.clearLayers();
    
    const activeModals = Array.from(document.querySelectorAll('.filter-modal-cb:checked')).map(cb => cb.value);
    const activeLines = Array.from(document.querySelectorAll('.filter-line-cb:checked')).map(cb => parseInt(cb.value));

    datasets.forEach(geojsonData => {
        L.geoJSON(geojsonData, {
            filter: function(feature) {
                const p = feature.properties;
                // Filter by Modal
                if (p.Modal && !activeModals.includes(p.Modal)) return false;
                // Filter by Line
                if (p.N_Linha !== undefined && !activeLines.includes(p.N_Linha)) return false;
                
                return true;
            },
            style: getFeatureStyle,
            pointToLayer: function (feature, latlng) {
                const color = feature.properties.Color || colorMap[feature.properties.N_Linha] || "#ffffff";
                return L.circleMarker(latlng, {
                    radius: 5,
                    fillColor: "#ffffff", 
                    color: color,
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 1
                });
            },
            onEachFeature: bindFeaturePopup
        }).addTo(allLayers);
    });
}

// 4. Listeners
document.querySelectorAll('.filter-modal-cb, .filter-line-cb').forEach(cb => {
    cb.addEventListener('change', renderLayers);
});

// Initial Render
renderLayers();

// Temporary Timeline Disable Message
const yearDisplay = document.getElementById('current-year-display');
const sliderHint = document.querySelector('.slider-hint');
yearDisplay.textContent = "Todas as Linhas";
sliderHint.textContent = "Visualização completa da rede (Linha do tempo desativada temporariamente até a inserção das datas)";
document.getElementById('time-slider').disabled = true;
