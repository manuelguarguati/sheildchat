/**
 * Chat Module
 * Real-time messaging with Socket.io
 * Enhanced with robust error handling, state management, and auto-reconnection
 */

class Chat {
  constructor() {
    this.socket = null;
    this.currentUser = null;
    this.selectedUser = null;
    this.onlineUsers = new Set();
    this.messages = [];
    this.isTyping = false;
    this.typingTimeout = null;
    
    // State management
    this.connectionState = 'disconnected'; // 'connecting' | 'connected' | 'disconnected' | 'reconnecting'
    this.pendingMessages = new Map(); // Map of temp ID -> message data
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    
    // Friends and requests state
    this.friends = [];
    this.pendingRequests = [];
    this.searchResults = [];
    this.searchTimeout = null;
    this.searchQuery = '';
    
    // Unread messages tracking
    this.unreadCounts = new Map(); // userId -> count
    
    // Notification sound
    this.notificationSound = null;
    
    // Event listeners storage for cleanup
    this.eventListeners = new Map();
    
    this.init();
  }

  /**
   * Initialize chat
   */
  async init() {
    if (!Auth.requireAuth()) return;
    
    this.currentUser = Auth.getUser();
    if (!this.currentUser) {
      window.location.href = '/login';
      return;
    }

    // Request notification permission
    this.requestNotificationPermission();
    
    // Initialize notification sound
    this.initNotificationSound();
    
    this.updateUI();
    await this.loadFriends();
    await this.loadPendingRequests();
    this.connectSocket();
    this.bindEvents();
    
    // Update last_seen on page unload
    window.addEventListener('beforeunload', () => {
      if (this.socket && this.connectionState === 'connected') {
        this.socket.emit('update:last:seen');
      }
    });

    // Handle visibility change for notifications
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.socket) {
        // Update last_seen when user comes back
        this.socket.emit('update:last:seen');
      }
    });
  }

  /**
   * Request browser notification permission
   */
  requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        console.log('Notification permission:', permission);
      }).catch(error => {
        console.error('Failed to request notification permission:', error);
      });
    }
  }

  /**
   * Initialize notification sound
   */
  initNotificationSound() {
    try {
      // Try MP3 first, fallback to OGG
      const audioSources = [
        '/sounds/notification.mp3',
        '/sounds/notification.ogg'
      ];
      
      this.notificationSound = new Audio();
      this.notificationSound.volume = 0.5;
      this.notificationSound.preload = 'auto';
      
      // Set up error handler to try next source
      this.notificationSound.addEventListener('error', () => {
        console.log('Audio source error, trying next format');
      });
      
      // Try to load the first source
      this.notificationSound.src = audioSources[0];
      this.notificationSound.load();
      
      console.log('Notification sound initialized:', this.notificationSound.src);
    } catch (error) {
      console.log('Notification sound not available:', error);
      this.notificationSound = null;
    }
  }

  /**
   * Play notification sound
   */
  playNotificationSound() {
    if (!this.notificationSound) {
      // Try to reinitialize
      this.initNotificationSound();
      return;
    }
    
    // Reset audio to start
    this.notificationSound.currentTime = 0;
    
    this.notificationSound.play().catch(async (error) => {
      console.log('Could not play notification sound, trying fallback:', error.message);
      
      // Try OGG as fallback
      try {
        const oggAudio = new Audio('/sounds/notification.ogg');
        oggAudio.volume = 0.5;
        await oggAudio.play();
        console.log('OGG fallback played successfully');
      } catch (oggError) {
        console.log('Could not play OGG fallback:', oggError.message);
      }
    });
  }

  /**
   * Update UI with user info
   */
  updateUI() {
    const nameEl = document.getElementById('currentUserName');
    const avatarEl = document.getElementById('currentUserAvatar');
    const adminLink = document.getElementById('adminLink');
    const connectionStatusEl = document.getElementById('connectionStatus');
    
    if (nameEl) {
      nameEl.textContent = this.currentUser.first_name 
        ? `${this.currentUser.first_name} ${this.currentUser.last_name}`
        : this.currentUser.username;
    }
    
    if (avatarEl) {
      avatarEl.textContent = (this.currentUser.first_name || this.currentUser.username)[0].toUpperCase();
    }
    
    if (adminLink && this.currentUser.role === 'admin') {
      adminLink.style.display = 'flex';
    }

    // Update connection status indicator
    if (connectionStatusEl) {
      connectionStatusEl.className = `connection-status ${this.connectionState}`;
      connectionStatusEl.title = this.getConnectionStatusText();
    }
  }

  /**
   * Get human-readable connection status
   */
  getConnectionStatusText() {
    const statusMap = {
      'connected': 'Connected',
      'connecting': 'Connecting...',
      'disconnected': 'Disconnected',
      'reconnecting': `Reconnecting (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    };
    return statusMap[this.connectionState] || 'Unknown';
  }

  /**
   * Connect to Socket.io with auto-reconnection
   */
  connectSocket() {
    const token = localStorage.getItem('shield_token');
    
    this.connectionState = 'connecting';
    this.updateConnectionStatus();

    this.socket = io({
      auth: { token },
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
      reconnectionDelayMax: 5000,
      timeout: 10000
    });

    // Set up event listeners
    this.setupEventListeners();

    this.socket.on('connect', () => {
      console.log('🔌 Socket conectado:', this.socket.id);
      this.connectionState = 'connected';
      this.reconnectAttempts = 0;
      this.updateConnectionStatus();
      Toast.show('Connected', 'success');
      
      // Register user to their personal room
      console.log("📝 Ejecutando register con userId:", this.currentUser.id);
      this.socket.emit('register', this.currentUser.id, (response) => {
        console.log("✅ Register response:", response);
        if (!response?.success) {
          console.warn('Registration failed:', response?.error);
        }
      });

      // Resend pending messages
      this.resendPendingMessages();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      this.connectionState = 'disconnected';
      this.updateConnectionStatus();
      
      if (reason === 'io server disconnect') {
        // Server initiated disconnect, try to reconnect manually
        this.socket.connect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      this.connectionState = 'disconnected';
      this.updateConnectionStatus();
      
      if (error.message === 'Authentication failed' || error.message === 'Token expired') {
        Toast.show('Session expired. Please login again.', 'error');
        Auth.logout();
        window.location.href = '/login';
      } else {
        Toast.show('Connection error. Retrying...', 'warning');
      }
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      this.connectionState = 'reconnecting';
      this.reconnectAttempts = attemptNumber;
      this.updateConnectionStatus();
      console.log(`Reconnection attempt ${attemptNumber}/${this.maxReconnectAttempts}`);
    });

    this.socket.on('reconnect', () => {
      console.log('Reconnected successfully');
      this.connectionState = 'connected';
      this.reconnectAttempts = 0;
      this.updateConnectionStatus();
      Toast.show('Reconnected', 'success');
    });

    this.socket.on('reconnect_failed', () => {
      console.error('Reconnection failed');
      this.connectionState = 'disconnected';
      this.updateConnectionStatus();
      Toast.show('Failed to reconnect. Please refresh the page.', 'error');
    });
  }

  /**
   * Set up socket event listeners
   */
  setupEventListeners() {
    // IMPORTANT: Remove existing listeners to prevent duplicates
    this.socket.off('new_message');
    this.socket.off('message:receive');
    this.socket.off('error');
    this.socket.off('user:online');
    this.socket.off('user:offline');
    this.socket.off('typing:start');
    this.socket.off('typing:stop');
    this.socket.off('message:read:ack');
    this.socket.off('messages:read:bulk');
    this.socket.off('friend:request:received');
    this.socket.off('friend:request:accepted:notification');
    this.socket.off('messageEdited');
    this.socket.off('messageDeleted');
    
    // Handle incoming messages (new_message event)
    this.socket.on('new_message', (message) => {
      console.log('📨 Mensaje recibido via new_message:', message);
      this.handleIncomingMessage(message);
    });

    // Handle incoming messages (message:receive event - backwards compatibility)
    this.socket.on('message:receive', (message) => {
      this.handleIncomingMessage(message);
    });

    // Handle socket errors
    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
      Toast.show(error.message || 'Connection error', 'error');
    });

    // Handle user online status
    this.socket.on('user:online', (data) => {
      this.onlineUsers.add(data.userId);
      this.updateUserStatus(data.userId, true);
    });

    // Handle user offline status
    this.socket.on('user:offline', (data) => {
      this.onlineUsers.delete(data.userId);
      this.updateUserStatus(data.userId, false);
      // Update last seen info if available
      if (data.last_seen) {
        this.updateUserLastSeen(data.userId, data.last_seen);
      }
    });

    // Handle typing indicators
    this.socket.on('typing:start', (data) => {
      if (this.selectedUser && data.sender_id === this.selectedUser.id) {
        this.showTypingIndicator();
      }
    });

    this.socket.on('typing:stop', (data) => {
      if (this.selectedUser && data.sender_id === this.selectedUser.id) {
        this.hideTypingIndicator();
      }
    });

    // Handle message read acknowledgment (single message)
    this.socket.on('message:read:ack', (data) => {
      this.updateMessageReadStatus(data.message_id);
    });

    // Handle bulk message read acknowledgment
    this.socket.on('messages:read:bulk', (data) => {
      this.updateBulkMessagesReadStatus(data.reader_id);
    });

    // Handle friend request received notification
    this.socket.on('friend:request:received', (data) => {
      console.log('Friend request received:', data);
      Toast.show(`${data.sender_name} te ha enviado una solicitud de amistad`, 'info');
      this.loadPendingRequests();
    });

    // Handle friend request accepted notification
    this.socket.on('friend:request:accepted:notification', (data) => {
      console.log('Friend request accepted:', data);
      Toast.show(`¡Ahora eres amigo de ${data.receiver_name}!`, 'success');
      this.loadFriends();
      // Add new friend to sidebar
      this.addFriendToSidebar(data);
    });

    // Handle message edited event
    this.socket.on('messageEdited', (data) => {
      console.log('Message edited:', data);
      this.handleMessageEdited(data);
    });

    // Handle message deleted event
    this.socket.on('messageDeleted', (data) => {
      console.log('Message deleted:', data);
      this.handleMessageDeleted(data);
    });
  }

  /**
   * Update connection status indicator in UI
   */
  updateConnectionStatus() {
    const statusEl = document.getElementById('connectionStatus');
    if (statusEl) {
      statusEl.className = `connection-status ${this.connectionState}`;
      statusEl.title = this.getConnectionStatusText();
    }
  }

  /**
   * Resend pending messages after reconnection
   */
  async resendPendingMessages() {
    if (this.pendingMessages.size === 0) return;
    
    console.log(`Resending ${this.pendingMessages.size} pending messages`);
    
    const pending = Array.from(this.pendingMessages.entries());
    
    for (const [tempId, messageData] of pending) {
      try {
        await this.sendMessageAsync(messageData.content, messageData.receiverId, tempId);
      } catch (error) {
        console.error('Failed to resend message:', error);
      }
    }
  }

  /**
   * Send message asynchronously with promise support
   */
  sendMessageAsync(content, receiverId, tempId = null) {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.connectionState !== 'connected') {
        reject(new Error('Not connected'));
        return;
      }

      this.socket.emit('message:send', {
        receiver_id: receiverId,
        content: content.trim()
      }, (response) => {
        if (response?.success) {
          resolve(response);
        } else {
          reject(new Error(response?.error || 'Failed to send message'));
        }
      });

      // Timeout for message send
      setTimeout(() => {
        reject(new Error('Message send timeout'));
      }, 10000);
    });
  }

  /**
   * Update message status in UI
   */
  updateMessageStatus(tempId, status) {
    const msgEl = document.querySelector(`.message[data-temp-id="${tempId}"]`);
    if (msgEl) {
      const statusEl = msgEl.querySelector('.message-status');
      if (statusEl) {
        statusEl.className = `message-status ${status}`;
        statusEl.textContent = status === 'sending' ? 'Sending...' : 
                               status === 'failed' ? 'Failed' : '';
      }
    }
  }

  /**
   * Load friends list (accepted friendships)
   */
  async loadFriends() {
    try {
      console.log('📥 Cargando lista de amigos...');
      const response = await api.friends.getFriends();
      
      if (response.success) {
        this.friends = response.data.friends;
        this.renderFriends();
        console.log('✅ Amigos cargados:', this.friends.length);
      }
    } catch (error) {
      console.error('❌ Error al cargar amigos:', error);
      this.renderFriends();
    }
  }

  /**
   * Render friends list
   */
  renderFriends() {
    const container = document.getElementById('friendsList');
    if (!container) {
      console.warn('⚠️ No se encontró el contenedor de amigos');
      return;
    }
    
    if (!this.friends || this.friends.length === 0) {
      container.innerHTML = '<div class="empty-state">No friends yet. Search for users to add!</div>';
      console.log('📭 No hay amigos para mostrar');
      return;
    }
    
    console.log('👥 Renderizando lista de amigos:', this.friends.length);
    
    container.innerHTML = this.friends.map(user => {
      const unreadCount = this.unreadCounts.get(user.id) || 0;
      const isOnline = this.onlineUsers.has(user.id);
      
      return `
        <div class="user-item friend-item" data-user-id="${user.id}">
          <div class="avatar">${(user.first_name || user.username)[0].toUpperCase()}</div>
          <div class="user-details">
            <span class="user-name">${user.first_name ? `${user.first_name} ${user.last_name}` : user.username}</span>
            <span class="user-status" id="user-status-${user.id}">${isOnline ? 'Online' : 'Offline'}</span>
          </div>
          ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
        </div>
      `;
    }).join('');

    // Add click handlers
    container.querySelectorAll('.user-item').forEach(item => {
      item.addEventListener('click', () => {
        const userId = parseInt(item.dataset.userId);
        const user = this.friends.find(u => u.id === userId);
        if (user) {
          console.log('👤 Usuario seleccionado:', user.username);
          this.selectUser(user);
        }
      });
    });
    
    console.log('✅ Lista de amigos renderizada');
  }

  /**
   * Load pending friend requests
   */
  async loadPendingRequests() {
    try {
      const response = await api.friends.getPendingRequests();
      
      if (response.success) {
        this.pendingRequests = response.data.requests;
        this.renderPendingRequests();
      }
    } catch (error) {
      console.error('Failed to load pending requests:', error);
      this.renderPendingRequests();
    }
  }

  /**
   * Add new friend to sidebar with animation
   * @param {Object} friend - Friend user object
   */
  addFriendToSidebar(friend) {
    const container = document.getElementById('friendsList');
    if (!container) {
      console.warn('⚠️ No se encontró el contenedor de amigos');
      return;
    }
    
    // Check if friend already exists
    const existingItem = container.querySelector(`.friend-item[data-user-id="${friend.id}"]`);
    if (existingItem) {
      console.log('👤 Usuario ya existe en la lista de amigos');
      return;
    }
    
    // Remove empty state if exists
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) {
      emptyState.remove();
    }
    
    const isOnline = this.onlineUsers.has(friend.id);
    const unreadCount = this.unreadCounts.get(friend.id) || 0;
    
    const friendHtml = `
      <div class="friend-item" data-user-id="${friend.id}" style="opacity: 0; transform: translateX(-20px);">
        <div class="avatar">${(friend.first_name || friend.username)[0].toUpperCase()}</div>
        <div class="user-details">
          <span class="user-name">${friend.first_name ? `${friend.first_name} ${friend.last_name}` : friend.username}</span>
          <span class="user-status ${isOnline ? 'online' : ''}" id="user-status-${friend.id}">${isOnline ? 'Online' : 'Offline'}</span>
        </div>
        ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
      </div>
    `;
    
    // Insert at the beginning
    container.insertAdjacentHTML('afterbegin', friendHtml);
    
    // Animate entry
    setTimeout(() => {
      const newItem = container.querySelector(`.friend-item[data-user-id="${friend.id}"]`);
      if (newItem) {
        newItem.style.transition = 'all 0.3s ease';
        newItem.style.opacity = '1';
        newItem.style.transform = 'translateX(0)';
        console.log('👤 Nuevo amigo agregado a la sidebar');
      }
    }, 10);
    
    // Add click handler
    const newItem = container.querySelector(`.friend-item[data-user-id="${friend.id}"]`);
    if (newItem) {
      newItem.addEventListener('click', () => {
        const user = this.friends.find(u => u.id === friend.id);
        if (user) this.selectUser(user);
      });
    }
  }

  /**
   * Render pending requests
   */
  renderPendingRequests() {
    const container = document.getElementById('pendingRequestsList');
    if (!container) {
      console.warn('⚠️ No se encontró el contenedor de solicitudes pendientes');
      return;
    }

    const badge = document.getElementById('pendingBadge');
    if (badge) {
      badge.textContent = this.pendingRequests.length;
      badge.style.display = this.pendingRequests.length > 0 ? 'inline' : 'none';
      console.log('📛 Badge de solicitudes actualizado:', this.pendingRequests.length);
    }

    if (!this.pendingRequests || this.pendingRequests.length === 0) {
      container.innerHTML = '<div class="empty-state">No pending requests</div>';
      console.log('📭 No hay solicitudes pendientes');
      return;
    }

    console.log('📨 Renderizando solicitudes pendientes:', this.pendingRequests.length);
    
    container.innerHTML = this.pendingRequests.map(req => `
      <div class="request-item" data-request-id="${req.id}">
        <div class="avatar">${(req.sender.first_name || req.sender.username)[0].toUpperCase()}</div>
        <div class="request-details">
          <span class="user-name">${req.sender.first_name ? `${req.sender.first_name} ${req.sender.last_name}` : req.sender.username}</span>
          <span class="request-time">${this.formatTime(req.created_at)}</span>
        </div>
        <div class="request-actions">
          <button class="btn-accept" onclick="chat.acceptRequest(${req.id})">✓</button>
          <button class="btn-reject" onclick="chat.rejectRequest(${req.id})">✕</button>
        </div>
      </div>
    `).join('');
    
    console.log('✅ Solicitudes pendientes renderizadas');
  }

  /**
   * Format time helper
   */
  formatTime(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  }

  /**
   * Accept friend request
   * @param {number} requestId - The friend request ID to accept
   */
  async acceptRequest(requestId) {
    console.log('✅ Aceptando solicitud de amistad:', requestId);
    
    // Find the request element in DOM
    const requestEl = document.querySelector(`.request-item[data-request-id="${requestId}"]`);
    console.log('📋 Elemento de solicitud encontrado:', requestEl);
    
    try {
      const response = await api.friends.acceptRequest(requestId);
      
      if (response.success) {
        console.log('✅ Solicitud aceptada correctamente');
        
        // Show success message
        Toast.show('Ahora son amigos', 'success');
        
        // Get the sender info before removing
        const request = this.pendingRequests.find(r => r.id === requestId);
        const senderId = request?.sender_id;
        const senderName = request?.sender?.first_name 
          ? `${request.sender.first_name} ${request.sender.last_name}`
          : request?.sender?.username || 'Usuario';
        
        // Remove the request card from DOM immediately with animation
        if (requestEl) {
          requestEl.style.transition = 'all 0.3s ease';
          requestEl.style.opacity = '0';
          requestEl.style.transform = 'translateX(100px)';
          setTimeout(() => {
            requestEl.remove();
            console.log('🗑️ Tarjeta de solicitud eliminada del DOM');
          }, 300);
        }
        
        // Emit socket event for real-time notification
        if (senderId) {
          this.socket?.emit('friend:request:accepted', { sender_id: senderId });
          console.log('📡 Socket event enviado');
        }
        
        // Reload friends list
        await this.loadFriends();
        console.log('🔄 Lista de amigos actualizada');
        
        // Reload pending requests after animation
        setTimeout(async () => {
          await this.loadPendingRequests();
          console.log('🔄 Solicitudes pendientes actualizadas');
        }, 350);
        
        // Refresh online status for new friend
        if (this.selectedUser && this.selectedUser.id === response.data.friendship?.receiver_id) {
          this.updateUserStatus(this.selectedUser.id, this.onlineUsers.has(this.selectedUser.id));
        }
        
        // Add the new friend to sidebar with animation
        if (response.data?.friendship) {
          const newFriend = response.data.friendship;
          this.addFriendToSidebar(newFriend);
        }
      }
    } catch (error) {
      console.error('❌ Error al aceptar solicitud:', error);
      Toast.show(error.message || 'Failed to accept request', 'error');
    }
  }

  /**
   * Reject friend request
   */
  async rejectRequest(requestId) {
    try {
      const response = await api.friends.rejectRequest(requestId);
      
      if (response.success) {
        Toast.show('Friend request rejected', 'info');
        await this.loadPendingRequests();
      }
    } catch (error) {
      Toast.show(error.message || 'Failed to reject request', 'error');
    }
  }

  /**
   * Search users
   */
  async searchUsers(query) {
    if (!query || query.trim().length < 2) {
      this.searchResults = [];
      this.renderSearchResults();
      return;
    }

    try {
      const response = await api.friends.searchUsers(query);
      
      if (response.success) {
        this.searchResults = response.data.users;
        this.renderSearchResults();
      }
    } catch (error) {
      console.error('Search failed:', error);
      this.searchResults = [];
      this.renderSearchResults();
    }
  }

  /**
   * Render search results
   */
  renderSearchResults() {
    const container = document.getElementById('searchResults');
    if (!container) return;

    // Show/hide container based on results
    if (this.searchQuery && this.searchQuery.trim().length >= 2) {
      container.style.display = 'block';
    } else {
      container.style.display = 'none';
      return;
    }

    if (!this.searchResults || this.searchResults.length === 0) {
      container.innerHTML = '<div class="empty-state">No users found</div>';
      return;
    }

    container.innerHTML = this.searchResults.map(user => `
      <div class="search-result-item" data-user-id="${user.id}">
        <div class="avatar">${(user.first_name || user.username)[0].toUpperCase()}</div>
        <div class="user-details">
          <span class="user-name">${user.first_name ? `${user.first_name} ${user.last_name}` : user.username}</span>
        </div>
        <button class="btn-add-friend" data-user-id="${user.id}" onclick="chat.sendFriendRequest(${user.id}, this)">Add Friend</button>
      </div>
    `).join('');
  }

  /**
   * Send friend request
   * @param {number} receiverId - The user ID to send request to
   * @param {HTMLElement} buttonElement - Optional button element for direct DOM update
   */
  async sendFriendRequest(receiverId, buttonElement = null) {
    // Validate receiverId
    if (!receiverId || receiverId === 'undefined' || receiverId === 'null') {
      console.error('❌ Invalid receiverId:', receiverId);
      Toast.show('Error: Invalid user ID', 'error');
      return;
    }
    
    // Ensure receiverId is a number
    const parsedReceiverId = parseInt(receiverId, 10);
    if (isNaN(parsedReceiverId)) {
      console.error('❌ receiverId is not a valid number:', receiverId);
      Toast.show('Error: Invalid user ID', 'error');
      return;
    }
    
    console.log('📤 Enviando solicitud de amistad a:', parsedReceiverId);
    
    // Try to find button if not provided
    let button = buttonElement;
    if (!button) {
      button = document.querySelector(`.btn-add-friend[data-user-id="${parsedReceiverId}"]`);
    }
    
    // Disable button immediately to prevent double clicks
    if (button) {
      button.disabled = true;
      button.innerText = 'Enviando...';
    }
    
    try {
      console.log('📡 Enviando API request con receiverId:', parsedReceiverId);
      const response = await api.friends.sendRequest(parsedReceiverId);
      
      if (response.success) {
        console.log('✅ Solicitud enviada correctamente');
        
        // Show success message
        Toast.show('Solicitud enviada correctamente', 'success');
        
        // Disable the button and change text immediately
        if (button) {
          button.innerText = 'Solicitud pendiente';
          button.disabled = true;
          button.classList.add('btn-pending');
          console.log('🔘 Botón actualizado visualmente');
        } else {
          console.warn('⚠️ No se encontró el botón para actualizar');
        }
        
        // Emit socket event for real-time notification
        this.socket?.emit('friend:request:sent', { receiver_id: parsedReceiverId });
        console.log('📡 Socket event enviado');
        
        // Clear search results and reload
        this.searchQuery = '';
        const searchInput = document.getElementById('searchUsers');
        if (searchInput) searchInput.value = '';
        this.searchResults = [];
        this.renderSearchResults();
        
        console.log('🧹 Búsqueda limpiada');
      }
    } catch (error) {
      console.error('❌ Error al enviar solicitud:', error);
      Toast.show(error.message || 'Failed to send request', 'error');
    }
  }

  /**
   * Load users (legacy - redirects to loadFriends)
   */
  async loadUsers() {
    await this.loadFriends();
  }

  /**
   * Render users list (legacy - redirects to renderFriends)
   */
  renderUsers(users) {
    this.friends = users;
    this.renderFriends();
  }

  /**
   * Update user status
   */
  updateUserStatus(userId, isOnline) {
    const statusEl = document.getElementById(`user-status-${userId}`);
    if (statusEl) {
      statusEl.textContent = isOnline ? 'Online' : 'Offline';
      statusEl.className = `user-status ${isOnline ? 'online' : ''}`;
    }

    // Update chat header if this user is selected
    if (this.selectedUser && this.selectedUser.id === userId) {
      const chatStatusEl = document.getElementById('chatUserStatus');
      if (chatStatusEl) {
        chatStatusEl.textContent = isOnline ? 'Online' : 'Offline';
        chatStatusEl.className = `user-status ${isOnline ? 'online' : ''}`;
      }
    }
  }

  /**
   * Update single message read status
   * @param {number} messageId - The message ID to update
   */
  updateMessageReadStatus(messageId) {
    console.log('📖 Actualizando estado de lectura para mensaje:', messageId);
    
    const msgEl = document.querySelector(`.message[data-msg-id="${messageId}"]`);
    if (!msgEl) {
      console.warn('⚠️ No se encontró el elemento de mensaje para ID:', messageId);
      return;
    }
    
    const statusEl = msgEl.querySelector('.message-status');
    if (statusEl) {
      statusEl.innerHTML = '✓✓';
      statusEl.classList.add('read');
      console.log('✅ Indicador de leído actualizado a ✓✓');
    }
    msgEl.dataset.isRead = 'true';
  }

  /**
   * Update bulk messages read status
   */
  updateBulkMessagesReadStatus(readerId) {
    // Update all messages from this reader in current conversation
    this.messages.forEach(msg => {
      if (msg.sender_id === readerId) {
        this.updateMessageReadStatus(msg.id);
      }
    });
  }

  /**
   * Update user last seen
   */
  updateUserLastSeen(userId, lastSeen) {
    const statusEl = document.getElementById(`user-status-${userId}`);
    if (statusEl && !this.onlineUsers.has(userId)) {
      const lastSeenDate = new Date(lastSeen);
      const now = new Date();
      const diff = now - lastSeenDate;
      
      let timeText = '';
      if (diff < 60000) {
        timeText = 'Just now';
      } else if (diff < 3600000) {
        timeText = `Last seen ${Math.floor(diff / 60000)}m ago`;
      } else if (diff < 86400000) {
        timeText = `Last seen ${Math.floor(diff / 3600000)}h ago`;
      } else {
        timeText = `Last seen ${lastSeenDate.toLocaleDateString()}`;
      }
      
      statusEl.textContent = timeText;
    }
  }

  /**
   * Add new friend to sidebar dynamically
   */
  addFriendToSidebar(data) {
    const friend = {
      id: data.receiver_id,
      username: '',
      first_name: data.receiver_name.split(' ')[0],
      last_name: data.receiver_name.split(' ').slice(1).join(' ') || '',
      avatar: null
    };
    
    // Add to friends array if not exists
    if (!this.friends.find(f => f.id === friend.id)) {
      this.friends.push(friend);
      this.renderFriends();
    }
  }

  /**
   * Select a user to chat with
   */
  async selectUser(user) {
    this.selectedUser = user;
    this.messages = [];

    // Update UI
    document.getElementById('noChatSelected').style.display = 'none';
    document.getElementById('activeChat').style.display = 'flex';

    // Update chat header
    document.getElementById('chatUserAvatar').textContent = (user.first_name || user.username)[0].toUpperCase();
    document.getElementById('chatUserName').textContent = user.first_name 
      ? `${user.first_name} ${user.last_name}` 
      : user.username;

    // Update status
    const isOnline = this.onlineUsers.has(user.id);
    document.getElementById('chatUserStatus').textContent = isOnline ? 'Online' : 'Offline';
    document.getElementById('chatUserStatus').className = `user-status ${isOnline ? 'online' : ''}`;

    // Highlight selected user
    document.querySelectorAll('.user-item').forEach(item => {
      item.classList.toggle('active', parseInt(item.dataset.userId) === user.id);
    });

    // Clear unread count for this user
    this.unreadCounts.set(user.id, 0);
    
    // Remove unread indicator from the selected user's sidebar item
    const friendItem = document.querySelector(`.friend-item[data-user-id="${user.id}"]`);
    if (friendItem) {
      const indicator = friendItem.querySelector('.unread-indicator');
      if (indicator) {
        indicator.remove();
      }
    }
    
    this.renderFriends();

    // Load conversation
    await this.loadConversation();

    // Mark all messages from this user as read
    if (this.socket && this.connectionState === 'connected') {
      this.socket.emit('messages:mark:read', { sender_id: user.id });
    }

    // Get last seen if user is offline
    if (!isOnline && this.socket && this.connectionState === 'connected') {
      this.socket.emit('get:last:seen', { target_user_id: user.id }, (response) => {
        if (response.success && response.last_seen) {
          this.updateUserLastSeen(user.id, response.last_seen);
        }
      });
    }

    // Notify typing (optional)
    this.socket?.emit('typing:stop', { receiver_id: user.id });
  }

  /**
   * Load conversation history
   */
  async loadConversation() {
    if (!this.selectedUser) return;

    try {
      const response = await api.messages.getConversation(this.selectedUser.id);
      
      if (response.success) {
        const serverMessages = response.data.messages.reverse();
        
        // Merge server messages with existing messages (keeping temp messages pending ACK)
        const existingIds = new Set(serverMessages.map(m => m.id));
        const tempMessages = this.messages.filter(m => m.temp && !existingIds.has(m.id));
        
        // Combine server messages with temp messages (temp messages will be replaced when ACK arrives)
        this.messages = [...serverMessages, ...tempMessages];
        
        // Clear DOM and re-render all messages
        this.renderMessages();
      }
    } catch (error) {
      Toast.show(error.message, 'error');
    }
  }

  /**
   * Render messages
   */
  renderMessages() {
    const container = document.getElementById('messagesList');
    if (!container) return;

    if (this.messages.length === 0) {
      container.innerHTML = `
        <div class="no-messages" style="text-align: center; color: var(--text-muted); padding: 40px;">
          <p>No messages yet. Start a conversation!</p>
        </div>
      `;
      return;
    }

    // Clear existing messages in DOM (this is called after loading conversation)
    container.innerHTML = '';
    
    // Render all messages
    container.innerHTML = this.messages.map(msg => this.createMessageElement(msg)).join('');
    this.scrollToBottom();
  }

  /**
   * Create message element
   */
  createMessageElement(msg) {
    const isSent = msg.sender_id === this.currentUser.id;
    const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isDeleted = msg.is_deleted === true || msg.is_deleted === 1;
    const isEdited = msg.is_edited === true || msg.is_edited === 1;
    
    // Check if message is read (for sent messages)
    let checkmarks = '';
    if (isSent && !isDeleted) {
      if (msg.is_read) {
        checkmarks = '<span class="message-status read">✓✓</span>';
      } else {
        checkmarks = '<span class="message-status">✓</span>';
      }
    }
    
    // Handle deleted messages
    if (isDeleted) {
      return `
        <div class="message ${isSent ? 'sent' : 'received'} deleted" id="message-${msg.id}" data-msg-id="${msg.id}" data-is-deleted="true">
          <div class="message-content">
            <div class="message-text deleted-text">Este mensaje fue eliminado</div>
            <div class="message-info">
              <span class="message-time">${time}</span>
            </div>
          </div>
        </div>
      `;
    }
    
    // Handle different message types
    let messageContent = '';
    if (msg.message_type === 'image') {
      messageContent = `<img src="${msg.file_url}" alt="Image" class="message-image" onclick="window.chat.viewImage('${msg.file_url}')">`;
    } else if (msg.message_type === 'file') {
      const filename = msg.decrypted_message || msg.content || 'Archivo';
      messageContent = `<a href="${msg.file_url}" target="_blank" class="message-file">📎 ${filename}</a>`;
    } else {
      messageContent = `<div class="message-text">${this.escapeHtml(msg.decrypted_message || msg.content || '')}</div>`;
    }
    
    // Show edit/delete menu only for own messages
    let menuHtml = '';
    if (isSent) {
      menuHtml = `
        <div class="message-menu">
          <button class="message-menu-btn" onclick="window.chat.toggleMessageMenu(${msg.id}, event)">⋯</button>
          <div class="message-menu-dropdown" id="menu-${msg.id}">
            <button class="menu-item" onclick="window.chat.startEditMessage(${msg.id})">✏️ Editar</button>
            <button class="menu-item delete" onclick="window.chat.deleteMessage(${msg.id})">🗑️ Eliminar</button>
          </div>
        </div>
      `;
    }
    
    // Show (editado) for edited messages
    const editedLabel = isEdited ? '<span class="edited-label">(editado)</span>' : '';
    
    return `
      <div class="message ${isSent ? 'sent' : 'received'}" id="message-${msg.id}" data-msg-id="${msg.id}" data-is-read="${msg.is_read || false}" data-is-edited="${isEdited}">
        ${menuHtml}
        <div class="message-content">
          ${messageContent}
          <div class="message-info">
            <span class="message-time">${time}</span>
            ${editedLabel}
            ${isSent ? checkmarks : ''}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Toggle message menu
   */
  toggleMessageMenu(messageId, event) {
    event.stopPropagation();
    
    // Close all other menus
    document.querySelectorAll('.message-menu-dropdown').forEach(menu => {
      if (menu.id !== `menu-${messageId}`) {
        menu.style.display = 'none';
      }
    });
    
    // Toggle this menu
    const menu = document.getElementById(`menu-${messageId}`);
    if (menu) {
      menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    }
  }

  /**
   * Close all message menus
   */
  closeAllMenus() {
    document.querySelectorAll('.message-menu-dropdown').forEach(menu => {
      menu.style.display = 'none';
    });
  }

  /**
   * Start editing a message
   */
  startEditMessage(messageId) {
    const msgEl = document.querySelector(`.message[data-msg-id="${messageId}"]`);
    if (!msgEl) return;
    
    // Find the message in the array
    const message = this.messages.find(m => m.id === messageId);
    if (!message || message.is_deleted) {
      Toast.show('No puedes editar este mensaje', 'warning');
      return;
    }
    
    // Check if 15 minutes have passed
    const messageTime = new Date(message.created_at).getTime();
    const now = Date.now();
    const timeDiff = now - messageTime;
    const timeLimit = 15 * 60 * 1000; // 15 minutes
    
    if (timeDiff > timeLimit) {
      Toast.show('No puedes editar después de 15 minutos', 'error');
      return;
    }
    
    // Close menu
    this.closeAllMenus();
    
    // Get current content
    const currentContent = message.decrypted_message || message.content || '';
    
    // Replace message content with input
    const contentDiv = msgEl.querySelector('.message-content');
    if (!contentDiv) return;
    
    contentDiv.innerHTML = `
      <div class="edit-message-container">
        <input type="text" class="edit-message-input" value="${this.escapeHtml(currentContent)}" />
        <div class="edit-message-actions">
          <button class="btn-cancel" onclick="window.chat.cancelEditMessage(${messageId})">✕</button>
          <button class="btn-save" onclick="window.chat.saveEditMessage(${messageId})">✓</button>
        </div>
      </div>
    `;
    
    // Focus the input
    const input = contentDiv.querySelector('.edit-message-input');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
    
    // Add enter key handler
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.saveEditMessage(messageId);
      }
    });
  }

  /**
   * Cancel editing a message
   */
  cancelEditMessage(messageId) {
    // Re-render the message
    const message = this.messages.find(m => m.id === messageId);
    if (message) {
      const msgEl = document.querySelector(`.message[data-msg-id="${messageId}"]`);
      if (msgEl) {
        msgEl.outerHTML = this.createMessageElement(message);
      }
    }
  }

  /**
   * Save edited message
   */
  async saveEditMessage(messageId) {
    const msgEl = document.querySelector(`.message[data-msg-id="${messageId}"]`);
    if (!msgEl) return;
    
    const input = msgEl.querySelector('.edit-message-input');
    if (!input) return;
    
    const newContent = input.value.trim();
    
    if (!newContent) {
      Toast.show('El mensaje no puede estar vacío', 'error');
      return;
    }
    
    // Find the message
    const message = this.messages.find(m => m.id === messageId);
    if (!message) {
      Toast.show('Mensaje no encontrado', 'error');
      return;
    }
    
    // Encrypt the new content before sending
    try {
      const response = await api.messages.editMessage(messageId, newContent);
      
      if (response.success) {
        Toast.show('Mensaje editado correctamente', 'success');
        
        // Update local message
        message.decrypted_message = newContent;
        message.is_edited = true;
        message.edited_at = new Date().toISOString();
        
        // Re-render the message
        if (msgEl) {
          msgEl.outerHTML = this.createMessageElement(message);
        }
      } else {
        Toast.show(response.message || 'Error al editar mensaje', 'error');
      }
    } catch (error) {
      console.error('Error editing message:', error);
      Toast.show(error.message || 'Error al editar mensaje', 'error');
    }
  }

  /**
   * Delete a message
   */
  async deleteMessage(messageId) {
    // Close menu
    this.closeAllMenus();
    
    if (!confirm('¿Eliminar este mensaje?')) return;
    
    try {
      const token = localStorage.getItem('shield_token');
      const response = await fetch(`/api/messages/${messageId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        Toast.show('Mensaje eliminado', 'success');
        
        // Update local message
        const message = this.messages.find(m => m.id === messageId);
        if (message) {
          message.is_deleted = true;
          message.deleted_at = new Date().toISOString();
        }
        
        // Update UI
        const msgEl = document.querySelector(`.message[data-msg-id="${messageId}"]`);
        if (msgEl) {
          msgEl.outerHTML = this.createMessageElement(message);
        }
      } else {
        Toast.show(data.message || 'Error al eliminar mensaje', 'error');
      }
    } catch (error) {
      console.error('Error deleting message:', error);
      Toast.show('Error al eliminar mensaje', 'error');
    }
  }

  /**
   * Handle message edited event
   */
  handleMessageEdited(data) {
    console.log('Message edited:', data);
    
    const { id, decryptedText, is_edited, edited_at } = data;
    
    // Find and update message in array
    const message = this.messages.find(m => m.id === id);
    if (message) {
      message.is_edited = is_edited;
      message.edited_at = edited_at;
      if (decryptedText) {
        message.decrypted_message = decryptedText;
      }
      
      // Update UI if message is in current conversation
      const messageDiv = document.getElementById(`message-${id}`);
      if (!messageDiv) return;
      
      if (this.selectedUser && 
          (message.sender_id === this.selectedUser.id || message.receiver_id === this.selectedUser.id)) {
        // Update only the text content, not the entire element
        const contentDiv = messageDiv.querySelector('.message-content');
        if (contentDiv) {
          const messageText = contentDiv.querySelector('.message-text');
          if (messageText) {
            messageText.textContent = decryptedText || messageText.textContent;
          }
        }
        
        // Add or update edited label
        let editedLabel = messageDiv.querySelector('.edited-label');
        if (!editedLabel) {
          const messageInfo = messageDiv.querySelector('.message-info');
          if (messageInfo) {
            editedLabel = document.createElement('span');
            editedLabel.classList.add('edited-label');
            editedLabel.textContent = ' (editado)';
            messageInfo.appendChild(editedLabel);
          }
        } else {
          editedLabel.textContent = ' (editado)';
        }
        
        // Update data-is-edited attribute
        messageDiv.setAttribute('data-is-edited', 'true');
      }
    }
  }

  /**
   * Handle message deleted event
   */
  handleMessageDeleted(data) {
    console.log('Message deleted:', data);
    
    const { id } = data;
    
    // Find and update message in array
    const message = this.messages.find(m => m.id === id);
    if (message) {
      message.is_deleted = true;
      message.deleted_at = new Date().toISOString();
      
      // Update UI if message is in current conversation
      const messageDiv = document.getElementById(`message-${id}`);
      if (!messageDiv) return;
      
      if (this.selectedUser && 
          (message.sender_id === this.selectedUser.id || message.receiver_id === this.selectedUser.id)) {
        // Update only the inner content, don't replace the entire element
        const contentDiv = messageDiv.querySelector('.message-content');
        if (contentDiv) {
          const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          contentDiv.innerHTML = `
            <div class="message-text deleted-text">Este mensaje fue eliminado</div>
            <div class="message-info">
              <span class="message-time">${time}</span>
            </div>
          `;
        }
        
        // Mark as deleted
        messageDiv.setAttribute('data-is-deleted', 'true');
        messageDiv.classList.add('deleted');
        
        // Remove menu if exists
        const menu = messageDiv.querySelector('.message-menu');
        if (menu) {
          menu.remove();
        }
        
        // Remove status checkmarks if exists
        const status = messageDiv.querySelector('.message-status');
        if (status) {
          status.remove();
        }
        
        // Remove edited label if exists
        const editedLabel = messageDiv.querySelector('.edited-label');
        if (editedLabel) {
          editedLabel.remove();
        }
      }
    }
  }

  /**
   * Append new message to UI
   */
  appendMessage(message) {
    const container = document.getElementById('messagesList');
    if (!container) return;
    
    // ANTI-DUPLICATE: Check if message already exists in DOM
    if (document.getElementById(`message-${message.id}`)) {
      console.log('⚠️ Mensaje ya existe en DOM, ignorando:', message.id);
      return;
    }
    
    // Remove empty state if exists
    const emptyState = container.querySelector('.no-messages');
    if (emptyState) emptyState.remove();
    
    const msgEl = this.createMessageElement(message);
    container.insertAdjacentHTML('beforeend', msgEl);
    this.scrollToBottom();
    
    // Add to messages array only if not already present
    if (!this.messages.find(m => m.id === message.id)) {
      this.messages.push(message);
    }
  }

  /**
   * Handle incoming message
   * @param {Object} message - The incoming message object
   */
  handleIncomingMessage(message) {
    console.log('📨 Mensaje entrante recibido:', message);
    
    // ANTI-DUPLICATE: Check if message already exists by ID
    if (message.id && this.messages.find(m => m.id === message.id)) {
      console.log('⚠️ Mensaje ya existe en el array, ignorando:', message.id);
      return;
    }
    
    // Decrypt if needed
    if (message.encrypted_message && !message.decrypted_message) {
      try {
        message.decrypted_message = message.content;
      } catch (e) {
        message.decrypted_message = '[Unable to decrypt]';
        console.error('❌ Error al desencriptar mensaje:', e);
      }
    }
    
    // Add to messages array
    this.messages.push(message);
    console.log('📝 Mensaje agregado al array de mensajes');
    
    // Check if chatting with this person
    const isChatOpen = this.selectedUser && 
                       (message.sender_id === this.selectedUser.id || message.receiver_id === this.selectedUser.id);
    console.log('💬 Chat abierto:', isChatOpen, '- Usuario seleccionado:', this.selectedUser?.id);
    
    if (isChatOpen) {
      console.log('✅ Chat abierto - insertando mensaje en DOM');
      // Chat is open - render message and mark as read
      const msgEl = this.createMessageElement(message);
      const container = document.getElementById('messagesList');
      if (container) {
        const emptyState = container.querySelector('.no-messages');
        if (emptyState) {
          emptyState.remove();
          console.log('🗑️ Estado vacío eliminado');
        }
        container.insertAdjacentHTML('beforeend', msgEl);
        this.scrollToBottom();
        console.log('📜 Mensaje插入ado y scrolleado al fondo');
      } else {
        console.error('❌ No se encontró el contenedor de mensajes');
      }
      
      // Mark as read immediately if receiver is viewing
      if (message.receiver_id === this.currentUser.id && !message.is_read) {
        console.log('📖 Marcando mensaje como leído');
        this.socket?.emit('message:read', { 
          message_id: message.id, 
          sender_id: message.sender_id 
        });
        message.is_read = true;
        // Update visual status
        this.updateMessageReadStatus(message.id);
      }
    } else {
      console.log('🔔 Chat cerrado - mostrando notificación');
      // Chat is not open - show notification
      this.showMessageNotification(message);
      
      // Increment unread count
      const senderId = message.sender_id;
      const currentCount = this.unreadCounts.get(senderId) || 0;
      this.unreadCounts.set(senderId, currentCount + 1);
      console.log('📊 Contador de no leído actualizado:', currentCount + 1);
      
      // Update friends list with unread badge
      this.renderFriends();
      console.log('🔄 Lista de amigos actualizada');
    }
  }

  /**
   * Show message notification
   */
  showMessageNotification(message) {
    const senderId = message.sender_id;
    const isChatOpen = this.selectedUser && this.selectedUser.id === senderId;
    
    // Get sender name
    const senderName = message.sender?.first_name 
      ? `${message.sender.first_name} ${message.sender.last_name}`
      : message.sender?.username || 'Usuario';
    
    // Play notification sound if chat is not open
    if (!isChatOpen) {
      this.playNotificationSound();
    }
    
    // Show browser notification if permitted and chat is not open
    if (!isChatOpen && document.visibilityState === 'hidden') {
      if (Notification.permission === 'granted') {
        new Notification('Shield Chat', {
          body: `${senderName}: ${message.decrypted_message || message.content || 'Nuevo mensaje'}`,
          icon: '/icon-192.png',
          tag: `message-${senderId}`
        });
      }
    }
    
    // Show in-app toast notification with sender name
    if (!isChatOpen) {
      Toast.show(`✉️ Nuevo mensaje de ${senderName}`, 'info');
    }
    
    // Add a visible red dot notification in the friends list for this sender
    this.showUnreadIndicator(senderId, senderName);
  }

  /**
   * Show unread indicator (red dot) in sidebar for a user
   * @param {number} userId - The user ID who sent the message
   * @param {string} userName - The sender's display name
   */
  showUnreadIndicator(userId, userName) {
    console.log('🔔 Mostrando indicador de mensaje no leído para:', userId, userName);
    
    // Find the friend item in the sidebar
    const friendItem = document.querySelector(`.friend-item[data-user-id="${userId}"]`);
    
    if (!friendItem) {
      console.warn('⚠️ No se encontró el elemento de amigo en la sidebar para userId:', userId);
      // The user might not be in friends list yet - this is normal if they just sent their first message
      return;
    }
    
    console.log('✅ Elemento de amigo encontrado:', friendItem);
    
    // Check if already has an unread indicator
    const existingIndicator = friendItem.querySelector('.unread-indicator');
    if (existingIndicator) {
      // Update the count
      const countSpan = existingIndicator.querySelector('.unread-count');
      if (countSpan) {
        const currentCount = parseInt(countSpan.textContent) || 0;
        countSpan.textContent = currentCount + 1;
        console.log('📊 Contador actualizado a:', currentCount + 1);
      }
      return;
    }
    
    // Create a prominent red dot indicator with name tooltip
    const indicator = document.createElement('div');
    indicator.className = 'unread-indicator';
    indicator.innerHTML = `
      <span class="red-dot"></span>
      <span class="unread-count">1</span>
      <span class="sender-name-tooltip">${userName}</span>
    `;
    
    friendItem.appendChild(indicator);
    console.log('🔔 Indicador de no leído agregado');
    
    // Add animation
    indicator.style.animation = 'pulseRing 1s ease-out';
    
    // Remove animation after it completes
    setTimeout(() => {
      indicator.style.animation = '';
    }, 1000);
  }

  /**
   * Show typing indicator
   */
  showTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.style.display = 'flex';
  }

  /**
   * Hide typing indicator
   */
  hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.style.display = 'none';
  }

  /**
   * Bind UI events
   */
  bindEvents() {
    // Message form submission
    const messageForm = document.getElementById('messageForm');
    if (messageForm) {
      messageForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('messageInput');
        if (input && input.value.trim()) {
          this.sendMessage(input.value);
          input.value = '';
        }
      });
    }

    // Message input typing detection
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
      messageInput.addEventListener('input', () => {
        if (!this.isTyping && this.selectedUser && this.connectionState === 'connected') {
          this.isTyping = true;
          this.socket?.emit('typing:start', { receiver_id: this.selectedUser.id });
        }

        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
          this.isTyping = false;
          this.socket?.emit('typing:stop', { receiver_id: this.selectedUser.id });
        }, 1000);
      });
    }

    // Search users
    const searchInput = document.getElementById('searchUsers');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        clearTimeout(this.searchTimeout);
        this.searchQuery = searchInput.value.trim();
        
        this.searchTimeout = setTimeout(() => {
          if (this.searchQuery.length >= 2) {
            this.searchUsers(this.searchQuery);
          } else {
            this.searchResults = [];
            this.renderSearchResults();
          }
        }, 300);
      });
    }

    // Manual reconnect button
    const reconnectBtn = document.getElementById('reconnectBtn');
    if (reconnectBtn) {
      reconnectBtn.addEventListener('click', () => {
        if (this.connectionState !== 'connected') {
          this.socket?.connect();
        }
      });
    }

    // Close menus when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.message-menu')) {
        this.closeAllMenus();
      }
    });
  }

  /**
   * Send message
   */
  sendMessage(content) {
    if (!this.selectedUser) {
      Toast.show('Please select a user to chat with', 'warning');
      return;
    }

    // Create temp message for immediate display
    const tempId = Date.now();
    const tempMessage = {
      id: tempId,
      temp: tempId,
      sender_id: this.currentUser.id,
      receiver_id: this.selectedUser.id,
      decrypted_message: content,
      created_at: new Date().toISOString(),
      tempId: tempId
    };

    // Add to UI immediately
    this.messages.push(tempMessage);
    this.appendMessage(tempMessage);

    // Track as pending
    this.pendingMessages.set(tempId, {
      content,
      receiverId: this.selectedUser.id,
      tempId
    });

    // Send via socket
    if (this.socket && this.connectionState === 'connected') {
      this.socket.emit('message:send', {
        receiver_id: this.selectedUser.id,
        content: content.trim()
      }, (response) => {
        if (response?.success) {
          // Remove from pending
          this.pendingMessages.delete(tempId);
          
          // Replace temp message with real one
          const index = this.messages.findIndex(m => m.temp === tempId);
          if (index !== -1) {
            this.messages[index] = response.message;
          }
          
          // Update UI
          const msgEl = document.querySelector(`.message[data-msg-id="${tempId}"]`);
          if (msgEl) {
            msgEl.outerHTML = this.createMessageElement(response.message);
          }
        } else {
          // Mark as failed
          const msgEl = document.querySelector(`.message[data-msg-id="${tempId}"]`);
          if (msgEl) {
            msgEl.querySelector('.message-status').textContent = 'Failed';
            msgEl.querySelector('.message-status').classList.add('failed');
          }
          Toast.show(response?.error || 'Failed to send message', 'error');
        }
      });
    } else {
      Toast.show('Not connected. Message queued.', 'warning');
    }
  }

  /**
   * Scroll to bottom of messages
   */
  scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Disconnect socket (cleanup)
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connectionState = 'disconnected';
  }

  /**
   * Remove a friend
   */
  async removeFriend(friendId) {
    if (!confirm('¿Seguro que deseas eliminar este amigo?')) return;

    try {
      const response = await fetch(`/api/friends/${friendId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (response.ok) {
        Toast.show(data.message, 'success');
        this.loadFriends(); // Refresh friends list
      } else {
        Toast.show(data.message || 'Error al eliminar amigo', 'error');
      }
    } catch (error) {
      console.error('Remove friend error:', error);
      Toast.show('Error al eliminar amigo', 'error');
    }
  }

  /**
   * Delete conversation with a user
   */
  async deleteConversation(userId) {
    if (!confirm('¿Seguro que deseas eliminar esta conversación? Esta acción no se puede deshacer.')) return;

    try {
      const response = await fetch(`/api/messages/conversation/${userId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (response.ok) {
        Toast.show(data.message, 'success');
        // Clear messages and refresh
        this.messages = [];
        this.selectedUser = null;
        this.renderConversationHeader();
        this.renderMessages();
      } else {
        Toast.show(data.message || 'Error al eliminar conversación', 'error');
      }
    } catch (error) {
      console.error('Delete conversation error:', error);
      Toast.show('Error al eliminar conversación', 'error');
    }
  }

  /**
   * Send file/image
   */
  async sendFile() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput?.files[0];

    if (!file) {
      Toast.show('Selecciona un archivo', 'warning');
      return;
    }

    if (!this.selectedUser) {
      Toast.show('Selecciona un usuario para enviar el archivo', 'warning');
      return;
    }

    try {
      const token = localStorage.getItem('shield_token');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('receiver_id', this.selectedUser.id);
      formData.append('message_type', file.type.startsWith('image') ? 'image' : 'file');

      const response = await fetch('/api/messages/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();

      if (response.ok) {
        Toast.show('Archivo enviado', 'success');
        // Reload conversation to show new message
        await this.loadConversation(this.selectedUser.id);
        // Clear file input
        if (fileInput) fileInput.value = '';
      } else {
        Toast.show(data.message || 'Error al enviar archivo', 'error');
      }
    } catch (error) {
      console.error('Send file error:', error);
      Toast.show('Error al enviar archivo', 'error');
    }
  }

  /**
   * View image in fullscreen modal
   */
  viewImage(url) {
    // Create modal if not exists
    let modal = document.getElementById('imageModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'imageModal';
      modal.className = 'image-modal';
      modal.innerHTML = `
        <div class="image-modal-content">
          <span class="close-modal">&times;</span>
          <img id="modalImage" src="" alt="Image">
        </div>
      `;
      document.body.appendChild(modal);

      // Close modal events
      modal.querySelector('.close-modal').addEventListener('click', () => {
        modal.style.display = 'none';
      });
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.style.display = 'none';
        }
      });

      // Add modal styles
      const style = document.createElement('style');
      style.textContent = `
        .image-modal {
          display: none;
          position: fixed;
          z-index: 10000;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0,0,0,0.9);
          justify-content: center;
          align-items: center;
        }
        .image-modal-content {
          max-width: 90%;
          max-height: 90%;
          position: relative;
        }
        .image-modal-content img {
          max-width: 100%;
          max-height: 90vh;
          border-radius: 8px;
        }
        .close-modal {
          position: absolute;
          top: -40px;
          right: 0;
          color: white;
          font-size: 40px;
          cursor: pointer;
        }
        .message-image {
          max-width: 200px;
          max-height: 200px;
          border-radius: 8px;
          cursor: pointer;
          transition: transform 0.2s;
        }
        .message-image:hover {
          transform: scale(1.05);
        }
        .message-file {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: inherit;
          text-decoration: none;
          padding: 8px 12px;
          background: rgba(255,255,255,0.1);
          border-radius: 8px;
        }
        .message-file:hover {
          background: rgba(255,255,255,0.2);
        }
      `;
      document.head.appendChild(style);
    }

    // Show image in modal
    const modalImg = document.getElementById('modalImage');
    modalImg.src = url;
    modal.style.display = 'flex';
  }
}

/**
 * Toast Notifications
 */
const Toast = {
  show(message, type = 'info', duration = 4000) {
    // Check if Toast system exists in the page
    if (typeof window.Toast !== 'undefined' && window.Toast.show && window.Toast !== this) {
      window.Toast.show(message, type);
      return;
    }
    
    // Fallback notification
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Create toast element
    let toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toastContainer';
      toastContainer.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;';
      document.body.appendChild(toastContainer);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Add icon based on type
    let icon = '';
    switch(type) {
      case 'success': icon = '✓ '; break;
      case 'error': icon = '✕ '; break;
      case 'warning': icon = '⚠ '; break;
      default: icon = '💬 ';
    }
    
    toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-message">${message}</span>`;
    
    toastContainer.appendChild(toast);
    
    // Auto remove
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
};

// Make Toast available globally
window.Toast = Toast;

// Make chat methods available globally for inline onclick handlers
window.chat = null;

// Initialize chat when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.chat = new Chat();
});
