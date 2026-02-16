// ── Common Constants & Utilities ───────────────────────────────────────────

const common = (function() {
    // Sheet name to URL mapping
    const SHEET_URLS = {
        "Sales": "/sheets/sales.html",
        "Sales Raw": "/sheets/sales-raw.html",
        "Inventory": "/sheets/inventory.html",
        "Summary Inventory": "/sheets/summary-inventory.html",
        "Input Inventory": "/sheets/input-inventory.html",
        "Expenses": "/sheets/expenses.html",
        "Product Purchase": "/sheets/product-purchase.html",
        "Information": "/sheets/information.html"
    };

    /**
     * Format date to Google Sheets compatible format (d-MMM-yyyy)
     * @param {Date} date - Date object to format
     * @returns {string} Formatted date string
     */
    function formatDateForSheet(date) {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", 
                        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const day = date.getDate();
        const month = months[date.getMonth()];
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    }

    /**
     * Format date to input date format (yyyy-MM-dd)
     * @param {Date} date - Date object to format
     * @returns {string} Formatted date string for input[type="date"]
     */
    function formatDateForInput(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Parse date from input[type="date"] format
     * @param {string} dateStr - Date string in yyyy-MM-dd format
     * @returns {Date} Date object
     */
    function parseDateFromInput(dateStr) {
        return new Date(dateStr + "T00:00:00");
    }

    /**
     * Get URL for sheet name
     * @param {string} sheetName - Sheet name
     * @returns {string} URL path for sheet
     */
    function getSheetUrl(sheetName) {
        return SHEET_URLS[sheetName] || `/sheets/${sheetName.toLowerCase().replace(/\s+/g, '-')}.html`;
    }

    /**
     * Validate email format
     * @param {string} email - Email address
     * @returns {boolean} True if valid email
     */
    function isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    /**
     * Validate Bangladesh phone number
     * @param {string} phone - Phone number
     * @returns {boolean} True if valid phone
     */
    function isValidPhone(phone) {
        // Bangladesh phone: 01XXXXXXXXX (11 digits)
        const re = /^01[0-9]{9}$/;
        return re.test(phone.replace(/[\s\-]/g, ''));
    }

    /**
     * Sanitize string for display
     * @param {string} str - String to sanitize
     * @returns {string} Sanitized string
     */
    function sanitize(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Debounce function execution
     * @param {Function} func - Function to debounce
     * @param {number} delay - Delay in milliseconds
     * @returns {Function} Debounced function
     */
    function debounce(func, delay) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    /**
     * Get today's date
     * @returns {Date} Today's date
     */
    function getToday() {
        return new Date();
    }

    /**
     * Navigate to dashboard
     */
    function goToDashboard() {
        window.location.href = "/";
    }

    /**
     * Navigate to sheet page
     * @param {string} sheetName - Sheet name
     */
    function goToSheet(sheetName) {
        window.location.href = getSheetUrl(sheetName);
    }

    // Public API
    return {
        SHEET_URLS,
        formatDateForSheet,
        formatDateForInput,
        parseDateFromInput,
        getSheetUrl,
        isValidEmail,
        isValidPhone,
        sanitize,
        debounce,
        getToday,
        goToDashboard,
        goToSheet
    };
})();
