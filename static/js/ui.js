// ── UI Components & Helpers Module ─────────────────────────────────────────

const ui = (function() {
    let loadingOverlay = null;
    let loadingText = null;

    /**
     * Initialize UI module — cache DOM refs and wire up sidebar toggle
     */
    function init() {
        loadingOverlay = document.getElementById("loadingOverlay");
        loadingText    = document.getElementById("loadingText");
        _initSidebarToggle();
    }

    // ── Sidebar Toggle (mobile off-canvas) ──────────────────────────────────

    function _initSidebarToggle() {
        const hamburger = document.getElementById("hamburger");
        const overlay   = document.getElementById("sidebarOverlay");

        if (hamburger) {
            hamburger.addEventListener("click", toggleSidebar);
        }

        if (overlay) {
            overlay.addEventListener("click", closeSidebar);
        }

        // Close sidebar when any nav link is clicked on mobile
        document.querySelectorAll(".sidebar .nav-link").forEach(link => {
            link.addEventListener("click", () => {
                if (window.innerWidth < 992) closeSidebar();
            });
        });
    }

    function toggleSidebar() {
        document.body.classList.toggle("sidebar-open");
        const overlay = document.getElementById("sidebarOverlay");
        if (overlay) overlay.classList.toggle("show");
    }

    function closeSidebar() {
        document.body.classList.remove("sidebar-open");
        const overlay = document.getElementById("sidebarOverlay");
        if (overlay) overlay.classList.remove("show");
    }

    // ── Loading Overlay ──────────────────────────────────────────────────────

    /**
     * Show loading overlay with custom text
     * @param {string} text - Loading message to display
     */
    function showLoading(text = "Loading...") {
        if (!loadingOverlay || !loadingText) init();
        if (loadingText) loadingText.textContent = text;
        if (loadingOverlay) loadingOverlay.classList.add("show");
    }

    /**
     * Hide loading overlay
     */
    function hideLoading() {
        if (!loadingOverlay) init();
        if (loadingOverlay) loadingOverlay.classList.remove("show");
    }

    // ── Toast ────────────────────────────────────────────────────────────────

    /**
     * Show toast notification
     * @param {string} message - Message to display
     * @param {string} type    - Toast type: success, danger, warning, info
     */
    function showToast(message, type = "success") {
        const container = document.getElementById("toastContainer");
        if (!container) {
            console.error("Toast container not found");
            return;
        }

        const icons = {
            success: "bi-check-circle-fill",
            danger:  "bi-exclamation-triangle-fill",
            warning: "bi-exclamation-circle-fill",
            info:    "bi-info-circle-fill",
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

    // ── User Profile ─────────────────────────────────────────────────────────

    /**
     * Setup user profile UI elements
     * Populates username, role badge, avatar in sidebar
     */
    function setupUserProfile() {
        const user = auth.getCurrentUser();
        if (!user) return;

        const userNameEl   = document.getElementById("userName");
        const userRoleEl   = document.getElementById("userRole");
        const userAvatarEl = document.getElementById("userAvatar");

        if (userNameEl)   userNameEl.textContent = user.username;
        if (userRoleEl) {
            userRoleEl.textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);
            userRoleEl.className   = `badge ${user.role === "admin" ? "bg-danger" : "bg-info"}`;
        }
        if (userAvatarEl) {
            userAvatarEl.textContent = user.username.charAt(0).toUpperCase();
        }
    }

    // ── Sidebar Active State ─────────────────────────────────────────────────

    /**
     * Set active sheet in sidebar navigation
     * @param {string} sheetName - Name of the currently active sheet
     */
    function setActiveSheet(sheetName) {
        document.querySelectorAll("#sheetList .nav-link").forEach((el) => {
            const linkText = el.querySelector("span")?.textContent || el.textContent.trim();
            el.classList.toggle("active", linkText === sheetName);
        });
    }

    // ── Sidebar Population ───────────────────────────────────────────────────

    // Icon map for sidebar nav items
    const _sheetIcons = {
        "Sales":              "bi-cart-check",
        "Sales Raw":          "bi-file-earmark-plus",
        "Inventory":          "bi-box-seam",
        "Summary Inventory":  "bi-clipboard-data",
        "Input Inventory":    "bi-input-cursor",
        "Expenses":           "bi-wallet2",
        "Product Purchase":   "bi-bag-check",
        "Information":        "bi-info-circle",
    };

    /**
     * Populate sidebar with sheet names
     * @param {Array} sheets - Array of sheet objects from API
     */
    function populateSidebar(sheets) {
        const sheetList = document.getElementById("sheetList");
        if (!sheetList) return;

        sheetList.innerHTML = "";

        const sheetUrlMap = {
            "Sales":              "/sheets/sales.html",
            "Sales Raw":          "/sheets/sales-raw.html",
            "Inventory":          "/sheets/inventory.html",
            "Summary Inventory":  "/sheets/summary-inventory.html",
            "Input Inventory":    "/sheets/input-inventory.html",
            "Expenses":           "/sheets/expenses.html",
            "Product Purchase":   "/sheets/product-purchase.html",
            "Information":        "/sheets/information.html",
        };

        sheets.forEach((sheet) => {
            const link = document.createElement("a");
            link.className = "nav-link";
            link.href = sheetUrlMap[sheet.name] || "/sheets/" + sheet.name.toLowerCase().replace(/\s+/g, '-') + ".html";

            const icon = _sheetIcons[sheet.name] || "bi-file-earmark-text";
            link.innerHTML = `<i class="bi ${icon}"></i><span>${sheet.name}</span>`;

            // Badge for non-standard header rows
            if (sheet.header_row > 1) {
                const badge = document.createElement("span");
                badge.className = "badge bg-secondary ms-auto";
                badge.style.fontSize = "0.65rem";
                badge.textContent = `R${sheet.header_row}`;
                badge.title = `Header starts at row ${sheet.header_row}`;
                link.appendChild(badge);
            }

            sheetList.appendChild(link);
        });

        // Re-wire close on click after population
        sheetList.querySelectorAll(".nav-link").forEach(link => {
            link.addEventListener("click", () => {
                if (window.innerWidth < 992) closeSidebar();
            });
        });
    }

    // ── Role Visibility ──────────────────────────────────────────────────────

    /**
     * Show/hide element based on role
     * @param {string} elementId     - ID of element to show/hide
     * @param {string|Array} allowedRoles - Role(s) that can see the element
     */
    function showForRole(elementId, allowedRoles) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const user = auth.getCurrentUser();
        if (!user) {
            element.style.display = "none";
            return;
        }

        const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
        element.style.display = roles.includes(user.role) ? "" : "none";
    }

    // ── Public API ───────────────────────────────────────────────────────────
    return {
        init,
        showLoading,
        hideLoading,
        showToast,
        setupUserProfile,
        setActiveSheet,
        populateSidebar,
        showForRole,
        toggleSidebar,
        closeSidebar,
    };
})();
