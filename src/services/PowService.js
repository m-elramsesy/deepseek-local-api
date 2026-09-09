const WasmService = require('./WasmService');
const { API_ENDPOINTS, WASM_CONFIG } = require('../config/constants');
const { HeadersBuilder } = require('../config/headers');
const { EncodingUtils } = require('../utils/encoding');

class PowService {
    constructor() {
        this.wasmService = new WasmService();
    }

    async initialize() {
        await this.wasmService.initialize(WASM_CONFIG.DEFAULT_PATH);
    }

    async getPowResponse(token, targetPath) {
        const headers = HeadersBuilder.getAuthHeaders(token);
        const payload = { target_path: targetPath };

        try {
            const response = await fetch(API_ENDPOINTS.CREATE_POW, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.text();
                console.error("PoW challenge error:", errorData);
                throw new Error(`Failed to get PoW challenge: ${response.status}`);
            }

            const data = await response.json();
            console.log("PoW challenge data:", data);
            const challenge = data.data.biz_data.challenge;

            if (!WASM_CONFIG.SUPPORTED_ALGORITHMS.includes(challenge.algorithm)) {
                throw new Error(`Unsupported algorithm: ${challenge.algorithm}`);
            }

            const prefix = `${challenge.salt}_${challenge.expire_at}_`;
            const answer = await this.wasmService.solve(
                challenge.challenge,
                prefix,
                challenge.difficulty
            );

            const powData = {
                algorithm: challenge.algorithm,
                answer: answer,
                challenge: challenge.challenge,
                difficulty: challenge.difficulty,
                expire_at: challenge.expire_at,
                salt: challenge.salt,
                signature: challenge.signature,
                target_path: challenge.target_path
            };

            return EncodingUtils.encodeJSONToBase64(powData);
        } catch (error) {
            console.error("Error in getPowResponse:", error);
            throw error;
        }
    }
}

module.exports = PowService; 