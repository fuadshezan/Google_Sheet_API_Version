// ── API Client Module ──────────────────────────────────────────────────────

const api = (function() {
    const API_BASE = "";  // Same origin

    /**
     * Handle API response errors
     * @param {Response} response - Fetch response object
     * @returns {Promise} Resolves if OK, rejects with error otherwise
     */
    async function handleResponse(response) {
        if (response.status === 401) {
            auth.logout();
            throw new Error("Authentication required");
        }
        
        if (response.status === 403) {
            throw new Error("Access denied");
        }

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || `HTTP ${response.status}`);
        }

        return response;
    }

    /**
     * Fetch list of sheets accessible to current user
     * @returns {Promise<Object>} Object with sheets array
     */
    async function fetchSheets() {
        const res = await fetch(`${API_BASE}/api/sheets`, {
            headers: auth.getAuthHeaders()
        });
        await handleResponse(res);
        return res.json();
    }

    /**
     * Fetch data from a specific sheet
     * @param {string} sheetName - Name of the sheet
     * @returns {Promise<Object>} Sheet data with headers, rows, config, image_columns
     */
    async function fetchSheetData(sheetName) {
        const res = await fetch(`${API_BASE}/api/sheets/${encodeURIComponent(sheetName)}`, {
            headers: auth.getAuthHeaders()
        });
        await handleResponse(res);
        return res.json();
    }

    /**
     * Fetch products list for dropdown
     * @returns {Promise<Object>} Object with products array
     */
    async function fetchProducts() {
        const res = await fetch(`${API_BASE}/api/products`, {
            headers: auth.getAuthHeaders()
        });
        await handleResponse(res);
        return res.json();
    }

    /**
     * Insert new order to Sales Raw sheet
     * @param {Object} orderData - Order data to insert
     * @returns {Promise<Object>} Result with message, sl_no, rows_added
     */
    async function insertOrder(orderData) {
        const res = await fetch(`${API_BASE}/api/sales-raw/insert`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...auth.getAuthHeaders()
            },
            body: JSON.stringify(orderData)
        });
        await handleResponse(res);
        return res.json();
    }

    /**
     * Update order statuses from courier APIs
     * @returns {Promise<Object>} Update results with counts and details
     */
    async function updateStatuses() {
        const res = await fetch(`${API_BASE}/api/update-statuses`, {
            method: "POST",
            headers: auth.getAuthHeaders()
        });
        await handleResponse(res);
        return res.json();
    }

    /**
     * Get current user info from token
     * @returns {Promise<Object>} User object with username, email, role
     */
    async function getCurrentUser() {
        const res = await fetch(`${API_BASE}/api/me`, {
            headers: auth.getAuthHeaders()
        });
        await handleResponse(res);
        return res.json();
    }

    /**
     * Login with email and password
     * @param {string} email - User email
     * @param {string} password - User password
     * @returns {Promise<Object>} Token and user info
     */
    async function login(email, password) {
        const res = await fetch(`${API_BASE}/api/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email, password })
        });
        
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || "Login failed");
        }
        
        return res.json();
    }

    // Public API
    return {
        fetchSheets,
        fetchSheetData,
        fetchProducts,
        insertOrder,
        updateStatuses,
        getCurrentUser,
        login
    };
})();
