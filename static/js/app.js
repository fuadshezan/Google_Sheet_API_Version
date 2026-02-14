// ── State ────────────────────────────────────────────────────────────────────

let currentSheet = null;
let dataTableInstance = null;
let authUser = null;  // { username, email, role }
let authToken = null;

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

// ── Init ────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
    // Check authentication first
    if (!checkAuth()) return;

    // Setup user UI elements
    setupUserUI();

    // Load sheet names
    loadSheetNames();
});
