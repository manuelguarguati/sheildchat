/**
 * Authentication Module
 * Handles login, logout, and session management
 */

const Auth = {
  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    const token = localStorage.getItem('shield_token');
    return !!token;
  },

  /**
   * Get current user from localStorage
   */
  getUser() {
    const user = localStorage.getItem('shield_user');
    return user ? JSON.parse(user) : null;
  },

  /**
   * Set user in localStorage
   */
  setUser(user) {
    localStorage.setItem('shield_user', JSON.stringify(user));
  },

  /**
   * Clear auth data
   */
  clear() {
    localStorage.removeItem('shield_token');
    localStorage.removeItem('shield_user');
  },

  /**
   * Login user
   */
  async login(username, password, companyDomain) {
    try {
      const response = await api.auth.login(username, password, companyDomain);
      
      if (response.success) {
        api.setToken(response.data.token);
        Auth.setUser(response.data.user);
        return { success: true };
      }
      
      return { success: false, message: response.message };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },

  /**
   * Logout user
   */
  async logout() {
    try {
      await api.auth.logout();
    } catch (error) {
      // Ignore logout API errors
      console.log('Logout API error (ignoring):', error.message);
    }
    
    Auth.clear();
    window.location.href = '/login';
  },

  /**
   * Redirect to chat if authenticated
   */
  redirectIfAuthenticated() {
    if (Auth.isAuthenticated()) {
      const user = Auth.getUser();
      if (user && user.role === 'admin') {
        window.location.href = '/admin';
      } else {
        window.location.href = '/chat';
      }
    }
  },

  /**
   * Require authentication
   */
  requireAuth() {
    if (!Auth.isAuthenticated()) {
      window.location.href = '/login';
      return false;
    }
    return true;
  },

  /**
   * Check if user is admin
   */
  isAdmin() {
    const user = Auth.getUser();
    return user && user.role === 'admin';
  }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Check authentication status on protected pages
  const path = window.location.pathname;
  
  if (path === '/login' || path === '/') {
    Auth.redirectIfAuthenticated();
  } else if (path !== '/login' && !Auth.isAuthenticated()) {
    window.location.href = '/login';
  }
});

// Handle logout button clicks
document.addEventListener('click', (e) => {
  if (e.target.closest('#logoutBtn')) {
    e.preventDefault();
    Auth.logout();
  }
});
