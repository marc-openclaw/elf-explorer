const fs = require('fs');
const { parseElf, hex, ET_TYPES, EM_MACHINES } = require('./out/elf-parser');

const data = fs.readFileSync('/tmp/test-elf-binary');

console.log('=== Test 1: Parse ===');
const elf = parseElf(data);
if (!elf) { console.error('FAIL: parseElf returned null'); process.exit(1); }
console.log('PASS: Parsed', elf.header.class === 2 ? 'ELF64' : 'ELF32', ET_TYPES[elf.header.type]);

console.log('\n=== Test 2: File offsets on symbols ===');
let symOffOk = true;
for (const st of elf.symbols) {
  for (const s of st.symbols) {
    if (s._fileOffset === undefined || s._entSize === undefined) { symOffOk = false; break; }
    if (s._fileOffset < 0 || s._fileOffset + s._entSize > data.length) { symOffOk = false; break; }
  }
}
console.log('Symbol offsets valid:', symOffOk ? 'PASS' : 'FAIL');
console.log('Sample symbol:', elf.symbols[0]?.symbols[1]?.name, 'at offset', elf.symbols[0]?.symbols[1]?._fileOffset);

console.log('\n=== Test 3: File offsets on dynamic entries ===');
let dynOk = true;
for (const d of elf.dynamicEntries) {
  if (d._fileOffset === undefined || d._fileOffset < 0) { dynOk = false; break; }
}
console.log('Dynamic entry offsets valid:', dynOk ? 'PASS' : 'FAIL');
console.log('Dynamic section offset:', elf.dynamicSectionOffset);

console.log('\n=== Test 4: File offsets on relocations ===');
let relOk = true;
for (const r of elf.relocations) {
  for (const e of r.entries) {
    if (e._fileOffset === undefined || e._fileOffset < 0) { relOk = false; break; }
  }
}
console.log('Relocation offsets valid:', relOk ? 'PASS' : 'FAIL');

console.log('\n=== Test 5: String table entries with offsets ===');
let strOk = true;
for (const st of elf.stringTables) {
  for (const s of st.strings) {
    if (s.fileOffset === undefined || s.fileOffset < 0) { strOk = false; break; }
    // Verify string at offset matches
    const actual = data.toString('utf8', s.fileOffset, s.fileOffset + s.value.length);
    if (actual !== s.value) {
      console.error('FAIL: String mismatch at', s.fileOffset, ':', JSON.stringify(actual), '!=', JSON.stringify(s.value));
      strOk = false; break;
    }
  }
}
console.log('String offsets valid:', strOk ? 'PASS' : 'FAIL');
console.log('Sample string:', elf.stringTables[0]?.strings[0]?.value, 'at offset', elf.stringTables[0]?.strings[0]?.fileOffset);

console.log('\n=== Test 6: All items have clickable offsets ===');
let totalItems = 0, itemsWithOffsets = 0;
// Count symbols
for (const st of elf.symbols) for (const s of st.symbols) { totalItems++; if (s._fileOffset >= 0) itemsWithOffsets++; }
// Count dynamic
for (const d of elf.dynamicEntries) { totalItems++; if (d._fileOffset >= 0) itemsWithOffsets++; }
// Count relocations
for (const r of elf.relocations) for (const e of r.entries) { totalItems++; if (e._fileOffset >= 0) itemsWithOffsets++; }
// Count strings
for (const st of elf.stringTables) for (const s of st.strings) { totalItems++; if (s.fileOffset >= 0) itemsWithOffsets++; }
console.log(`${itemsWithOffsets}/${totalItems} items have file offsets: ${itemsWithOffsets === totalItems ? 'PASS' : 'PARTIAL'}`);

console.log('\n=== All tests complete ===');
