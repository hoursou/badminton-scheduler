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
        
        // Check for shared view on load
        this.loadSharedView();
        
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
    
    // Drag and drop functionality removed - using dropdown method instead
    setupDragAndDrop() {
        // Setup delete button touch events for mobile
        this.setupDeleteButtonTouchEvents();
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
        console.log('Adding pair to session:', { sessionId, courtId, matchIndex });
        
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
        
        console.log('Found session and court:', { session, court });
        
        // Initialize matches array if it doesn't exist
        if (!court.matches) {
            court.matches = [];
        }
        
        // Find an available match slot or create a new one
        let targetMatch = null;
        let targetIndex = -1;
        
        // Look for a match with less than 2 pairs
        for (let i = 0; i < court.matches.length; i++) {
            if (court.matches[i] && court.matches[i].pairs && court.matches[i].pairs.length < 2) {
                targetMatch = court.matches[i];
                targetIndex = i;
                break;
            }
        }
        
        // If no available match found, create a new one
        if (!targetMatch) {
            targetIndex = court.matches.length;
            court.matches[targetIndex] = { pairs: [], players: [] };
            targetMatch = court.matches[targetIndex];
        }
        
        // Check if pair is already in this match
        const alreadyInMatch = targetMatch.pairs.some(p => p.id === selectedPair.id);
        if (alreadyInMatch) {
            this.showNotification('Pair already added to this match', 'error');
            return;
        }
        
        // Check for player conflicts within same match
        const conflict = this.checkPlayerConflict(selectedPair, targetMatch);
        if (conflict) {
            this.showNotification(`Conflict: Player ${conflict.player} cannot play on both sides of the match (${conflict.existingPair} vs ${conflict.newPair})`, 'error');
            return;
        }
        
        // Check for player availability conflicts across all courts in this session
        const availabilityConflict = this.checkPlayerAvailabilityConflict(session, selectedPair, courtId);
        if (availabilityConflict) {
            const confirmMessage = `Warning: Players ${availabilityConflict.players.join(', ')} are already scheduled in Court ${availabilityConflict.conflictingCourt} at the same time. This may cause availability issues.\n\nDo you want to continue?`;
            
            if (!confirm(confirmMessage)) {
                return;
            }
            
            this.showNotification(`Players double-booked across courts. Please verify availability.`, 'warning');
        }
        
        targetMatch.pairs.push(selectedPair);
        
        console.log('Updated court matches:', court.matches);
        
        // Save and re-render
        this.saveSessions();
        this.render();
        
        // Reset dropdown
        selectElement.value = '';
        
        const pairCount = targetMatch.pairs.length;
        this.showNotification(`Added ${selectedPair.name} to ${court.name} (${pairCount}/2 pairs)`, 'success');
    }
    
    checkPlayerConflict(newPair, existingMatch) {
        if (!existingMatch || !existingMatch.pairs || existingMatch.pairs.length === 0) {
            return null;
        }
        
        // Get players from the new pair
        const newPairPlayers = [newPair.player1Id, newPair.player2Id];
        
        // Check each existing pair in the match
        for (const existingPair of existingMatch.pairs) {
            const existingPairPlayers = [existingPair.player1Id, existingPair.player2Id];
            
            // Check for any overlapping players
            for (const playerId of newPairPlayers) {
                if (existingPairPlayers.includes(playerId)) {
                    // Found a conflict
                    const playerName = this.getPlayerName(playerId);
                    return {
                        player: playerName,
                        existingPair: existingPair.name,
                        newPair: newPair.name
                    };
                }
            }
        }
        
        return null;
    }
    
    checkPlayerAvailabilityConflict(session, newPair, currentCourtId) {
        const newPairPlayers = [newPair.player1Id, newPair.player2Id];
        const conflictingPlayers = [];
        let conflictingCourt = null;
        
        // Check all courts in the session except the current one
        for (const court of session.courtsData) {
            if (court.id === currentCourtId) continue;
            
            // Check all matches in this court
            for (const match of court.matches || []) {
                if (match.pairs) {
                    for (const pair of match.pairs) {
                        // Check if any player from new pair is already in this court
                        if (newPairPlayers.includes(pair.player1Id) || newPairPlayers.includes(pair.player2Id)) {
                            conflictingCourt = court.name;
                            
                            // Add conflicting player names
                            if (newPairPlayers.includes(pair.player1Id)) {
                                const playerName = this.getPlayerName(pair.player1Id);
                                if (!conflictingPlayers.includes(playerName)) {
                                    conflictingPlayers.push(playerName);
                                }
                            }
                            if (newPairPlayers.includes(pair.player2Id)) {
                                const playerName = this.getPlayerName(pair.player2Id);
                                if (!conflictingPlayers.includes(playerName)) {
                                    conflictingPlayers.push(playerName);
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Return conflict info if any conflicts found
        if (conflictingPlayers.length > 0) {
            return {
                players: conflictingPlayers,
                conflictingCourt: conflictingCourt
            };
        }
        
        return null;
    }
    
    getPlayerName(playerId) {
        const player = this.players.find(p => p.id === playerId);
        return player ? player.name : 'Unknown';
    }
    
    // Session sharing functionality
    shareSessionWithPlayers() {
        if (this.sessions.length === 0) {
            this.showNotification('No sessions to share', 'error');
            return;
        }
        
        // Create shareable data with session info
        const shareData = {
            type: 'session_view',
            sessions: this.sessions,
            players: this.players,
            pairs: this.pairs,
            sharedAt: new Date().toISOString(),
            version: '2.4'
        };
        
        // Compress the data for URL
        const jsonString = JSON.stringify(shareData);
        const compressed = this.compressData(jsonString);
        const encoded = btoa(compressed);
        
        // Create shareable URL
        const baseUrl = window.location.origin + window.location.pathname;
        const shareUrl = `${baseUrl}?view=shared&data=${encoded}`;
        
        // Copy to clipboard
        this.copyToClipboard(shareUrl);
        
        this.showNotification('Session link copied to clipboard! Share with players.', 'success');
    }
    
    compressData(data) {
        // Simple compression - replace common patterns
        return data
            .replace(/"players":/g, '"p":')
            .replace(/"pairs":/g, '"pr":')
            .replace(/"sessions":/g, '"s":')
            .replace(/"player1Id":/g, '"p1":')
            .replace(/"player2Id":/g, '"p2":')
            .replace(/"player1Name":/g, '"pn1":')
            .replace(/"player2Name":/g, '"pn2":')
            .replace(/"courtsData":/g, '"c":');
    }
    
    copyToClipboard(text) {
        // Create temporary textarea element
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        
        try {
            document.execCommand('copy');
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
        
        document.body.removeChild(textarea);
    }
    
    shareSessionWithWhatsApp() {
        if (this.sessions.length === 0) {
            this.showNotification('No sessions to share', 'error');
            return;
        }
        
        // Create formatted message for WhatsApp
        let message = '🏸 *Badminton Schedule*\n\n';
        
        this.sessions.forEach((session, index) => {
            const sessionDate = new Date(session.date + ' ' + session.time);
            message += `*${index + 1}. ${session.name}*\n`;
            message += `📅 ${sessionDate.toLocaleDateString()}\n`;
            message += `⏰ ${session.time}\n`;
            message += `🏟 Courts: ${session.courts}\n\n`;
            
            // Add scheduled matches
            let hasMatches = false;
            session.courtsData.forEach((court, courtIndex) => {
                if (court.matches && court.matches.length > 0) {
                    hasMatches = true;
                    message += `*${court.name}:*\n`;
                    court.matches.forEach((match, matchIndex) => {
                        if (match.pairs && match.pairs.length > 0) {
                            message += `  Match ${matchIndex + 1}: `;
                            const pairNames = match.pairs.map(p => p.name).join(' vs ');
                            message += `${pairNames}\n`;
                        }
                    });
                    message += '\n';
                }
            });
            
            if (!hasMatches) {
                message += 'No matches scheduled yet\n';
            }
            message += '---\n\n';
        });
        
        message += '📱 Generated by Badminton Scheduler';
        
        // Encode for WhatsApp URL
        const encodedMessage = encodeURIComponent(message);
        const whatsappUrl = `https://wa.me/?text=${encodedMessage}`;
        
        // Open WhatsApp
        window.open(whatsappUrl, '_blank');
        
        this.showNotification('Opening WhatsApp with schedule...', 'success');
    }
    
    loadSharedView() {
        const urlParams = new URLSearchParams(window.location.search);
        const view = urlParams.get('view');
        const data = urlParams.get('data');
        
        if (view === 'shared' && data) {
            try {
                const decoded = atob(data);
                const decompressed = this.decompressData(decoded);
                const shareData = JSON.parse(decompressed);
                
                if (shareData.type === 'session_view') {
                    this.renderSharedView(shareData);
                }
            } catch (error) {
                console.error('Error loading shared view:', error);
                this.showNotification('Invalid share link', 'error');
            }
        }
    }
    
    decompressData(data) {
        // Reverse compression
        return data
            .replace(/"p":/g, '"players":')
            .replace(/"pr":/g, '"pairs":')
            .replace(/"s":/g, '"sessions":')
            .replace(/"p1":/g, '"player1Id":')
            .replace(/"p2":/g, '"player2Id":')
            .replace(/"pn1":/g, '"player1Name":')
            .replace(/"pn2":/g, '"player2Name":')
            .replace(/"c":/g, '"courtsData":');
    }
    
    renderSharedView(shareData) {
        // Hide all admin controls
        document.querySelector('.glass-morphism.p-4').style.display = 'none';
        document.getElementById('playersPanel').style.display = 'none';
        document.getElementById('sessionsPanel').style.display = 'none';
        
        // Create shared view container
        const sharedContainer = document.createElement('div');
        sharedContainer.className = 'glass-morphism p-6';
        sharedContainer.innerHTML = `
            <div class="text-center mb-6">
                <h1 class="text-3xl font-bold text-white mb-2">Badminton Schedule</h1>
                <p class="text-white/70 text-sm">Read-only view for players</p>
                <p class="text-white/50 text-xs mt-1">Shared on ${new Date(shareData.sharedAt).toLocaleDateString()}</p>
            </div>
            
            <div class="space-y-6">
                ${shareData.sessions.map(session => this.renderSharedSession(session, shareData.players, shareData.pairs)).join('')}
            </div>
            
            <div class="text-center mt-8">
                <p class="text-white/50 text-xs">Created with Badminton Scheduler v2.4</p>
            </div>
        `;
        
        // Replace main content
        const mainContainer = document.querySelector('.container.mx-auto');
        mainContainer.innerHTML = '';
        mainContainer.appendChild(sharedContainer);
    }
    
    renderSharedSession(session, players, pairs) {
        const sessionDate = new Date(session.date + ' ' + session.time);
        
        return `
            <div class="border border-white/20 rounded-lg p-4">
                <div class="mb-4">
                    <h3 class="text-xl font-bold text-white mb-2">${session.name}</h3>
                    <p class="text-white/70 text-sm">
                        <i class="fas fa-calendar mr-2"></i>${sessionDate.toLocaleDateString()}
                        <i class="fas fa-clock ml-3 mr-2"></i>${session.time}
                        <i class="fas fa-hourglass-half ml-3 mr-2"></i>${session.duration} min
                    </p>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    ${session.courtsData.map(court => this.renderSharedCourt(court, pairs)).join('')}
                </div>
            </div>
        `;
    }
    
    renderSharedCourt(court, pairs) {
        return `
            <div class="border border-white/10 rounded-lg p-3">
                <h4 class="font-semibold text-white mb-3">${court.name}</h4>
                
                ${court.matches.length === 0 ? 
                    '<p class="text-white/50 text-center py-4">No matches scheduled</p>' :
                    court.matches.map((match, index) => this.renderSharedMatch(match, index + 1, pairs)).join('')
                }
            </div>
        `;
    }
    
    renderSharedMatch(match, matchNumber, pairs) {
        if (match.pairs && match.pairs.length > 0) {
            return `
                <div class="bg-white/10 rounded-lg p-3 mb-2">
                    <div class="text-sm font-medium text-white mb-2">Match ${matchNumber}</div>
                    <div class="space-y-1">
                        ${match.pairs.map(pair => {
                            const pairData = pairs.find(p => p.id === pair.id);
                            return pairData ? `
                                <div class="bg-white/5 rounded px-2 py-1 text-sm text-white/80">
                                    <i class="fas fa-users mr-1"></i>${pairData.name}
                                    <span class="text-white/60 text-xs ml-2">(${pairData.player1Name} & ${pairData.player2Name})</span>
                                </div>
                            ` : '';
                        }).join('')}
                    </div>
                </div>
            `;
        }
        
        return '';
    }
    
    setupDeleteButtonTouchEvents() {
        // Add touch event listeners to delete buttons
        document.querySelectorAll('button[onclick*="removePlayer"], button[onclick*="removePair"]').forEach(button => {
            // Prevent drag events on delete buttons
            button.addEventListener('dragstart', (e) => e.stopPropagation());
            button.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                // Add visual feedback
                button.style.transform = 'scale(0.95)';
                if (navigator.vibrate) navigator.vibrate(30);
            }, { passive: true });
            button.addEventListener('touchend', (e) => {
                e.stopPropagation();
                button.style.transform = 'scale(1)';
            }, { passive: true });
        });
    }
    
    setupSwipeToDelete() {
        const cards = document.querySelectorAll('.player-card, .pair-card');
        
        cards.forEach(card => {
            let startX = 0;
            let currentX = 0;
            let isSwiping = false;
            let deleteThreshold = 100; // Swipe distance to trigger delete
            
            // Remove any existing touch event listeners first
            card.removeEventListener('touchstart', this.handleTouchStart);
            card.removeEventListener('touchmove', this.handleTouchMove);
            card.removeEventListener('touchend', this.handleTouchEnd);
            
            card.addEventListener('touchstart', (e) => {
                // Stop propagation to prevent other touch handlers
                e.stopPropagation();
                startX = e.touches[0].clientX;
                isSwiping = true;
                card.style.transition = 'none';
            }, { passive: true });
            
            card.addEventListener('touchmove', (e) => {
                if (!isSwiping) return;
                
                currentX = e.touches[0].clientX;
                const deltaX = currentX - startX;
                
                // Only allow left swipe (negative deltaX)
                if (deltaX < 0) {
                    card.style.transform = `translateX(${deltaX}px)`;
                    card.style.opacity = 1 + (deltaX / 200); // Fade out as swipe progresses
                    
                    // Prevent default scrolling when swiping
                    if (Math.abs(deltaX) > 20) {
                        e.preventDefault();
                    }
                }
            }, { passive: false });
            
            card.addEventListener('touchend', (e) => {
                if (!isSwiping) return;
                
                // Stop propagation to prevent other touch handlers
                e.stopPropagation();
                
                const deltaX = currentX - startX;
                const cardType = card.getAttribute('data-type');
                const cardId = card.getAttribute('data-id');
                
                // Reset transition
                card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
                
                if (Math.abs(deltaX) > deleteThreshold && deltaX < 0) {
                    // Swipe threshold reached - delete the item
                    card.style.transform = 'translateX(-100%)';
                    card.style.opacity = '0';
                    
                    // Add haptic feedback
                    if (navigator.vibrate) {
                        navigator.vibrate([50, 50, 50]);
                    }
                    
                    // Delete after animation
                    setTimeout(() => {
                        if (cardType === 'player') {
                            this.removePlayer(cardId);
                        } else if (cardType === 'pair') {
                            this.removePair(cardId);
                        }
                    }, 300);
                } else {
                    // Snap back to original position
                    card.style.transform = 'translateX(0)';
                    card.style.opacity = '1';
                }
                
                isSwiping = false;
            }, { passive: true });
            
            card.addEventListener('touchcancel', (e) => {
                // Stop propagation to prevent other touch handlers
                e.stopPropagation();
                // Reset on touch cancel
                card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
                card.style.transform = 'translateX(0)';
                card.style.opacity = '1';
                isSwiping = false;
            }, { passive: true });
        });
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
            <div class="player-card" data-id="${player.id}" data-type="player">
                <div class="flex justify-between items-center">
                    <div class="flex-1">
                        <div class="font-semibold text-gray-800">${player.name}</div>
                        <div class="text-sm text-gray-600">
                            <span class="inline-block px-2 py-1 bg-${this.getSkillColor(player.skill)}-100 text-${this.getSkillColor(player.skill)}-800 text-xs rounded-full">
                                ${player.skill}
                            </span>
                        </div>
                    </div>
                    <button onclick="scheduler.removePlayer('${player.id}')" class="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-sm min-w-[44px] h-[44px] flex items-center justify-center touch-manipulation" style="touch-action: manipulation; pointer-events: auto;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
        
        // Setup swipe-to-delete after rendering
        setTimeout(() => this.setupSwipeToDelete(), 100);
    }

    renderPairs() {
        if (this.pairs.length === 0) {
            this.elements.pairsList.innerHTML = '<p class="text-gray-300 text-center py-4">No pairs created yet</p>';
            return;
        }
        
        this.elements.pairsList.innerHTML = this.pairs.map(pair => `
            <div class="pair-card" data-id="${pair.id}" data-type="pair">
                <div class="flex justify-between items-center">
                    <div>
                        <div class="font-semibold">${pair.name}</div>
                        <div class="text-sm opacity-90">${pair.player1Name} & ${pair.player2Name}</div>
                    </div>
                    <button onclick="scheduler.removePair('${pair.id}')" class="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-sm min-w-[44px] h-[44px] flex items-center justify-center touch-manipulation" style="touch-action: manipulation; pointer-events: auto;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
        
        // Setup swipe-to-delete after rendering
        setTimeout(() => this.setupSwipeToDelete(), 100);
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
        
        // Setup delete events after rendering
        setTimeout(() => this.setupDeleteButtonTouchEvents(), 100);
    }
    
    renderCourt(session, court) {
        // Show all pairs, let the user decide - they can add pairs to different matches
        const availablePairs = this.pairs;
        
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

function shareSessionWithWhatsApp() {
    scheduler.shareSessionWithWhatsApp();
}

// Initialize the scheduler
const scheduler = new BadmintonScheduler();
