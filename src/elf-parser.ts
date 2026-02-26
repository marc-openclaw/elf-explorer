/**
 * ELF Binary Parser
 * Supports ELF32 and ELF64, little-endian and big-endian
 */

export interface ElfHeader {
  class: number;       // 1=32-bit, 2=64-bit
  data: number;        // 1=LE, 2=BE
  version: number;
  osabi: number;
  type: number;
  machine: number;
  entry: bigint;
  phoff: bigint;
  shoff: bigint;
  flags: number;
  ehsize: number;
  phentsize: number;
  phnum: number;
  shentsize: number;
  shnum: number;
  shstrndx: number;
}

export interface ProgramHeader {
  type: number;
  flags: number;
  offset: bigint;
  vaddr: bigint;
  paddr: bigint;
  filesz: bigint;
  memsz: bigint;
  align: bigint;
}

export interface SectionHeader {
  nameIdx: number;
  name: string;
  type: number;
  flags: bigint;
  addr: bigint;
  offset: bigint;
  size: bigint;
  link: number;
  info: number;
  addralign: bigint;
  entsize: bigint;
}

export interface ElfSymbol {
  nameIdx: number;
  name: string;
  value: bigint;
  size: bigint;
  info: number;
  other: number;
  shndx: number;
  _fileOffset: number;  // file offset of this symbol entry
  _entSize: number;     // size of this symbol entry
}

export interface DynEntry {
  tag: bigint;
  val: bigint;
  _fileOffset: number;
  _entSize: number;
}

export interface RelEntry {
  offset: bigint;
  info: bigint;
  addend?: bigint;
  symbolName?: string;
  _fileOffset: number;
  _entSize: number;
}

export interface StringEntry {
  value: string;
  fileOffset: number;
  length: number;       // byte length including null terminator
}

export interface ElfFile {
  header: ElfHeader;
  programHeaders: ProgramHeader[];
  sectionHeaders: SectionHeader[];
  symbols: { section: string; sectionOffset: number; symbols: ElfSymbol[] }[];
  dynamicEntries: DynEntry[];
  dynamicSectionOffset: number;
  relocations: { section: string; sectionOffset: number; entries: RelEntry[] }[];
  stringTables: { section: string; sectionOffset: number; strings: StringEntry[] }[];
}

class Reader {
  private buf: Buffer;
  private is64: boolean;
  private isLE: boolean;
  pos: number = 0;

  constructor(buf: Buffer, is64: boolean, isLE: boolean) {
    this.buf = buf;
    this.is64 = is64;
    this.isLE = isLE;
  }

  seek(pos: number) { this.pos = pos; }

  u8(): number { return this.buf[this.pos++]; }

  u16(): number {
    const v = this.isLE ? this.buf.readUInt16LE(this.pos) : this.buf.readUInt16BE(this.pos);
    this.pos += 2;
    return v;
  }

  u32(): number {
    const v = this.isLE ? this.buf.readUInt32LE(this.pos) : this.buf.readUInt32BE(this.pos);
    this.pos += 4;
    return v;
  }

  u64(): bigint {
    const v = this.isLE ? this.buf.readBigUInt64LE(this.pos) : this.buf.readBigUInt64BE(this.pos);
    this.pos += 8;
    return v;
  }

  addr(): bigint { return this.is64 ? this.u64() : BigInt(this.u32()); }
  off(): bigint { return this.is64 ? this.u64() : BigInt(this.u32()); }
  xword(): bigint { return this.is64 ? this.u64() : BigInt(this.u32()); }
  sxword(): bigint {
    if (this.is64) {
      const v = this.isLE ? this.buf.readBigInt64LE(this.pos) : this.buf.readBigInt64BE(this.pos);
      this.pos += 8;
      return v;
    } else {
      const v = this.isLE ? this.buf.readInt32LE(this.pos) : this.buf.readInt32BE(this.pos);
      this.pos += 4;
      return BigInt(v);
    }
  }
}

function readCString(buf: Buffer, offset: number): string {
  if (offset < 0 || offset >= buf.length) return '';
  const end = buf.indexOf(0, offset);
  if (end === -1) return buf.toString('utf8', offset);
  return buf.toString('utf8', offset, end);
}

export function parseElf(data: Buffer): ElfFile | null {
  if (data.length < 52) return null;
  if (data[0] !== 0x7f || data[1] !== 0x45 || data[2] !== 0x4c || data[3] !== 0x46) return null;

  const elfClass = data[4];
  const elfData = data[5];
  const is64 = elfClass === 2;
  const isLE = elfData === 1;

  const r = new Reader(data, is64, isLE);

  r.seek(6);
  const version = r.u8();
  const osabi = r.u8();
  r.seek(16);
  const type = r.u16();
  const machine = r.u16();
  r.u32();
  const entry = r.addr();
  const phoff = r.off();
  const shoff = r.off();
  const flags = r.u32();
  const ehsize = r.u16();
  const phentsize = r.u16();
  const phnum = r.u16();
  const shentsize = r.u16();
  const shnum = r.u16();
  const shstrndx = r.u16();

  const header: ElfHeader = {
    class: elfClass, data: elfData, version, osabi, type, machine,
    entry, phoff, shoff, flags, ehsize, phentsize, phnum, shentsize, shnum, shstrndx
  };

  const programHeaders: ProgramHeader[] = [];
  for (let i = 0; i < phnum; i++) {
    r.seek(Number(phoff) + i * phentsize);
    const ptype = r.u32();
    let pflags = 0;
    if (is64) pflags = r.u32();
    const poffset = r.off();
    const pvaddr = r.addr();
    const ppaddr = r.addr();
    const pfilesz = r.xword();
    const pmemsz = r.xword();
    if (!is64) pflags = r.u32();
    const palign = r.xword();
    programHeaders.push({ type: ptype, flags: pflags, offset: poffset, vaddr: pvaddr, paddr: ppaddr, filesz: pfilesz, memsz: pmemsz, align: palign });
  }

  const sectionHeaders: SectionHeader[] = [];
  for (let i = 0; i < shnum; i++) {
    r.seek(Number(shoff) + i * shentsize);
    const shnameIdx = r.u32();
    const shtype = r.u32();
    const shflags = r.xword();
    const shaddr = r.addr();
    const shoffset = r.off();
    const shsize = r.xword();
    const shlink = r.u32();
    const shinfo = r.u32();
    const shaddralign = r.xword();
    const shentsize2 = r.xword();
    sectionHeaders.push({
      nameIdx: shnameIdx, name: '', type: shtype, flags: shflags,
      addr: shaddr, offset: shoffset, size: shsize, link: shlink,
      info: shinfo, addralign: shaddralign, entsize: shentsize2
    });
  }

  if (shstrndx < sectionHeaders.length) {
    const strtab = sectionHeaders[shstrndx];
    const strtabOff = Number(strtab.offset);
    for (const sh of sectionHeaders) {
      sh.name = readCString(data, strtabOff + sh.nameIdx);
    }
  }

  const symbols: { section: string; sectionOffset: number; symbols: ElfSymbol[] }[] = [];
  for (const sh of sectionHeaders) {
    if (sh.type !== 2 && sh.type !== 11) continue;
    const syms: ElfSymbol[] = [];
    const entSize = Number(sh.entsize) || (is64 ? 24 : 16);
    const count = Number(sh.size) / entSize;
    const secOff = Number(sh.offset);
    const strSec = sh.link < sectionHeaders.length ? sectionHeaders[sh.link] : null;
    const strOff = strSec ? Number(strSec.offset) : 0;

    for (let i = 0; i < count; i++) {
      const symFileOffset = secOff + i * entSize;
      r.seek(symFileOffset);
      let sym: ElfSymbol;
      if (is64) {
        const nameIdx = r.u32();
        const info = r.u8();
        const other = r.u8();
        const shndx = r.u16();
        const value = r.addr();
        const size = r.xword();
        sym = { nameIdx, name: '', value, size, info, other, shndx, _fileOffset: symFileOffset, _entSize: entSize };
      } else {
        const nameIdx = r.u32();
        const value = r.addr();
        const size = r.xword();
        const info = r.u8();
        const other = r.u8();
        const shndx = r.u16();
        sym = { nameIdx, name: '', value, size, info, other, shndx, _fileOffset: symFileOffset, _entSize: entSize };
      }
      if (strSec) sym.name = readCString(data, strOff + sym.nameIdx);
      syms.push(sym);
    }
    symbols.push({ section: sh.name || (sh.type === 2 ? '.symtab' : '.dynsym'), sectionOffset: secOff, symbols: syms });
  }

  const dynamicEntries: DynEntry[] = [];
  let dynamicSectionOffset = 0;
  for (const sh of sectionHeaders) {
    if (sh.type !== 6) continue;
    const entSize = Number(sh.entsize) || (is64 ? 16 : 8);
    const count = Number(sh.size) / entSize;
    const secOff = Number(sh.offset);
    dynamicSectionOffset = secOff;
    for (let i = 0; i < count; i++) {
      const entFileOffset = secOff + i * entSize;
      r.seek(entFileOffset);
      const tag = r.sxword();
      const val = r.xword();
      dynamicEntries.push({ tag, val, _fileOffset: entFileOffset, _entSize: entSize });
      if (tag === 0n) break;
    }
  }

  const relocations: { section: string; sectionOffset: number; entries: RelEntry[] }[] = [];
  for (const sh of sectionHeaders) {
    if (sh.type !== 4 && sh.type !== 9) continue;
    const isRela = sh.type === 4;
    const entSize = Number(sh.entsize) || (is64 ? (isRela ? 24 : 16) : (isRela ? 12 : 8));
    const count = Number(sh.size) / entSize;
    const secOff = Number(sh.offset);
    const symSec = sh.link < sectionHeaders.length ? sectionHeaders[sh.link] : null;
    let symSymbols: ElfSymbol[] | null = null;
    if (symSec) {
      const found = symbols.find(s => s.section === symSec.name);
      if (found) symSymbols = found.symbols;
    }

    const entries: RelEntry[] = [];
    for (let i = 0; i < count; i++) {
      const entFileOffset = secOff + i * entSize;
      r.seek(entFileOffset);
      const offset = r.addr();
      const info = r.xword();
      const addend = isRela ? r.sxword() : undefined;
      const symIdx = is64 ? Number(info >> 32n) : Number(info >> 8n);
      let symbolName: string | undefined;
      if (symSymbols && symIdx > 0 && symIdx < symSymbols.length) {
        symbolName = symSymbols[symIdx].name;
      }
      entries.push({ offset, info, addend, symbolName, _fileOffset: entFileOffset, _entSize: entSize });
    }
    relocations.push({ section: sh.name, sectionOffset: secOff, entries });
  }

  const stringTables: { section: string; sectionOffset: number; strings: StringEntry[] }[] = [];
  for (const sh of sectionHeaders) {
    if (sh.type !== 3) continue;
    const strs: StringEntry[] = [];
    const off = Number(sh.offset);
    const end = off + Number(sh.size);
    let pos = off;
    while (pos < end) {
      const s = readCString(data, pos);
      if (s.length > 0) {
        strs.push({ value: s, fileOffset: pos, length: s.length + 1 });
      }
      pos += s.length + 1;
    }
    stringTables.push({ section: sh.name, sectionOffset: off, strings: strs });
  }

  return { header, programHeaders, sectionHeaders, symbols, dynamicEntries, dynamicSectionOffset, relocations, stringTables };
}

// Lookup tables
export const ET_TYPES: Record<number, string> = {
  0: 'ET_NONE', 1: 'ET_REL', 2: 'ET_EXEC', 3: 'ET_DYN', 4: 'ET_CORE'
};

export const EM_MACHINES: Record<number, string> = {
  0: 'EM_NONE', 2: 'EM_SPARC', 3: 'EM_386', 6: 'EM_486', 7: 'EM_860',
  8: 'EM_MIPS', 20: 'EM_PPC', 21: 'EM_PPC64', 40: 'EM_ARM',
  42: 'EM_SH', 43: 'EM_SPARCV9', 50: 'EM_IA_64', 62: 'EM_X86_64',
  183: 'EM_AARCH64', 243: 'EM_RISCV', 247: 'EM_BPF'
};

export const PT_TYPES: Record<number, string> = {
  0: 'PT_NULL', 1: 'PT_LOAD', 2: 'PT_DYNAMIC', 3: 'PT_INTERP', 4: 'PT_NOTE',
  5: 'PT_SHLIB', 6: 'PT_PHDR', 7: 'PT_TLS', 0x6474e550: 'PT_GNU_EH_FRAME',
  0x6474e551: 'PT_GNU_STACK', 0x6474e552: 'PT_GNU_RELRO', 0x6474e553: 'PT_GNU_PROPERTY'
};

export const SHT_TYPES: Record<number, string> = {
  0: 'SHT_NULL', 1: 'SHT_PROGBITS', 2: 'SHT_SYMTAB', 3: 'SHT_STRTAB',
  4: 'SHT_RELA', 5: 'SHT_HASH', 6: 'SHT_DYNAMIC', 7: 'SHT_NOTE',
  8: 'SHT_NOBITS', 9: 'SHT_REL', 10: 'SHT_SHLIB', 11: 'SHT_DYNSYM',
  14: 'SHT_INIT_ARRAY', 15: 'SHT_FINI_ARRAY', 16: 'SHT_PREINIT_ARRAY',
  0x6ffffff6: 'SHT_GNU_HASH', 0x6ffffffd: 'SHT_GNU_VERDEF',
  0x6ffffffe: 'SHT_GNU_VERNEED', 0x6fffffff: 'SHT_GNU_VERSYM'
};

export const DT_TAGS: Record<number, string> = {
  0: 'DT_NULL', 1: 'DT_NEEDED', 2: 'DT_PLTRELSZ', 3: 'DT_PLTGOT',
  4: 'DT_HASH', 5: 'DT_STRTAB', 6: 'DT_SYMTAB', 7: 'DT_RELA',
  8: 'DT_RELASZ', 9: 'DT_RELAENT', 10: 'DT_STRSZ', 11: 'DT_SYMENT',
  12: 'DT_INIT', 13: 'DT_FINI', 14: 'DT_SONAME', 15: 'DT_RPATH',
  17: 'DT_REL', 20: 'DT_PLTREL', 21: 'DT_DEBUG', 23: 'DT_JMPREL',
  25: 'DT_INIT_ARRAY', 26: 'DT_FINI_ARRAY', 27: 'DT_INIT_ARRAYSZ',
  28: 'DT_FINI_ARRAYSZ', 29: 'DT_RUNPATH', 30: 'DT_FLAGS'
};

export const STB_BINDINGS: Record<number, string> = {
  0: 'LOCAL', 1: 'GLOBAL', 2: 'WEAK'
};

export const STT_TYPES: Record<number, string> = {
  0: 'NOTYPE', 1: 'OBJECT', 2: 'FUNC', 3: 'SECTION', 4: 'FILE',
  5: 'COMMON', 6: 'TLS', 10: 'GNU_IFUNC'
};

export const OSABI_NAMES: Record<number, string> = {
  0: 'ELFOSABI_NONE/SYSV', 1: 'HPUX', 2: 'NetBSD', 3: 'Linux/GNU',
  6: 'Solaris', 7: 'AIX', 8: 'IRIX', 9: 'FreeBSD', 12: 'OpenBSD'
};

export function hex(v: bigint | number): string {
  return '0x' + v.toString(16);
}

export function phFlags(f: number): string {
  return (f & 4 ? 'R' : '-') + (f & 2 ? 'W' : '-') + (f & 1 ? 'X' : '-');
}

export function shFlags(f: bigint): string {
  let s = '';
  if (f & 1n) s += 'W';
  if (f & 2n) s += 'A';
  if (f & 4n) s += 'X';
  return s || '-';
}
