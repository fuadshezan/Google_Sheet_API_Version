// ── Summary Inventory Sheet Module ────────────────────────────────────────

(function() {
    const SHEET_NAME = "Summary Inventory";
    let dataTableInstance = null;

    /**
     * Load sheet data
     */
    async function loadData() {
        ui.showLoading(`Loading ${SHEET_NAME}...`);
        try {
            const data = await api.fetchSheetData(SHEET_NAME);
            renderTable(data.headers, data.rows, data.config);
            document.getElementById("btnRefresh").disabled = false;
        } catch (err) {
            ui.showToast(`Failed to load "${SHEET_NAME}": ${err.message}`, "danger");
        } finally {
            ui.hideLoading();
        }
    }

    /**
     * Render table with DataTables
     */
    function renderTable(headers, rows, config = {}) {
        if (dataTableInstance) {
            dataTableInstance.destroy();
            dataTableInstance = null;
        }

        const dataTable = document.getElementById("dataTable");
        const thead = dataTable.querySelector("thead");
        const tbody = dataTable.querySelector("tbody");
        thead.innerHTML = "";
        tbody.innerHTML = "";

        // Build header
        const headerRow = document.createElement("tr");
        headers.forEach((h) => {
            const th = document.createElement("th");
            th.textContent = h || "(empty)";
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);

        // Build body
        rows.forEach((row) => {
            const tr = document.createElement("tr");
            headers.forEach((_, i) => {
                const td = document.createElement("td");
                const cellValue = row[i] !== undefined ? row[i] : "";
                td.textContent = cellValue;
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });

        // Show table
        document.getElementById("emptyState").classList.add("d-none");
        document.getElementById("tableWrapper").classList.remove("d-none");

        // Initialize DataTable
        dataTableInstance = new DataTable("#dataTable", {
            pageLength: 25,
            lengthMenu: [10, 25, 50, 100],
            order: [],
            scrollX: true,
            language: {
                search: "Search:",
                lengthMenu: "Show _MENU_ rows",
                info: "Showing _START_ to _END_ of _TOTAL_ rows",
            },
        });

        // Update info
        let infoText = `${rows.length} rows, ${headers.length} columns`;
        if (config.header_row && config.header_row > 1) {
            infoText += ` | Header: Row ${config.header_row}`;
        }
        document.getElementById("sheetInfo").textContent = infoText;
    }

    /**
     * Refresh sheet data
     */
    function refresh() {
        loadData();
    }

    /**
     * Setup sidebar navigation
     */
    async function setupNavigation() {
        try {
            const data = await api.fetchSheets();
            ui.populateSidebar(data.sheets);
            ui.setActiveSheet(SHEET_NAME);
        } catch (err) {
            console.error("Failed to load sheets:", err);
        }
    }

    /**
     * Initialize the page
     */
    function init() {
        if (!auth.checkAuth()) return;

        ui.init();
        ui.setupUserProfile();
        setupNavigation();
        loadData();

        // Setup event listeners
        document.getElementById("btnRefresh").addEventListener("click", refresh);
    }

    // Initialize on DOM ready
    document.addEventListener("DOMContentLoaded", init);
})();
