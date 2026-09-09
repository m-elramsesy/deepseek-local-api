const fs = require('fs');
const path = require('path');
const { API_ENDPOINTS } = require('../config/constants');
const { HeadersBuilder } = require('../config/headers');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

class ChatSession {
    constructor(sessionId = null, parentMessageId = null, title = null) {
        this.sessionId = ChatSession.parseSessionId(sessionId);
        this.currentMessageId = 0;
        this.parentMessageId = parentMessageId;
        this.title = title || 'New Chat';
    }

    /**
     * Parse session ID from either a raw UUID or a full DeepSeek web URL
     * e.g. https://chat.deepseek.com/a/chat/s/48893d3d-cb96-4e8c-a7ef-344038a36e15
     */
    static parseSessionId(input) {
        if (!input || typeof input !== 'string') return null;
        const trimmed = input.trim();
        const uuidMatch = trimmed.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
        return uuidMatch ? uuidMatch[0] : trimmed;
    }

    /**
     * Get direct web URL for this session
     */
    getWebUrl() {
        return this.sessionId ? API_ENDPOINTS.WEB_SESSION_URL(this.sessionId) : null;
    }

    /**
     * Create a brand new session on DeepSeek
     */
    static async create(token, parentMessageId = null) {
        const headers = HeadersBuilder.getAuthHeaders(token);
        const payload = { character_id: null };

        try {
            const response = await fetch(API_ENDPOINTS.CREATE_SESSION, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.text();
                console.error("Session creation error:", errorData);
                throw new Error(`Session creation failed: ${response.status}`);
            }

            const data = await response.json();
            const sessionId = data?.data?.biz_data?.id || data?.biz_data?.id;
            if (!sessionId) {
                throw new Error("Could not find session ID in response");
            }

            const session = new ChatSession(sessionId, parentMessageId);
            session.save();
            return session;
        } catch (error) {
            console.error("Error in createSession:", error);
            throw error;
        }
    }

    /**
     * Resume an existing session by ID or Web URL.
     * Attempts to fetch message history from DeepSeek to determine the latest parent_message_id.
     */
    static async resume(token, sessionIdOrUrl) {
        const sessionId = this.parseSessionId(sessionIdOrUrl);
        if (!sessionId) {
            throw new Error("Invalid session ID or URL provided");
        }

        // Check local saved session first
        const saved = this.getSavedSession(sessionId);
        let parentMessageId = saved ? saved.parentMessageId : null;
        let title = saved ? saved.title : 'Resumed Chat';

        // Try to query DeepSeek for latest messages in this session
        try {
            const headers = HeadersBuilder.getAuthHeaders(token);
            const historyUrl = `${API_ENDPOINTS.HISTORY_MESSAGES}?chat_session_id=${sessionId}`;
            const res = await fetch(historyUrl, {
                method: 'GET',
                headers: headers
            });

            if (res.ok) {
                const data = await res.json();
                const messages = data?.data?.biz_data?.chat_messages || data?.biz_data?.chat_messages || [];
                if (messages.length > 0) {
                    const lastMsg = messages[messages.length - 1];
                    parentMessageId = lastMsg.message_id || lastMsg.id || parentMessageId;
                    if (!saved?.title && messages[0]?.content) {
                        title = messages[0].content.slice(0, 35);
                    }
                }
            }
        } catch (e) {
            // Fallback to local state if offline or API call fails
        }

        const session = new ChatSession(sessionId, parentMessageId, title);
        session.save();
        return session;
    }

    getCurrentMessageId() {
        return this.currentMessageId;
    }

    incrementMessageId() {
        this.currentMessageId += 1;
        return this.currentMessageId;
    }

    getParentMessageId() {
        return this.parentMessageId === null ? null : this.parentMessageId;
    }

    setParentMessageId(id) {
        this.parentMessageId = id;
        this.save();
    }

    setTitle(title) {
        this.title = title;
        this.save();
    }

    getId() {
        return this.sessionId;
    }

    // --- Lightweight Local Persistence ---

    static ensureDataDir() {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
    }

    static loadAllSavedSessions() {
        this.ensureDataDir();
        if (!fs.existsSync(SESSIONS_FILE)) return [];
        try {
            return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
        } catch (e) {
            return [];
        }
    }

    static getSavedSession(id) {
        const sessions = this.loadAllSavedSessions();
        return sessions.find(s => s.id === id) || null;
    }

    save() {
        if (!this.sessionId) return;
        ChatSession.ensureDataDir();
        const sessions = ChatSession.loadAllSavedSessions();
        const idx = sessions.findIndex(s => s.id === this.sessionId);
        const entry = {
            id: this.sessionId,
            webUrl: this.getWebUrl(),
            title: this.title,
            parentMessageId: this.parentMessageId,
            updatedAt: new Date().toISOString()
        };

        if (idx >= 0) {
            sessions[idx] = { ...sessions[idx], ...entry };
        } else {
            sessions.unshift(entry);
        }

        fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8');
    }
}

module.exports = ChatSession; 