const { API_ENDPOINTS, CHAT_CONFIG } = require('../config/constants');
const { HeadersBuilder } = require('../config/headers');
const PowService = require('../services/PowService');
const ChatSession = require('./ChatSession');

class DeepseekClient {
    constructor(token, parentMessageId = null) {
        this.token = token;
        this.powService = new PowService();
        this.currentSession = null;
        this.parentMessageId = parentMessageId;
    }

    async initialize() {
        await this.powService.initialize();
    }

    async createSession() {
        this.currentSession = await ChatSession.create(this.token, this.parentMessageId);
        return this.currentSession;
    }

    async resumeSession(sessionIdOrUrl) {
        this.currentSession = await ChatSession.resume(this.token, sessionIdOrUrl);
        return this.currentSession;
    }

    async sendMessage(message, session = null, { thinking_enabled = false, search_enabled = false } = {}) {
        if (!session && !this.currentSession) {
            session = await this.createSession();
        }
        const chatSession = session || this.currentSession;

        if (chatSession.title === 'New Chat') {
            chatSession.setTitle(message.slice(0, 35));
        }

        // Increment message ID for human message
        chatSession.incrementMessageId();

        const powDataB64 = await this.powService.getPowResponse(
            this.token,
            API_ENDPOINTS.TARGET_PATH
        );

        const headers = HeadersBuilder.getChatHeaders(this.token, powDataB64);

        const payload = {
            prompt: message,
            model: CHAT_CONFIG.DEFAULT_MODEL,
            stream: true,
            temperature: CHAT_CONFIG.DEFAULT_TEMPERATURE,
            max_tokens: CHAT_CONFIG.DEFAULT_MAX_TOKENS,
            ref_file_ids: [],
            thinking_enabled,
            search_enabled,
            chat_session_id: chatSession.getId(),
            parent_message_id: chatSession.getParentMessageId()
        };

        try {
            const response = await fetch(API_ENDPOINTS.COMPLETION, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.text();
                console.error("Chat completion error:", errorData);
                throw new Error(`Chat completion failed: ${response.status}`);
            }

            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                const clone = response.clone();
                try {
                    const data = await clone.json();
                    if (data && data.code !== undefined && data.code !== 0) {
                        const errorMsg = data.msg || data.biz_msg || `API error code ${data.code}`;
                        throw new Error(`DeepSeek API error (${data.code}): ${errorMsg}`);
                    }
                } catch (e) {
                    if (e.message.startsWith('DeepSeek API error')) {
                        throw e;
                    }
                }
            }

            // Increment message ID for AI response
            chatSession.incrementMessageId();

            return response;
        } catch (error) {
            console.error("Error in sendMessage:", error);
            throw error;
        }
    }

    async *streamResponse(response, session = null) {
        const chatSession = session || this.currentSession;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentPath = null;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith('event:')) continue;

                    if (trimmed.startsWith('data:')) {
                        const dataStr = trimmed.slice(5).trim();
                        if (!dataStr || dataStr === '{}') continue;

                        try {
                            const parsed = JSON.parse(dataStr);

                            // Capture and save the response_message_id for threading next message
                            if (parsed.response_message_id && chatSession) {
                                chatSession.setParentMessageId(parsed.response_message_id);
                            }

                            if (parsed.p) currentPath = parsed.p;
                            if (parsed.v !== undefined && typeof parsed.v === 'string') {
                                if (currentPath === 'response/thinking_content') {
                                    yield {
                                        type: 'thinking',
                                        text: parsed.v
                                    };
                                } else if (currentPath === 'response/content' || currentPath === 'response/text') {
                                    yield {
                                        type: 'content',
                                        text: parsed.v
                                    };
                                }
                            }
                        } catch (e) { }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }
}

module.exports = DeepseekClient; 