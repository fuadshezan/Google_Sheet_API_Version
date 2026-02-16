// ── Authentication & Authorization Module ──────────────────────────────────

const auth = (function() {
    let authToken = null;
    let authUser = null;  // { username, email, role }

    /**
     * Get authorization headers for API requests
     * @returns {Object} Headers object with Authorization bearer token
     */
    function getAuthHeaders() {
        return authToken ? { "Authorization": `Bearer ${authToken}` } : {};
    }

    /**
     * Check if user is authenticated and token is valid
     * @returns {boolean} True if authenticated, false otherwise (redirects to login)
     */
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
        fetch(`/api/me`, { headers: getAuthHeaders() })
            .then(res => {
                if (!res.ok) {
                    logout();
                }
            })
            .catch(() => logout());

        return true;
    }

    /**
     * Log out the current user
     * Clears local storage and redirects to login page
     */
    function logout() {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
        authToken = null;
        authUser = null;
        window.location.href = "/login";
    }

    /**
     * Get the current authenticated user
     * @returns {Object|null} User object or null if not authenticated
     */
    function getCurrentUser() {
        return authUser;
    }

    /**
     * Check if current user has admin role
     * @returns {boolean} True if user is admin
     */
    function isAdmin() {
        return authUser && authUser.role === "admin";
    }

    /**
     * Check if current user has specific role
     * @param {string} role - Role to check
     * @returns {boolean} True if user has role
     */
    function hasRole(role) {
        return authUser && authUser.role === role;
    }

    // Public API
    return {
        getAuthHeaders,
        checkAuth,
        logout,
        getCurrentUser,
        isAdmin,
        hasRole
    };
})();
