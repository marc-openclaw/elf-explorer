/**
 * Rich tooltips for ELF fields with hex values for all enums.
 */

export const ELF_FIELD_DOCS: Record<string, string> = {
  'header': 'The **ELF Header** is the first structure in every ELF file. It identifies the file as ELF and describes the overall layout.',
  'header.class': '`e_ident[EI_CLASS]` — **Address size**\n\n| Value | Name | Meaning |\n|---|---|---|\n| `0x01` | ELFCLASS32 | 32-bit |\n| `0x02` | ELFCLASS64 | 64-bit |',
  'header.data': '`e_ident[EI_DATA]` — **Byte order**\n\n| Value | Name | Meaning |\n|---|---|---|\n| `0x01` | ELFDATA2LSB | Little-endian |\n| `0x02` | ELFDATA2MSB | Big-endian |',
  'header.osabi': '`e_ident[EI_OSABI]` — **Target OS/ABI**\n\n| Value | Name |\n|---|---|\n| `0x00` | ELFOSABI_NONE / SYSV |\n| `0x03` | Linux / GNU |\n| `0x09` | FreeBSD |',
  'header.type': '`e_type` — **Object file type**\n\n| Value | Name | Meaning |\n|---|---|---|\n| `0x00` | ET_NONE | No type |\n| `0x01` | ET_REL | Relocatable (.o) |\n| `0x02` | ET_EXEC | Executable |\n| `0x03` | ET_DYN | Shared object / PIE |\n| `0x04` | ET_CORE | Core dump |',
  'header.machine': '`e_machine` — **Target architecture**\n\n| Value | Name |\n|---|---|\n| `0x03` | EM_386 (x86) |\n| `0x28` | EM_ARM |\n| `0x3E` | EM_X86_64 |\n| `0xB7` | EM_AARCH64 |\n| `0xF3` | EM_RISCV |',
  'header.entry': '`e_entry` — **Entry point** virtual address where execution begins.',
  'header.phoff': '`e_phoff` — **Program header table** file offset.',
  'header.shoff': '`e_shoff` — **Section header table** file offset.',
  'header.flags': '`e_flags` — **Processor-specific flags**. Usually `0x00` for x86/x64.',
  'header.ehsize': '`e_ehsize` — Size of the **ELF header** in bytes.\n\n`0x34` (52) for ELF32, `0x40` (64) for ELF64.',
  'header.phentsize': '`e_phentsize` — Size of **one program header** entry in bytes.',
  'header.phnum': '`e_phnum` — **Number** of program header entries.',
  'header.shentsize': '`e_shentsize` — Size of **one section header** entry in bytes.',
  'header.shnum': '`e_shnum` — **Number** of section header entries.',
  'header.shstrndx': '`e_shstrndx` — Section header **index** of the section name string table.',

  'ph': '**Program Header Table** — Describes segments for runtime loading.\n\nEach entry tells the loader how to map file content into memory.',
  'ph.type': '`p_type` — **Segment type**\n\n| Value | Name | Meaning |\n|---|---|---|\n| `0x00` | PT_NULL | Unused |\n| `0x01` | PT_LOAD | Loadable segment |\n| `0x02` | PT_DYNAMIC | Dynamic linking info |\n| `0x03` | PT_INTERP | Interpreter path |\n| `0x04` | PT_NOTE | Auxiliary info |\n| `0x06` | PT_PHDR | PH table itself |\n| `0x07` | PT_TLS | Thread-local storage |',
  'ph.flags': '`p_flags` — **Segment permissions**\n\n| Bit | Flag | Meaning |\n|---|---|---|\n| `0x01` | PF_X | Executable |\n| `0x02` | PF_W | Writable |\n| `0x04` | PF_R | Readable |',
  'ph.offset': '`p_offset` — **File offset** where the segment data begins.',
  'ph.vaddr': '`p_vaddr` — **Virtual address** where the segment is loaded.',
  'ph.paddr': '`p_paddr` — **Physical address** (usually same as vaddr).',
  'ph.filesz': '`p_filesz` — **Size in file** (bytes). May be less than memsz (.bss).',
  'ph.memsz': '`p_memsz` — **Size in memory** (bytes).',
  'ph.align': '`p_align` — **Alignment** requirement.',

  'sh': '**Section Header Table** — Describes all sections for linking and debugging.\n\nCommon sections: `.text` (code), `.data` (data), `.bss` (uninitialized), `.symtab` (symbols).',
  'sh.name': '`sh_name` — **Offset** into the section name string table.',
  'sh.type': '`sh_type` — **Section type**\n\n| Value | Name | Meaning |\n|---|---|---|\n| `0x00` | SHT_NULL | Inactive |\n| `0x01` | SHT_PROGBITS | Program data |\n| `0x02` | SHT_SYMTAB | Symbol table |\n| `0x03` | SHT_STRTAB | String table |\n| `0x04` | SHT_RELA | Relocation + addend |\n| `0x06` | SHT_DYNAMIC | Dynamic linking |\n| `0x08` | SHT_NOBITS | .bss (no file data) |\n| `0x09` | SHT_REL | Relocation |\n| `0x0B` | SHT_DYNSYM | Dynamic symbols |',
  'sh.flags': '`sh_flags` — **Section attributes**\n\n| Bit | Flag | Meaning |\n|---|---|---|\n| `0x01` | SHF_WRITE | Writable |\n| `0x02` | SHF_ALLOC | In memory |\n| `0x04` | SHF_EXECINSTR | Executable |',
  'sh.addr': '`sh_addr` — **Virtual address** if section is loaded into memory.',
  'sh.offset': '`sh_offset` — **File offset** of section data.',
  'sh.size': '`sh_size` — **Size** of section in bytes.',
  'sh.link': '`sh_link` — **Link** to associated section (e.g., string table for symbol table).',
  'sh.info': '`sh_info` — **Extra info** (meaning depends on section type).',
  'sh.addralign': '`sh_addralign` — **Alignment** constraint.',
  'sh.entsize': '`sh_entsize` — Size of each **fixed-size entry** (for tables).',

  'sym': '**Symbol Table** — Maps names to addresses for linking and debugging.',
  'sym.name': '`st_name` — **Offset** into the associated string table.',
  'sym.bind': '**Binding** — Symbol visibility\n\n| Value | Name | Meaning |\n|---|---|---|\n| `0x00` | LOCAL | File-only visibility |\n| `0x01` | GLOBAL | Visible everywhere |\n| `0x02` | WEAK | Overridable global |',
  'sym.type': '**Symbol type**\n\n| Value | Name | Meaning |\n|---|---|---|\n| `0x00` | NOTYPE | Unspecified |\n| `0x01` | OBJECT | Data (variable) |\n| `0x02` | FUNC | Function |\n| `0x03` | SECTION | Section |\n| `0x04` | FILE | Source file |',
  'sym.value': '`st_value` — Symbol **address** (virtual address for functions/variables).',
  'sym.size': '`st_size` — **Size** of the symbol in bytes.',
  'sym.info': '`st_info` — Combined **binding** (high 4 bits) and **type** (low 4 bits).',
  'sym.other': '`st_other` — **Visibility** (bits 0-1).\n\n| Value | Name |\n|---|---|\n| `0x00` | DEFAULT |\n| `0x01` | INTERNAL |\n| `0x02` | HIDDEN |\n| `0x03` | PROTECTED |',
  'sym.shndx': '`st_shndx` — **Section index** the symbol is associated with.\n\n| Value | Name |\n|---|---|\n| `0x0000` | UNDEF |\n| `0xFFF1` | ABS |\n| `0xFFF2` | COMMON |',

  'dyn': '**Dynamic Section** — Entries for the dynamic linker.\n\nSpecifies shared libraries, symbol tables, relocations, init/fini functions.',
  'dyn.tag': '`d_tag` — **Entry type**\n\n| Value | Name |\n|---|---|\n| `0x00` | DT_NULL (end) |\n| `0x01` | DT_NEEDED (library) |\n| `0x05` | DT_STRTAB |\n| `0x06` | DT_SYMTAB |\n| `0x17` | DT_JMPREL |',
  'dyn.val': '`d_val` / `d_ptr` — **Value or pointer** associated with the tag.',

  'rel': '**Relocation** — Describes a patch to apply when loading/linking.',
  'rel.offset': '`r_offset` — **Address** of the location to patch.',
  'rel.info': '`r_info` — **Symbol index** (upper bits) and **relocation type** (lower bits).',
  'rel.addend': '`r_addend` — **Constant addend** for the relocation computation.',

  'strtab': '**String Table** — Null-terminated strings referenced by offset.',
  'segment': '**Segment data** — The actual file content of this segment.',
};

export function fieldTooltip(fieldKey: string, value: string, rawHex?: string, offset?: number, size?: number): string {
  const doc = ELF_FIELD_DOCS[fieldKey] || '';
  let md = '';

  if (doc) {
    md += doc + '\n\n---\n\n';
  }

  md += `**Value:** \`${value}\``;
  if (rawHex) {
    md += ` (\`${rawHex}\`)`;
  }

  if (offset !== undefined) {
    md += `\\\n**Offset:** \`0x${offset.toString(16).toUpperCase()}\` (${offset})`;
  }
  if (size !== undefined && size > 0) {
    md += `\\\n**Size:** ${size} byte${size !== 1 ? 's' : ''}`;
  }

  if (offset !== undefined && size !== undefined && size > 0) {
    md += '\n\n*Click to highlight in hex view • Double-click to edit*';
  }

  return md;
}
