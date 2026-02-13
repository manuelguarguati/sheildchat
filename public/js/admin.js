/**
 * Admin Module
 * Admin panel functionality for user management
 */

class Admin {
  constructor() {
    this.currentUser = null;
    this.users = [];
    this.logs = [];
    this.currentPage = { users: 1, logs: 1 };
    
    this.init();
  }

  /**
   * Initialize admin panel
   */
  init() {
    if (!Auth.requireAuth()) return;
    
    if (!Auth.isAdmin()) {
      window.location.href = '/chat';
      return;
    }

    this.currentUser = Auth.getUser();
    this.updateUI();
    this.bindEvents();
    this.loadStats();
    this.loadUsers();
    this.loadLogs();
  }

  /**
   * Update UI with user info
   */
  updateUI() {
    const nameEl = document.getElementById('currentUserName');
    const avatarEl = document.getElementById('currentUserAvatar');
    
    if (nameEl && this.currentUser) {
      nameEl.textContent = this.currentUser.first_name 
        ? `${this.currentUser.first_name} ${this.currentUser.last_name}`
        : this.currentUser.username;
    }
    
    if (avatarEl && this.currentUser) {
      avatarEl.textContent = (this.currentUser.first_name || this.currentUser.username)[0].toUpperCase();
    }

    // Set current date
    const dateEl = document.getElementById('currentDate');
    if (dateEl) {
      dateEl.textContent = new Date().toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
  }

  /**
   * Load statistics
   */
  async loadStats() {
    try {
      const response = await api.admin.getStats();
      
      if (response.success) {
        const stats = response.data.stats;
        
        document.getElementById('totalUsers').textContent = stats.totalUsers;
        document.getElementById('activeUsers').textContent = stats.activeUsers;
        document.getElementById('totalMessages').textContent = stats.totalMessages;
        document.getElementById('unreadMessages').textContent = stats.unreadMessages;
      }
    } catch (error) {
      Toast.show(error.message, 'error');
    }
  }

  /**
   * Load users
   */
  async loadUsers() {
    const search = document.getElementById('userSearch')?.value || '';
    const role = document.getElementById('roleFilter')?.value || '';
    const active = document.getElementById('activeFilter')?.value || '';

    try {
      const response = await api.admin.listUsers(
        this.currentPage.users, 
        20, 
        search, 
        role, 
        active
      );

      if (response.success) {
        this.users = response.data.users;
        this.renderUsers(response.data.users);
        this.renderPagination(response.data.pagination, 'users');
      }
    } catch (error) {
      Toast.show(error.message, 'error');
    }
  }

  /**
   * Render users table
   */
  renderUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    if (!users || users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="loading">No users found</td></tr>';
      return;
    }

    tbody.innerHTML = users.map(user => `
      <tr>
        <td>${user.id}</td>
        <td>${this.escapeHtml(user.username)}</td>
        <td>${user.email || '-'}</td>
        <td><span class="role-badge ${user.role}">${user.role}</span></td>
        <td><span class="status-badge ${user.is_active ? 'active' : 'inactive'}">${user.is_active ? 'Active' : 'Inactive'}</span></td>
        <td>${new Date(user.created_at).toLocaleDateString()}</td>
        <td>
          <button class="action-btn" onclick="admin.editUser(${user.id})">Edit</button>
          <button class="action-btn delete" onclick="admin.deleteUser(${user.id})">Delete</button>
        </td>
      </tr>
    `).join('');
  }

  /**
   * Load audit logs
   */
  async loadLogs() {
    const action = document.getElementById('actionFilter')?.value || '';

    try {
      const response = await api.admin.getAuditLogs(
        this.currentPage.logs, 
        50, 
        action
      );

      if (response.success) {
        this.logs = response.data.logs;
        this.renderLogs(response.data.logs);
        this.renderPagination(response.data.pagination, 'logs');
      }
    } catch (error) {
      Toast.show(error.message, 'error');
    }
  }

  /**
   * Render audit logs
   */
  renderLogs(logs) {
    const tbody = document.getElementById('logsTableBody');
    if (!tbody) return;

    if (!logs || logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="loading">No logs found</td></tr>';
      return;
    }

    tbody.innerHTML = logs.map(log => `
      <tr>
        <td>${log.id}</td>
        <td>${log.user ? this.escapeHtml(log.user.username) : 'System'}</td>
        <td>${this.escapeHtml(log.action)}</td>
        <td><span class="status-badge ${log.status === 'success' ? 'active' : log.status === 'warning' ? 'inactive' : 'inactive'}">${log.status}</span></td>
        <td>${log.ip_address || '-'}</td>
        <td>${new Date(log.created_at).toLocaleString()}</td>
      </tr>
    `).join('');
  }

  /**
   * Render pagination
   */
  renderPagination(pagination, type) {
    const container = document.getElementById(`${type}Pagination`);
    if (!container) return;

    if (pagination.pages <= 1) {
      container.innerHTML = '';
      return;
    }

    let html = '';
    
    if (pagination.page > 1) {
      html += `<button onclick="admin.goToPage(${pagination.page - 1}, '${type}')">Prev</button>`;
    }
    
    for (let i = 1; i <= pagination.pages; i++) {
      html += `<button class="${i === pagination.page ? 'active' : ''}" onclick="admin.goToPage(${i}, '${type}')">${i}</button>`;
    }
    
    if (pagination.page < pagination.pages) {
      html += `<button onclick="admin.goToPage(${pagination.page + 1}, '${type}')">Next</button>`;
    }

    container.innerHTML = html;
  }

  /**
   * Go to page
   */
  goToPage(page, type) {
    this.currentPage[type] = page;
    if (type === 'users') {
      this.loadUsers();
    } else {
      this.loadLogs();
    }
  }

  /**
   * Create user
   */
  async createUser(userData) {
    try {
      const response = await api.admin.createUser(userData);
      
      // Check for success (response object with success: true)
      if (response && response.success) {
        // Show confirmation alert
        alert('Usuario creado exitosamente');
        
        // Close modal
        this.closeModal();
        
        // Reload users list
        this.loadUsers();
        
        // Reload stats
        this.loadStats();
      } else {
        // Handle API error
        alert(response?.message || 'Error al crear usuario');
      }
    } catch (error) {
      // Handle network errors
      console.error('Create user error:', error);
      alert('Error de conexión con el servidor');
    }
  }

  /**
   * Edit user
   */
  async editUser(userId) {
    const user = this.users.find(u => u.id === userId);
    if (!user) return;

    // Populate modal with user data
    document.getElementById('newUsername').value = user.username;
    document.getElementById('newEmail').value = user.email || '';
    document.getElementById('newRole').value = user.role;
    document.getElementById('newFirstName').value = user.first_name || '';
    document.getElementById('newLastName').value = user.last_name || '';
    
    // Hide password field for editing
    document.querySelector('#createUserForm .form-group:nth-child(3)').style.display = 'none';
    
    // Change form to update mode
    document.querySelector('.modal-header h3').textContent = 'Edit User';
    document.querySelector('#createUserForm button[type="submit"]').textContent = 'Update User';
    
    // Store user ID for update
    document.getElementById('createUserForm').dataset.editId = userId;
    
    this.openModal();
  }

  /**
   * Update user
   */
  async updateUser(userId, userData) {
    try {
      const response = await api.admin.updateUser(userId, userData);
      
      if (response.success) {
        Toast.show('User updated successfully', 'success');
        this.closeModal();
        this.loadUsers();
      } else {
        Toast.show(response.message, 'error');
      }
    } catch (error) {
      Toast.show(error.message, 'error');
    }
  }

  /**
   * Delete user
   */
  async deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      const response = await api.admin.deleteUser(userId);
      
      if (response.success) {
        Toast.show('User deleted successfully', 'success');
        this.loadUsers();
        this.loadStats();
      } else {
        Toast.show(response.message, 'error');
      }
    } catch (error) {
      Toast.show(error.message, 'error');
    }
  }

  /**
   * Open modal
   */
  openModal() {
    document.getElementById('createUserModal').style.display = 'flex';
  }

  /**
   * Close modal
   */
  closeModal() {
    const modal = document.getElementById('createUserModal');
    modal.style.display = 'none';
    
    // Reset form
    const form = document.getElementById('createUserForm');
    form.reset();
    delete form.dataset.editId;
    
    // Show password field
    document.querySelector('#createUserForm .form-group:nth-child(3)').style.display = 'flex';
    
    // Reset header
    document.querySelector('.modal-header h3').textContent = 'Create New User';
    document.querySelector('#createUserForm button[type="submit"]').textContent = 'Create User';
  }

  /**
   * Bind events
   */
  bindEvents() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const section = item.dataset.section;
        
        // Update nav
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        
        // Update sections
        document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
        document.getElementById(`${section}Section`).classList.add('active');
      });
    });

    // Create user buttons
    const createUserBtns = [
      document.getElementById('createUserBtn'),
      document.getElementById('createUserBtn2')
    ];
    
    createUserBtns.forEach(btn => {
      if (btn) {
        btn.addEventListener('click', () => this.openModal());
      }
    });

    // Close modal
    document.getElementById('closeModalBtn')?.addEventListener('click', () => this.closeModal());
    document.getElementById('cancelModalBtn')?.addEventListener('click', () => this.closeModal());

    // Close modal on outside click
    document.getElementById('createUserModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'createUserModal') this.closeModal();
    });

    // Create user form
    document.getElementById('createUserForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const userData = {
        username: document.getElementById('newUsername').value,
        email: document.getElementById('newEmail').value,
        role: document.getElementById('newRole').value,
        first_name: document.getElementById('newFirstName').value,
        last_name: document.getElementById('newLastName').value
      };

      const editId = e.target.dataset.editId;
      
      if (editId) {
        // Update mode
        const updateData = { ...userData };
        if (document.getElementById('newPassword').value) {
          updateData.password = document.getElementById('newPassword').value;
        }
        await this.updateUser(parseInt(editId), updateData);
      } else {
        // Create mode
        userData.password = document.getElementById('newPassword').value;
        await this.createUser(userData);
      }
    });

    // Filters
    document.getElementById('userSearch')?.addEventListener('input', () => {
      this.currentPage.users = 1;
      this.loadUsers();
    });

    document.getElementById('roleFilter')?.addEventListener('change', () => {
      this.currentPage.users = 1;
      this.loadUsers();
    });

    document.getElementById('activeFilter')?.addEventListener('change', () => {
      this.currentPage.users = 1;
      this.loadUsers();
    });

    document.getElementById('logSearch')?.addEventListener('input', () => {
      this.currentPage.logs = 1;
      this.loadLogs();
    });

    document.getElementById('actionFilter')?.addEventListener('change', () => {
      this.currentPage.logs = 1;
      this.loadLogs();
    });
  }

  /**
   * Escape HTML
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize admin on admin page
if (window.location.pathname === '/admin') {
  window.admin = new Admin();
}
