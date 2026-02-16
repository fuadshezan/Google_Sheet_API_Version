// ──Sales Raw Sheet Module ─────────────────────────────────────────────────

(function() {
    const SHEET_NAME = "Sales Raw";
    let dataTableInstance = null;
    let productsList = [];
    let productRowCounter = 0;

    /**
     * Load Sales Raw sheet data
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

    // ── Insert Order Functions ─────────────────────────────────────────────

    /**
     * Load products from Inventory sheet
     */
    async function loadProducts() {
        if (productsList.length > 0) return; // Already cached
        try {
            const data = await api.fetchProducts();
            productsList = data.products || [];
        } catch (err) {
            console.error("Failed to load products:", err);
            ui.showToast("Failed to load products list", "danger");
        }
    }

    /**
     * Build HTML options for product dropdown
     */
    function buildProductOptions() {
        let html = '<option value="">-- Select Product --</option>';
        productsList.forEach((p) => {
            const escaped = common.sanitize(p);
            html += `<option value="${escaped}">${escaped}</option>`;
        });
        return html;
    }

    /**
     * Add a product row to the form
     */
    function addProductRow() {
        productRowCounter++;
        const container = document.getElementById("productList");
        const idx = productRowCounter;

        const div = document.createElement("div");
        div.className = "product-row";
        div.id = `productRow_${idx}`;
        div.innerHTML = `
            <span class="product-badge">${container.children.length + 1}</span>
            <div class="product-select-wrapper">
                <label class="form-label mb-1" style="font-size:0.8rem;">Product</label>
                <select class="form-select form-select-sm product-select" required>
                    ${buildProductOptions()}
                </select>
            </div>
            <div class="qty-wrapper">
                <label class="form-label mb-1" style="font-size:0.8rem;">Qty</label>
                <input type="number" class="form-control form-control-sm product-qty" min="1" value="1" required>
            </div>
            <div class="remove-btn-wrapper">
                <label class="form-label mb-1" style="font-size:0.8rem;">&nbsp;</label>
                <button type="button" class="btn btn-outline-danger btn-sm remove-product-btn" data-row-id="productRow_${idx}" title="Remove">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        `;
        container.appendChild(div);
        renumberProductBadges();

        // Initialize Select2
        $(`#productRow_${idx} .product-select`).select2({
            theme: 'bootstrap-5',
            width: '100%',
            placeholder: '-- Search Product --',
            allowClear: true,
            dropdownParent: $('#insertOrderModal')
        });

        // Attach remove handler
        div.querySelector('.remove-product-btn').addEventListener('click', function() {
            removeProductRow(this.getAttribute('data-row-id'));
        });
    }

    /**
     * Remove a product row
     */
    function removeProductRow(rowId) {
        const container = document.getElementById("productList");
        const row = document.getElementById(rowId);
        if (row && container.children.length > 1) {
            $(row).find('.product-select').select2('destroy');
            row.remove();
            renumberProductBadges();
        } else if (container.children.length <= 1) {
            ui.showToast("At least one product is required.", "warning");
        }
    }

    /**
     * Renumber product badges after add/remove
     */
    function renumberProductBadges() {
        const rows = document.querySelectorAll("#productList .product-row");
        rows.forEach((row, i) => {
            const badge = row.querySelector(".product-badge");
            if (badge) badge.textContent = i + 1;
        });
    }

    /**
     * Open Insert Order modal
     */
    async function openInsertOrderModal() {
        await loadProducts();
        if (productsList.length === 0) {
            ui.showToast("Could not load product list. Try again.", "danger");
            return;
        }

        // Reset form
        document.getElementById("insertOrderForm").reset();
        document.getElementById("productList").innerHTML = "";
        productRowCounter = 0;

        // Set today's date
        const today = common.formatDateForInput(common.getToday());
        document.getElementById("orderDate").value = today;

        // Add first product row
        addProductRow();
    }

    /**
     * Submit order to backend
     */
    async function submitInsertOrder() {
        const btn = document.getElementById("btnSubmitOrder");

        // Gather customer info
        const date = document.getElementById("orderDate").value;
        const customerName = document.getElementById("customerName").value.trim();
        const customerContact = document.getElementById("customerContact").value.trim();
        const customerAddress = document.getElementById("customerAddress").value.trim();
        const customerType = document.getElementById("customerType").value;

        // Validate
        if (!date || !customerName || !customerContact || !customerAddress) {
            ui.showToast("Please fill in all required customer fields.", "warning");
            return;
        }

        // Gather products
        const productRows = document.querySelectorAll("#productList .product-row");
        const products = [];
        let valid = true;

        productRows.forEach((row, i) => {
            const select = row.querySelector(".product-select");
            const qtyInput = row.querySelector(".product-qty");
            const product = select.value;
            const qty = parseInt(qtyInput.value);

            if (!product) {
                ui.showToast(`Product #${i + 1}: Please select a product.`, "warning");
                valid = false;
                return;
            }
            if (!qty || qty < 1) {
                ui.showToast(`Product #${i + 1}: Quantity must be at least 1.`, "warning");
                valid = false;
                return;
            }
            products.push({ product_details: product, quantity: qty });
        });

        if (!valid || products.length === 0) return;

        // Format date for sheet
        const dateObj = common.parseDateFromInput(date);
        const formattedDate = common.formatDateForSheet(dateObj);

        // Submit
        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Submitting...';

        try {
            const data = await api.insertOrder({
                date: formattedDate,
                customer_name: customerName,
                customer_contact: customerContact,
                customer_address: customerAddress,
                customer_type: customerType,
                products: products
            });

            // Close modal
            const modalEl = document.getElementById("insertOrderModal");
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();

            ui.showToast(data.message || "Order inserted successfully!", "success");

            // Refresh data
            refresh();

        } catch (err) {
            ui.showToast(`Failed to insert order: ${err.message}`, "danger");
        } finally {
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
        document.getElementById("btnAddProduct").addEventListener("click", addProductRow);
        document.getElementById("btnSubmitOrder").addEventListener("click", submitInsertOrder);

        // Open modal when Insert button clicked
        document.getElementById("insertOrderModal").addEventListener("show.bs.modal", openInsertOrderModal);

        // Show Insert button only for admin
        ui.showForRole("btnInsert", "admin");
    }

    // Initialize on DOM ready
    document.addEventListener("DOMContentLoaded", init);
})();
