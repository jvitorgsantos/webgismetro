// Initialize map and hide default zoom
const map = L.map('map', { zoomControl: false }).setView([-23.5505, -46.6333], 11);

// Add custom zoom control at bottom-left
L.control.zoom({ position: 'bottomleft' }).addTo(map);

// Define Tile Layers
const basemaps = {
    "Claro (Light)": L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20
    }),
    "Escuro (Dark)": L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20
    }),
    "Google Satellite": L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',{
        maxZoom: 20,
        subdomains:['mt0','mt1','mt2','mt3'],
        attribution: 'Map data &copy; Google'
    })
};
basemaps["Claro (Light)"].addTo(map); // Definindo Claro (Light) como default
L.control.layers(basemaps, {}, { position: 'bottomright' }).addTo(map);

// Color Mapping
const colorMap = {
    0: "#000000", 1: "#19159d", 2: "#007b5f", 3: "#ec3138", 4: "#fcc918",
    5: "#874ec1", 6: "#f94c01", 7: "#ac0250", 8: "#929489", 9: "#00aa86",
    10: "#007581", 11: "#dc4f00", 12: "#051972", 13: "#1ea544", 14: "#342b24",
    15: "#8b8b8b", 16: "#791c6c", 17: "#e47802", 18: "#aa6015", 19: "#1976d1",
    20: "#ed3c82", 21: "#af004f", 22: "#64361b", 23: "#a9cf52", 24: "#f7c9c9",
    25: "#d2b994", 26: "#5a4265"
};

// Collapsible Panels Logic
const toggleHeader = document.getElementById('toggle-header');
const headerContainer = document.getElementById('header-container');
toggleHeader.addEventListener('click', () => headerContainer.classList.toggle('collapsed'));

const toggleTimeline = document.getElementById('toggle-timeline');
const timelineContainer = document.getElementById('timeline-container');
toggleTimeline.addEventListener('click', () => timelineContainer.classList.toggle('collapsed'));

const toggleControls = document.getElementById('toggle-controls');
const controlsContainer = document.getElementById('controls-container');
toggleControls.addEventListener('click', () => controlsContainer.classList.toggle('collapsed'));

// Accordions logic for static accordions
document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', (e) => {
        e.target.parentElement.classList.toggle('open');
    });
});

// Geometry Checkboxes logic
document.querySelectorAll('.filter-geo-cb').forEach(cb => {
    cb.addEventListener('change', (e) => {
        const pill = e.target.parentElement;
        if(e.target.checked) pill.classList.remove('inactive');
        else pill.classList.add('inactive');
        renderLayers();
    });
});


// --- DATA PREPARATION ---
// Duas camadas separadas para controlar a visibilidade dos poligonos via zoom
let allNonPolygonLayers = L.layerGroup().addTo(map);
let allPolygonLayers = L.layerGroup(); // Não adicionado ao mapa por padrão

const datasets = [linhasData, poligonosData, pontosData];
const searchIndex = []; // For the search bar

// Extract unique Modals, Lines, Status and compute Dates/Data
const modalsMap = new Map(); // Modal -> array of lines
const statusSet = new Set(); // Unique Status_Obra

datasets.forEach(dataset => {
    dataset.features.forEach(f => {
        const p = f.properties;
        const modal = p.Modal || "Desconhecido";
        const nLinha = p.N_Linha !== undefined ? p.N_Linha : -1;
        
        if (p.Status_Obra) statusSet.add(p.Status_Obra);
        
        let lineName = p.Nm_Linha;
        if (!lineName && p.Name) {
            lineName = p.Name.split('>')[0].trim();
        }
        lineName = lineName || `Linha ${nLinha}`;

        if (!modalsMap.has(modal)) {
            modalsMap.set(modal, new Map());
        }
        if (nLinha !== -1 && !modalsMap.get(modal).has(nLinha)) {
            modalsMap.get(modal).set(nLinha, lineName);
        }

        // --- Data Extraction via Regex (Description parsing) ---
        let dateVal = null;
        if (p.data_inauguracao) {
            const parts = p.data_inauguracao.split('/');
            dateVal = parts.length === 3 ? parseInt(parts[2]) : parseInt(p.data_inauguracao);
        } else if (p.description) {
            const dateMatch = p.description.match(/(\d{2}\/\d{2}\/\d{4})|(\b(19|20)\d{2}\b)/);
            if (dateMatch) {
                if (dateMatch[1]) {
                    dateVal = parseInt(dateMatch[1].split('/')[2]);
                } else if (dateMatch[2]) {
                    dateVal = parseInt(dateMatch[2]);
                }
            }
        }
        p._year = dateVal || 1900;

        p._demand = "N/D";
        p._trains = "N/D";
        if (p.description) {
            const demandMatch = p.description.match(/(\d[\d\s]*mil pass\/d)/i);
            if (demandMatch) p._demand = demandMatch[1];
            
            const trainsMatch = p.description.match(/(\d+ trens)/i);
            if (trainsMatch) p._trains = trainsMatch[1];
        }

        if (f.geometry.type.includes("Point") || f.geometry.type.includes("Polygon")) {
            let stName = p.Name || p.Nm_Linha || "Estação";
            if (stName.startsWith("Estação ")) stName = stName.replace("Estação ", "");
            
            let latlng;
            if (f.geometry.type === "MultiPoint") {
                latlng = [f.geometry.coordinates[0][1], f.geometry.coordinates[0][0]];
            } else if (f.geometry.type === "Point") {
                latlng = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
            } else if (f.geometry.type.includes("Polygon")) {
                latlng = [f.geometry.coordinates[0][0][0][1], f.geometry.coordinates[0][0][0][0]];
            }
            if (latlng && !searchIndex.find(s => s.name === stName)) {
                searchIndex.push({ name: stName, latlng: latlng, modal: modal });
            }
        }
    });
});

// --- UI GENERATION ---

// Dynamic Status Obra Checkboxes
const statusContainer = document.getElementById('status-container');
const statusLabels = {
    "Construído": { label: "Em Operação", icon: "🚆" },
    "Em Obras": { label: "Em Obras", icon: "🚧" },
    "Projeto": { label: "Em Projeto", icon: "📐" },
    "Suspenso": { label: "Suspenso / Cancelado", icon: "❌" },
    "Cancelado": { label: "Suspenso / Cancelado", icon: "❌" }
};

statusSet.forEach(status => {
    const config = statusLabels[status] || { label: status, icon: "📌" };
    const pill = document.createElement('label');
    pill.className = 'line-pill';
    pill.innerHTML = `
        <input type="checkbox" value="${status}" class="filter-status-cb" checked>
        <span>${config.icon} ${config.label}</span>
    `;
    
    const cb = pill.querySelector('input');
    cb.addEventListener('change', (e) => {
        if(e.target.checked) pill.classList.remove('inactive');
        else pill.classList.add('inactive');
        renderLayers();
    });
    
    statusContainer.appendChild(pill);
});

// Dynamic Modals Accordion
const accordionContainer = document.getElementById('accordion-container');

Array.from(modalsMap.keys()).sort().forEach(modal => {
    const linesInModal = modalsMap.get(modal);
    
    const acc = document.createElement('div');
    acc.className = 'accordion open';
    
    const header = document.createElement('div');
    header.className = 'accordion-header';
    header.textContent = modal;
    header.addEventListener('click', () => acc.classList.toggle('open'));
    
    const body = document.createElement('div');
    body.className = 'accordion-body';
    
    Array.from(linesInModal.keys()).sort((a,b) => a-b).forEach(nLinha => {
        const lineName = linesInModal.get(nLinha);
        const color = colorMap[nLinha] || '#fff';
        
        const pill = document.createElement('label');
        pill.className = 'line-pill';
        pill.innerHTML = `
            <input type="checkbox" value="${nLinha}" class="filter-line-cb" checked>
            <div class="pill-color" style="background-color: ${color};"></div>
            <span>${lineName}</span>
        `;
        const cb = pill.querySelector('input');
        cb.addEventListener('change', (e) => {
            if(e.target.checked) pill.classList.remove('inactive');
            else pill.classList.add('inactive');
            renderLayers();
        });
        
        body.appendChild(pill);
    });
    
    acc.appendChild(header);
    acc.appendChild(body);
    accordionContainer.appendChild(acc);
});


// --- HOVER TOOLTIP LOGIC ---
const tooltip = document.getElementById('custom-tooltip');
let tooltipTimeout = null;

function handleMouseOver(e) {
    clearTimeout(tooltipTimeout);
    
    const p = e.target.feature.properties;
    const name = p.Name || p.Nm_Linha || "Sem nome";
    const modal = p.Modal || "Metroferroviário";
    const color = p.Color || colorMap[p.N_Linha] || "#ffffff";
    const status = p.Status_Obra || "N/D";
    
    const statusConfig = statusLabels[status] || { label: status, icon: "" };
    
    tooltip.innerHTML = `
        <h3 style="color: ${color};">
            <span class="pill-color" style="background-color: ${color};"></span>
            ${name.replace('Estação ', '')}
        </h3>
        <span class="tooltip-modal">${modal} • ${statusConfig.icon} ${statusConfig.label}</span>
        <div class="tooltip-data"><strong>Inauguração:</strong> ${p._year !== 1900 ? p._year : 'N/D'}</div>
        <div class="tooltip-data"><strong>Demanda:</strong> ${p._demand}</div>
        <div class="tooltip-data"><strong>Trens:</strong> ${p._trains}</div>
    `;
    tooltip.classList.remove('hidden');
    
    // Highlight feature
    if (e.target.setStyle) {
        e.target.setStyle({ weight: 8, opacity: 1 });
    } else if (e.target.setRadius) {
        e.target.setRadius(8);
    }
}

function handleMouseMove(e) {
    tooltip.style.left = (e.originalEvent.pageX + 15) + 'px';
    tooltip.style.top = (e.originalEvent.pageY + 15) + 'px';
}

function handleMouseOut(e) {
    // Reset highlight immediately
    allNonPolygonLayers.eachLayer(geoLayer => geoLayer.resetStyle(e.target));
    allPolygonLayers.eachLayer(geoLayer => geoLayer.resetStyle(e.target));
    
    tooltipTimeout = setTimeout(() => {
        tooltip.classList.add('hidden');
    }, 2000);
}

function getFeatureStyle(feature) {
    const color = feature.properties.Color || colorMap[feature.properties.N_Linha] || "#ffffff";
    const status = feature.properties.Status_Obra;
    const isPolygon = feature.geometry.type.includes("Polygon");
    
    if (isPolygon) {
        return { color: color, fillColor: color, fillOpacity: 0.5, weight: 2 };
    } else {
        if (status === "Projeto") {
            return { color: color, weight: 4, opacity: 0.8, lineCap: 'round', dashArray: '5, 8' };
        } else {
            return { color: color, weight: 5, opacity: 0.8, lineCap: 'round' };
        }
    }
}


// --- RENDERING CORE ---
let currentYearSlider = 2026;

function renderLayers() {
    allNonPolygonLayers.clearLayers();
    allPolygonLayers.clearLayers();
    
    const activeLines = Array.from(document.querySelectorAll('.filter-line-cb:checked')).map(cb => parseInt(cb.value));
    const activeStatus = Array.from(document.querySelectorAll('.filter-status-cb:checked')).map(cb => cb.value);
    const activeGeos = Array.from(document.querySelectorAll('.filter-geo-cb:checked')).map(cb => cb.value);

    // General filter function
    const generalFilter = function(feature) {
        const p = feature.properties;
        const geom = feature.geometry.type;
        
        // Geometry Filter
        if (geom.includes("Line") && !activeGeos.includes("Line")) return false;
        if (geom.includes("Point") && !activeGeos.includes("Point")) return false;
        if (geom.includes("Polygon") && !activeGeos.includes("Polygon")) return false;
        
        // Line Filter
        if (p.N_Linha !== undefined && !activeLines.includes(p.N_Linha)) return false;
        
        // Status Filter
        if (p.Status_Obra && !activeStatus.includes(p.Status_Obra)) return false;
        
        // Timeline Filter
        if (p._year > currentYearSlider) return false;
        
        return true;
    };

    // Point styling function
    const pointOptions = function (feature, latlng) {
        const color = feature.properties.Color || colorMap[feature.properties.N_Linha] || "#ffffff";
        const status = feature.properties.Status_Obra;
        
        let fillColor = "#ffffff";
        let weight = 2;
        
        if (status === "Projeto") {
            fillColor = "transparent";
        } else if (status === "Suspenso" || status === "Cancelado") {
            fillColor = "gray";
            weight = 0; // sem contorno
        }
        
        const marker = L.circleMarker(latlng, {
            radius: 5, fillColor: fillColor, color: color, weight: weight, opacity: 1, fillOpacity: 1
        });
        
        // FlyTo on click
        marker.on('click', () => {
            map.flyTo(latlng, 16, { duration: 1.5 });
        });
        
        return marker;
    };

    datasets.forEach(geojsonData => {
        // 1. Process Non-Polygons (Lines & Points)
        const nonPolygonLayer = L.geoJSON(geojsonData, {
            filter: f => !f.geometry.type.includes("Polygon") && generalFilter(f),
            style: getFeatureStyle,
            pointToLayer: pointOptions
        });
        
        nonPolygonLayer.eachLayer(layer => {
            layer.on({ mouseover: handleMouseOver, mousemove: handleMouseMove, mouseout: handleMouseOut });
        });
        nonPolygonLayer.addTo(allNonPolygonLayers);

        // 2. Process Polygons (Areas)
        const polygonLayer = L.geoJSON(geojsonData, {
            filter: f => f.geometry.type.includes("Polygon") && generalFilter(f),
            style: getFeatureStyle
        });
        
        polygonLayer.eachLayer(layer => {
            layer.on({ mouseover: handleMouseOver, mousemove: handleMouseMove, mouseout: handleMouseOut });
        });
        polygonLayer.addTo(allPolygonLayers);
    });
    
    updatePolygonVisibility();
}


// --- POLYGON VISIBILITY LOGIC (ZOOM) ---
function updatePolygonVisibility() {
    if (map.getZoom() >= 16) {
        if (!map.hasLayer(allPolygonLayers)) {
            map.addLayer(allPolygonLayers);
        }
    } else {
        if (map.hasLayer(allPolygonLayers)) {
            map.removeLayer(allPolygonLayers);
        }
    }
}
map.on('zoomend', updatePolygonVisibility);


// --- TIMELINE CONTROLS ---
const timeSlider = document.getElementById('time-slider');
const yearDisplay = document.getElementById('current-year-display');
const playBtn = document.getElementById('play-pause-btn');

timeSlider.addEventListener('input', function(e) {
    currentYearSlider = parseInt(e.target.value);
    yearDisplay.textContent = currentYearSlider;
    renderLayers();
});

let playInterval = null;
playBtn.addEventListener('click', () => {
    if (playInterval) {
        // Pause
        clearInterval(playInterval);
        playInterval = null;
        playBtn.textContent = '▶';
    } else {
        // Play
        playBtn.textContent = '⏸';
        if (currentYearSlider >= 2026) {
            currentYearSlider = 1974;
            timeSlider.value = currentYearSlider;
            yearDisplay.textContent = currentYearSlider;
            renderLayers();
        }
        
        playInterval = setInterval(() => {
            currentYearSlider++;
            if (currentYearSlider > 2026) {
                clearInterval(playInterval);
                playInterval = null;
                playBtn.textContent = '▶';
                currentYearSlider = 2026;
            }
            timeSlider.value = currentYearSlider;
            yearDisplay.textContent = currentYearSlider;
            renderLayers();
        }, 800);
    }
});


// --- SEARCH BAR ---
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

searchInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    searchResults.innerHTML = '';
    
    if (val.length < 2) {
        searchResults.classList.add('hidden');
        return;
    }
    
    const matches = searchIndex.filter(s => s.name.toLowerCase().includes(val)).slice(0, 5);
    if (matches.length > 0) {
        searchResults.classList.remove('hidden');
        matches.forEach(m => {
            const li = document.createElement('li');
            li.textContent = `${m.name} (${m.modal})`;
            li.addEventListener('click', () => {
                map.flyTo(m.latlng, 16, { duration: 1.5 });
                searchResults.classList.add('hidden');
                searchInput.value = m.name;
            });
            searchResults.appendChild(li);
        });
    } else {
        searchResults.classList.add('hidden');
    }
});

// Initial Render
renderLayers();
