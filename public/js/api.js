/**
 * API Client for Shield Chat
 * Handles all HTTP requests with JWT authentication
 */

const API_BASE = '/api';

class ApiClient {
  constructor() {
    this.token = localStorage.getItem('shield_token');
  }

  /**
   * Get authorization header
   */
  getHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    
    return headers;
  }

  /**
   * Set authentication token
   */
  setToken(token) {
    this.token = token;
    localStorage.setItem('shield_token', token);
  }

  /**
   * Remove authentication token
   */
  removeToken() {
    this.token = null;
    localStorage.removeItem('shield_token');
  }

  /**
   * Generic GET request
   */
  async get(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'GET',
      headers: this.getHeaders()
    });
    
    return this.handleResponse(response);
  }

  /**
   * Generic POST request
   */
  async post(endpoint, data = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });
    
    return this.handleResponse(response);
  }

  /**
   * Generic PUT request
   */
  async put(endpoint, data = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });
    
    return this.handleResponse(response);
  }

  /**
   * Generic DELETE request
   */
  async delete(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'DELETE',
      headers: this.getHeaders()
    });
    
    return this.handleResponse(response);
  }

  /**
   * Handle API response
   */
  async handleResponse(response) {
    try {
      const data = await response.json();
      
      if (!response.ok) {
        // Handle token expiration
        if (response.status === 401 && (data.message === 'Token expired.' || data.message?.includes('expired'))) {
          this.removeToken();
          window.location.href = '/login';
          throw new Error('Session expired. Please login again.');
        }
        
        if (response.status === 409) {
          throw new Error(data.message || 'User already exists');
        }
        
        if (response.status === 404) {
          throw new Error(data.message || 'Resource not found');
        }
        
        if (response.status === 400) {
          throw new Error(data.message || 'Invalid request');
        }
        
        throw new Error(data.message || `Request failed (${response.status})`);
      }
      
      return data;
    } catch (error) {
      // If error is already a handled API error, rethrow it
      if (error.message && (
        error.message.includes('Token expired') ||
        error.message.includes('User already exists') ||
        error.message.includes('Resource not found') ||
        error.message.includes('Invalid request') ||
        error.message.includes('Request failed')
      )) {
        throw error;
      }
      
      // Network error
      throw new Error('Error de conexión con el servidor');
    }
  }

  /**
   * Authentication endpoints
   */
  auth = {
    login: (username, password, company_domain) => 
      this.post('/auth/login', { username, password, company_domain }),
    
    logout: () => this.post('/auth/logout'),
    
    me: () => this.get('/auth/me')
  };

  /**
   * Messages endpoints
   */
  messages = {
    getUsers: () => this.get('/messages/users'),
    
    getConversation: (userId, page = 1, limit = 50) => 
      this.get(`/messages/conversation/${userId}?page=${page}&limit=${limit}`),
    
    sendMessage: (receiverId, content, messageType = 'text') => 
      this.post(`/messages/send/${receiverId}`, { content, message_type: messageType }),
    
    markAsRead: (messageId) => this.put(`/messages/${messageId}/read`),
    
    editMessage: (messageId, content) => 
      this.put(`/messages/${messageId}`, { content }),
    
    deleteMessage: (messageId) => this.delete(`/messages/${messageId}`)
  };

  /**
   * Users endpoints
   */
  users = {
    list: (page = 1, limit = 20, search = '') => 
      this.get(`/users?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`),
    
    get: (id) => this.get(`/users/${id}`),
    
    updateProfile: (data) => this.put('/users/profile', data),
    
    changePassword: (currentPassword, newPassword) => 
      this.put('/users/password', { current_password: currentPassword, new_password: newPassword })
  };

  /**
   * Friends endpoints
   */
  friends = {
    searchUsers: (name) => 
      this.get(`/users/search?name=${encodeURIComponent(name)}`),
    
    sendRequest: (receiverId) => 
      this.post('/friends/request', { receiver_id: receiverId }),
    
    acceptRequest: (requestId) => 
      this.put(`/friends/accept/${requestId}`),
    
    rejectRequest: (requestId) => 
      this.put(`/friends/reject/${requestId}`),
    
    getPendingRequests: () => 
      this.get('/friends/pending'),
    
    getFriends: () => 
      this.get('/friends/list')
  };

  /**
   * Admin endpoints
   */
  admin = {
    getStats: () => this.get('/admin/stats'),
    
    listUsers: (page = 1, limit = 20, search = '', role = '', active = '') => {
      let url = `/admin/users?page=${page}&limit=${limit}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (role) url += `&role=${role}`;
      if (active !== '') url += `&active=${active}`;
      return this.get(url);
    },
    
    createUser: (userData) => this.post('/admin/users', userData),
    
    updateUser: (id, data) => this.put(`/admin/users/${id}`, data),
    
    deleteUser: (id) => this.delete(`/admin/users/${id}`),
    
    getAuditLogs: (page = 1, limit = 50, action = '', userId = '') => {
      let url = `/admin/audit-logs?page=${page}&limit=${limit}`;
      if (action) url += `&action=${encodeURIComponent(action)}`;
      if (userId) url += `&user_id=${userId}`;
      return this.get(url);
    }
  };
}

// Create global API instance
const api = new ApiClient();
