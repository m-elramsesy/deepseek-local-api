/**
 * Utility functions for handling WebAssembly memory operations
 */

class MemoryUtils {
    /**
     * Write data to WebAssembly memory
     * @param {DataView} view - DataView of the WebAssembly memory
     * @param {number} offset - Memory offset to write to
     * @param {Uint8Array} data - Data to write
     */
    static writeToMemory(view, offset, data) {
        for (let i = 0; i < data.length; i++) {
            view.setUint8(offset + i, data[i]);
        }
    }

    /**
     * Read data from WebAssembly memory
     * @param {DataView} view - DataView of the WebAssembly memory
     * @param {number} offset - Memory offset to read from
     * @param {number} size - Number of bytes to read
     * @returns {Uint8Array} Read data
     */
    static readFromMemory(view, offset, size) {
        const bytes = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
            bytes[i] = view.getUint8(offset + i);
        }
        return bytes;
    }

    /**
     * Read a 32-bit integer from memory
     * @param {DataView} view - DataView of the WebAssembly memory
     * @param {number} offset - Memory offset to read from
     * @param {boolean} littleEndian - Whether to use little-endian byte order
     * @returns {number} Read integer
     */
    static readInt32(view, offset, littleEndian = true) {
        return view.getInt32(offset, littleEndian);
    }

    /**
     * Read a 64-bit float from memory
     * @param {DataView} view - DataView of the WebAssembly memory
     * @param {number} offset - Memory offset to read from
     * @param {boolean} littleEndian - Whether to use little-endian byte order
     * @returns {number} Read float
     */
    static readFloat64(view, offset, littleEndian = true) {
        return view.getFloat64(offset, littleEndian);
    }

    /**
     * Create a DataView from a WebAssembly memory buffer
     * @param {WebAssembly.Memory} memory - WebAssembly memory instance
     * @returns {DataView} DataView of the memory
     */
    static createMemoryView(memory) {
        return new DataView(memory.buffer);
    }
}

module.exports = {MemoryUtils}; 