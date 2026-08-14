// Text Sanitizer for UTF-8 glitches
function cleanText(str) {
    if (!str) return "";
    return str
        .replace(/ConstruÃdo|Construdo|ConstruÃ\u00addo/g, "Construído")
        .replace(/MetrÃ|Metr/g, "Metrô")
        .replace(/SÃ\u00a3o|Sǜo|SÃo/g, "São")
        .replace(/FranÃ\u00a7a|Frana/g, "França")
        .replace(/AnÃ\u00a1lia|Anǭlia/g, "Anália")
        .replace(/Santo AndrÃ\u00a9|Santo AndrǸ/g, "Santo André")
        .replace(/MauÃ\u00a1|Mauǭ/g, "Mauá")
        .replace(/EstaciÃ\u00b3n|Estaǜo|Estaes/g, "Estação")
        .replace(/Traados/g, "Traçados");
}

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
basemaps["Claro (Light)"].addTo(map);

// Color Mapping
const colorMap = {
    0: "#000000", 1: "#19159d", 2: "#007b5f", 3: "#ec3138", 4: "#fcc918",
    5: "#874ec1", 6: "#f94c01", 7: "#ac0250", 8: "#929489", 9: "#00aa86",
    10: "#007581", 11: "#dc4f00", 12: "#051972", 13: "#1ea544", 14: "#342b24",
    15: "#8b8b8b", 16: "#791c6c", 17: "#e47802", 18: "#aa6015", 19: "#1976d1",
    20: "#ed3c82", 21: "#af004f", 22: "#64361b", 23: "#a9cf52", 24: "#f7c9c9",
    25: "#d2b994", 26: "#5a4265"
};

// --- CUSTOM BASEMAP LOGIC ---
let currentBasemap = basemaps["Claro (Light)"];
document.querySelectorAll('.basemap-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.basemap-btn').forEach(b => b.classList.remove('active'));
        const targetBtn = e.target.closest('.basemap-btn');
        targetBtn.classList.add('active');
        
        const mapName = targetBtn.getAttribute('data-map');
        map.removeLayer(currentBasemap);
        currentBasemap = basemaps[mapName];
        currentBasemap.addTo(map);
    });
});

// Collapsible Panels Logic (Timeline only)
const toggleTimeline = document.getElementById('toggle-timeline');
const timelineContainer = document.getElementById('timeline-container');
toggleTimeline.addEventListener('click', () => timelineContainer.classList.toggle('collapsed'));

// Accordions logic
document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', (e) => {
        e.target.parentElement.classList.toggle('open');
    });
});

// Tab switching logic
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        e.target.classList.add('active');
        const targetId = e.target.getAttribute('data-tab');
        document.getElementById(targetId).classList.add('active');
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
let allNonPolygonLayers = L.layerGroup().addTo(map);
let allPolygonLayers = L.layerGroup();

const datasets = [linhasData, poligonosData];
const searchIndex = [];

const modalsMap = new Map();
const statusSet = new Set();
let dynamicMinYear = 2026;

datasets.forEach(dataset => {
    dataset.features.forEach(f => {
        const p = f.properties;
        const modal = cleanText(p.Modal || "Desconhecido");
        const nLinha = p.N_Linha !== undefined ? p.N_Linha : -1;
        
        if (p.Status_Obra) statusSet.add(p.Status_Obra);
        
        let lineName = cleanText(p.Nm_Linha);
        if (!lineName && p.Name) {
            lineName = cleanText(p.Name.split('>')[0].trim());
        }
        lineName = lineName || `Linha ${nLinha}`;

        // ONLY add features that are Lines to the UI list
        if (f.geometry.type.includes("Line")) {
            if (!modalsMap.has(modal)) {
                modalsMap.set(modal, new Map());
            }
            if (nLinha !== -1 && !modalsMap.get(modal).has(nLinha)) {
                modalsMap.get(modal).set(nLinha, lineName);
            }
        }

        // --- Data Extraction (Ano de Abertura) ---
        let dateVal = null;
        if (p.data_abertura) {
            const parts = p.data_abertura.split('-');
            if (parts.length >= 1) dateVal = parseInt(parts[0]);
        } else if (p.data_inauguracao) {
            const parts = p.data_inauguracao.split('/');
            dateVal = parts.length === 3 ? parseInt(parts[2]) : parseInt(p.data_inauguracao);
        } else if (p.description) {
            const dateMatch = p.description.match(/(\d{2}\/\d{2}\/\d{4})|(\b(18|19|20)\d{2}\b)/);
            if (dateMatch) {
                if (dateMatch[1]) dateVal = parseInt(dateMatch[1].split('/')[2]);
                else if (dateMatch[2]) dateVal = parseInt(dateMatch[2]);
            }
        }
        
        if (dateVal && dateVal >= 1800 && dateVal <= 2026) {
            if (dateVal < dynamicMinYear) dynamicMinYear = dateVal;
        }
        p._year = dateVal || 1900;

        // Search Index
        if (f.geometry.type.includes("Polygon")) {
            let stName = cleanText(p.Name || p.Nm_Linha || "Estação");
            if (stName.startsWith("Estação ")) stName = stName.replace("Estação ", "");
            let latlng = [f.geometry.coordinates[0][0][0][1], f.geometry.coordinates[0][0][0][0]];
            if (latlng && !searchIndex.find(s => s.name === stName)) {
                searchIndex.push({ name: stName, latlng: latlng, modal: modal });
            }
        }
    });
});

// Update Timeline Slider Min Year dynamically
const timeSlider = document.getElementById('time-slider');
const startYearDisplay = document.getElementById('start-year');
timeSlider.min = dynamicMinYear;
startYearDisplay.textContent = dynamicMinYear;


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
    const rawStatus = cleanText(status);
    const config = statusLabels[status] || statusLabels[rawStatus] || { label: rawStatus, icon: "📌" };
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


// --- FIXED HOVER TOOLTIP LOGIC ---
const tooltip = document.getElementById('custom-tooltip');
let tooltipTimeout = null;

function handleMouseOver(e) {
    clearTimeout(tooltipTimeout);
    
    const p = e.target.feature.properties;
    const name = cleanText(p.Name || p.Nm_Linha || "Sem nome");
    const modal = cleanText(p.Modal || "Metroferroviário");
    const color = p.Color || colorMap[p.N_Linha] || "#ffffff";
    const status = cleanText(p.Status_Obra || "N/D");
    const statusConfig = statusLabels[p.Status_Obra] || statusLabels[status] || { label: status, icon: "" };
    
    tooltip.innerHTML = `
        <h3 style="color: ${color};">
            <span class="pill-color" style="background-color: ${color};"></span>
            ${name.replace('Estação ', '')}
        </h3>
        <span class="tooltip-modal">${modal} • ${statusConfig.icon} ${statusConfig.label}</span>
        <div class="tooltip-data"><strong>Inauguração:</strong> ${p._year !== 1900 ? p._year : 'N/D'}</div>
    `;
    tooltip.classList.remove('hidden');
    
    if (e.target.setStyle) {
        e.target.setStyle({ weight: 8, opacity: 1 });
    }
}

function handleMouseMove(e) {
    const tooltipWidth = tooltip.offsetWidth || 240;
    const tooltipHeight = tooltip.offsetHeight || 120;
    
    let leftPos = e.clientX + 15;
    let topPos = e.clientY + 15;
    
    if (leftPos + tooltipWidth > window.innerWidth - 10) {
        leftPos = e.clientX - tooltipWidth - 15;
    }
    if (topPos + tooltipHeight > window.innerHeight - 10) {
        topPos = e.clientY - tooltipHeight - 15;
    }
    
    tooltip.style.left = leftPos + 'px';
    tooltip.style.top = topPos + 'px';
}

function handleMouseOut(e) {
    allNonPolygonLayers.eachLayer(geoLayer => geoLayer.resetStyle(e.target));
    allPolygonLayers.eachLayer(geoLayer => geoLayer.resetStyle(e.target));
    
    tooltipTimeout = setTimeout(() => {
        tooltip.classList.add('hidden');
    }, 500);
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

    const generalFilter = function(feature) {
        const p = feature.properties;
        const geom = feature.geometry.type;
        
        if (geom.includes("Line") && !activeGeos.includes("Line")) return false;
        if (geom.includes("Polygon") && !activeGeos.includes("Polygon")) return false;
        
        if (p.N_Linha !== undefined && !activeLines.includes(p.N_Linha)) return false;
        if (p.Status_Obra && !activeStatus.includes(p.Status_Obra)) return false;
        if (p._year > currentYearSlider) return false;
        
        return true;
    };

    datasets.forEach(geojsonData => {
        const nonPolygonLayer = L.geoJSON(geojsonData, {
            filter: f => !f.geometry.type.includes("Polygon") && generalFilter(f),
            style: getFeatureStyle
        });
        
        nonPolygonLayer.eachLayer(layer => {
            layer.on({ mouseover: handleMouseOver, mousemove: handleMouseMove, mouseout: handleMouseOut });
        });
        nonPolygonLayer.addTo(allNonPolygonLayers);

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
    updateStats();
}


// --- POLYGON VISIBILITY LOGIC (ZOOM) ---
function updatePolygonVisibility() {
    if (map.getZoom() >= 16) {
        if (!map.hasLayer(allPolygonLayers)) map.addLayer(allPolygonLayers);
    } else {
        if (map.hasLayer(allPolygonLayers)) map.removeLayer(allPolygonLayers);
    }
}
map.on('zoomend', updatePolygonVisibility);


// --- STATISTICS COMPUTATION ---
function updateStats() {
    const activeLines = Array.from(document.querySelectorAll('.filter-line-cb:checked')).map(cb => parseInt(cb.value));
    const activeStatus = Array.from(document.querySelectorAll('.filter-status-cb:checked')).map(cb => cb.value);
    
    let visibleFeatures = [];
    datasets.forEach(dataset => {
        dataset.features.forEach(f => {
            const p = f.properties;
            if (p.N_Linha !== undefined && !activeLines.includes(p.N_Linha)) return;
            if (p.Status_Obra && !activeStatus.includes(p.Status_Obra)) return;
            if (p._year > currentYearSlider) return;
            visibleFeatures.push(f);
        });
    });

    const activeLineNumbers = new Set();
    const modalCounts = {};
    const statusCounts = {};

    visibleFeatures.forEach(f => {
        const p = f.properties;
        if (p.N_Linha !== undefined && p.N_Linha !== -1) activeLineNumbers.add(p.N_Linha);
        
        const m = cleanText(p.Modal || "Outros");
        modalCounts[m] = (modalCounts[m] || 0) + 1;
        
        const rawStatus = cleanText(p.Status_Obra || "Outros");
        const s = statusLabels[p.Status_Obra]?.label || statusLabels[rawStatus]?.label || rawStatus;
        statusCounts[s] = (statusCounts[s] || 0) + 1;
    });

    const yearDisplayStats = document.getElementById('stats-year');
    if (yearDisplayStats) yearDisplayStats.textContent = currentYearSlider;
    
    document.getElementById('kpi-total-lines').textContent = activeLineNumbers.size;
    document.getElementById('kpi-total-segments').textContent = visibleFeatures.length;
    document.getElementById('kpi-modal-count').textContent = Object.keys(modalCounts).length;

    const modalList = document.getElementById('modal-breakdown-list');
    if (modalList) {
        modalList.innerHTML = Object.entries(modalCounts).map(([m, count]) => 
            `<div class="breakdown-item"><span>${m}</span><span class="count">${count} trechos</span></div>`
        ).join('');
    }

    const statusList = document.getElementById('status-breakdown-list');
    if (statusList) {
        statusList.innerHTML = Object.entries(statusCounts).map(([s, count]) => 
            `<div class="breakdown-item"><span>${s}</span><span class="count">${count} trechos</span></div>`
        ).join('');
    }
}

// Stats Modal Event Handlers
const statsModal = document.getElementById('stats-modal');
const openStatsBtn = document.getElementById('open-stats-btn');
const closeStatsBtn = document.getElementById('close-stats-btn');

if (openStatsBtn) {
    openStatsBtn.addEventListener('click', () => {
        updateStats();
        statsModal.classList.remove('hidden');
    });
}
if (closeStatsBtn) {
    closeStatsBtn.addEventListener('click', () => {
        statsModal.classList.add('hidden');
    });
}
if (statsModal) {
    statsModal.addEventListener('click', (e) => {
        if (e.target === statsModal) statsModal.classList.add('hidden');
    });
}


// --- TIMELINE CONTROLS ---
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
        clearInterval(playInterval);
        playInterval = null;
        playBtn.textContent = '▶';
    } else {
        playBtn.textContent = '⏸';
        if (currentYearSlider >= 2026) {
            currentYearSlider = dynamicMinYear;
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
        }, 600);
    }
});


// --- SEARCH BAR ---
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

searchInput.addEventListener('input', (e) => {
    const val = cleanText(e.target.value.toLowerCase());
    searchResults.innerHTML = '';
    
    if (val.length < 2) {
        searchResults.classList.add('hidden');
        return;
    }
    
    const matches = searchIndex.filter(s => cleanText(s.name.toLowerCase()).includes(val)).slice(0, 5);
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
