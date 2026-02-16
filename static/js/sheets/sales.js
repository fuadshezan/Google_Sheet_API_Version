// ── Sales Sheet Module ─────────────────────────────────────────────────────

(function() {
    const SHEET_NAME = "Sales";
    let dataTableInstance = null;

    /**
     * Load Sales sheet data
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
     * @param {Array} headers - Column headers
     * @param {Array} rows - Data rows
     * @param {Object} config - Sheet configuration
     */
    function renderTable(headers, rows, config = {}) {
        // Destroy existing DataTable instance
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

        // Show table, hide empty state
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
                emptyTable: "No data available",
            },
        });

        // Update info
        let infoText = `${rows.length} rows, ${headers.length} columns`;
        if (config.header_row && config.header_row > 1) {
            infoText += ` | Header: Row ${config.header_row}`;
        }
        if (config.columns) {
            infoText += ` | Columns: ${config.columns}`;
        }
        document.getElementById("sheetInfo").textContent = infoText;
    }

    /**
     * Refresh current sheet data
     */
    function refresh() {
        loadData();
    }

    /**
     * Update order statuses from courier APIs
     */
    async function updateStatuses() {
        const btn = document.getElementById("btnUpdate");
        const originalHTML = btn.innerHTML;

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Updating...';
        ui.showLoading("Fetching delivery statuses from Pathao / Steadfast...");

        try {
            const result = await api.updateStatuses();
            
            ui.showToast(
                `Status update complete! ${result.updated} of ${result.with_consignment} orders updated.`,
                "success"
            );

            // Show details for each updated order
            if (result.details && result.details.length > 0) {
                result.details.forEach((detail, idx) => {
                    setTimeout(() => {
                        ui.showToast(
                            `${detail.order_id}: ${detail.status}`,
                            "info"
                        );
                    }, (idx + 1) * 500);
                });
            }

            // Show errors if any
            if (result.errors && result.errors.length > 0) {
                result.errors.forEach((error, idx) => {
                    setTimeout(() => {
                        ui.showToast(error, "warning");
                    }, (result.details.length + idx + 1) * 500);
                });
            }

            // Refresh data to show updated statuses
            setTimeout(() => {
                refresh();
            }, 1000);

        } catch (err) {
            ui.showToast(`Failed to update statuses: ${err.message}`, "danger");
        } finally {
            ui.hideLoading();
            btn.disabled = false;
            btn.innerHTML = originalHTML;
        }
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

        ui.setupUserProfile();
        setupNavigation();
        loadData();

        // Setup event listeners
        document.getElementById("btnRefresh").addEventListener("click", refresh);
        document.getElementById("btnUpdate").addEventListener("click", updateStatuses);

        // Show Update button only for admin
        ui.showForRole("btnUpdate", "admin");
    }

    // Initialize on DOM ready
    document.addEventListener("DOMContentLoaded", init);
})();
