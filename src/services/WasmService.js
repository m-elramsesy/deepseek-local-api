const fs = require("fs");
const path = require("path");
const {MemoryUtils} = require("../utils/memory");
const {EncodingUtils} = require("../utils/encoding");

class WasmService {
    constructor() {
        this.instance = null;
        this.memory = null;
        this.addToStack = null;
        this.alloc = null;
        this.wasmSolve = null;
    }

    async initialize(wasmPath) {
        const finalPath = path.resolve(process.cwd(), wasmPath);

        if (!fs.existsSync(finalPath)) {
            throw new Error(`WASM file not found: ${finalPath}`);
        }

        try {
            const wasmBytes = await fs.promises.readFile(finalPath);
            const wasmModule = await WebAssembly.compile(wasmBytes);
            
            const importObject = {
                env: {
                    abort: () => { 
                        console.error("WASM aborted!"); 
                        throw new Error("WASM aborted"); 
                    },
                }
            };

            this.instance = await WebAssembly.instantiate(wasmModule, importObject);
            this.memory = new Uint8Array(this.instance.exports.memory.buffer);
            this.addToStack = this.instance.exports.__wbindgen_add_to_stack_pointer;
            this.alloc = this.instance.exports.__wbindgen_export_0;
            this.wasmSolve = this.instance.exports.wasm_solve;

            if (!this.memory || !this.addToStack || !this.alloc || !this.wasmSolve) {
                throw new Error("Missing WASM export functions.");
            }
        } catch (e) {
            throw new Error(`Failed to initialize WASM: ${e.message}`);
        }
    }

    writeMemory(offset, data) {
        const view = MemoryUtils.createMemoryView(this.instance.exports.memory);
        MemoryUtils.writeToMemory(view, offset, data);
    }

    readMemory(offset, size) {
        const view = MemoryUtils.createMemoryView(this.instance.exports.memory);
        return MemoryUtils.readFromMemory(view, offset, size);
    }

    encodeString(text) {
        const data = EncodingUtils.encodeUTF8(text);
        const length = data.length;
        const ptr = this.alloc(length, 1);
        this.writeMemory(ptr, data);
        return { ptr, length };
    }

    async solve(challengeStr, prefix, difficulty) {
        if (!this.instance) {
            throw new Error("WASM not initialized. Call initialize() first.");
        }

        try {
            const retptr = this.addToStack(-16);

            const { ptr: ptrChallenge, length: lenChallenge } = this.encodeString(challengeStr);
            const { ptr: ptrPrefix, length: lenPrefix } = this.encodeString(prefix);

            this.wasmSolve(
                retptr,
                ptrChallenge,
                lenChallenge,
                ptrPrefix,
                lenPrefix,
                parseFloat(difficulty)
            );

            const statusBytes = this.readMemory(retptr, 4);
            if (statusBytes.length !== 4) {
                this.addToStack(16);
                throw new Error("Failed to read status bytes");
            }

            const view = MemoryUtils.createMemoryView(this.instance.exports.memory);
            const status = MemoryUtils.readInt32(view, retptr);

            const valueBytes = this.readMemory(retptr + 8, 8);
            if (valueBytes.length !== 8) {
                this.addToStack(16);
                throw new Error("Failed to read result bytes");
            }

            const value = MemoryUtils.readFloat64(view, retptr + 8);
            this.addToStack(16);

            if (status === 0) {
                return null;
            }

            return Math.floor(value);
        } catch (error) {
            this.addToStack(16);
            throw error;
        }
    }
}

module.exports = WasmService; 