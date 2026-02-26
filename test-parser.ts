import * as fs from 'fs';
import { parseElf } from './src/elf-parser';

// Test against a real ELF binary
const testBinaries = ['/bin/ls', '/bin/sh', '/usr/bin/env'];
for (const bin of testBinaries) {
  if (!fs.existsSync(bin)) continue;
  console.log(`\n=== Testing: ${bin} ===`);
  const data = fs.readFileSync(bin);
  const elf = parseElf(data as any);
  if (!elf) { console.log('NOT an ELF file'); continue; }
  
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
    console.log(`  ${st.section}: ${st.symbols.length} symbols, first 5: ${st.symbols.slice(0,5).map(s=>s.name||'<empty>').join(', ')}`);
  }
  console.log(`Dynamic entries: ${elf.dynamicEntries.length}`);
  console.log(`Relocation tables: ${elf.relocations.length}`);
  console.log(`String tables: ${elf.stringTables.length}`);
}
