document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const input = document.getElementById('tracking-input');
    const searchBtn = document.getElementById('search-btn');
    const resultsSection = document.getElementById('results-section');
    const errorMsg = document.getElementById('error-message');
    const timelineContainer = document.getElementById('timeline-container');

    // Display Fields
    const displayId = document.getElementById('display-tracking-id');
    const displayStatus = document.getElementById('current-status-badge');
    const displayName = document.getElementById('client-name');
    const displayCity = document.getElementById('destination-city');
    const displayEstimated = document.getElementById('estimated-date');

    // Event Listeners
    // Configuration
    const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTlunn1dvrmg1_c9aCrPNM2k_LbiuoghiAIs9_WkYDLe7Dcvdo2QVNuYTr_J9YXzvtpepR2AAdrHMFk/pub?output=csv';

    // Event Listeners
    searchBtn.addEventListener('click', handleSearch);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    // Handlers
    async function handleSearch() {
        const id = input.value.trim();
        if (!id) return;

        // UI Reset
        searchBtn.disabled = true;
        searchBtn.innerHTML = '<span class="loader">...</span>';
        errorMsg.classList.add('hidden');
        resultsSection.classList.add('hidden');

        try {
            // Fetch from Google Sheets
            const data = await fetchGoogleSheetData(id);
            renderResults(data);
        } catch (error) {
            console.error(error);
            showError(error.message);
        } finally {
            searchBtn.disabled = false;
            searchBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
        }
    }

    async function fetchGoogleSheetData(trackingId) {
        try {
            const response = await fetch(SHEET_CSV_URL);
            if (!response.ok) throw new Error(`Error de red: ${response.status} - No se pudo conectar a Google Sheets`);

            const text = await response.text();
            const rows = text.split('\n').map(row => row.split(','));

            // Clean ID for comparison
            const searchId = trackingId.replace(/['"]/g, '').trim().toUpperCase();

            const targetRow = rows.find(row => {
                if (!row[0]) return false;
                // Remove quotes if present (common in CSV) and trim
                const cellId = row[0].replace(/['"]/g, '').trim().toUpperCase();
                return cellId === searchId;
            });

            if (!targetRow) {
                // Debug info
                console.warn(`Buscando ID: ${searchId}`);
                console.warn(`Filas leídas: ${rows.length}`);
                if (rows.length > 1) console.warn(`Ejemplo fila 2 ID: ${rows[1][0]}`);
                throw new Error(`Guía "${trackingId}" no encontrada (Leímos ${rows.length} filas)`);
            }

            // Map Row to Internal Data Structure
            // CSV Order: GUIA(0), NOMBRE(1), CIUDAD(2), ESTADO(3), CREACION(4), ESTIMADA(5), ALISTAMIENTO(6), DESPACHO(7), ENTREGA(8), TRANSPORTADORA(9)
            return {
                id: targetRow[0],
                client: {
                    name: targetRow[1],
                    city: targetRow[2]
                },
                status: {
                    current: mapStatus(targetRow[3]),
                    exception: null
                },
                logistics: {
                    carrier: targetRow[9],
                    estimated_date: targetRow[5]
                },
                history: {
                    created_at: targetRow[4],
                    packed_at: targetRow[6], // Header had space 'FECHA _ALISTAMIENTO' but index is 6
                    dispatched_at: targetRow[7],
                    delivered_at: targetRow[8]
                }
            };
        } catch (e) {
            // Rethrow with more context if needed, or just let it bubble
            throw e;
        }
    }

    function mapStatus(sheetStatus) {
        if (!sheetStatus) return 'created';
        const s = sheetStatus.replace(/['"]/g, '').trim().toUpperCase();
        if (s === 'RECIEN CREADO' || s === 'RECIÉN CREADO') return 'created';
        if (s === 'EN ALISTAMIENTO') return 'packed';
        if (s === 'EN TRANSITO' || s === 'EN TRÁNSITO') return 'dispatched';
        if (s === 'ENTREGADO') return 'delivered';
        return 'created'; // Default fallback
    }

    function showError(msg) {
        errorMsg.classList.remove('hidden');
        errorMsg.innerHTML = `<p>${msg || 'Error desconocido'}. <br><small>Si dice "Error de red" o "Failed to fetch", es por seguridad del navegador local. Sube a Netlify para probar.</small></p>`;
    }

    function renderResults(data) {
        // 1. Fill basic info
        displayId.textContent = data.id;
        displayName.textContent = data.client.name;
        displayCity.textContent = data.client.city;
        displayEstimated.textContent = data.logistics.estimated_date;

        displayStatus.textContent = getStatusLabel(data.status.current);

        // 2. Build Timeline
        buildTimeline(data);

        // 3. Show section
        resultsSection.classList.remove('hidden');
    }

    function getStatusLabel(status) {
        const labels = {
            'created': 'Recibido',
            'packed': 'En Alistamiento',
            'dispatched': 'En Tránsito',
            'delivered': 'Entregado'
        };
        return labels[status] || status;
    }

    function buildTimeline(data) {
        timelineContainer.innerHTML = '';

        // Define steps definitions
        const steps = [
            {
                key: 'created_at',
                label: 'Hemos recibido tu pedido',
                path: data.history.created_at
            },
            {
                key: 'packed_at',
                label: 'Estamos empacando tus productos',
                path: data.history.packed_at
            },
            {
                key: 'dispatched_at',
                label: 'Pedido ha sido despachado',
                path: data.history.dispatched_at,
                subLabel: data.logistics.carrier ? `Transportadora: ${data.logistics.carrier}` : null
            },
            {
                key: 'delivered_at',
                label: 'Pedido Entregado',
                path: data.history.delivered_at
            }
        ];

        steps.forEach((step, index) => {
            if (!step.path || step.path.trim() === '') return; // Skip if date is empty in CSV

            const isActive = index === steps.length - 1;

            const item = document.createElement('div');
            item.className = 'timeline-item' + (isActive ? ' active' : '');

            item.innerHTML = `
                <div class="timeline-dot"></div>
                <div class="timeline-content">
                    <h4>${step.label}</h4>
                    ${step.subLabel ? `<p>${step.subLabel}</p>` : ''}
                    <span class="timeline-date">${step.cleanDate || step.path}</span>
                </div>
            `;

            timelineContainer.appendChild(item);
        });
    }
});
