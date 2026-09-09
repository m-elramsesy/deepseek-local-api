/**
 * Utility functions for handling string encoding and base64 operations
 */

class EncodingUtils {
    /**
     * Encode a string to UTF-8 bytes
     * @param {string} text - Text to encode
     * @returns {Uint8Array} Encoded bytes
     */
    static encodeUTF8(text) {
        return new TextEncoder().encode(text);
    }

    /**
     * Decode UTF-8 bytes to string
     * @param {Uint8Array} bytes - Bytes to decode
     * @returns {string} Decoded text
     */
    static decodeUTF8(bytes) {
        return new TextDecoder().decode(bytes);
    }

    /**
     * Encode data to base64
     * @param {string} data - String to encode
     * @returns {string} Base64 encoded string
     */
    static encodeBase64(data) {
        if (typeof window !== 'undefined') {
            // Browser environment
            return btoa(data);
        } else {
            // Node.js environment
            return Buffer.from(data).toString('base64');
        }
    }

    /**
     * Decode base64 string
     * @param {string} base64 - Base64 string to decode
     * @returns {string} Decoded string
     */
    static decodeBase64(base64) {
        if (typeof window !== 'undefined') {
            // Browser environment
            return atob(base64);
        } else {
            // Node.js environment
            return Buffer.from(base64, 'base64').toString();
        }
    }

    /**
     * Encode JSON object to base64
     * @param {Object} data - Object to encode
     * @returns {string} Base64 encoded string
     */
    static encodeJSONToBase64(data) {
        const jsonStr = JSON.stringify(data);
        return this.encodeBase64(jsonStr);
    }

    /**
     * Decode base64 string to JSON object
     * @param {string} base64 - Base64 string to decode
     * @returns {Object} Decoded JSON object
     */
    static decodeBase64ToJSON(base64) {
        const jsonStr = this.decodeBase64(base64);
        return JSON.parse(jsonStr);
    }

    /**
     * Convert string to bytes with specified encoding
     * @param {string} text - Text to convert
     * @param {string} encoding - Encoding to use (utf8, base64, etc.)
     * @returns {Uint8Array} Converted bytes
     */
    static stringToBytes(text, encoding = 'utf8') {
        switch (encoding.toLowerCase()) {
            case 'utf8':
            case 'utf-8':
                return this.encodeUTF8(text);
            case 'base64':
                const decoded = this.decodeBase64(text);
                return this.encodeUTF8(decoded);
            default:
                throw new Error(`Unsupported encoding: ${encoding}`);
        }
    }
}

module.exports = {EncodingUtils}; 