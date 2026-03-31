// ── Inventory Sheet Module ────────────────────────────────────────────────

(function() {
    const SHEET_NAME = "Inventory";
    let dataTableInstance = null;

    /**
     * Load Inventory sheet data
     */
    async function loadData() {
        ui.showLoading(`Loading ${SHEET_NAME}...`);
        try {
            const data = await api.fetchSheetData(SHEET_NAME);
            const imageCols = data.image_columns || [];
            renderTable(data.headers, data.rows, data.config, imageCols);
            document.getElementById("btnRefresh").disabled = false;
        } catch (err) {
            ui.showToast(`Failed to load "${SHEET_NAME}": ${err.message}`, "danger");
        } finally {
            ui.hideLoading();
        }
    }

    // ── Image Helpers ──────────────────────────────────────────────────────

    /**
     * Check if value is a valid image URL
     */
    function isImageUrl(value) {
        if (!value || typeof value !== "string") return false;
        const trimmed = value.trim().toLowerCase();
        
        // Extract URL from =IMAGE("url",...) formula if present
        const imageFormula = /^=image\s*\(\s*"([^"]+)"/i;
        const match = value.match(imageFormula);
        if (match) {
            value = match[1];
        }
        
        return (
            (trimmed.startsWith("http://") || trimmed.startsWith("https://")) &&
            (/\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(trimmed) ||
             trimmed.includes("cloudinary.com") ||
             trimmed.includes("imgur.com") ||
             trimmed.includes("drive.google.com"))
        );
    }

    /**
     * Extract URL from formula or return original value
     */
    function extractImageUrl(value) {
        if (!value || typeof value !== "string") return value;
        
        // Try to extract from =IMAGE("url",...) formula
        const imageFormula = /^=image\s*\(\s*"([^"]+)"/i;
        const match = value.match(imageFormula);
        return match ? match[1] : value;
    }

    /**
     * Create image cell with thumbnail and hover zoom
     */
    function createImageCell(url) {
        const actualUrl = extractImageUrl(url);
        const wrapper = document.createElement("div");
        wrapper.className = "img-cell";

        const img = document.createElement("img");
        img.src = actualUrl;
        img.alt = "Product";
        img.className = "table-thumbnail";
        img.loading = "lazy";

        // Hover zoom events
        img.addEventListener("mouseenter", (e) => {
            showZoom(e, actualUrl);
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

    /**
     * Show zoom popup on hover
     */
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

    /**
     * Move zoom popup with cursor
     */
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

    /**
     * Hide zoom popup
     */
    function hideZoom() {
        const zoomEl = document.getElementById("imageZoom");
        if (zoomEl) {
            zoomEl.style.display = "none";
        }
    }

    // ── Table Rendering ────────────────────────────────────────────────────

    /**
     * Render table with DataTables and image support
     */
    function renderTable(headers, rows, config = {}, imageCols = []) {
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

                // Check if this column is an image column and value is valid URL
                if (imageColIndices.has(i) && isImageUrl(cellValue)) {
                    td.appendChild(createImageCell(cellValue));
                } else {
                    td.textContent = cellValue;
                }
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
        if (imageCols.length > 0) {
            infoText += ` | Images: ${imageCols.join(", ")}`;
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
