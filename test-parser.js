"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const elf_parser_1 = require("./src/elf-parser");
// Test against a real ELF binary
const testBinaries = ['/bin/ls', '/bin/sh', '/usr/bin/env'];
for (const bin of testBinaries) {
    if (!fs.existsSync(bin))
        continue;
    console.log(`\n=== Testing: ${bin} ===`);
    const data = fs.readFileSync(bin);
    const elf = (0, elf_parser_1.parseElf)(data);
    if (!elf) {
        console.log('NOT an ELF file');
        continue;
    }
    const h = elf.header;
    console.log(`Class: ${h.class === 2 ? 'ELF64' : 'ELF32'}`);
    console.log(`Data: ${h.data === 1 ? 'LE' : 'BE'}`);
    console.log(`Type: ${h.type} Machine: ${h.machine}`);
    console.log(`Entry: 0x${h.entry.toString(16)}`);
    console.log(`Program Headers: ${elf.programHeaders.length}`);
    console.log(`Section Headers: ${elf.sectionHeaders.length}`);
    console.log(`Sections: ${elf.sectionHeaders.map(s => s.name).filter(Boolean).join(', ')}`);
    console.log(`Symbol tables: ${elf.symbols.length}`);
    for (const st of elf.symbols) {
        console.log(`  ${st.section}: ${st.symbols.length} symbols, first 5: ${st.symbols.slice(0, 5).map(s => s.name || '<empty>').join(', ')}`);
    }
    console.log(`Dynamic entries: ${elf.dynamicEntries.length}`);
    console.log(`Relocation tables: ${elf.relocations.length}`);
    console.log(`String tables: ${elf.stringTables.length}`);
}
//# sourceMappingURL=test-parser.js.map