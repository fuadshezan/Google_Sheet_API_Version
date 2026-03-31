// ── Sales Sheet Module ─────────────────────────────────────────────────────

console.log("[SALES.JS] Script loaded");

(function() {
    console.log("[SALES.JS] IIFE started");
    const SHEET_NAME = "Sales";
    let dataTableInstance = null;
    let currentDateFrom = null;
    let currentDateTo = null;
    
    console.log("[SALES.JS] Variables initialized");

    /**
     * Load Sales sheet data
     */
    async function loadData() {
        ui.showLoading(`Loading ${SHEET_NAME}...`);
        console.log(`[DEBUG] loadData called with dateFrom=${currentDateFrom}, dateTo=${currentDateTo}`);
        try {
            const data = await api.fetchSheetData(SHEET_NAME, currentDateFrom, currentDateTo);
            console.log(`[DEBUG] Received ${data.rows.length} rows from API`);
            renderTable(data.headers, data.rows, data.config);
            document.getElementById("btnRefresh").disabled = false;
            
            // Update filter info
            updateFilterInfo();
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

        // Find indices for Order ID and Consignment ID columns
        const orderIdIdx = headers.findIndex(h => h === "Order ID");
        const consignmentIdIdx = headers.findIndex(h => h === "Consignment ID");

        // Build header - add Actions column
        const headerRow = document.createElement("tr");
        headers.forEach((h) => {
            const th = document.createElement("th");
            th.textContent = h || "(empty)";
            headerRow.appendChild(th);
        });
        // Add Actions column
        const actionsHeader = document.createElement("th");
        actionsHeader.textContent = "Actions";
        actionsHeader.style.width = "100px";
        headerRow.appendChild(actionsHeader);
        thead.appendChild(headerRow);

        // Build body
        rows.forEach((row, rowIdx) => {
            const tr = document.createElement("tr");
            headers.forEach((_, i) => {
                const td = document.createElement("td");
                const cellValue = row[i] !== undefined ? row[i] : "";
                td.textContent = cellValue;
                tr.appendChild(td);
            });
            
            // Add Actions cell with Update Status button
            const actionsTd = document.createElement("td");
            const orderId = orderIdIdx >= 0 ? row[orderIdIdx] : null;
            const consignmentId = consignmentIdIdx >= 0 ? row[consignmentIdIdx] : null;
            
            // Show button only if there's a consignment ID
            if (consignmentId && consignmentId.trim() !== "") {
                const updateBtn = document.createElement("button");
                updateBtn.className = "btn btn-sm btn-outline-primary update-status-btn";
                updateBtn.innerHTML = '<i class="bi bi-arrow-repeat"></i>';
                updateBtn.title = "Update Status";
                updateBtn.dataset.orderId = orderId;
                updateBtn.dataset.consignmentId = consignmentId;
                updateBtn.onclick = () => updateSingleStatus(orderId, consignmentId, updateBtn);
                actionsTd.appendChild(updateBtn);
            }
            tr.appendChild(actionsTd);
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
            columnDefs: [
                { targets: -1, orderable: false } // Disable sorting on Actions column
            ]
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
     * Apply date range filter
     */
    function applyFilter() {
        const dateFromInput = document.getElementById("dateFrom");
        const dateToInput = document.getElementById("dateTo");
        
        console.log("[DEBUG] dateFromInput element:", dateFromInput);
        console.log("[DEBUG] dateToInput element:", dateToInput);
        
        const dateFrom = dateFromInput ? dateFromInput.value : "";
        const dateTo = dateToInput ? dateToInput.value : "";
        
        console.log(`[DEBUG] applyFilter - Raw values: dateFrom='${dateFrom}', dateTo='${dateTo}'`);
        
        // Convert empty strings to null
        currentDateFrom = dateFrom && dateFrom.trim() !== "" ? dateFrom : null;
        currentDateTo = dateTo && dateTo.trim() !== "" ? dateTo : null;
        
        console.log(`[DEBUG] applyFilter - After processing: currentDateFrom='${currentDateFrom}', currentDateTo='${currentDateTo}'`);
        
        loadData();
    }

    /**
     * Clear date range filter
     */
    function clearFilter() {
        console.log("[DEBUG] clearFilter called");
        document.getElementById("dateFrom").value = "";
        document.getElementById("dateTo").value = "";
        currentDateFrom = null;
        currentDateTo = null;
        console.log("[DEBUG] Filter cleared, reloading data");
        loadData();
    }

    /**
     * Update filter information text
     */
    function updateFilterInfo() {
        const filterInfoEl = document.getElementById("filterInfo");
        if (currentDateFrom || currentDateTo) {
            let text = "Filter: ";
            if (currentDateFrom && currentDateTo) {
                text += `${currentDateFrom} to ${currentDateTo}`;
            } else if (currentDateFrom) {
                text += `From ${currentDateFrom}`;
            } else if (currentDateTo) {
                text += `Until ${currentDateTo}`;
            }
            filterInfoEl.textContent = text;
            filterInfoEl.classList.remove("text-muted");
            filterInfoEl.classList.add("text-primary", "fw-semibold");
        } else {
            filterInfoEl.textContent = "No filter applied";
            filterInfoEl.classList.remove("text-primary", "fw-semibold");
            filterInfoEl.classList.add("text-muted");
        }
    }

    /**
     * Update status for a single order
     */
    async function updateSingleStatus(orderId, consignmentId, btnElement) {
        const originalHTML = btnElement.innerHTML;
        
        btnElement.disabled = true;
        btnElement.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        
        try {
            const result = await api.updateSingleStatus(orderId);
            
            ui.showToast(
                `Status updated for ${orderId}: ${result.status}`,
                "success"
            );
            
            // Refresh data to show updated status
            setTimeout(() => {
                refresh();
            }, 500);
            
        } catch (err) {
            ui.showToast(`Failed to update status: ${err.message}`, "danger");
            btnElement.disabled = false;
            btnElement.innerHTML = originalHTML;
        }
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
        console.log("[SALES.JS] init() called");
        
        if (!auth.checkAuth()) {
            console.log("[SALES.JS] Auth check failed, exiting init");
            return;
        }
        
        console.log("[SALES.JS] Auth check passed");

        ui.setupUserProfile();
        setupNavigation();
        loadData();

        console.log("[SALES.JS] Setting up event listeners");
        
        // Setup event listeners
        const btnRefresh = document.getElementById("btnRefresh");
        const btnUpdate = document.getElementById("btnUpdate");
        const btnApplyFilter = document.getElementById("btnApplyFilter");
        const btnClearFilter = document.getElementById("btnClearFilter");
        
        console.log("[SALES.JS] Button elements:", {
            btnRefresh,
            btnUpdate,
            btnApplyFilter,
            btnClearFilter
        });
        
        if (btnRefresh) {
            btnRefresh.addEventListener("click", refresh);
            console.log("[SALES.JS] Attached refresh listener");
        }
        
        if (btnUpdate) {
            btnUpdate.addEventListener("click", updateStatuses);
            console.log("[SALES.JS] Attached update statuses listener");
        }
        
        if (btnApplyFilter) {
            btnApplyFilter.addEventListener("click", () => {
                console.log("[SALES.JS] Apply Filter button clicked!");
                applyFilter();
            });
            console.log("[SALES.JS] Attached apply filter listener");
        }
        
        if (btnClearFilter) {
            btnClearFilter.addEventListener("click", () => {
                console.log("[SALES.JS] Clear Filter button clicked!");
                clearFilter();
            });
            console.log("[SALES.JS] Attached clear filter listener");
        }

        // Show Update button only for admin
        ui.showForRole("btnUpdate", "admin");
        
        console.log("[SALES.JS] init() completed");
    }

    // Initialize on DOM ready
    console.log("[SALES.JS] Adding DOMContentLoaded listener");
    document.addEventListener("DOMContentLoaded", () => {
        console.log("[SALES.JS] DOMContentLoaded event fired");
        init();
    });
})();

console.log("[SALES.JS] Script execution completed");
