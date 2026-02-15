// ── State ────────────────────────────────────────────────────────────────────

let currentSheet = null;
let dataTableInstance = null;
let authUser = null;  // { username, email, role }
let authToken = null;
let productsList = []; // Cached product display names for dropdown
let productRowCounter = 0;

const API = "";  // same origin

// ── DOM References ──────────────────────────────────────────────────────────

const sheetList = document.getElementById("sheetList");
const sheetTitle = document.getElementById("sheetTitle");
const sheetInfo = document.getElementById("sheetInfo");
const emptyState = document.getElementById("emptyState");
const tableWrapper = document.getElementById("tableWrapper");
const dataTable = document.getElementById("dataTable");
const btnRefresh = document.getElementById("btnRefresh");
const btnUpdate = document.getElementById("btnUpdate");
const loadingOverlay = document.getElementById("loadingOverlay");
const loadingText = document.getElementById("loadingText");

// ── Auth Helpers ────────────────────────────────────────────────────────────

function getAuthHeaders() {
    return authToken ? { "Authorization": `Bearer ${authToken}` } : {};
}

function checkAuth() {
    authToken = localStorage.getItem("auth_token");
    const userStr = localStorage.getItem("auth_user");

    if (!authToken || !userStr) {
        window.location.href = "/login";
        return false;
    }

    try {
        authUser = JSON.parse(userStr);
    } catch {
        logout();
        return false;
    }

    // Verify token with server
    fetch(`${API}/api/me`, { headers: getAuthHeaders() })
        .then(res => {
            if (!res.ok) {
                logout();
            }
        })
        .catch(() => logout());

    return true;
}

function logout() {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    authToken = null;
    authUser = null;
    window.location.href = "/login";
}

function setupUserUI() {
    if (!authUser) return;

    // Set username display
    const userNameEl = document.getElementById("userName");
    const userRoleEl = document.getElementById("userRole");
    const userAvatarEl = document.getElementById("userAvatar");

    if (userNameEl) userNameEl.textContent = authUser.username;
    if (userRoleEl) {
        userRoleEl.textContent = authUser.role.charAt(0).toUpperCase() + authUser.role.slice(1);
        userRoleEl.className = `badge ${authUser.role === "admin" ? "bg-danger" : "bg-info"}`;
    }
    if (userAvatarEl) {
        userAvatarEl.textContent = authUser.username.charAt(0).toUpperCase();
    }

    // Hide "Update Order Statuses" button for non-admin users
    if (btnUpdate) {
        if (authUser.role !== "admin") {
            btnUpdate.style.display = "none";
        } else {
            btnUpdate.style.display = "";
        }
    }
}

// ── Loading Helpers ─────────────────────────────────────────────────────────

function showLoading(text = "Loading...") {
    loadingText.textContent = text;
    loadingOverlay.classList.add("show");
}

function hideLoading() {
    loadingOverlay.classList.remove("show");
}

// ── Toast Notifications ─────────────────────────────────────────────────────

function showToast(message, type = "success") {
    const container = document.getElementById("toastContainer");
    const icons = {
        success: "bi-check-circle-fill",
        danger: "bi-exclamation-triangle-fill",
        warning: "bi-exclamation-circle-fill",
        info: "bi-info-circle-fill",
    };

    const toastEl = document.createElement("div");
    toastEl.className = `toast align-items-center text-bg-${type} border-0`;
    toastEl.setAttribute("role", "alert");
    toastEl.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                <i class="bi ${icons[type] || icons.info} me-2"></i>${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto"
                    data-bs-dismiss="toast"></button>
        </div>
    `;
    container.appendChild(toastEl);

    const toast = new bootstrap.Toast(toastEl, { delay: 5000 });
    toast.show();
    toastEl.addEventListener("hidden.bs.toast", () => toastEl.remove());
}

// ── Load Sheet Names (Sidebar) ──────────────────────────────────────────────

async function loadSheetNames() {
    try {
        const res = await fetch(`${API}/api/sheets`, { headers: getAuthHeaders() });

        if (res.status === 401) {
            logout();
            return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        sheetList.innerHTML = "";
        data.sheets.forEach((sheet) => {
            const link = document.createElement("a");
            link.className = "nav-link d-flex justify-content-between align-items-center";
            link.href = "#";

            const nameSpan = document.createElement("span");
            nameSpan.textContent = sheet.name;
            link.appendChild(nameSpan);

            // Show config badge if header_row != 1
            if (sheet.header_row > 1) {
                const badge = document.createElement("span");
                badge.className = "badge bg-secondary";
                badge.textContent = `Row ${sheet.header_row}`;
                badge.title = `Header starts at row ${sheet.header_row}, columns ${sheet.columns || "all"}`;
                link.appendChild(badge);
            }

            link.addEventListener("click", (e) => {
                e.preventDefault();
                loadSheetData(sheet.name);
            });
            sheetList.appendChild(link);
        });
    } catch (err) {
        showToast(`Failed to load sheet names: ${err.message}`, "danger");
    }
}

// ── Load Sheet Data (Table) ─────────────────────────────────────────────────

async function loadSheetData(sheetName) {
    showLoading(`Loading "${sheetName}"...`);
    currentSheet = sheetName;

    // Update sidebar active state
    document.querySelectorAll("#sheetList .nav-link").forEach((el) => {
        const name = el.querySelector("span") ? el.querySelector("span").textContent : el.textContent;
        el.classList.toggle("active", name === sheetName);
    });

    try {
        const res = await fetch(`${API}/api/sheets/${encodeURIComponent(sheetName)}`, {
            headers: getAuthHeaders(),
        });

        if (res.status === 401) {
            logout();
            return;
        }
        if (res.status === 403) {
            showToast("You don't have access to this sheet.", "warning");
            hideLoading();
            return;
        }
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || `HTTP ${res.status}`);
        }
        const data = await res.json();

        const cfg = data.config || {};
        const imageCols = data.image_columns || [];
        renderTable(data.headers, data.rows, sheetName, cfg, imageCols);
        btnRefresh.disabled = false;
    } catch (err) {
        showToast(`Failed to load "${sheetName}": ${err.message}`, "danger");
        hideLoading();
    }
}

// ── Image Helpers ───────────────────────────────────────────────────────────

function isImageUrl(value) {
    if (!value || typeof value !== "string") return false;
    const trimmed = value.trim().toLowerCase();
    return (
        (trimmed.startsWith("http://") || trimmed.startsWith("https://")) &&
        (/\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(trimmed) ||
         trimmed.includes("cloudinary.com") ||
         trimmed.includes("imgur.com") ||
         trimmed.includes("drive.google.com"))
    );
}

function createImageCell(url) {
    const wrapper = document.createElement("div");
    wrapper.className = "img-cell";

    const img = document.createElement("img");
    img.src = url;
    img.alt = "Product";
    img.className = "table-thumbnail";
    img.loading = "lazy";

    // Hover zoom
    img.addEventListener("mouseenter", (e) => {
        showZoom(e, url);
    });
    img.addEventListener("mousemove", (e) => {
        moveZoom(e);
    });
    img.addEventListener("mouseleave", () => {
        hideZoom();
    });

    wrapper.appendChild(img);
    return wrapper;
}

function showZoom(e, url) {
    let zoomEl = document.getElementById("imageZoom");
    if (!zoomEl) {
        zoomEl = document.createElement("div");
        zoomEl.id = "imageZoom";
        zoomEl.className = "image-zoom-popup";
        zoomEl.innerHTML = '<img src="" alt="Zoom">';
        document.body.appendChild(zoomEl);
    }
    zoomEl.querySelector("img").src = url;
    zoomEl.style.display = "block";
    moveZoom(e);
}

function moveZoom(e) {
    const zoomEl = document.getElementById("imageZoom");
    if (!zoomEl) return;

    const padding = 16;
    const zoomW = 320;
    const zoomH = 380;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Position to right of cursor by default, flip left if no space
    let left = e.clientX + padding;
    let top = e.clientY - zoomH / 2;

    if (left + zoomW > vw) {
        left = e.clientX - zoomW - padding;
    }
    if (top < padding) {
        top = padding;
    }
    if (top + zoomH > vh - padding) {
        top = vh - zoomH - padding;
    }

    zoomEl.style.left = left + "px";
    zoomEl.style.top = top + "px";
}

function hideZoom() {
    const zoomEl = document.getElementById("imageZoom");
    if (zoomEl) {
        zoomEl.style.display = "none";
    }
}

// ── Render Table with DataTables ────────────────────────────────────────────

function renderTable(headers, rows, sheetName, cfg = {}, imageCols = []) {
    // Destroy existing DataTable instance
    if (dataTableInstance) {
        dataTableInstance.destroy();
        dataTableInstance = null;
    }

    // Build a set of image column indices
    const imageColIndices = new Set();
    imageCols.forEach((colName) => {
        headers.forEach((h, i) => {
            if (h.trim() === colName.trim()) {
                imageColIndices.add(i);
            }
        });
    });

    // Clear table
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

            if (imageColIndices.has(i) && isImageUrl(cellValue)) {
                td.appendChild(createImageCell(cellValue));
            } else {
                td.textContent = cellValue;
            }
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    // Show table, hide empty state
    emptyState.classList.add("d-none");
    tableWrapper.classList.remove("d-none");

    // Initialize DataTables
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

    // Update title and info
    sheetTitle.textContent = sheetName;
    let infoText = `${rows.length} rows, ${headers.length} columns`;
    if (cfg.header_row && cfg.header_row > 1) {
        infoText += ` | Header: Row ${cfg.header_row}`;
    }
    if (cfg.columns) {
        infoText += ` | Columns: ${cfg.columns}`;
    }
    sheetInfo.textContent = infoText;

    // Show/hide Insert Order button based on current sheet
    const btnInsert = document.getElementById("btnInsertOrder");
    if (btnInsert) {
        if (sheetName === "Sales Raw" && authUser && authUser.role === "admin") {
            btnInsert.classList.remove("d-none");
        } else {
            btnInsert.classList.add("d-none");
        }
    }

    hideLoading();
}

// ── Refresh Current Sheet ───────────────────────────────────────────────────

function refreshCurrentSheet() {
    if (currentSheet) {
        loadSheetData(currentSheet);
    }
}

// ── Update Order Statuses ───────────────────────────────────────────────────

async function updateStatuses() {
    const btn = document.getElementById("btnUpdate");
    const originalHTML = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Updating...';
    showLoading("Fetching delivery statuses from Pathao / Steadfast...");

    try {
        const res = await fetch(`${API}/api/update-statuses`, {
            method: "POST",
            headers: getAuthHeaders(),
        });

        if (res.status === 401) {
            logout();
            return;
        }
        if (res.status === 403) {
            showToast("Admin access required to update statuses.", "warning");
            hideLoading();
            return;
        }
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || `HTTP ${res.status}`);
        }
        const data = await res.json();

        hideLoading();

        // Build result message
        if (data.updated > 0) {
            let msg = `Updated ${data.updated} order(s) out of ${data.with_consignment} with consignment IDs.`;
            showToast(msg, "success");

            // Show details
            if (data.details && data.details.length > 0) {
                data.details.forEach((d) => {
                    showToast(`${d.order_id} -> ${d.status} (Row ${d.row})`, "info");
                });
            }
        } else if (data.with_consignment === 0) {
            showToast("No orders with Consignment IDs found.", "warning");
        } else {
            showToast("No statuses could be fetched. Check API credentials.", "warning");
        }

        // Show errors
        if (data.errors && data.errors.length > 0) {
            data.errors.forEach((e) => showToast(e, "danger"));
        }

        // Refresh Sales sheet if currently viewing it
        if (currentSheet === "Sales") {
            loadSheetData("Sales");
        }
    } catch (err) {
        hideLoading();
        showToast(`Update failed: ${err.message}`, "danger");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
    }
}

// ── Insert Order (Sales Raw) ────────────────────────────────────────────────

async function loadProducts() {
    if (productsList.length > 0) return; // Already cached
    try {
        const res = await fetch(`${API}/api/products`, { headers: getAuthHeaders() });
        if (res.ok) {
            const data = await res.json();
            productsList = data.products || [];
        }
    } catch (err) {
        console.error("Failed to load products:", err);
    }
}

function buildProductOptions() {
    let html = '<option value="">-- Select Product --</option>';
    productsList.forEach((p) => {
        const escaped = p.replace(/"/g, "&quot;").replace(/</g, "&lt;");
        html += `<option value="${escaped}">${escaped}</option>`;
    });
    return html;
}

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
            <button type="button" class="btn btn-outline-danger btn-sm" onclick="removeProductRow('productRow_${idx}')" title="Remove">
                <i class="bi bi-trash"></i>
            </button>
        </div>
    `;
    container.appendChild(div);
    renumberProductBadges();
    
    // Initialize Select2 on the newly added select element
    $(`#productRow_${idx} .product-select`).select2({
        theme: 'bootstrap-5',
        width: '100%',
        placeholder: '-- Search Product --',
        allowClear: true,
        dropdownParent: $('#insertOrderModal') // Important: attach to modal
    });
}

function removeProductRow(rowId) {
    const container = document.getElementById("productList");
    const row = document.getElementById(rowId);
    if (row && container.children.length > 1) {
        // Destroy Select2 before removing the element
        $(row).find('.product-select').select2('destroy');
        row.remove();
        renumberProductBadges();
    } else if (container.children.length <= 1) {
        showToast("At least one product is required.", "warning");
    }
}

function renumberProductBadges() {
    const rows = document.querySelectorAll("#productList .product-row");
    rows.forEach((row, i) => {
        const badge = row.querySelector(".product-badge");
        if (badge) badge.textContent = i + 1;
    });
}

async function openInsertOrderModal() {
    // Load products for dropdown
    await loadProducts();
    if (productsList.length === 0) {
        showToast("Could not load product list. Try again.", "danger");
        return;
    }

    // Reset form
    document.getElementById("insertOrderForm").reset();
    document.getElementById("productList").innerHTML = "";
    productRowCounter = 0;

    // Set today's date as default
    const today = new Date().toISOString().split("T")[0];
    document.getElementById("orderDate").value = today;

    // Add first product row
    addProductRow();

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById("insertOrderModal"));
    modal.show();
}

async function submitInsertOrder() {
    const btn = document.getElementById("btnSubmitOrder");

    // Gather customer info
    const date = document.getElementById("orderDate").value;
    const customerName = document.getElementById("customerName").value.trim();
    const customerContact = document.getElementById("customerContact").value.trim();
    const customerAddress = document.getElementById("customerAddress").value.trim();
    const customerType = document.getElementById("customerType").value;

    // Validate customer fields
    if (!date || !customerName || !customerContact || !customerAddress) {
        showToast("Please fill in all required customer fields.", "warning");
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
            showToast(`Product #${i + 1}: Please select a product.`, "warning");
            valid = false;
            return;
        }
        if (!qty || qty < 1) {
            showToast(`Product #${i + 1}: Quantity must be at least 1.`, "warning");
            valid = false;
            return;
        }
        products.push({ product_details: product, quantity: qty });
    });

    if (!valid || products.length === 0) return;

    // Format date to match sheet format (d-MMM-yyyy)
    const dateObj = new Date(date + "T00:00:00");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const formattedDate = `${dateObj.getDate()}-${months[dateObj.getMonth()]}-${dateObj.getFullYear()}`;

    // Submit
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Submitting...';

    try {
        const res = await fetch(`${API}/api/sales-raw/insert`, {
            method: "POST",
            headers: {
                ...getAuthHeaders(),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                date: formattedDate,
                customer_name: customerName,
                customer_contact: customerContact,
                customer_address: customerAddress,
                customer_type: customerType,
                products: products,
            }),
        });

        if (res.status === 401) { logout(); return; }
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || `HTTP ${res.status}`);
        }

        const data = await res.json();

        // Close modal
        const modalEl = document.getElementById("insertOrderModal");
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

        showToast(data.message || `Order inserted successfully!`, "success");

        // Refresh Sales Raw sheet if currently viewing
        if (currentSheet === "Sales Raw") {
            loadSheetData("Sales Raw");
        }
    } catch (err) {
        showToast(`Insert failed: ${err.message}`, "danger");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
    }
}

// ── Init ────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
    // Check authentication first
    if (!checkAuth()) return;

    // Setup user UI elements
    setupUserUI();

    // Load sheet names
    loadSheetNames();
});
