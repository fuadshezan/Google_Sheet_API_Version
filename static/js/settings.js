// ── Settings Page — Sheet Config Management ───────────────────────────────

(function () {
    let currentConfig = {};
    let deleteTarget = null;

    // ── Icon mapping (same as ui.js) ────────────────────────────────────────
    const SHEET_ICONS = {
        "Sales":              "bi-cart-check",
        "Sales Raw":          "bi-file-earmark-plus",
        "Inventory":          "bi-box-seam",
        "Summary Inventory":  "bi-clipboard-data",
        "Input Inventory":    "bi-input-cursor",
        "Expenses":           "bi-wallet2",
        "Product Purchase":   "bi-bag-check",
        "Information":        "bi-info-circle",
        "DASHBOARD":          "bi-speedometer2",
        "DashBoard Calculation": "bi-calculator",
        "Daily Inventory":    "bi-calendar3",
        "Reference Inventory":"bi-archive",
        "UserName":           "bi-people-fill",
    };

    // ── Load config from API ────────────────────────────────────────────────

    async function loadConfig() {
        ui.showLoading("Loading configuration...");
        try {
            const res = await fetch("/api/config", {
                headers: auth.getAuthHeaders()
            });
            if (res.status === 401) { auth.logout(); return; }
            if (res.status === 403) {
                ui.showToast("Admin access required.", "danger");
                window.location.href = "/";
                return;
            }
            if (!res.ok) throw new Error("Failed to load config");
            currentConfig = await res.json();
            renderCards();
        } catch (err) {
            ui.showToast(`Error: ${err.message}`, "danger");
        } finally {
            ui.hideLoading();
        }
    }

    // ── Render all config cards ─────────────────────────────────────────────

    function renderCards() {
        const grid = document.getElementById("configGrid");
        const empty = document.getElementById("configEmpty");
        const count = document.getElementById("sheetCount");

        const entries = Object.entries(currentConfig);
        count.textContent = `${entries.length} sheet${entries.length !== 1 ? "s" : ""} configured`;

        if (entries.length === 0) {
            grid.innerHTML = "";
            empty.classList.remove("d-none");
            return;
        }

        empty.classList.add("d-none");
        grid.innerHTML = "";

        entries.forEach(([name, cfg]) => {
            grid.appendChild(createCard(name, cfg));
        });
    }

    // ── Create a single config card ─────────────────────────────────────────

    function createCard(sheetName, cfg) {
        const card = document.createElement("div");
        card.className = "config-card";
        card.dataset.sheet = sheetName;

        const icon = SHEET_ICONS[sheetName] || "bi-file-earmark-text";
        const visible = cfg.visible !== false;
        const roles = cfg.roles || [];
        const headerRow = cfg.header_row || 1;
        const columns = cfg.columns || "";
        const imageColumns = (cfg.image_columns || []).join(", ");
        const roleColumns = cfg.role_columns || {};

        // Build badges
        let badgesHtml = "";
        if (!visible) badgesHtml += `<span class="badge bg-secondary">Hidden</span>`;
        if (roles.length > 0) {
            roles.forEach(r => {
                const cls = r === "admin" ? "bg-danger" : "bg-info";
                badgesHtml += `<span class="badge ${cls}">${r}</span>`;
            });
        }

        // Build role_columns entries
        let roleColumnsHtml = "";
        const allRoles = ["admin", "moderator"];
        allRoles.forEach(role => {
            const cols = roleColumns[role] ? roleColumns[role].join(", ") : "";
            roleColumnsHtml += `
                <div class="role-columns-entry">
                    <label>${role}</label>
                    <input type="text" data-role="${role}" value="${escapeAttr(cols)}"
                           placeholder="e.g. Order ID, Date, Customer Name">
                </div>
            `;
        });

        card.innerHTML = `
            <div class="config-card-header" data-bs-toggle="collapse-card">
                <div class="config-card-title">
                    <div class="sheet-icon"><i class="bi ${icon}"></i></div>
                    <div>
                        <h3>${escapeHtml(sheetName)}</h3>
                        <div class="sheet-badges">${badgesHtml}</div>
                    </div>
                </div>
                <i class="bi bi-chevron-down config-card-chevron"></i>
            </div>
            <div class="config-card-body">
                <div class="config-row">
                    <div class="config-field">
                        <label>Header Row</label>
                        <input type="number" class="cfg-header-row" value="${headerRow}" min="1">
                    </div>
                    <div class="config-field">
                        <label>Columns</label>
                        <input type="text" class="cfg-columns" value="${escapeAttr(columns)}"
                               placeholder="e.g. A:R or A,C,D,E,F">
                        <div class="field-hint">Supports A:R, A,C,D,E,F, or A:C,E,G:J</div>
                    </div>
                </div>

                <div class="config-row">
                    <div class="config-field">
                        <div class="config-toggle">
                            <input class="form-check-input cfg-visible" type="checkbox" ${visible ? "checked" : ""}>
                            <span class="toggle-label">Visible in frontend</span>
                        </div>
                    </div>
                    <div class="config-field">
                        <label>Image Columns</label>
                        <input type="text" class="cfg-image-columns" value="${escapeAttr(imageColumns)}"
                               placeholder="e.g. Product Image">
                        <div class="field-hint">Column header names with =IMAGE() formulas</div>
                    </div>
                </div>

                <div class="config-field">
                    <label>Roles (who can access)</label>
                    <div class="roles-group">
                        <div class="form-check">
                            <input class="form-check-input cfg-role" type="checkbox" value="admin"
                                   ${roles.includes("admin") ? "checked" : ""}>
                            <label class="form-check-label">Admin</label>
                        </div>
                        <div class="form-check">
                            <input class="form-check-input cfg-role" type="checkbox" value="moderator"
                                   ${roles.includes("moderator") ? "checked" : ""}>
                            <label class="form-check-label">Moderator</label>
                        </div>
                    </div>
                    <div class="field-hint">Leave unchecked to allow all roles</div>
                </div>

                <div class="role-columns-section">
                    <h4><i class="bi bi-funnel"></i> Column Visibility per Role</h4>
                    <div class="field-hint" style="margin-top:-6px; margin-bottom:8px;">
                        Restrict which column <em>headers</em> a role can see. Leave blank = show all columns.
                    </div>
                    ${roleColumnsHtml}
                </div>
            </div>
            <div class="config-card-footer">
                <button class="btn btn-delete-sheet" data-sheet="${escapeAttr(sheetName)}">
                    <i class="bi bi-trash3"></i> Delete
                </button>
                <div class="d-flex align-items-center gap-2">
                    <span class="config-save-indicator"><i class="bi bi-check-circle-fill"></i> Saved</span>
                    <button class="btn btn-save-sheet" data-sheet="${escapeAttr(sheetName)}">
                        <i class="bi bi-check-lg"></i> Save
                    </button>
                </div>
            </div>
        `;

        // Wire events
        const header = card.querySelector(".config-card-header");
        header.addEventListener("click", () => {
            card.classList.toggle("collapsed");
        });

        const saveBtn = card.querySelector(".btn-save-sheet");
        saveBtn.addEventListener("click", () => saveSheet(sheetName, card));

        const deleteBtn = card.querySelector(".btn-delete-sheet");
        deleteBtn.addEventListener("click", () => showDeleteConfirm(sheetName));

        return card;
    }

    // ── Save single sheet config ────────────────────────────────────────────

    async function saveSheet(sheetName, card) {
        const saveBtn = card.querySelector(".btn-save-sheet");
        const indicator = card.querySelector(".config-save-indicator");

        saveBtn.disabled = true;
        saveBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Saving...`;

        try {
            const cfg = readCardConfig(card);

            const res = await fetch(`/api/config/${encodeURIComponent(sheetName)}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    ...auth.getAuthHeaders()
                },
                body: JSON.stringify(cfg)
            });

            if (res.status === 401) { auth.logout(); return; }
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || "Save failed");
            }

            const data = await res.json();
            currentConfig[sheetName] = data.config || cfg;

            // Flash indicator
            indicator.classList.add("show");
            setTimeout(() => indicator.classList.remove("show"), 2500);

            ui.showToast(`"${sheetName}" config saved!`, "success");
        } catch (err) {
            ui.showToast(`Save failed: ${err.message}`, "danger");
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<i class="bi bi-check-lg"></i> Save`;
        }
    }

    // ── Read config values from a card ──────────────────────────────────────

    function readCardConfig(card) {
        const headerRow = parseInt(card.querySelector(".cfg-header-row").value) || 1;
        const columns = card.querySelector(".cfg-columns").value.trim() || null;
        const visible = card.querySelector(".cfg-visible").checked;

        // Roles
        const roleCheckboxes = card.querySelectorAll(".cfg-role:checked");
        const roles = Array.from(roleCheckboxes).map(cb => cb.value);

        // Image columns
        const imgColStr = card.querySelector(".cfg-image-columns").value.trim();
        const imageColumns = imgColStr
            ? imgColStr.split(",").map(s => s.trim()).filter(Boolean)
            : null;

        // Role columns
        const roleColumnsEntries = card.querySelectorAll(".role-columns-entry input");
        let roleColumns = null;
        roleColumnsEntries.forEach(input => {
            const role = input.dataset.role;
            const val = input.value.trim();
            if (val) {
                if (!roleColumns) roleColumns = {};
                roleColumns[role] = val.split(",").map(s => s.trim()).filter(Boolean);
            }
        });

        const cfg = {
            header_row: headerRow,
            columns: columns,
            visible: visible,
        };

        if (roles.length > 0) cfg.roles = roles;
        if (roleColumns) cfg.role_columns = roleColumns;
        if (imageColumns) cfg.image_columns = imageColumns;

        return cfg;
    }

    // ── Add new sheet config ────────────────────────────────────────────────

    function setupAddSheet() {
        const btn = document.getElementById("btnAddSheet");
        const modal = new bootstrap.Modal(document.getElementById("addSheetModal"));
        const confirmBtn = document.getElementById("btnConfirmAdd");

        btn.addEventListener("click", () => {
            // Reset fields
            document.getElementById("newSheetName").value = "";
            document.getElementById("newHeaderRow").value = "1";
            document.getElementById("newColumns").value = "";
            document.getElementById("newVisible").checked = true;
            document.getElementById("newRoleAdmin").checked = true;
            document.getElementById("newRoleModerator").checked = false;
            modal.show();
        });

        confirmBtn.addEventListener("click", async () => {
            const name = document.getElementById("newSheetName").value.trim();
            if (!name) {
                ui.showToast("Sheet name is required.", "warning");
                return;
            }

            if (currentConfig[name]) {
                ui.showToast(`"${name}" already exists. Edit it instead.`, "warning");
                return;
            }

            const cfg = {
                header_row: parseInt(document.getElementById("newHeaderRow").value) || 1,
                columns: document.getElementById("newColumns").value.trim() || null,
                visible: document.getElementById("newVisible").checked,
            };

            // Roles
            const roles = [];
            if (document.getElementById("newRoleAdmin").checked) roles.push("admin");
            if (document.getElementById("newRoleModerator").checked) roles.push("moderator");
            if (roles.length > 0) cfg.roles = roles;

            confirmBtn.disabled = true;
            confirmBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Adding...`;

            try {
                const res = await fetch(`/api/config/${encodeURIComponent(name)}`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        ...auth.getAuthHeaders()
                    },
                    body: JSON.stringify(cfg)
                });

                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.detail || "Add failed");
                }

                currentConfig[name] = cfg;
                renderCards();
                modal.hide();
                ui.showToast(`"${name}" configuration added!`, "success");
            } catch (err) {
                ui.showToast(`Add failed: ${err.message}`, "danger");
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = `<i class="bi bi-plus-lg"></i> Add Configuration`;
            }
        });
    }

    // ── Delete sheet config ─────────────────────────────────────────────────

    function showDeleteConfirm(sheetName) {
        deleteTarget = sheetName;
        document.getElementById("deleteSheetName").textContent = sheetName;
        document.getElementById("deleteConfirmOverlay").classList.add("show");
    }

    function hideDeleteConfirm() {
        deleteTarget = null;
        document.getElementById("deleteConfirmOverlay").classList.remove("show");
    }

    function setupDelete() {
        document.getElementById("btnCancelDelete").addEventListener("click", hideDeleteConfirm);
        document.getElementById("deleteConfirmOverlay").addEventListener("click", (e) => {
            if (e.target === e.currentTarget) hideDeleteConfirm();
        });

        document.getElementById("btnConfirmDelete").addEventListener("click", async () => {
            if (!deleteTarget) return;

            const name = deleteTarget;
            const btn = document.getElementById("btnConfirmDelete");
            btn.disabled = true;
            btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Deleting...`;

            try {
                const res = await fetch(`/api/config/${encodeURIComponent(name)}`, {
                    method: "DELETE",
                    headers: auth.getAuthHeaders()
                });

                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.detail || "Delete failed");
                }

                delete currentConfig[name];
                renderCards();
                hideDeleteConfirm();
                ui.showToast(`"${name}" configuration deleted.`, "success");
            } catch (err) {
                ui.showToast(`Delete failed: ${err.message}`, "danger");
            } finally {
                btn.disabled = false;
                btn.innerHTML = `<i class="bi bi-trash3 me-1"></i>Delete`;
            }
        });
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeAttr(str) {
        return String(str).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    // ── Initialize ──────────────────────────────────────────────────────────

    async function loadSidebar() {
        try {
            const data = await api.fetchSheets();
            ui.populateSidebar(data.sheets);
        } catch (err) {
            // Sidebar load failure is non-critical
            console.warn("Could not load sidebar sheets:", err);
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        if (!auth.checkAuth()) return;

        // Verify admin role client-side
        const user = auth.getCurrentUser();
        if (user && user.role !== "admin") {
            window.location.href = "/";
            return;
        }

        ui.init();
        ui.setupUserProfile();
        setupAddSheet();
        setupDelete();
        loadSidebar();
        loadConfig();
    });
})();
