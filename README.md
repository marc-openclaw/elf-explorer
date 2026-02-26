# ELF Explorer

A Visual Studio Code extension for exploring and editing ELF (Executable and Linkable Format) binary files with an integrated hex editor and structure tree view.

## What It Is

ELF Explorer provides an interactive environment for analyzing ELF binaries directly in VS Code. It combines a hex editor with a hierarchical structure view, letting you inspect headers, sections, symbols, relocations, and more — all with click-to-highlight navigation between structure fields and raw bytes.

## Why It Exists

There's no good integrated ELF analysis tool in VS Code that combines hex-level inspection with high-level structure analysis. Existing tools either show raw hex (without context) or parse structures (without showing the underlying bytes). ELF Explorer bridges that gap.

## Features

- **Hex Editor with Editing Support**
  - View and edit binary data byte-by-byte
  - Virtual scrolling for large files (efficient memory usage)
  - Visual highlighting of selected ranges
  - Double-click any editable field to modify bytes

- **Structure Tree View**
  - ELF Header (class, encoding, OS/ABI, type, machine, entry point)
  - Program Headers (segments, flags, addresses)
  - Section Headers (.text, .data, .bss, etc.)
  - Symbol Tables (.symtab, .dynsym)
  - Dynamic Section (DT_NEEDED, DT_SONAME, etc.)
  - Relocations (.rel, .rela)
  - String Tables (all embedded strings with offsets)

- **Click-to-Highlight**
  - Click any structure element to highlight its bytes in the hex view
  - Navigate between logical structure and raw binary representation

- **Format Support**
  - ELF32 and ELF64
  - Little-endian (LE) and big-endian (BE)
  - All major machine architectures (x86, x86_64, ARM, AARCH64, RISC-V, etc.)

- **Automatic File Detection**
  - Recognizes ELF magic bytes (`0x7F 'E' 'L' 'F'`)
  - Supports common extensions: `.elf`, `.so`, `.o`, `.out`, `.ko`, `.axf`

- **Rich Tooltips**
  - Hover over fields for detailed explanations
  - Shows enum values, flags, and field offsets

## How to Build

```bash
npm install
npm run compile
npm run package
```

This produces a `.vsix` file in the project root.

## How to Install

1. Build the extension (see above)
2. In VS Code, run: **Extensions: Install from VSIX...**
3. Select the generated `elf-explorer-<version>.vsix` file

Or install from the command line:

```bash
code --install-extension elf-explorer-*.vsix
```

## How to Test

Run the integration test suite:

```bash
node test-integration.js
```

**What it tests:**
- ELF32 and ELF64 parsing
- Little-endian and big-endian byte order handling
- Header field extraction (type, machine, entry point)
- Section header parsing (name, type, offset, size)
- Magic byte validation
- Edge cases (truncated files, invalid magic)

## How to Use

1. **Open an ELF file** in VS Code (e.g., `/bin/ls`, a `.so`, or compiled `.o` file)
2. The extension automatically activates and opens:
   - **Left panel:** ELF structure tree (expand sections, symbols, etc.)
   - **Main view:** Interactive hex editor
3. **Click any item** in the tree to highlight its bytes in the hex view
4. **Double-click editable fields** to modify bytes (e.g., change the entry point)
5. **Save changes** with `Ctrl+S` / `Cmd+S`

### Example Workflow

```bash
# Compile a test program
gcc -o hello hello.c

# Open in VS Code
code hello

# Explore:
# - Click "ELF Header" → see the 64-byte header highlighted
# - Click "Program Headers" → inspect loadable segments
# - Click ".text" section → view code bytes
# - Click a symbol → see its location in the binary
```

## Supported Formats

| Format | Byte Order | Architectures |
|--------|-----------|---------------|
| **ELF32** | Little-endian (LE) | x86, ARM, RISC-V, MIPS, etc. |
| **ELF32** | Big-endian (BE) | SPARC, PowerPC, MIPS BE |
| **ELF64** | Little-endian (LE) | x86_64, ARM64/AArch64, RISC-V |
| **ELF64** | Big-endian (BE) | SPARC64, PowerPC64 |

## License

MIT
