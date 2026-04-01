// ──Sales Raw Sheet Module ─────────────────────────────────────────────────

(function () {
    const SHEET_NAME = "Sales Raw";
    let dataTableInstance = null;
    let productsList = [];
    let productRowCounter = 0;
    let orderInsertedDuringSession = false;

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

    function extractPriceFromProductDetails(productDetailsText) {
        if (!productDetailsText) return "";

        // Normalize whitespace (Select2 / HTML can include NBSP)
        const text = String(productDetailsText).replace(/\u00A0/g, " ").trim();

        // Preferred formats:
        //   "... -- 350"
        //   "... – 350" (en-dash)
        //   "... — 350" (em-dash)
        // Allow optional currency suffix: tk / taka / ৳
        const markerMatch = text.match(/(?:--|–|—)\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:৳|tk|taka)?\b/i);
        if (markerMatch) return markerMatch[1];

        // Fallback: last numeric token before optional currency
        const tailNumberMatch = text.match(/([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:৳|tk|taka)?\s*$/i);
        if (tailNumberMatch) return tailNumberMatch[1];

        return "";
    }

    function parseAmount(val) {
        if (val === null || val === undefined) return 0;
        const n = Number(String(val).replace(/,/g, "").trim());
        return Number.isFinite(n) ? n : 0;
    }

    /**
     * Normalize and validate a Bangladeshi phone number.
     *
     * Steps:
     *  1. Remove all whitespace and special characters (+, -, etc.)
     *  2. Convert Bengali digits (০-৯) to English digits (0-9)
     *  3. Strip leading country code "88" if present
     *  4. Validate that the result is exactly 11 digits
     *
     * @param {string} raw  – The raw phone number input
     * @returns {{ valid: boolean, number: string, error?: string }}
     */
    function normalizePhoneNumber(raw) {
        if (!raw) return { valid: false, number: "", converted: false, error: "Phone number is empty." };

        // 1. Strip all whitespace and non-digit / non-Bengali-digit characters
        //    Keep only 0-9 and Bengali ০-৯
        let cleaned = String(raw).replace(/[^0-9\u09E6-\u09EF]/g, "");

        // 2. Convert Bengali digits to English digits
        //    Bengali ০ = U+09E6 … ৯ = U+09EF
        const hasBengali = /[\u09E6-\u09EF]/.test(cleaned);
        cleaned = cleaned.replace(/[\u09E6-\u09EF]/g, (ch) =>
            String(ch.charCodeAt(0) - 0x09E6)
        );

        // 3. Remove leading country code "88"
        if (cleaned.startsWith("88")) {
            cleaned = cleaned.substring(2);
        }

        // 4. Validate: must be exactly 11 digits
        if (cleaned.length !== 11) {
            return {
                valid: false,
                number: cleaned,
                converted: hasBengali,
                error: `Phone number must be 11 digits (got ${cleaned.length}).`
            };
        }

        if (!/^\d{11}$/.test(cleaned)) {
            return { valid: false, number: cleaned, converted: hasBengali, error: "Phone number contains non-numeric characters." };
        }

        return { valid: true, number: cleaned, converted: hasBengali };
    }

    /**
     * Live-validate the customer contact field.
     * - Green shadow when valid
     * - Error hint text when invalid
     * - Auto-replaces Bengali digits with English in the field
     */
    function validateContactField() {
        const input = document.getElementById("customerContact");
        if (!input) return;

        const rawValue = input.value.trim();

        // Get or create the error hint element
        let hint = document.getElementById("contactValidationHint");
        if (!hint) {
            hint = document.createElement("div");
            hint.id = "contactValidationHint";
            hint.className = "contact-validation-hint";
            input.parentNode.appendChild(hint);
        }

        // If the field is empty, reset to neutral state
        if (!rawValue) {
            input.classList.remove("contact-valid", "contact-invalid");
            hint.textContent = "";
            hint.style.display = "none";
            return;
        }

        const result = normalizePhoneNumber(rawValue);

        if (result.valid) {
            // If Bengali digits were present, replace the field value with the converted English number
            if (result.converted) {
                input.value = result.number;
            }
            input.classList.add("contact-valid");
            input.classList.remove("contact-invalid");
            hint.textContent = "";
            hint.style.display = "none";
        } else {
            input.classList.add("contact-invalid");
            input.classList.remove("contact-valid");
            hint.textContent = result.error;
            hint.style.display = "block";
        }
    }

    const DELIVERY_CHARGES = {
        "Pathao Inside": 70,
        "Pathao Outside": 110,
        "Steadfast Inside": 70,
        "Steadfast Outside": 110,
        "Personal Dev": 0,
        "Pathao Subcity": 90,
        "Steadfast Subcity": 90,
    };

    function updatePayableAmount() {
        const totalEl = document.getElementById("TotalPrice");
        const chargeEl = document.getElementById("deliveryCharge");
        const discountEl = document.getElementById("discountedPrice");
        const payableEl = document.getElementById("payableAmount");
        if (!payableEl) return;

        const totalProductPrice = parseAmount(totalEl ? totalEl.value : 0);
        const deliveryCharge = parseAmount(chargeEl ? chargeEl.value : 0);
        const discountedPrice = parseAmount(discountEl ? discountEl.value : 0);

        // Payable = Total product price + Delivery charges - (Discounted price)
        // Discount can be negative; subtracting a negative will add it.
        payableEl.value = String(totalProductPrice + deliveryCharge - discountedPrice);
    }

    function updateDeliveryChargeDisplay() {
        const platformEl = document.getElementById("deliveryPlatform");
        const chargeEl = document.getElementById("deliveryCharge");
        if (!platformEl || !chargeEl) return;

        const platform = platformEl.value;
        if (!platform) {
            chargeEl.value = "";
            return;
        }

        const charge = Object.prototype.hasOwnProperty.call(DELIVERY_CHARGES, platform)
            ? DELIVERY_CHARGES[platform]
            : "";

        chargeEl.value = charge === "" ? "" : String(charge);

        updatePayableAmount();
    }

    function getSelectedProductText(selectEl) {
        try {
            // Prefer Select2's display text if available
            if (window.jQuery && selectEl && window.jQuery(selectEl).data("select2")) {
                const data = window.jQuery(selectEl).select2("data");
                if (Array.isArray(data) && data[0] && typeof data[0].text === "string") {
                    return data[0].text;
                }
            }
        } catch {
            // ignore and fall back
        }

        // Plain select fallback
        const opt = selectEl && selectEl.selectedIndex >= 0 ? selectEl.options[selectEl.selectedIndex] : null;
        return (opt && opt.text) ? opt.text : (selectEl ? selectEl.value : "");
    }

    function updateProductRowPrice(rowEl) {
        const selectEl = rowEl.querySelector(".product-select");
        const priceEl = rowEl.querySelector(".product-price");
        if (!selectEl || !priceEl) return;

        const qtyInput = rowEl.querySelector(".product-qty");
        const qty = Math.max(0, parseAmount(qtyInput ? qtyInput.value : 0));

        const selectedText = getSelectedProductText(selectEl);
        const unitPriceRaw = extractPriceFromProductDetails(selectedText);
        const unitPrice = parseAmount(unitPriceRaw);

        const lineTotal = unitPrice * qty;
        priceEl.value = lineTotal ? String(lineTotal) : "";
    }

    function updateTotalProductsPrice() {
        const totalEl = document.getElementById("TotalPrice");
        if (!totalEl) return;

        const rows = document.querySelectorAll("#productList .product-row");
        let sum = 0;
        rows.forEach((rowEl) => {
            const rowTotalEl = rowEl.querySelector(".product-price");
            sum += parseAmount(rowTotalEl ? rowTotalEl.value : 0);
        });

        totalEl.value = String(sum);

        updatePayableAmount();
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
            <div class="product-row-top">
                <span class="product-badge">${container.children.length + 1}</span>
                <div class="product-select-wrapper">
                    <label class="form-label mb-1">Product</label>
                    <select class="form-select form-select-sm product-select" required>
                        ${buildProductOptions()}
                    </select>
                </div>
            </div>
            <div class="product-row-bottom">
                <div class="qty-wrapper">
                    <label class="form-label mb-1">Qty</label>
                    <input type="number" class="form-control form-control-sm product-qty" min="1" value="1" required>
                </div>
                <div class="price-wrapper">
                    <label class="form-label mb-1">Price</label>
                    <input type="text" class="form-control form-control-sm product-price" value="" readonly>
                </div>
                <div class="remove-btn-wrapper">
                    <label class="form-label mb-1">&nbsp;</label>
                    <button type="button" class="btn btn-outline-danger btn-sm remove-product-btn" data-row-id="productRow_${idx}" title="Remove">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
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
        // console.log(`Added product row with ID: productRow_${idx}`);
        // add another product-select change listener to handle price updates when product is changed via Select2 
        const qtyEl = div.querySelector('.product-qty');
        const selectEl = div.querySelector('.product-select');

        // Quantity change
        qtyEl?.addEventListener('input', () => {
            updateProductRowPrice(div);
            updateTotalProductsPrice();
        });

        // Product selection change
        selectEl?.addEventListener('change', () => {
            updateProductRowPrice(div);
            updateTotalProductsPrice();
        });

        // Select2 events (more reliable when using Select2 UI)
        try {
            const $select = window.jQuery ? window.jQuery(selectEl) : null;
            if ($select) {
                $select.on('select2:select', () => {
                    // console.log(`[price] select2:select fired for productRow_${idx}`);
                    updateProductRowPrice(div);
                    updateTotalProductsPrice();
                });
                $select.on('select2:clear', () => {
                    // console.log(`[price] select2:clear fired for productRow_${idx}`);
                    updateProductRowPrice(div);
                    updateTotalProductsPrice();
                });
                // Some Select2 setups only trigger plain 'change'
                $select.on('change', () => {
                    // console.log(`[price] jquery change fired for productRow_${idx}`);
                    updateProductRowPrice(div);
                    updateTotalProductsPrice();
                });
            }
        } catch (e) {
            console.warn("[price] failed to attach select2 events", e);
        }
        updateProductRowPrice(div);
        updateTotalProductsPrice();

        // Attach remove handler
        div.querySelector('.remove-product-btn').addEventListener('click', function () {
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
            updateTotalProductsPrice();
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

        // Reset the session flag
        orderInsertedDuringSession = false;

        // Reset form
        resetInsertForm();
    }

    /**
     * Reset the insert order form for the next entry
     */
    function resetInsertForm() {
        // Destroy any existing Select2 instances before clearing
        document.querySelectorAll('#productList .product-select').forEach((el) => {
            try {
                if (window.jQuery && window.jQuery(el).data('select2')) {
                    window.jQuery(el).select2('destroy');
                }
            } catch (e) { /* ignore */ }
        });

        document.getElementById("insertOrderForm").reset();
        document.getElementById("productList").innerHTML = "";
        productRowCounter = 0;

        // Clear contact validation state
        const contactEl = document.getElementById("customerContact");
        if (contactEl) {
            contactEl.classList.remove("contact-valid", "contact-invalid");
        }
        const hint = document.getElementById("contactValidationHint");
        if (hint) {
            hint.textContent = "";
            hint.style.display = "none";
        }

        // Set today's date
        const today = common.formatDateForInput(common.getToday());
        document.getElementById("orderDate").value = today;

        // Reset derived UI-only fields
        updateDeliveryChargeDisplay();
        updatePayableAmount();

        // Add first product row
        addProductRow();
        updateTotalProductsPrice();
    }

    /**
     * Submit order to backend
     */
    async function submitInsertOrder() {
        const btn = document.getElementById("btnSubmitOrder");
        // console.log("Submit button:", btn);
        // console.log("IN the order insert javascript.");

        // Gather customer info
        const date = document.getElementById("orderDate").value;
        const customerName = document.getElementById("customerName").value.trim();
        const customerContactRaw = document.getElementById("customerContact").value.trim();
        const customerAddress = document.getElementById("customerAddress").value.trim();
        const customerType = document.getElementById("customerType").value;

        // Normalize & validate phone number
        const phoneResult = normalizePhoneNumber(customerContactRaw);
        if (!phoneResult.valid) {
            ui.showToast(`Invalid phone number: ${phoneResult.error}`, "warning");
            return;
        }
        const customerContact = phoneResult.number;

        // Gather sales info
        const discountedPriceRaw = document.getElementById("discountedPrice").value.trim();
        const totalPriceRaw = document.getElementById("payableAmount")?.value.trim();
        const deliveryPlatform = document.getElementById("deliveryPlatform").value;
        const salesBy = document.getElementById("salesBy").value;

        // Validate
        if (!date || !customerName || !customerContact || !customerAddress) {
            ui.showToast("Please fill in all required customer fields.", "warning");
            return;
        }

        if (!deliveryPlatform || !salesBy) {
            ui.showToast("Please fill in all required sales fields.", "warning");
            return;
        }

        const discountedPrice = Number(discountedPriceRaw);
        const totalPrice = Number(totalPriceRaw);
        // console.log("Parsed prices:", { discountedPrice, totalPrice });
        // // Show their types in console for debugging
        
        // console.log("Types of parsed prices:", {
        //     discountedPrice: typeof discountedPrice,
        //     totalPrice: typeof totalPrice
        // });

        if (Number.isNaN(discountedPrice) || Number.isNaN(totalPrice)) {
            ui.showToast("Discounted price and total price must be numeric.", "warning");
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
                products: products,
                sales: {
                    discounted_price: discountedPrice,
                    total_price: totalPrice,
                    delivery_platform: deliveryPlatform,
                    sales_by: salesBy
                }
            });
            // Mark that an order was inserted during this session
            orderInsertedDuringSession = true;

            ui.showToast(data.message || "Order inserted successfully!", "success");

            // Reset the form for the next insertion (keep modal open)
            resetInsertForm();

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

        ui.init();
        ui.setupUserProfile();
        setupNavigation();
        loadData();

        // Setup event listeners
        document.getElementById("btnRefresh").addEventListener("click", refresh);
        document.getElementById("btnAddProduct").addEventListener("click", addProductRow);
        document.getElementById("btnSubmitOrder").addEventListener("click", (event) => {
            event.preventDefault();
            submitInsertOrder();
        });

        const insertForm = document.getElementById("insertOrderForm");
        insertForm.addEventListener("submit", (event) => {
            event.preventDefault();
            submitInsertOrder();
        });

        // Open modal when Insert button clicked
        document.getElementById("insertOrderModal").addEventListener("show.bs.modal", openInsertOrderModal);

        // Refresh data when the modal is manually closed (only if orders were inserted)
        document.getElementById("insertOrderModal").addEventListener("hidden.bs.modal", () => {
            if (orderInsertedDuringSession) {
                orderInsertedDuringSession = false;
                refresh();
            }
        });

        // Frontend-only: auto-fill delivery charge based on selected platform
        document.getElementById("deliveryPlatform")?.addEventListener("change", updateDeliveryChargeDisplay);

        // Live phone number validation on the contact field
        const contactInput = document.getElementById("customerContact");
        contactInput?.addEventListener("input", validateContactField);
        contactInput?.addEventListener("blur", validateContactField);

        // Frontend-only: auto-fill payable amount when discount changes
        document.getElementById("discountedPrice")?.addEventListener("input", updatePayableAmount);
        document.getElementById("discountedPrice")?.addEventListener("change", updatePayableAmount);

        updateDeliveryChargeDisplay();
        updatePayableAmount();

        // Show Insert button only for admin
        ui.showForRole("btnInsert", "admin");
    }

    // Initialize on DOM ready
    document.addEventListener("DOMContentLoaded", init);
})();
