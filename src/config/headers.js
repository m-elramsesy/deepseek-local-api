const BASE_HEADERS = {
    "Host": "chat.deepseek.com",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type": "application/json",
    "Origin": "https://chat.deepseek.com",
    "Referer": "https://chat.deepseek.com/",
    "Sec-Ch-Ua": "\"Not A(Brand\";v=\"8\", \"Chromium\";v=\"152\", \"Google Chrome\";v=\"152\"",
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": "\"Windows\"",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "x-app-version": "20241129.1",
    "x-client-locale": "en_US",
    "x-client-platform": "web",
    "x-client-version": "1.0.0-always"
};

class HeadersBuilder {
    static sanitizeToken(token) {
        if (!token || typeof token !== 'string') return '';
        return token.trim().replace(/^["']|["']$/g, '').trim();
    }

    static getAuthHeaders(token, cookie = process.env.DEEPSEEK_COOKIE) {
        const cleanToken = this.sanitizeToken(token);
        const headers = {
            ...BASE_HEADERS,
            "Authorization": `Bearer ${cleanToken}`
        };
        if (cookie) {
            headers["Cookie"] = cookie;
        }
        return headers;
    }

    static getChatHeaders(token, powDataB64, cookie = process.env.DEEPSEEK_COOKIE) {
        return {
            ...this.getAuthHeaders(token, cookie),
            "x-ds-pow-response": powDataB64
        };
    }
}

module.exports = {
    BASE_HEADERS,
    HeadersBuilder
}; 