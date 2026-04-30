class BadmintonScheduler {
    constructor() {
        this.players = this.loadPlayers();
        this.pairs = this.loadPairs();
        this.sessions = this.loadSessions();
        this.currentView = 'players';
        this.mobileView = 'players';
        this.draggedItem = null;
        this.touchItem = null;
        
        // GitHub API settings
        this.githubToken = localStorage.getItem('github_token') || '';
        this.githubRepo = 'hoursou/badminton-scheduler';
        this.dataFile = 'badminton-data.json';
        this.syncEnabled = !!this.githubToken;
        this.lastSyncTime = localStorage.getItem('last_sync_time') || null;
        this.lastRemoteUpdate = localStorage.getItem('last_remote_update') || null;
        this.syncInterval = null;
        this.syncPollingFrequency = 30000; // 30 seconds
        
        this.initializeElements();
        this.bindEvents();
        this.render();
        this.initializeMobileView();
        
        // Auto-sync if enabled
        if (this.syncEnabled) {
            this.startAutoSync();
        }
    }
    
    initializeElements() {
        this.elements = {
            playersList: document.getElementById('playersList'),
            pairsList: document.getElementById('pairsList'),
            sessionsContainer: document.getElementById('sessionsContainer'),
            emptyState: document.getElementById('emptyState'),
            playersViewBtn: document.getElementById('playersViewBtn'),
            pairsViewBtn: document.getElementById('pairsViewBtn'),
            addPlayerForm: document.getElementById('addPlayerForm'),
            createPairForm: document.getElementById('createPairForm'),
            createSessionForm: document.getElementById('createSessionForm'),
            playersPanel: document.getElementById('playersPanel'),
            sessionsPanel: document.getElementById('sessionsPanel')
        };
    }
    
    // GitHub API Methods
    async syncToGitHub() {
        if (!this.syncEnabled) {
            return; // Silent fail if sync not enabled
        }
        
        try {
            const data = {
                players: this.players,
                pairs: this.pairs,
                sessions: this.sessions,
                lastUpdated: new Date().toISOString()
            };
            
            const response = await fetch(`https://api.github.com/repos/${this.githubRepo}/contents/${this.dataFile}`, {
                method: 'GET',
                headers: {
                    'Authorization': `token ${this.githubToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            let sha = '';
            if (response.ok) {
                const fileData = await response.json();
                sha = fileData.sha;
            }
            
            const putResponse = await fetch(`https://api.github.com/repos/${this.githubRepo}/contents/${this.dataFile}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${this.githubToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify({
                    message: `Auto-sync update - ${new Date().toLocaleString()}`,
                    content: btoa(JSON.stringify(data, null, 2)),
                    sha: sha
                })
            });
            
            if (putResponse.ok) {
                this.lastSyncTime = new Date().toISOString();
                localStorage.setItem('last_sync_time', this.lastSyncTime);
                this.updateSyncStatus();
                console.log('Auto-sync to GitHub completed');
            } else {
                throw new Error('Failed to sync to GitHub');
            }
        } catch (error) {
            console.error('Auto-sync error:', error);
            // Silent fail - don't show notifications for auto-sync errors
        }
    }
    
    async syncFromGitHub() {
        if (!this.syncEnabled) return;
        
        try {
            const response = await fetch(`https://api.github.com/repos/${this.githubRepo}/contents/${this.dataFile}`, {
                headers: {
                    'Authorization': `token ${this.githubToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (response.ok) {
                const fileData = await response.json();
                const data = JSON.parse(atob(fileData.content));
                
                // Check if remote data is newer
                const localLastUpdated = localStorage.getItem('last_updated') || '1970-01-01T00:00:00.000Z';
                if (data.lastUpdated > localLastUpdated) {
                    this.players = data.players || [];
                    this.pairs = data.pairs || [];
                    this.sessions = data.sessions || [];
                    
                    // Update local storage
                    this.saveToLocalStorage();
                    localStorage.setItem('last_updated', data.lastUpdated);
                    
                    this.render();
                    this.showNotification('Data synced from GitHub', 'success');
                }
                
                this.lastSyncTime = new Date().toISOString();
                localStorage.setItem('last_sync_time', this.lastSyncTime);
                this.updateSyncStatus();
            }
        } catch (error) {
            console.error('GitHub sync from error:', error);
        }
    }
    
    saveToLocalStorage() {
        localStorage.setItem('badminton_players', JSON.stringify(this.players));
        localStorage.setItem('badminton_pairs', JSON.stringify(this.pairs));
        localStorage.setItem('badminton_sessions', JSON.stringify(this.sessions));
        localStorage.setItem('last_updated', new Date().toISOString());
    }
    
    enableGitHubSync(token) {
        console.log('enableGitHubSync method called with token:', token ? 'Yes' : 'No');
        try {
            this.githubToken = token;
            this.syncEnabled = true;
            localStorage.setItem('github_token', token);
            console.log('Token saved to localStorage');
            
            this.showNotification('Auto-sync enabled - Real-time updates active', 'success');
            console.log('Notification shown');
            
            // Close the modal and switch to manage view
            this.closeModal('githubSyncModal');
            const setupContent = document.getElementById('syncSetupContent');
            const manageContent = document.getElementById('syncManageContent');
            if (setupContent) setupContent.style.display = 'none';
            if (manageContent) manageContent.style.display = 'block';
            
            console.log('Starting auto-sync');
            this.startAutoSync();
            this.updateSyncStatus();
            console.log('enableGitHubSync completed');
        } catch (error) {
            console.error('Error in enableGitHubSync:', error);
            this.showNotification('Failed to enable GitHub sync', 'error');
        }
    }
    
    startAutoSync() {
        // Clear any existing interval
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
        
        // Initial sync
        this.syncFromGitHub();
        
        // Start polling for changes
        this.syncInterval = setInterval(() => {
            this.checkForRemoteChanges();
        }, this.syncPollingFrequency);
        
        console.log('Auto-sync started, polling every', this.syncPollingFrequency / 1000, 'seconds');
    }
    
    stopAutoSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('Auto-sync stopped');
        }
    }
    
    async checkForRemoteChanges() {
        if (!this.syncEnabled) return;
        
        try {
            const response = await fetch(`https://api.github.com/repos/${this.githubRepo}/contents/${this.dataFile}`, {
                headers: {
                    'Authorization': `token ${this.githubToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'If-Modified-Since': this.lastRemoteUpdate || ''
                }
            });
            
            if (response.status === 304) {
                // No changes
                return;
            }
            
            if (response.ok) {
                const fileData = await response.json();
                const data = JSON.parse(atob(fileData.content));
                
                // Check if remote data is newer
                const localLastUpdated = localStorage.getItem('last_updated') || '1970-01-01T00:00:00.000Z';
                if (data.lastUpdated > localLastUpdated) {
                    console.log('Remote changes detected, syncing...');
                    this.players = data.players || [];
                    this.pairs = data.pairs || [];
                    this.sessions = data.sessions || [];
                    
                    // Update local storage
                    this.saveToLocalStorage();
                    localStorage.setItem('last_remote_update', fileData.last_modified);
                    localStorage.setItem('last_updated', data.lastUpdated);
                    
                    this.render();
                    this.showNotification('🔄 Auto-synced: Changes from other device', 'info');
                }
                
                this.lastSyncTime = new Date().toISOString();
                localStorage.setItem('last_sync_time', this.lastSyncTime);
                this.updateSyncStatus();
            }
        } catch (error) {
            console.log('Check for changes failed, continuing...');
        }
    }
    
    disableGitHubSync() {
        this.stopAutoSync();
        this.syncEnabled = false;
        this.githubToken = '';
        localStorage.removeItem('github_token');
        localStorage.removeItem('last_sync_time');
        localStorage.removeItem('last_remote_update');
        this.showNotification('Auto-sync disabled', 'info');
        this.updateSyncStatus();
    }
    
    updateSyncStatus() {
        const statusElement = document.getElementById('syncStatus');
        if (statusElement) {
            if (this.syncEnabled && this.lastSyncTime) {
                const syncDate = new Date(this.lastSyncTime);
                statusElement.innerHTML = `<i class="fas fa-sync-alt text-green-400"></i> Last sync: ${syncDate.toLocaleString()}`;
                statusElement.className = 'text-xs text-gray-300';
            } else if (this.syncEnabled) {
                statusElement.innerHTML = '<i class="fas fa-sync-alt text-yellow-400"></i> Sync enabled';
                statusElement.className = 'text-xs text-gray-300';
            } else {
                statusElement.innerHTML = '<i class="fas fa-sync text-gray-400"></i> Local only';
                statusElement.className = 'text-xs text-gray-400';
            }
        }
    }
    
    bindEvents() {
        // Form submissions
        this.elements.addPlayerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.addPlayer();
        });
        
        this.elements.createPairForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.createPair();
        });
        
        this.elements.createSessionForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.createSession();
        });
        
        // Close modals when clicking outside
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal(modal.id);
                }
            });
        });
    }
    
    // Data persistence
    loadPlayers() {
        const stored = localStorage.getItem('badminton_players');
        return stored ? JSON.parse(stored) : [];
    }
    
    loadPairs() {
        const stored = localStorage.getItem('badminton_pairs');
        return stored ? JSON.parse(stored) : [];
    }
    
    loadSessions() {
        const stored = localStorage.getItem('badminton_sessions');
        return stored ? JSON.parse(stored) : [];
    }
    
    savePlayers() {
        this.saveToLocalStorage();
        if (this.syncEnabled) {
            this.syncToGitHub();
        }
    }
    
    savePairs() {
        this.saveToLocalStorage();
        if (this.syncEnabled) {
            this.syncToGitHub();
        }
    }
    
    saveSessions() {
        this.saveToLocalStorage();
        if (this.syncEnabled) {
            this.syncToGitHub();
        }
    }
    
    // Player management
    addPlayer() {
        const name = document.getElementById('playerName').value.trim();
        const phone = document.getElementById('playerPhone').value.trim();
        const skill = document.getElementById('playerSkill').value;
        
        if (!name) {
            this.showNotification('Please enter player name', 'error');
            return;
        }
        
        // Check if player already exists
        if (this.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
            this.showNotification('Player already exists', 'error');
            return;
        }
        
        const player = {
            id: 'player-' + Date.now(),
            name: name,
            phone: phone,
            skill: skill,
            addedAt: new Date().toISOString()
        };
        
        this.players.push(player);
        this.savePlayers();
        this.render();
        this.closeModal('addPlayerModal');
        this.elements.addPlayerForm.reset();
        
        this.showNotification(`Player ${name} added successfully`, 'success');
    }
    
    removePlayer(playerId) {
        if (!confirm('Are you sure you want to remove this player?')) return;
        
        this.players = this.players.filter(p => p.id !== playerId);
        // Remove from pairs
        this.pairs = this.pairs.filter(pair => 
            pair.player1Id !== playerId && pair.player2Id !== playerId
        );
        
        this.savePlayers();
        this.savePairs();
        this.render();
        
        this.showNotification('Player removed successfully', 'success');
    }
    
    // Pair management
    createPair() {
        const name = document.getElementById('pairName').value.trim();
        const player1Id = document.getElementById('pairPlayer1').value;
        const player2Id = document.getElementById('pairPlayer2').value;
        
        if (!player1Id || !player2Id) {
            this.showNotification('Please select both players', 'error');
            return;
        }
        
        if (player1Id === player2Id) {
            this.showNotification('Please select different players', 'error');
            return;
        }
        
        // Check if pair already exists
        if (this.pairs.some(pair => 
            (pair.player1Id === player1Id && pair.player2Id === player2Id) ||
            (pair.player1Id === player2Id && pair.player2Id === player1Id)
        )) {
            this.showNotification('This pair already exists', 'error');
            return;
        }
        
        const player1 = this.players.find(p => p.id === player1Id);
        const player2 = this.players.find(p => p.id === player2Id);
        
        const pair = {
            id: 'pair-' + Date.now(),
            name: name || `${player1.name} & ${player2.name}`,
            player1Id: player1Id,
            player2Id: player2Id,
            player1Name: player1.name,
            player2Name: player2.name,
            createdAt: new Date().toISOString()
        };
        
        this.pairs.push(pair);
        this.savePairs();
        this.render();
        this.closeModal('createPairModal');
        this.elements.createPairForm.reset();
        
        this.showNotification(`Pair created successfully`, 'success');
    }
    
    removePair(pairId) {
        if (!confirm('Are you sure you want to remove this pair?')) return;
        
        this.pairs = this.pairs.filter(p => p.id !== pairId);
        this.savePairs();
        this.render();
        
        this.showNotification('Pair removed successfully', 'success');
    }
    
    // Session management
    createSession() {
        const name = document.getElementById('sessionName').value.trim();
        const date = document.getElementById('sessionDate').value;
        const time = document.getElementById('sessionTime').value;
        const courts = parseInt(document.getElementById('sessionCourts').value);
        const duration = parseInt(document.getElementById('matchDuration').value);
        
        if (!name || !date || !time) {
            this.showNotification('Please fill all required fields', 'error');
            return;
        }
        
        const session = {
            id: 'session-' + Date.now(),
            name: name,
            date: date,
            time: time,
            courts: courts,
            matchDuration: duration,
            courtsData: Array.from({ length: courts }, (_, i) => ({
                id: `court-${i + 1}`,
                name: `Court ${i + 1}`,
                matches: []
            })),
            createdAt: new Date().toISOString()
        };
        
        this.sessions.push(session);
        this.saveSessions();
        this.render();
        this.closeModal('createSessionModal');
        this.elements.createSessionForm.reset();
        
        this.showNotification(`Session ${name} created successfully`, 'success');
    }
    
    removeSession(sessionId) {
        if (!confirm('Are you sure you want to remove this session?')) return;
        
        this.sessions = this.sessions.filter(s => s.id !== sessionId);
        this.saveSessions();
        this.render();
        
        this.showNotification('Session removed successfully', 'success');
    }
    
    clearAllSessions() {
        if (!confirm('Are you sure you want to clear all sessions? This will remove all scheduled matches.')) return;
        
        this.sessions = [];
        this.saveSessions();
        this.render();
        
        this.showNotification('All sessions cleared', 'success');
    }
    
    // Drag and drop functionality
    setupDragAndDrop() {
        // Setup drag for players
        document.querySelectorAll('.player-card').forEach(card => {
            card.addEventListener('dragstart', (e) => this.handleDragStart(e, 'player'));
            card.addEventListener('dragend', (e) => this.handleDragEnd(e));
            // Touch events for mobile
            card.addEventListener('touchstart', (e) => this.handleTouchStart(e, 'player'), { passive: false });
            card.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
            card.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
        });
        
        // Setup drag for pairs
        document.querySelectorAll('.pair-card').forEach(card => {
            card.addEventListener('dragstart', (e) => this.handleDragStart(e, 'pair'));
            card.addEventListener('dragend', (e) => this.handleDragEnd(e));
            // Touch events for mobile
            card.addEventListener('touchstart', (e) => this.handleTouchStart(e, 'pair'), { passive: false });
            card.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
            card.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
        });
        
        // Setup drop zones for session slots
        document.querySelectorAll('.session-slot').forEach(slot => {
            slot.addEventListener('dragover', (e) => this.handleDragOver(e));
            slot.addEventListener('drop', (e) => this.handleDrop(e));
            slot.addEventListener('dragleave', (e) => this.handleDragLeave(e));
            // Touch events for mobile
            slot.addEventListener('touchmove', (e) => this.handleTouchOver(e), { passive: false });
            slot.addEventListener('touchend', (e) => this.handleTouchDrop(e), { passive: false });
        });
    }
    
    handleDragStart(e, type) {
        const id = e.target.getAttribute('data-id');
        this.draggedItem = { type, id };
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    }
    
    handleDragEnd(e) {
        e.target.classList.remove('dragging');
        document.querySelectorAll('.session-slot').forEach(slot => {
            slot.classList.remove('drag-over');
        });
    }
    
    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        e.currentTarget.classList.add('drag-over');
    }
    
    handleDragLeave(e) {
        e.currentTarget.classList.remove('drag-over');
    }
    
    handleDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        
        const slotData = JSON.parse(e.currentTarget.getAttribute('data-slot'));
        
        if (!this.draggedItem) return;
        
        const { sessionId, courtId, matchIndex } = slotData;
        const session = this.sessions.find(s => s.id === sessionId);
        const court = session.courtsData.find(c => c.id === courtId);
        
        if (this.draggedItem.type === 'player') {
            const player = this.players.find(p => p.id === this.draggedItem.id);
            if (!court.matches[matchIndex]) {
                court.matches[matchIndex] = { players: [], type: 'singles' };
            }
            
            // Add player to match (max 2 for singles, 4 for doubles)
            if (court.matches[matchIndex].players.length < 2) {
                court.matches[matchIndex].players.push(player);
                this.showNotification(`${player.name} added to match`, 'success');
            } else {
                this.showNotification('Match is full (2 players for singles)', 'error');
            }
        } else if (this.draggedItem.type === 'pair') {
            const pair = this.pairs.find(p => p.id === this.draggedItem.id);
            if (!court.matches[matchIndex]) {
                court.matches[matchIndex] = { pairs: [], type: 'doubles' };
            }
            
            // Add pair to match (max 2 pairs for doubles)
            if (court.matches[matchIndex].pairs.length < 2) {
                court.matches[matchIndex].pairs.push(pair);
                this.showNotification(`${pair.name} added to match`, 'success');
            } else {
                this.showNotification('Match is full (2 pairs for doubles)', 'error');
            }
        }
        
        this.saveSessions();
        this.render();
        this.draggedItem = null;
    }
    
    removeFromMatch(sessionId, courtId, matchIndex, itemType, itemId) {
        const session = this.sessions.find(s => s.id === sessionId);
        const court = session.courtsData.find(c => c.id === courtId);
        const match = court.matches[matchIndex];
        
        if (itemType === 'player') {
            match.players = match.players.filter(p => p.id !== itemId);
            if (match.players.length === 0) {
                court.matches.splice(matchIndex, 1);
            }
        } else if (itemType === 'pair') {
            match.pairs = match.pairs.filter(p => p.id !== itemId);
            if (match.pairs.length === 0) {
                court.matches.splice(matchIndex, 1);
            }
        }
        
        this.saveSessions();
        this.render();
        this.showNotification('Removed from match', 'success');
    }
    
    // View management
    showView(view) {
        this.currentView = view;
        
        if (view === 'players') {
            this.elements.playersList.style.display = 'block';
            this.elements.pairsList.style.display = 'none';
            this.elements.playersViewBtn.className = 'flex-1 bg-white/20 text-white px-3 py-2 rounded-lg text-sm';
            this.elements.pairsViewBtn.className = 'flex-1 bg-white/10 text-white px-3 py-2 rounded-lg text-sm';
        } else {
            this.elements.playersList.style.display = 'none';
            this.elements.pairsList.style.display = 'block';
            this.elements.playersViewBtn.className = 'flex-1 bg-white/10 text-white px-3 py-2 rounded-lg text-sm';
            this.elements.pairsViewBtn.className = 'flex-1 bg-white/20 text-white px-3 py-2 rounded-lg text-sm';
        }
    }
    
    // Mobile view management
    initializeMobileView() {
        // Check if mobile and set initial view
        if (window.innerWidth < 1024) {
            this.showMobileView('players');
        }
        
        // Listen for resize events
        window.addEventListener('resize', () => {
            if (window.innerWidth >= 1024) {
                // Desktop view - show both panels
                this.elements.playersPanel.style.display = 'block';
                this.elements.sessionsPanel.style.display = 'block';
            } else {
                // Mobile view - show current mobile view
                this.showMobileView(this.mobileView);
            }
        });
    }
    
    showMobileView(view) {
        this.mobileView = view;
        
        const mobilePlayersBtn = document.getElementById('mobilePlayersBtn');
        const mobileSessionsBtn = document.getElementById('mobileSessionsBtn');
        
        if (view === 'players') {
            this.elements.playersPanel.style.display = 'block';
            this.elements.sessionsPanel.style.display = 'none';
            if (mobilePlayersBtn) mobilePlayersBtn.className = 'flex-1 bg-white/20 text-white px-3 py-2 rounded-lg text-sm';
            if (mobileSessionsBtn) mobileSessionsBtn.className = 'flex-1 bg-white/10 text-white px-3 py-2 rounded-lg text-sm';
        } else {
            this.elements.playersPanel.style.display = 'none';
            this.elements.sessionsPanel.style.display = 'block';
            if (mobilePlayersBtn) mobilePlayersBtn.className = 'flex-1 bg-white/10 text-white px-3 py-2 rounded-lg text-sm';
            if (mobileSessionsBtn) mobileSessionsBtn.className = 'flex-1 bg-white/20 text-white px-3 py-2 rounded-lg text-sm';
        }
    }
    
    // Touch event handlers for mobile drag and drop
    handleTouchStart(e, type) {
        const touch = e.touches[0];
        const target = e.target.closest('.player-card, .pair-card');
        
        if (target) {
            this.touchItem = { type, id: target.getAttribute('data-id') };
            target.classList.add('dragging');
            
            // Create a ghost image for visual feedback
            const ghost = target.cloneNode(true);
            ghost.style.position = 'fixed';
            ghost.style.pointerEvents = 'none';
            ghost.style.opacity = '0.8';
            ghost.style.zIndex = '1000';
            ghost.id = 'touch-ghost';
            document.body.appendChild(ghost);
            
            this.updateGhostPosition(touch.clientX, touch.clientY);
        }
    }
    
    handleTouchMove(e) {
        if (!this.touchItem) return;
        
        e.preventDefault();
        const touch = e.touches[0];
        this.updateGhostPosition(touch.clientX, touch.clientY);
        
        // Highlight drop zones
        const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
        const dropZone = elementBelow?.closest('.session-slot');
        
        document.querySelectorAll('.session-slot').forEach(slot => {
            slot.classList.remove('drag-over');
        });
        
        if (dropZone) {
            dropZone.classList.add('drag-over');
        }
    }
    
    handleTouchEnd(e) {
        if (!this.touchItem) return;
        
        const touch = e.changedTouches[0];
        const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
        const dropZone = elementBelow?.closest('.session-slot');
        
        // Remove ghost image
        const ghost = document.getElementById('touch-ghost');
        if (ghost) ghost.remove();
        
        // Remove dragging class
        document.querySelectorAll('.player-card, .pair-card').forEach(card => {
            card.classList.remove('dragging');
        });
        
        // Handle drop
        if (dropZone) {
            this.handleTouchDrop({ target: dropZone });
        }
        
        // Clear drop zone highlights
        document.querySelectorAll('.session-slot').forEach(slot => {
            slot.classList.remove('drag-over');
        });
        
        this.touchItem = null;
    }
    
    handleTouchOver(e) {
        if (!this.touchItem) return;
        e.preventDefault();
        e.currentTarget.classList.add('drag-over');
    }
    
    handleTouchDrop(e) {
        if (!this.touchItem) return;
        
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        
        const slotData = JSON.parse(e.currentTarget.getAttribute('data-slot'));
        const { sessionId, courtId, matchIndex } = slotData;
        const session = this.sessions.find(s => s.id === sessionId);
        const court = session.courtsData.find(c => c.id === courtId);
        
        if (this.touchItem.type === 'player') {
            const player = this.players.find(p => p.id === this.touchItem.id);
            if (!court.matches[matchIndex]) {
                court.matches[matchIndex] = { players: [], type: 'singles' };
            }
            
            if (court.matches[matchIndex].players.length < 2) {
                court.matches[matchIndex].players.push(player);
                this.showNotification(`${player.name} added to match`, 'success');
            } else {
                this.showNotification('Match is full (2 players for singles)', 'error');
            }
        } else if (this.touchItem.type === 'pair') {
            const pair = this.pairs.find(p => p.id === this.touchItem.id);
            if (!court.matches[matchIndex]) {
                court.matches[matchIndex] = { pairs: [], type: 'doubles' };
            }
            
            if (court.matches[matchIndex].pairs.length < 2) {
                court.matches[matchIndex].pairs.push(pair);
                this.showNotification(`${pair.name} added to match`, 'success');
            } else {
                this.showNotification('Match is full (2 pairs for doubles)', 'error');
            }
        }
        
        this.saveSessions();
        this.render();
        this.touchItem = null;
    }
    
    updateGhostPosition(x, y) {
        const ghost = document.getElementById('touch-ghost');
        if (ghost) {
            ghost.style.left = (x - ghost.offsetWidth / 2) + 'px';
            ghost.style.top = (y - ghost.offsetHeight / 2) + 'px';
        }
    }
    
    // Rendering
    render() {
        this.renderPlayers();
        this.renderPairs();
        this.renderSessions();
        this.updatePairSelectOptions();
    }
    
    renderPlayers() {
        if (this.players.length === 0) {
            this.elements.playersList.innerHTML = '<p class="text-gray-300 text-center py-4">No players added yet</p>';
            return;
        }
        
        this.elements.playersList.innerHTML = this.players.map(player => `
            <div class="player-card" draggable="true" data-id="${player.id}">
                <div class="flex justify-between items-center">
                    <div>
                        <div class="font-semibold text-gray-800">${player.name}</div>
                        <div class="text-sm text-gray-600">
                            <span class="inline-block px-2 py-1 bg-${this.getSkillColor(player.skill)}-100 text-${this.getSkillColor(player.skill)}-800 text-xs rounded-full">
                                ${player.skill}
                            </span>
                        </div>
                    </div>
                    <button onclick="scheduler.removePlayer('${player.id}')" class="text-red-500 hover:text-red-700">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }
    
    renderPairs() {
        if (this.pairs.length === 0) {
            this.elements.pairsList.innerHTML = '<p class="text-gray-300 text-center py-4">No pairs created yet</p>';
            return;
        }
        
        this.elements.pairsList.innerHTML = this.pairs.map(pair => `
            <div class="pair-card" draggable="true" data-id="${pair.id}">
                <div class="flex justify-between items-center">
                    <div>
                        <div class="font-semibold">${pair.name}</div>
                        <div class="text-sm opacity-90">${pair.player1Name} & ${pair.player2Name}</div>
                    </div>
                    <button onclick="scheduler.removePair('${pair.id}')" class="text-white hover:text-red-200">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }
    
    renderSessions() {
        if (this.sessions.length === 0) {
            this.elements.sessionsContainer.style.display = 'none';
            this.elements.emptyState.style.display = 'block';
            return;
        }
        
        this.elements.sessionsContainer.style.display = 'block';
        this.elements.emptyState.style.display = 'none';
        
        // Sort sessions by date and time
        const sortedSessions = [...this.sessions].sort((a, b) => {
            const dateA = new Date(`${a.date} ${a.time}`);
            const dateB = new Date(`${b.date} ${b.time}`);
            return dateA - dateB;
        });
        
        this.elements.sessionsContainer.innerHTML = sortedSessions.map(session => `
            <div class="court-card">
                <div class="flex justify-between items-center mb-4">
                    <div>
                        <h3 class="text-xl font-bold text-gray-800">${session.name}</h3>
                        <p class="text-gray-600">
                            <i class="fas fa-calendar mr-2"></i>${new Date(session.date).toLocaleDateString()} 
                            <i class="fas fa-clock ml-3 mr-2"></i>${session.time}
                        </p>
                    </div>
                    <button onclick="scheduler.removeSession('${session.id}')" class="text-red-500 hover:text-red-700">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    ${session.courtsData.map(court => this.renderCourt(session, court)).join('')}
                </div>
            </div>
        `).join('');
        
        // Setup drag and drop after rendering
        setTimeout(() => this.setupDragAndDrop(), 100);
    }
    
    renderCourt(session, court) {
        return `
            <div class="border border-gray-200 rounded-lg p-4">
                <h4 class="font-semibold text-gray-800 mb-3">${court.name}</h4>
                <div class="space-y-2">
                    ${court.matches.length === 0 ? `
                        <div class="session-slot" data-slot='${JSON.stringify({ sessionId: session.id, courtId: court.id, matchIndex: 0 })}'>
                            <div class="text-center text-gray-400 py-4">
                                <i class="fas fa-plus-circle text-2xl mb-2"></i>
                                <p class="text-sm">Drag players or pairs here</p>
                            </div>
                        </div>
                    ` : court.matches.map((match, index) => this.renderMatch(session, court, match, index)).join('')}
                    ${court.matches.length > 0 ? `
                        <div class="session-slot" data-slot='${JSON.stringify({ sessionId: session.id, courtId: court.id, matchIndex: court.matches.length })}'>
                            <div class="text-center text-gray-400 py-2">
                                <i class="fas fa-plus-circle"></i>
                                <p class="text-xs">Add match</p>
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    renderMatch(session, court, match, index) {
        const isComplete = match.players?.length === 2 || match.pairs?.length === 2;
        const slotClass = isComplete ? 'occupied' : '';
        
        return `
            <div class="session-slot ${slotClass}" data-slot='${JSON.stringify({ sessionId: session.id, courtId: court.id, matchIndex: index })}'>
                <div class="text-sm font-medium text-gray-700 mb-2">Match ${index + 1}</div>
                ${match.players ? `
                    <div class="space-y-1">
                        ${match.players.map(player => `
                            <div class="flex justify-between items-center bg-gray-50 rounded px-2 py-1">
                                <span class="text-sm">${player.name}</span>
                                <button onclick="scheduler.removeFromMatch('${session.id}', '${court.id}', ${index}, 'player', '${player.id}')" 
                                        class="text-red-500 hover:text-red-700 text-xs">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                ${match.pairs ? `
                    <div class="space-y-1">
                        ${match.pairs.map(pair => `
                            <div class="flex justify-between items-center bg-purple-50 rounded px-2 py-1">
                                <span class="text-sm font-medium">${pair.name}</span>
                                <button onclick="scheduler.removeFromMatch('${session.id}', '${court.id}', ${index}, 'pair', '${pair.id}')" 
                                        class="text-red-500 hover:text-red-700 text-xs">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                ${!isComplete ? `
                    <div class="text-center text-gray-400 text-xs mt-2">
                        ${match.type === 'singles' ? 
                            `${match.players?.length || 0}/2 players` : 
                            `${match.pairs?.length || 0}/2 pairs`
                        }
                    </div>
                ` : `
                    <div class="text-center text-green-600 text-xs mt-2">
                        <i class="fas fa-check-circle mr-1"></i>Ready to play
                    </div>
                `}
            </div>
        `;
    }
    
    updatePairSelectOptions() {
        const player1Select = document.getElementById('pairPlayer1');
        const player2Select = document.getElementById('pairPlayer2');
        
        if (!player1Select || !player2Select) return;
        
        const options = '<option value="">Select Player</option>' + 
            this.players.map(player => `<option value="${player.id}">${player.name}</option>`).join('');
        
        player1Select.innerHTML = options;
        player2Select.innerHTML = options;
    }
    
    // Utility methods
    getSkillColor(skill) {
        const colors = {
            beginner: 'green',
            intermediate: 'yellow',
            advanced: 'orange',
            expert: 'red'
        };
        return colors[skill] || 'gray';
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-${type === 'success' ? 'check-circle' : 
                                   type === 'error' ? 'exclamation-circle' : 
                                   type === 'warning' ? 'exclamation-triangle' : 'info-circle'} mr-2"></i>
                ${message}
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    // Modal methods
    openModal(modalId) {
        document.getElementById(modalId).classList.add('show');
    }
    
    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('show');
    }
}

// Global functions for HTML onclick handlers
function openAddPlayerModal() {
    scheduler.openModal('addPlayerModal');
}

function openCreatePairModal() {
    scheduler.openModal('createPairModal');
}

function openCreateSessionModal() {
    scheduler.openModal('createSessionModal');
}

function closeModal(modalId) {
    scheduler.closeModal(modalId);
}

function showView(view) {
    scheduler.showView(view);
}

function showMobileView(view) {
    scheduler.showMobileView(view);
}

function clearAllSessions() {
    scheduler.clearAllSessions();
}

// Initialize the scheduler
const scheduler = new BadmintonScheduler();
