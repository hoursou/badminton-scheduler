class BadmintonScheduler {
    constructor() {
        this.players = this.loadPlayers();
        this.pairs = this.loadPairs();
        this.sessions = this.loadSessions();
        this.currentView = 'players';
        this.mobileView = 'players';
        this.draggedItem = null;
        this.touchItem = null;
        
        // Simple sync settings
        this.syncMethod = localStorage.getItem('sync_method') || 'local';
        this.lastSyncTime = localStorage.getItem('last_sync_time') || null;
        
        this.initializeElements();
        this.bindEvents();
        this.render();
        this.initializeMobileView();
        
        // No auto-sync - use manual sync options
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
    
    // Simple sync methods
    exportData() {
        const data = {
            players: this.players,
            pairs: this.pairs,
            sessions: this.sessions,
            exportedAt: new Date().toISOString(),
            version: '1.0'
        };
        
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `badminton-scheduler-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showNotification('Data exported successfully', 'success');
    }
    
    importData(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                
                if (data.version && data.players && data.pairs && data.sessions) {
                    this.players = data.players;
                    this.pairs = data.pairs;
                    this.sessions = data.sessions;
                    
                    this.saveToLocalStorage();
                    this.render();
                    
                    this.showNotification('Data imported successfully', 'success');
                } else {
                    this.showNotification('Invalid data format', 'error');
                }
            } catch (error) {
                this.showNotification('Failed to import data', 'error');
            }
        };
        reader.readAsText(file);
    }
    
    shareViaURL() {
        const data = {
            players: this.players,
            pairs: this.pairs,
            sessions: this.sessions,
            sharedAt: new Date().toISOString()
        };
        
        const compressed = btoa(JSON.stringify(data));
        const url = `${window.location.origin}${window.location.pathname}?data=${compressed}`;
        
        // Copy to clipboard
        navigator.clipboard.writeText(url).then(() => {
            this.showNotification('Share link copied to clipboard', 'success');
        }).catch(() => {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = url;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            this.showNotification('Share link copied to clipboard', 'success');
        });
    }
    
    loadFromURL() {
        const params = new URLSearchParams(window.location.search);
        const data = params.get('data');
        
        if (data) {
            try {
                const decompressed = JSON.parse(atob(data));
                
                if (decompressed.players && decompressed.pairs && decompressed.sessions) {
                    this.players = decompressed.players;
                    this.pairs = decompressed.pairs;
                    this.sessions = decompressed.sessions;
                    
                    this.saveToLocalStorage();
                    this.render();
                    
                    this.showNotification('Data loaded from shared link', 'success');
                    
                    // Clean URL
                    window.history.replaceState({}, document.title, window.location.pathname);
                }
            } catch (error) {
                console.error('Failed to load data from URL:', error);
            }
        }
    }
    
    // GitHub API Methods (legacy)
    async syncToGitHub() {
        if (!this.syncEnabled || this.syncMethod !== 'github') {
            return;
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
            }
        } catch (error) {
            console.error('Auto-sync error:', error);
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
    }
    
    // No auto-sync - use manual methods
    
    disableSync() {
        this.stopAutoSync();
        this.syncEnabled = false;
        this.syncMethod = 'local';
        this.githubToken = '';
        this.jsonBinId = null;
        localStorage.removeItem('github_token');
        localStorage.removeItem('jsonbin_id');
        localStorage.removeItem('jsonbin_api_key');
        localStorage.removeItem('sync_method');
        localStorage.removeItem('last_sync_time');
        localStorage.removeItem('last_remote_update');
        this.showNotification('Sync disabled', 'info');
        this.updateSyncStatus();
    }
    
    updateSyncStatus() {
        const statusElement = document.getElementById('syncStatus');
        if (statusElement) {
            statusElement.innerHTML = '<i class="fas fa-save text-gray-400"></i> Local storage';
            statusElement.className = 'text-xs text-gray-400';
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
    }
    
    savePairs() {
        this.saveToLocalStorage();
    }
    
    saveSessions() {
        this.saveToLocalStorage();
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
        // Find player name for confirmation
        const player = this.players.find(p => p.id === playerId);
        const playerName = player ? player.name : 'this player';
        
        if (!confirm(`Are you sure you want to remove ${playerName}?`)) return;
        
        console.log('Removing player:', playerId, playerName);
        
        this.players = this.players.filter(p => p.id !== playerId);
        
        // Remove from pairs
        const originalPairsCount = this.pairs.length;
        this.pairs = this.pairs.filter(pair => 
            pair.player1Id !== playerId && pair.player2Id !== playerId
        );
        
        const removedPairsCount = originalPairsCount - this.pairs.length;
        
        this.savePlayers();
        this.savePairs();
        this.render();
        
        let message = `Player ${playerName} removed successfully`;
        if (removedPairsCount > 0) {
            message += ` (${removedPairsCount} pair${removedPairsCount > 1 ? 's' : ''} also removed)`;
        }
        
        this.showNotification(message, 'success');
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
    
    // Mobile-only view management
    initializeMobileView() {
        // Always start with players view
        this.showMobileView('players');
        this.addMobileOptimizations();
        
        // Add mobile-specific event listeners
        this.addMobileEventListeners();
    }
    
    addMobileOptimizations() {
        // Add mobile-specific CSS classes
        document.body.classList.add('mobile-optimized');
        
        // Optimize touch targets
        document.querySelectorAll('.player-card, .pair-card').forEach(card => {
            card.style.minHeight = '44px'; // iOS touch target minimum
        });
        
        // Add swipe gestures for navigation
        this.addSwipeGestures();
    }
    
    addMobileEventListeners() {
        // Add orientation change handling
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                this.render();
                this.showMobileView(this.mobileView);
            }, 100);
        });
        
        // Add pull-to-refresh functionality
        this.addPullToRefresh();
    }
    
    addSwipeGestures() {
        let touchStartX = 0;
        let touchEndX = 0;
        
        document.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        });
        
        document.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            this.handleSwipeGesture(touchStartX, touchEndX);
        });
    }
    
    handleSwipeGesture(startX, endX) {
        const swipeThreshold = 50;
        const diff = startX - endX;
        
        if (Math.abs(diff) > swipeThreshold) {
            if (diff > 0 && this.mobileView === 'players') {
                // Swipe left - switch to sessions
                this.showMobileView('sessions');
            } else if (diff < 0 && this.mobileView === 'sessions') {
                // Swipe right - switch to players
                this.showMobileView('players');
            }
        }
    }
    
    addPullToRefresh() {
        let pullStartY = 0;
        let pullDistance = 0;
        let isPulling = false;
        
        document.addEventListener('touchstart', (e) => {
            if (window.scrollY === 0) {
                pullStartY = e.touches[0].clientY;
                isPulling = true;
            }
        });
        
        document.addEventListener('touchmove', (e) => {
            if (isPulling) {
                pullDistance = e.touches[0].clientY - pullStartY;
                if (pullDistance > 0 && pullDistance < 150) {
                    document.body.style.transform = `translateY(${pullDistance * 0.5}px)`;
                }
            }
        });
        
        document.addEventListener('touchend', () => {
            if (isPulling && pullDistance > 80) {
                this.syncFromCloud(); // Refresh data
                this.showNotification('Refreshing data...', 'info');
            }
            document.body.style.transform = '';
            isPulling = false;
            pullDistance = 0;
        });
    }
    
    showMobileView(view) {
        this.mobileView = view;
        
        const mobilePlayersBtn = document.getElementById('mobilePlayersBtn');
        const mobileSessionsBtn = document.getElementById('mobileSessionsBtn');
        
        // Add transition effect
        const panels = [this.elements.playersPanel, this.elements.sessionsPanel];
        panels.forEach(panel => {
            panel.style.transition = 'all 0.3s ease-in-out';
        });
        
        if (view === 'players') {
            this.elements.playersPanel.style.display = 'block';
            this.elements.sessionsPanel.style.display = 'none';
            if (mobilePlayersBtn) mobilePlayersBtn.className = 'flex-1 bg-white/20 text-white px-3 py-2 rounded-lg text-sm';
            if (mobileSessionsBtn) mobileSessionsBtn.className = 'flex-1 bg-white/10 text-white px-3 py-2 rounded-lg text-sm';
            
            // Add haptic feedback
            if (navigator.vibrate) navigator.vibrate(30);
        } else {
            this.elements.playersPanel.style.display = 'none';
            this.elements.sessionsPanel.style.display = 'block';
            if (mobilePlayersBtn) mobilePlayersBtn.className = 'flex-1 bg-white/10 text-white px-3 py-2 rounded-lg text-sm';
            if (mobileSessionsBtn) mobileSessionsBtn.className = 'flex-1 bg-white/20 text-white px-3 py-2 rounded-lg text-sm';
            
            // Add haptic feedback
            if (navigator.vibrate) navigator.vibrate(30);
        }
    }
    
    // Add pair to session via dropdown
    addPairToSession(sessionId, courtId, matchIndex) {
        const selectElement = document.getElementById(`pair-select-${sessionId}-${courtId}`);
        const selectedPairId = selectElement.value;
        
        if (!selectedPairId) {
            this.showNotification('Please select a pair', 'error');
            return;
        }
        
        const selectedPair = this.pairs.find(p => p.id === selectedPairId);
        if (!selectedPair) {
            this.showNotification('Pair not found', 'error');
            return;
        }
        
        const session = this.sessions.find(s => s.id === sessionId);
        const court = session.courtsData.find(c => c.id === courtId);
        
        // Add the pair to the match
        if (!court.matches[matchIndex]) {
            court.matches[matchIndex] = { pairs: [], players: [] };
        }
        
        court.matches[matchIndex].pairs.push(selectedPair);
        
        // Save and re-render
        this.saveSessions();
        this.render();
        
        // Reset dropdown
        selectElement.value = '';
        
        this.showNotification(`Added ${selectedPair.name} to ${court.name}`, 'success');
    }
    
    // Enhanced touch event handlers for mobile drag and drop
    handleTouchStart(e, type) {
        const touch = e.touches[0];
        const target = e.target.closest('.player-card, .pair-card');
        
        if (target) {
            e.preventDefault();
            this.touchItem = { type, id: target.getAttribute('data-id') };
            target.classList.add('dragging');
            
            // Add haptic feedback if available
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
            
            // Create a ghost image for visual feedback
            const ghost = target.cloneNode(true);
            ghost.style.position = 'fixed';
            ghost.style.pointerEvents = 'none';
            ghost.style.opacity = '0.9';
            ghost.style.zIndex = '1000';
            ghost.style.transform = 'scale(1.1)';
            ghost.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.3)';
            ghost.style.borderRadius = '12px';
            ghost.id = 'touch-ghost';
            document.body.appendChild(ghost);
            
            this.updateGhostPosition(touch.clientX, touch.clientY);
            
            // Store touch start position for better gesture detection
            this.touchStartX = touch.clientX;
            this.touchStartY = touch.clientY;
            this.touchStartTime = Date.now();
        }
    }
    
    handleTouchMove(e) {
        if (!this.touchItem) return;
        
        e.preventDefault();
        const touch = e.touches[0];
        this.updateGhostPosition(touch.clientX, touch.clientY);
        
        // Highlight drop zones with better visual feedback
        const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
        const dropZone = elementBelow?.closest('.session-slot');
        
        document.querySelectorAll('.session-slot').forEach(slot => {
            slot.classList.remove('drag-over');
        });
        
        if (dropZone) {
            dropZone.classList.add('drag-over');
            // Add haptic feedback when over valid drop zone
            if (navigator.vibrate && !this.lastVibrateTime || Date.now() - this.lastVibrateTime > 200) {
                navigator.vibrate(30);
                this.lastVibrateTime = Date.now();
            }
        }
    }
    
    handleTouchEnd(e) {
        if (!this.touchItem) return;
        
        const touch = e.changedTouches[0];
        const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
        const dropZone = elementBelow?.closest('.session-slot');
        
        // Calculate touch duration and distance for gesture detection
        const touchDuration = Date.now() - this.touchStartTime;
        const touchDistance = Math.sqrt(
            Math.pow(touch.clientX - this.touchStartX, 2) + 
            Math.pow(touch.clientY - this.touchStartY, 2)
        );
        
        // Remove ghost image with animation
        const ghost = document.getElementById('touch-ghost');
        if (ghost) {
            ghost.style.transition = 'all 0.2s ease-out';
            ghost.style.opacity = '0';
            ghost.style.transform = 'scale(0.8)';
            setTimeout(() => ghost.remove(), 200);
        }
        
        // Remove dragging class
        document.querySelectorAll('.player-card, .pair-card').forEach(card => {
            card.classList.remove('dragging');
        });
        
        // Handle drop with haptic feedback
        if (dropZone && touchDistance > 10) { // Minimum distance to consider it a drag
            this.handleTouchDrop({ target: dropZone });
            if (navigator.vibrate) {
                navigator.vibrate([50, 50, 50]); // Success vibration pattern
            }
        }
        
        // Clear drop zone highlights
        document.querySelectorAll('.session-slot').forEach(slot => {
            slot.classList.remove('drag-over');
        });
        
        this.touchItem = null;
        this.touchStartX = null;
        this.touchStartY = null;
        this.touchStartTime = null;
        this.lastVibrateTime = null;
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
            // Add smooth transition and better positioning
            ghost.style.transition = 'none';
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
                    <div class="flex-1">
                        <div class="font-semibold text-gray-800">${player.name}</div>
                        <div class="text-sm text-gray-600">
                            <span class="inline-block px-2 py-1 bg-${this.getSkillColor(player.skill)}-100 text-${this.getSkillColor(player.skill)}-800 text-xs rounded-full">
                                ${player.skill}
                            </span>
                        </div>
                    </div>
                    <button onclick="scheduler.removePlayer('${player.id}')" class="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-sm min-w-[44px] h-[44px] flex items-center justify-center">
                        <i class="fas fa-trash"></i>
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
        const availablePairs = this.pairs.filter(pair => {
            // Check if pair is already in any match in this court
            return !court.matches.some(match => 
                match.pairs && match.pairs.some(p => p.id === pair.id)
            );
        });
        
        return `
            <div class="border border-gray-200 rounded-lg p-4">
                <h4 class="font-semibold text-gray-800 mb-3">${court.name}</h4>
                
                <!-- Add Pair Dropdown for Mobile -->
                ${availablePairs.length > 0 ? `
                    <div class="mb-3">
                        <select id="pair-select-${session.id}-${court.id}" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500">
                            <option value="">Select a pair to add...</option>
                            ${availablePairs.map(pair => `
                                <option value="${pair.id}">${pair.name} (${pair.player1Name} & ${pair.player2Name})</option>
                            `).join('')}
                        </select>
                        <button onclick="scheduler.addPairToSession('${session.id}', '${court.id}', '${court.matches.length}')" class="mt-2 w-full bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg text-sm">
                            <i class="fas fa-plus mr-1"></i>Add Pair
                        </button>
                    </div>
                ` : ''}
                
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
