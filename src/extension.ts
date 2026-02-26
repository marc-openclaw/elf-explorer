import * as vscode from 'vscode';
import * as fs from 'fs';
import {
  parseElf, ElfFile, hex, phFlags, shFlags,
  ET_TYPES, EM_MACHINES, PT_TYPES, SHT_TYPES, DT_TAGS,
  STB_BINDINGS, STT_TYPES, OSABI_NAMES
} from './elf-parser';
import { ElfHexEditorProvider, onDidOpenFile, onDidEditFile } from './hex-view';
import { fieldTooltip } from './tooltips';

const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);

function isElfFile(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    return buf.equals(ELF_MAGIC);
  } catch {
    return false;
  }
}

// --- Icons ---

function icon(name: string, color?: string): vscode.ThemeIcon {
  return color
    ? new vscode.ThemeIcon(name, new vscode.ThemeColor(color))
    : new vscode.ThemeIcon(name);
}

const ICONS = {
  elfHeader:   () => icon('file-binary', 'charts.blue'),
  property:    () => icon('symbol-property', 'charts.blue'),
  phGroup:     () => icon('layers', 'charts.green'),
  phEntry:     () => icon('symbol-struct', 'charts.green'),
  segmentData: () => icon('database', 'charts.green'),
  shGroup:     () => icon('symbol-class', 'charts.purple'),
  section:     () => icon('symbol-field', 'charts.purple'),
  secData:     () => icon('database', 'charts.purple'),
  hdrEntry:    () => icon('list-tree', 'charts.purple'),
  symGroup:    () => icon('symbol-function', 'charts.yellow'),
  symFunc:     () => icon('symbol-method', 'charts.yellow'),
  symVar:      () => icon('symbol-variable', 'charts.orange'),
  symOther:    () => icon('symbol-constant', 'charts.yellow'),
  dynGroup:    () => icon('link', 'charts.orange'),
  dynEntry:    () => icon('symbol-enum-member', 'charts.orange'),
  relGroup:    () => icon('references', 'charts.red'),
  relEntry:    () => icon('symbol-event', 'charts.red'),
  strGroup:    () => icon('symbol-string', 'charts.green'),
  strEntry:    () => icon('quote', 'charts.green'),
  value:       () => icon('symbol-value', 'foreground'),
};

// --- Helper to get raw hex for enum values ---

function getRawHex(value: number | bigint, size: number): string {
  const num = typeof value === 'bigint' ? Number(value) : value;
  return '0x' + num.toString(16).toUpperCase().padStart(size * 2, '0');
}

// --- Tree items ---

class ElfTreeItem extends vscode.TreeItem {
  public uniqueId: string;

  constructor(
    label: string,
    description: string,
    public readonly children: ElfTreeItem[],
    public readonly fileOffset?: number,
    public readonly fileSize?: number,
    itemIcon?: vscode.ThemeIcon,
    tooltip?: string | vscode.MarkdownString,
    public readonly isEditable: boolean = false,
  ) {
    super(
      label,
      children.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );
    this.description = description;
    if (itemIcon) this.iconPath = itemIcon;

    // Generate unique ID for double-click detection
    this.uniqueId = `${label}_${fileOffset}_${Date.now()}_${Math.random()}`;

    if (typeof tooltip === 'string') {
      const md = new vscode.MarkdownString(tooltip);
      md.isTrusted = true;
      md.supportHtml = true;
      this.tooltip = md;
    } else if (tooltip) {
      this.tooltip = tooltip;
    }

    // ALL items get click command (for highlight + edit on double-click)
    if (fileOffset !== undefined && fileSize !== undefined && fileSize > 0) {
      this.command = {
        command: 'elf-explorer.itemClicked',
        title: 'Item Clicked',
        arguments: [this],
      };
    }
  }
}

function item(
  label: string,
  desc: string,
  children: ElfTreeItem[] = [],
  offset?: number,
  size?: number,
  itemIcon?: vscode.ThemeIcon,
  tooltip?: string,
  editable: boolean = false
): ElfTreeItem {
  return new ElfTreeItem(label, desc, children, offset, size, itemIcon, tooltip, editable);
}

// Key-value property with optional tooltip and edit
function kv(
  key: string,
  value: string,
  offset?: number,
  size?: number,
  tooltipKey?: string,
  rawHex?: string,
  editable?: boolean
): ElfTreeItem {
  const tt = fieldTooltip(tooltipKey || '', value, rawHex, offset, size);
  return item(key, value, [], offset, size, ICONS.property(), tt, editable || false);
}

function buildTree(elf: ElfFile): ElfTreeItem[] {
  const root: ElfTreeItem[] = [];
  const h = elf.header;
  const is64 = h.class === 2;
  const ehdrSize = is64 ? 64 : 52;

  // === ELF Header ===
  const headerChildren: ElfTreeItem[] = [
    kv('Class', is64 ? 'ELF64 (0x02)' : 'ELF32 (0x01)', 4, 1, 'header.class', getRawHex(h.class, 1), true),
    kv('Encoding', h.data === 1 ? 'Little-endian (0x01)' : 'Big-endian (0x02)', 5, 1, 'header.data', getRawHex(h.data, 1), true),
    kv('OS/ABI', `${OSABI_NAMES[h.osabi] || 'Unknown'} (${getRawHex(h.osabi, 1)})`, 7, 1, 'header.osabi', getRawHex(h.osabi, 1), true),
    kv('Type', `${ET_TYPES[h.type] || 'Unknown'} (${getRawHex(h.type, 2)})`, 16, 2, 'header.type', getRawHex(h.type, 2), true),
    kv('Machine', `${EM_MACHINES[h.machine] || 'Unknown'} (${getRawHex(h.machine, 2)})`, 18, 2, 'header.machine', getRawHex(h.machine, 2), true),
    kv('Entry Point', hex(h.entry), is64 ? 24 : 24, is64 ? 8 : 4, 'header.entry', undefined, true),
    kv('PH Offset', hex(h.phoff), is64 ? 32 : 28, is64 ? 8 : 4, 'header.phoff', undefined, true),
    kv('SH Offset', hex(h.shoff), is64 ? 40 : 32, is64 ? 8 : 4, 'header.shoff', undefined, true),
    kv('Flags', hex(h.flags), is64 ? 48 : 36, 4, 'header.flags', undefined, true),
    kv('Header Size', `${h.ehsize}`, is64 ? 52 : 40, 2, 'header.ehsize', undefined, true),
    kv('PH Entry Size', `${h.phentsize}`, is64 ? 54 : 42, 2, 'header.phentsize', undefined, true),
    kv('PH Count', `${h.phnum}`, is64 ? 56 : 44, 2, 'header.phnum', undefined, true),
    kv('SH Entry Size', `${h.shentsize}`, is64 ? 58 : 46, 2, 'header.shentsize', undefined, true),
    kv('SH Count', `${h.shnum}`, is64 ? 60 : 48, 2, 'header.shnum', undefined, true),
    kv('SH String Index', `${h.shstrndx}`, is64 ? 62 : 50, 2, 'header.shstrndx', undefined, true),
  ];

  root.push(item(
    'ELF Header',
    `${is64 ? '64-bit' : '32-bit'} ${ET_TYPES[h.type] || 'Unknown'}`,
    headerChildren,
    0,
    ehdrSize,
    ICONS.elfHeader(),
    fieldTooltip('header', `${is64 ? '64-bit' : '32-bit'} ${ET_TYPES[h.type] || 'Unknown'}`, undefined, 0, ehdrSize)
  ));

  // === Program Headers ===
  if (elf.programHeaders.length > 0) {
    const phOff = Number(h.phoff);
    const phTotalSize = h.phentsize * h.phnum;
    const phChildren = elf.programHeaders.map((ph, i) => {
      const typeName = PT_TYPES[ph.type] || `Unknown (${getRawHex(ph.type, 4)})`;
      const entryOff = phOff + i * h.phentsize;

      // Calculate exact field offsets within the program header entry
      let typeOff: number, flagsOff: number, offsetOff: number, vaddrOff: number;
      let paddrOff: number, fileszOff: number, memszOff: number, alignOff: number;

      if (is64) {
        // 64-bit: p_type(+0,4), p_flags(+4,4), p_offset(+8,8), p_vaddr(+16,8), 
        // p_paddr(+24,8), p_filesz(+32,8), p_memsz(+40,8), p_align(+48,8)
        typeOff = entryOff + 0;
        flagsOff = entryOff + 4;
        offsetOff = entryOff + 8;
        vaddrOff = entryOff + 16;
        paddrOff = entryOff + 24;
        fileszOff = entryOff + 32;
        memszOff = entryOff + 40;
        alignOff = entryOff + 48;
      } else {
        // 32-bit: p_type(+0,4), p_offset(+4,4), p_vaddr(+8,4), p_paddr(+12,4),
        // p_filesz(+16,4), p_memsz(+20,4), p_flags(+24,4), p_align(+28,4)
        typeOff = entryOff + 0;
        offsetOff = entryOff + 4;
        vaddrOff = entryOff + 8;
        paddrOff = entryOff + 12;
        fileszOff = entryOff + 16;
        memszOff = entryOff + 20;
        flagsOff = entryOff + 24;
        alignOff = entryOff + 28;
      }

      const phSubItems: ElfTreeItem[] = [
        kv('Type', typeName, typeOff, 4, 'ph.type', getRawHex(ph.type, 4), true),
        kv('Flags', `${phFlags(ph.flags)} (${getRawHex(ph.flags, 4)})`, flagsOff, 4, 'ph.flags', getRawHex(ph.flags, 4), true),
        kv('File Offset', hex(ph.offset), offsetOff, is64 ? 8 : 4, 'ph.offset', undefined, true),
        kv('Virtual Address', hex(ph.vaddr), vaddrOff, is64 ? 8 : 4, 'ph.vaddr', undefined, true),
        kv('Physical Address', hex(ph.paddr), paddrOff, is64 ? 8 : 4, 'ph.paddr', undefined, true),
        kv('File Size', `${ph.filesz}`, fileszOff, is64 ? 8 : 4, 'ph.filesz', undefined, true),
        kv('Memory Size', `${ph.memsz}`, memszOff, is64 ? 8 : 4, 'ph.memsz', undefined, true),
        kv('Alignment', hex(ph.align), alignOff, is64 ? 8 : 4, 'ph.align', undefined, true),
      ];

      // Add "Segment Data" child representing the actual segment content
      const segOff = Number(ph.offset);
      const segSize = Number(ph.filesz);
      if (segSize > 0 && segOff >= 0) {
        phSubItems.push(
          item(
            'Segment Data',
            `${segSize} bytes at ${hex(segOff)}`,
            [],
            segOff,
            segSize,
            ICONS.segmentData(),
            fieldTooltip('segment', `Segment content: ${segSize} bytes`, undefined, segOff, segSize)
          )
        );
      }

      return item(
        `[${i}] ${typeName}`,
        `${phFlags(ph.flags)} vaddr=${hex(ph.vaddr)}`,
        phSubItems,
        entryOff,
        h.phentsize,
        ICONS.phEntry(),
        fieldTooltip('ph', typeName, undefined, entryOff, h.phentsize)
      );
    });

    root.push(item(
      'Program Headers',
      `${elf.programHeaders.length} entries`,
      phChildren,
      phOff,
      phTotalSize,
      ICONS.phGroup(),
      fieldTooltip('ph', `${elf.programHeaders.length} entries`, undefined, phOff, phTotalSize)
    ));
  }

  // === Section Headers ===
  if (elf.sectionHeaders.length > 0) {
    const shOff = Number(h.shoff);
    const shTotalSize = h.shentsize * h.shnum;
    const shChildren = elf.sectionHeaders.map((sh, i) => {
      const typeName = SHT_TYPES[sh.type] || `Unknown (${getRawHex(sh.type, 4)})`;
      const name = sh.name || `[${i}]`;
      const entryOff = shOff + i * h.shentsize;

      // Calculate exact field offsets within the section header entry
      let nameOff: number, typeOff: number, flagsOff: number, addrOff: number;
      let offsetOff: number, sizeOff: number, linkOff: number, infoOff: number;
      let addralignOff: number, entsizeOff: number;

      if (is64) {
        // 64-bit: sh_name(+0,4), sh_type(+4,4), sh_flags(+8,8), sh_addr(+16,8),
        // sh_offset(+24,8), sh_size(+32,8), sh_link(+40,4), sh_info(+44,4),
        // sh_addralign(+48,8), sh_entsize(+56,8)
        nameOff = entryOff + 0;
        typeOff = entryOff + 4;
        flagsOff = entryOff + 8;
        addrOff = entryOff + 16;
        offsetOff = entryOff + 24;
        sizeOff = entryOff + 32;
        linkOff = entryOff + 40;
        infoOff = entryOff + 44;
        addralignOff = entryOff + 48;
        entsizeOff = entryOff + 56;
      } else {
        // 32-bit: sh_name(+0,4), sh_type(+4,4), sh_flags(+8,4), sh_addr(+12,4),
        // sh_offset(+16,4), sh_size(+20,4), sh_link(+24,4), sh_info(+28,4),
        // sh_addralign(+32,4), sh_entsize(+36,4)
        nameOff = entryOff + 0;
        typeOff = entryOff + 4;
        flagsOff = entryOff + 8;
        addrOff = entryOff + 12;
        offsetOff = entryOff + 16;
        sizeOff = entryOff + 20;
        linkOff = entryOff + 24;
        infoOff = entryOff + 28;
        addralignOff = entryOff + 32;
        entsizeOff = entryOff + 36;
      }

      const dataOff = Number(sh.offset);
      const dataSize = Number(sh.size);

      const shSubItems: ElfTreeItem[] = [
        kv('Name Index', `${sh.nameIdx}`, nameOff, 4, 'sh.name', undefined, true),
        kv('Type', typeName, typeOff, 4, 'sh.type', getRawHex(sh.type, 4), true),
        kv('Flags', `${shFlags(sh.flags)} (${hex(sh.flags)})`, flagsOff, is64 ? 8 : 4, 'sh.flags', undefined, true),
        kv('Address', hex(sh.addr), addrOff, is64 ? 8 : 4, 'sh.addr', undefined, true),
        kv('File Offset', hex(sh.offset), offsetOff, is64 ? 8 : 4, 'sh.offset', undefined, true),
        kv('Size', `${sh.size} bytes`, sizeOff, is64 ? 8 : 4, 'sh.size', undefined, true),
        kv('Link', `${sh.link}`, linkOff, 4, 'sh.link', undefined, true),
        kv('Info', `${sh.info}`, infoOff, 4, 'sh.info', undefined, true),
        kv('Alignment', hex(sh.addralign), addralignOff, is64 ? 8 : 4, 'sh.addralign', undefined, true),
        kv('Entry Size', `${sh.entsize}`, entsizeOff, is64 ? 8 : 4, 'sh.entsize', undefined, true),
      ];

      // Add section data item if present (not SHT_NOBITS)
      if (sh.type !== 8 && dataSize > 0) {
        shSubItems.push(
          item(
            'Section Data',
            `${dataSize} bytes at ${hex(dataOff)}`,
            [],
            dataOff,
            dataSize,
            ICONS.secData(),
            fieldTooltip('sh', `Section content: ${dataSize} bytes`, undefined, dataOff, dataSize)
          )
        );
      }

      return item(
        name,
        `${typeName} ${shFlags(sh.flags)} size=${hex(sh.size)}`,
        shSubItems,
        entryOff,
        h.shentsize,
        ICONS.section(),
        fieldTooltip('sh', `${name} — ${typeName}`, undefined, entryOff, h.shentsize)
      );
    });

    root.push(item(
      'Section Headers',
      `${elf.sectionHeaders.length} sections`,
      shChildren,
      shOff,
      shTotalSize,
      ICONS.shGroup(),
      fieldTooltip('sh', `${elf.sectionHeaders.length} sections`, undefined, shOff, shTotalSize)
    ));
  }

  // === Symbol Tables ===
  for (const st of elf.symbols) {
    const secHdr = elf.sectionHeaders.find(s => s.name === st.section);
    const secSize = secHdr ? Number(secHdr.size) : undefined;

    const symChildren = st.symbols
      .filter(s => s.name || s.value !== 0n)
      .map(s => {
        const bind = STB_BINDINGS[s.info >> 4] || `Unknown`;
        const stype = STT_TYPES[s.info & 0xf] || `Unknown`;
        const bindHex = getRawHex(s.info >> 4, 1);
        const stypeHex = getRawHex(s.info & 0xf, 1);
        const name = s.name || `<unnamed>`;
        const symIcon = (s.info & 0xf) === 2 ? ICONS.symFunc()
          : (s.info & 0xf) === 1 ? ICONS.symVar()
          : ICONS.symOther();

        // Calculate exact field offsets for symbol entry
        let nameOff: number, infoOff: number, otherOff: number, shndxOff: number;
        let valueOff: number, sizeOff: number;

        if (is64) {
          // 64-bit Symbol (24 bytes): st_name(+0,4), st_info(+4,1), st_other(+5,1),
          // st_shndx(+6,2), st_value(+8,8), st_size(+16,8)
          nameOff = s._fileOffset + 0;
          infoOff = s._fileOffset + 4;
          otherOff = s._fileOffset + 5;
          shndxOff = s._fileOffset + 6;
          valueOff = s._fileOffset + 8;
          sizeOff = s._fileOffset + 16;
        } else {
          // 32-bit Symbol (16 bytes): st_name(+0,4), st_value(+4,4), st_size(+8,4),
          // st_info(+12,1), st_other(+13,1), st_shndx(+14,2)
          nameOff = s._fileOffset + 0;
          valueOff = s._fileOffset + 4;
          sizeOff = s._fileOffset + 8;
          infoOff = s._fileOffset + 12;
          otherOff = s._fileOffset + 13;
          shndxOff = s._fileOffset + 14;
        }

        const symSubItems: ElfTreeItem[] = [
          kv('Name Index', `${s.nameIdx}`, nameOff, 4, 'sym.name', undefined, true),
          kv('Binding', `${bind} (${bindHex})`, infoOff, 1, 'sym.bind', bindHex, false),
          kv('Type', `${stype} (${stypeHex})`, infoOff, 1, 'sym.type', stypeHex, false),
          kv('Info', `0x${s.info.toString(16).toUpperCase().padStart(2, '0')}`, infoOff, 1, 'sym.info', undefined, true),
          kv('Other', `0x${s.other.toString(16).toUpperCase().padStart(2, '0')}`, otherOff, 1, 'sym.other', undefined, true),
          kv('Section Index', `${s.shndx}`, shndxOff, 2, 'sym.shndx', undefined, true),
          kv('Value', hex(s.value), valueOff, is64 ? 8 : 4, 'sym.value', undefined, true),
          kv('Size', `${s.size}`, sizeOff, is64 ? 8 : 4, 'sym.size', undefined, true),
        ];

        return item(
          name,
          `${bind} (${bindHex}) ${stype} (${stypeHex})`,
          symSubItems,
          s._fileOffset,
          s._entSize,
          symIcon,
          fieldTooltip('sym', `${bind} ${stype}`, undefined, s._fileOffset, s._entSize)
        );
      });

    if (symChildren.length > 0) {
      root.push(item(
        `Symbols: ${st.section}`,
        `${symChildren.length} symbols`,
        symChildren,
        st.sectionOffset,
        secSize,
        ICONS.symGroup(),
        fieldTooltip('sym', `${symChildren.length} symbols in ${st.section}`, undefined, st.sectionOffset, secSize)
      ));
    }
  }

  // === Dynamic Section ===
  if (elf.dynamicEntries.length > 0) {
    const dynSecHdr = elf.sectionHeaders.find(s => s.type === 6);
    const dynSize = dynSecHdr ? Number(dynSecHdr.size) : undefined;

    const dynChildren = elf.dynamicEntries.map(d => {
      const tagNum = Number(d.tag);
      const tagName = DT_TAGS[tagNum] || `Unknown`;
      const tagHex = getRawHex(d.tag, is64 ? 8 : 4);

      // Calculate field offsets for dynamic entry
      let tagOff: number, valOff: number;
      if (is64) {
        // 64-bit Dynamic (16 bytes): d_tag(+0,8), d_val(+8,8)
        tagOff = d._fileOffset + 0;
        valOff = d._fileOffset + 8;
      } else {
        // 32-bit Dynamic (8 bytes): d_tag(+0,4), d_val(+4,4)
        tagOff = d._fileOffset + 0;
        valOff = d._fileOffset + 4;
      }

      const dynSubItems: ElfTreeItem[] = [
        kv('Tag', `${tagName} (${tagHex})`, tagOff, is64 ? 8 : 4, 'dyn.tag', tagHex, true),
        kv('Value', hex(d.val), valOff, is64 ? 8 : 4, 'dyn.val', undefined, true),
      ];

      return item(
        `${tagName} (${tagHex})`,
        hex(d.val),
        dynSubItems,
        d._fileOffset,
        d._entSize,
        ICONS.dynEntry(),
        fieldTooltip('dyn', `${tagName}`, tagHex, d._fileOffset, d._entSize)
      );
    });

    root.push(item(
      'Dynamic Section',
      `${elf.dynamicEntries.length} entries`,
      dynChildren,
      elf.dynamicSectionOffset,
      dynSize,
      ICONS.dynGroup(),
      fieldTooltip('dyn', `${elf.dynamicEntries.length} entries`, undefined, elf.dynamicSectionOffset, dynSize)
    ));
  }

  // === Relocations ===
  for (const rel of elf.relocations) {
    const relSecHdr = elf.sectionHeaders.find(s => s.name === rel.section);
    const relSize = relSecHdr ? Number(relSecHdr.size) : undefined;
    const isRela = relSecHdr?.type === 4;

    const relChildren = rel.entries.slice(0, 500).map((r, i) => {
      const name = r.symbolName || `[${i}]`;

      // Calculate field offsets for relocation entry
      let offsetOff: number, infoOff: number, addendOff: number | undefined;
      if (is64) {
        if (isRela) {
          // 64-bit Rela (24 bytes): r_offset(+0,8), r_info(+8,8), r_addend(+16,8)
          offsetOff = r._fileOffset + 0;
          infoOff = r._fileOffset + 8;
          addendOff = r._fileOffset + 16;
        } else {
          // 64-bit Rel (16 bytes): r_offset(+0,8), r_info(+8,8)
          offsetOff = r._fileOffset + 0;
          infoOff = r._fileOffset + 8;
        }
      } else {
        if (isRela) {
          // 32-bit Rela (12 bytes): r_offset(+0,4), r_info(+4,4), r_addend(+8,4)
          offsetOff = r._fileOffset + 0;
          infoOff = r._fileOffset + 4;
          addendOff = r._fileOffset + 8;
        } else {
          // 32-bit Rel (8 bytes): r_offset(+0,4), r_info(+4,4)
          offsetOff = r._fileOffset + 0;
          infoOff = r._fileOffset + 4;
        }
      }

      const relSubItems: ElfTreeItem[] = [
        kv('Offset', hex(r.offset), offsetOff, is64 ? 8 : 4, 'rel.offset', undefined, true),
        kv('Info', hex(r.info), infoOff, is64 ? 8 : 4, 'rel.info', undefined, true),
      ];

      if (r.addend !== undefined && addendOff !== undefined) {
        relSubItems.push(
          kv('Addend', `${r.addend}`, addendOff, is64 ? 8 : 4, 'rel.addend', undefined, true)
        );
      }

      return item(
        name,
        `off=${hex(r.offset)} info=${hex(r.info)}${r.addend !== undefined ? ` +${r.addend}` : ''}`,
        relSubItems,
        r._fileOffset,
        r._entSize,
        ICONS.relEntry(),
        fieldTooltip('rel', name, undefined, r._fileOffset, r._entSize)
      );
    });

    if (relChildren.length > 0) {
      const extra = rel.entries.length > 500 ? ` (showing 500/${rel.entries.length})` : '';
      root.push(item(
        `Relocations: ${rel.section}`,
        `${rel.entries.length} entries${extra}`,
        relChildren,
        rel.sectionOffset,
        relSize,
        ICONS.relGroup(),
        fieldTooltip('rel', `${rel.entries.length} entries`, undefined, rel.sectionOffset, relSize)
      ));
    }
  }

  // === String Tables ===
  for (const st of elf.stringTables) {
    const strSecHdr = elf.sectionHeaders.find(s => s.name === st.section);
    const strSize = strSecHdr ? Number(strSecHdr.size) : undefined;

    const strChildren = st.strings.slice(0, 200).map(s => {
      const display = s.value.length > 60 ? s.value.substring(0, 57) + '...' : s.value;
      return item(
        display,
        hex(s.fileOffset),
        [],
        s.fileOffset,
        s.length,
        ICONS.strEntry(),
        `**String:** \`${s.value.length > 100 ? s.value.substring(0, 97) + '...' : s.value}\`\n\n` +
        `Length: ${s.value.length} chars\\\nOffset: \`${hex(s.fileOffset)}\`\n\n*Click to highlight in hex view*`
      );
    });

    if (strChildren.length > 0) {
      const extra = st.strings.length > 200 ? ` (showing 200/${st.strings.length})` : '';
      root.push(item(
        `Strings: ${st.section}`,
        `${st.strings.length} strings${extra}`,
        strChildren,
        st.sectionOffset,
        strSize,
        ICONS.strGroup(),
        fieldTooltip('strtab', `${st.strings.length} strings`, undefined, st.sectionOffset, strSize)
      ));
    }
  }

  return root;
}

// --- Tree Data Provider ---

class ElfTreeDataProvider implements vscode.TreeDataProvider<ElfTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ElfTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private roots: ElfTreeItem[] = [];

  refreshFromBuffer(uri: vscode.Uri, data: Buffer): void {
    const elf = parseElf(data);
    if (elf) {
      this.roots = buildTree(elf);
    } else {
      this.roots = [];
    }
    this._onDidChangeTreeData.fire();
  }

  refresh(uri: vscode.Uri | undefined): void {
    if (!uri || uri.scheme !== 'file') {
      this.roots = [];
      this._onDidChangeTreeData.fire();
      return;
    }
    if (!isElfFile(uri.fsPath)) {
      this.roots = [];
      this._onDidChangeTreeData.fire();
      return;
    }
    try {
      this.refreshFromBuffer(uri, fs.readFileSync(uri.fsPath));
    } catch {
      this.roots = [];
      this._onDidChangeTreeData.fire();
    }
  }

  getTreeItem(element: ElfTreeItem): vscode.TreeItem { return element; }
  getChildren(element?: ElfTreeItem): ElfTreeItem[] {
    return element ? element.children : this.roots;
  }
}

// --- Activation ---

function getActiveFileUri(): vscode.Uri | undefined {
  if (vscode.window.activeTextEditor) return vscode.window.activeTextEditor.document.uri;
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  if (tab?.input && typeof (tab.input as any).uri !== 'undefined') return (tab.input as any).uri;
  return undefined;
}

// Double-click detection state
let lastClickedItemId: string | undefined;
let lastClickTime: number = 0;
const DOUBLE_CLICK_MS = 400;

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(ElfHexEditorProvider.register(context));

  const treeProvider = new ElfTreeDataProvider();
  const treeView = vscode.window.createTreeView('elfExplorer', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // Item clicked command — handles highlight + double-click for edit
  context.subscriptions.push(
    vscode.commands.registerCommand('elf-explorer.itemClicked', async (item: ElfTreeItem) => {
      if (!item || item.fileOffset === undefined || item.fileSize === undefined || item.fileSize === 0) {
        return;
      }

      // Always highlight on first click
      ElfHexEditorProvider.highlightRange(item.fileOffset, item.fileSize);

      // Check for double-click (only on editable items)
      if (item.isEditable) {
        const now = Date.now();
        const isDoubleClick = (item.uniqueId === lastClickedItemId) && (now - lastClickTime < DOUBLE_CLICK_MS);

        if (isDoubleClick) {
          // Double-click detected — open edit dialog
          lastClickedItemId = undefined;
          lastClickTime = 0;

          const currentHex = ElfHexEditorProvider.readBytes(item.fileOffset, item.fileSize);
          if (!currentHex) return;

          // Format with spaces for readability
          const formatted = currentHex.match(/.{2}/g)?.join(' ') || currentHex;

          const input = await vscode.window.showInputBox({
            title: `Edit: ${item.label}`,
            prompt: `${item.fileSize} byte${item.fileSize > 1 ? 's' : ''} at offset 0x${item.fileOffset.toString(16)}`,
            value: formatted,
            valueSelection: [0, formatted.length],
            validateInput: (val) => {
              const clean = val.replace(/\s/g, '');
              if (!/^[0-9a-fA-F]*$/.test(clean)) return 'Invalid hex characters';
              if (clean.length !== item.fileSize! * 2) {
                return `Need ${item.fileSize! * 2} hex digits (${item.fileSize} bytes), got ${clean.length}`;
              }
              return null;
            },
          });

          if (input === undefined) return; // User cancelled

          const clean = input.replace(/\s/g, '');
          const newBytes: number[] = [];
          for (let i = 0; i < clean.length; i += 2) {
            newBytes.push(parseInt(clean.substring(i, i + 2), 16));
          }
          ElfHexEditorProvider.writeBytes(item.fileOffset, newBytes);
        } else {
          // First click — record for double-click detection
          lastClickedItemId = item.uniqueId;
          lastClickTime = now;
        }
      }
    })
  );

  // Events
  context.subscriptions.push(onDidOpenFile(uri => treeProvider.refresh(uri)));
  context.subscriptions.push(onDidEditFile(({ uri, data }) => treeProvider.refreshFromBuffer(uri, data)));
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => treeProvider.refresh(getActiveFileUri())));
  context.subscriptions.push(vscode.window.tabGroups.onDidChangeTabs(() => setTimeout(() => treeProvider.refresh(getActiveFileUri()), 150)));

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(async (doc) => {
      if (doc.uri.scheme !== 'file') return;
      if (doc.languageId === 'elf' || isElfFile(doc.uri.fsPath)) {
        if (doc.languageId !== 'elf') await vscode.languages.setTextDocumentLanguage(doc, 'elf');
        vscode.commands.executeCommand('vscode.openWith', doc.uri, ElfHexEditorProvider.viewType);
      }
    })
  );

  treeProvider.refresh(getActiveFileUri());
}

export function deactivate() {}
