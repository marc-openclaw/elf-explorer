import * as vscode from 'vscode';
import * as fs from 'fs';

const BYTES_PER_ROW = 16;

// Events
const _onDidOpenFile = new vscode.EventEmitter<vscode.Uri>();
export const onDidOpenFile = _onDidOpenFile.event;

const _onDidEditFile = new vscode.EventEmitter<{ uri: vscode.Uri; data: Buffer }>();
export const onDidEditFile = _onDidEditFile.event;

// --- Custom Document with edit support ---

class ElfDocument implements vscode.CustomDocument {
  uri: vscode.Uri;
  data: Buffer;
  private _edits: Array<{ offset: number; oldValue: number; newValue: number }> = [];
  private _savedEditCount = 0;

  private readonly _onDidDispose = new vscode.EventEmitter<void>();
  readonly onDidDispose = this._onDidDispose.event;

  constructor(uri: vscode.Uri) {
    this.uri = uri;
    this.data = fs.readFileSync(uri.fsPath);
  }

  dispose(): void {
    this._onDidDispose.fire();
    this._onDidDispose.dispose();
  }

  applyEdit(offset: number, newValue: number): { oldValue: number } {
    const oldValue = this.data[offset];
    this.data[offset] = newValue;
    this._edits.push({ offset, oldValue, newValue });
    return { oldValue };
  }

  undoEdit(): { offset: number; value: number } | undefined {
    const edit = this._edits.pop();
    if (edit) {
      this.data[edit.offset] = edit.oldValue;
      return { offset: edit.offset, value: edit.oldValue };
    }
    return undefined;
  }

  get isDirty(): boolean {
    return this._edits.length !== this._savedEditCount;
  }

  save(): void {
    fs.writeFileSync(this.uri.fsPath, this.data);
    this._savedEditCount = this._edits.length;
  }

  saveAs(target: vscode.Uri): void {
    fs.writeFileSync(target.fsPath, this.data);
  }
}

// --- Hex Editor Provider ---

export class ElfHexEditorProvider implements vscode.CustomEditorProvider<ElfDocument> {
  public static readonly viewType = 'elfExplorer.hexView';

  private static activeWebview: vscode.Webview | undefined;
  private static activeDocument: ElfDocument | undefined;

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<ElfDocument>>();
  readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new ElfHexEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(
      ElfHexEditorProvider.viewType,
      provider,
      { supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: true } }
    );
  }

  async openCustomDocument(uri: vscode.Uri): Promise<ElfDocument> {
    return new ElfDocument(uri);
  }

  async resolveCustomEditor(
    document: ElfDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    ElfHexEditorProvider.activeWebview = webviewPanel.webview;
    ElfHexEditorProvider.activeDocument = document;

    webviewPanel.webview.options = { enableScripts: true };
    webviewPanel.webview.html = this.getHtmlForWebview(document.data);

    _onDidOpenFile.fire(document.uri);

    // Handle messages from webview
    webviewPanel.webview.onDidReceiveMessage(msg => {
      if (msg.type === 'edit') {
        const { offset, newValue } = msg;
        const { oldValue } = document.applyEdit(offset, newValue);

        // Fire edit event for undo/redo
        this._onDidChangeCustomDocument.fire({
          document,
          undo: async () => {
            document.undoEdit();
            webviewPanel.webview.postMessage({ type: 'updateByte', offset, value: oldValue });
            _onDidEditFile.fire({ uri: document.uri, data: document.data });
          },
          redo: async () => {
            document.applyEdit(offset, newValue);
            webviewPanel.webview.postMessage({ type: 'updateByte', offset, value: newValue });
            _onDidEditFile.fire({ uri: document.uri, data: document.data });
          },
        });

        // Notify tree to refresh
        _onDidEditFile.fire({ uri: document.uri, data: document.data });
      }
    });

    webviewPanel.onDidDispose(() => {
      if (ElfHexEditorProvider.activeDocument === document) {
        ElfHexEditorProvider.activeWebview = undefined;
        ElfHexEditorProvider.activeDocument = undefined;
      }
    });

    webviewPanel.onDidChangeViewState(() => {
      if (webviewPanel.active) {
        ElfHexEditorProvider.activeWebview = webviewPanel.webview;
        ElfHexEditorProvider.activeDocument = document;
        _onDidOpenFile.fire(document.uri);
      }
    });
  }

  async saveCustomDocument(document: ElfDocument): Promise<void> {
    document.save();
  }

  async saveCustomDocumentAs(document: ElfDocument, destination: vscode.Uri): Promise<void> {
    document.saveAs(destination);
  }

  async revertCustomDocument(document: ElfDocument): Promise<void> {
    // Re-read from disk
    document.data = fs.readFileSync(document.uri.fsPath);
    if (ElfHexEditorProvider.activeDocument === document && ElfHexEditorProvider.activeWebview) {
      ElfHexEditorProvider.activeWebview.html = this.getHtmlForWebview(document.data);
    }
    _onDidEditFile.fire({ uri: document.uri, data: document.data });
  }

  async backupCustomDocument(document: ElfDocument, context: vscode.CustomDocumentBackupContext): Promise<vscode.CustomDocumentBackup> {
    fs.writeFileSync(context.destination.fsPath, document.data);
    return { id: context.destination.toString(), delete: () => fs.unlinkSync(context.destination.fsPath) };
  }

  static highlightRange(offset: number, size: number): void {
    if (ElfHexEditorProvider.activeWebview) {
      ElfHexEditorProvider.activeWebview.postMessage({ type: 'highlight', offset, size });
    }
  }

  /** Read bytes from the active document as hex string */
  static readBytes(offset: number, size: number): string | undefined {
    if (!ElfHexEditorProvider.activeDocument) return undefined;
    const buf = ElfHexEditorProvider.activeDocument.data.subarray(offset, offset + size);
    return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /** Write bytes to the active document and update webview */
  static writeBytes(offset: number, bytes: number[]): void {
    const doc = ElfHexEditorProvider.activeDocument;
    const webview = ElfHexEditorProvider.activeWebview;
    if (!doc || !webview) return;

    for (let i = 0; i < bytes.length; i++) {
      doc.applyEdit(offset + i, bytes[i]);
      webview.postMessage({ type: 'updateByte', offset: offset + i, value: bytes[i] });
    }
    _onDidEditFile.fire({ uri: doc.uri, data: doc.data });
  }

  private getHtmlForWebview(data: Buffer): string {
    const base64 = data.toString('base64');

    return /*html*/`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root {
    --cell-size: calc(var(--vscode-editor-font-size, 13px) * 1.6);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { padding: 0; overflow: hidden; }
  body {
    margin: 0; padding: 0;
    font-size: var(--vscode-editor-font-size, 13px);
    font-family: var(--vscode-editor-font-family, 'Consolas', 'Courier New', monospace);
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    overflow: hidden; height: 100vh; width: 100vw;
  }
  .container { display: flex; flex-direction: column; height: 100vh; width: 100vw; }
  .header {
    font-weight: bold;
    color: var(--vscode-editorLineNumber-activeForeground, var(--vscode-editorLineNumber-foreground));
    white-space: nowrap; display: flex; align-items: center;
    height: var(--cell-size); flex-shrink: 0; user-select: none;
  }
  .address {
    color: var(--vscode-editorLineNumber-foreground, #858585);
    text-transform: uppercase; line-height: var(--cell-size);
    font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
  }
  .cell-group {
    padding: 0 calc(var(--cell-size) / 4);
    display: inline-flex; cursor: default; user-select: text;
  }
  .data-cell {
    font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
    width: var(--cell-size); height: var(--cell-size); line-height: var(--cell-size);
    text-align: center; display: inline-block; user-select: none; text-transform: uppercase;
    border-radius: 2px; cursor: pointer;
  }
  .data-cell-char { width: calc(var(--cell-size) * 0.7); text-transform: none; }
  .non-graphic { color: var(--vscode-tab-unfocusedInactiveForeground, #666); }
  .data-cell-hovered { background: var(--vscode-editor-hoverHighlightBackground, rgba(255,255,255,0.05)); }
  .data-cell-selected {
    background: var(--vscode-editor-selectionBackground, rgba(38,79,120,0.7));
    color: var(--vscode-editor-selectionForeground, #fff);
  }
  .data-cell-selected-inactive {
    background: var(--vscode-editor-inactiveSelectionBackground, rgba(38,79,120,0.4));
  }
  .data-cell-editing {
    outline: 2px solid var(--vscode-editorCursor-foreground, #fff);
    outline-offset: -1px;
    background: var(--vscode-editor-selectionBackground, rgba(38,79,120,0.7));
    color: var(--vscode-editor-selectionForeground, #fff);
  }
  .data-cell-modified {
    background: var(--vscode-minimapGutter-modifiedBackground, rgba(12,125,157,0.6));
  }
  .scroll-area { flex: 1; overflow-y: auto; overflow-x: hidden; }
  .virtual-content { position: relative; }
  .data-row { position: absolute; left: 0; top: 0; display: flex; white-space: nowrap; }
</style>
</head>
<body>
<div class="container">
  <div class="header" id="header"></div>
  <div class="scroll-area" id="scroll-area">
    <div class="virtual-content" id="virtual-content"></div>
  </div>
</div>
<script>
(function() {
  const base64 = ${JSON.stringify(base64)};
  const raw = atob(base64);
  const fileSize = raw.length;
  const COLS = ${BYTES_PER_ROW};
  const totalRows = Math.ceil(fileSize / COLS);

  // Mutable byte array
  const bytes = new Uint8Array(fileSize);
  for (let i = 0; i < fileSize; i++) bytes[i] = raw.charCodeAt(i);

  const modifiedOffsets = new Set();
  const vscodeApi = acquireVsCodeApi();

  let cellH = 0;
  function measureCellHeight() {
    const tmp = document.createElement('span');
    tmp.className = 'data-cell'; tmp.textContent = '00';
    tmp.style.position = 'absolute'; tmp.style.visibility = 'hidden';
    document.body.appendChild(tmp);
    cellH = tmp.offsetHeight || 21;
    document.body.removeChild(tmp);
  }
  measureCellHeight();

  // Header
  const header = document.getElementById('header');
  const addrPH = document.createElement('div');
  addrPH.className = 'cell-group'; addrPH.style.visibility = 'hidden'; addrPH.setAttribute('aria-hidden','true');
  const addrS = document.createElement('span'); addrS.className = 'address'; addrS.textContent = '00000000';
  addrPH.appendChild(addrS); header.appendChild(addrPH);

  const hexH = document.createElement('div'); hexH.className = 'cell-group';
  for (let i = 0; i < COLS; i++) {
    const c = document.createElement('span'); c.className = 'data-cell';
    c.textContent = (i&0xff).toString(16).toUpperCase().padStart(2,'0');
    hexH.appendChild(c);
  }
  header.appendChild(hexH);

  const txtH = document.createElement('div'); txtH.className = 'cell-group';
  txtH.style.width = 'calc(var(--cell-size) * '+(COLS*0.7)+')'; txtH.style.flexShrink = '0';
  txtH.textContent = 'Decoded Text'; header.appendChild(txtH);

  // Virtual scroll
  const scrollArea = document.getElementById('scroll-area');
  const virtualContent = document.getElementById('virtual-content');
  virtualContent.style.height = (totalRows * cellH) + 'px';

  const BUFFER = 30;
  let renderedRows = {}, renderedRange = {start:-1,end:-1};
  let highlightStart = -1, highlightEnd = -1;
  let hoveredEls = [];
  let hexCells = {}, charCells = {};

  // Editing state
  let editingOffset = -1;
  let editNibble = 0; // 0 = high nibble, 1 = low nibble
  let editingEl = null;

  function isHighlighted(o) { return o >= highlightStart && o < highlightEnd; }

  function updateCellContent(offset) {
    const b = bytes[offset];
    const hexEl = hexCells[offset];
    const charEl = charCells[offset];
    if (hexEl) {
      hexEl.textContent = b.toString(16).toUpperCase().padStart(2,'0');
      if (modifiedOffsets.has(offset)) hexEl.classList.add('data-cell-modified');
    }
    if (charEl) {
      if (b >= 0x20 && b <= 0x7e) {
        charEl.textContent = String.fromCharCode(b);
        charEl.classList.remove('non-graphic');
      } else {
        charEl.textContent = '.';
        charEl.classList.add('non-graphic');
      }
      if (modifiedOffsets.has(offset)) charEl.classList.add('data-cell-modified');
    }
  }

  function startEdit(offset) {
    stopEdit();
    editingOffset = offset;
    editNibble = 0;
    const el = hexCells[offset];
    if (el) {
      el.classList.add('data-cell-editing');
      editingEl = el;
    }
  }

  function stopEdit() {
    if (editingEl) {
      editingEl.classList.remove('data-cell-editing');
      editingEl = null;
    }
    editingOffset = -1;
    editNibble = 0;
  }

  function renderRow(rowIdx) {
    const startByte = rowIdx * COLS;
    const row = document.createElement('div');
    row.className = 'data-row'; row.style.top = (rowIdx * cellH) + 'px';

    const ag = document.createElement('div'); ag.className = 'cell-group';
    const addr = document.createElement('span'); addr.className = 'address';
    addr.textContent = startByte.toString(16).toUpperCase().padStart(8,'0');
    ag.appendChild(addr); row.appendChild(ag);

    const hg = document.createElement('div'); hg.className = 'cell-group';
    for (let i = startByte; i < startByte + COLS; i++) {
      const c = document.createElement('span'); c.className = 'data-cell';
      if (i < fileSize) {
        c.textContent = bytes[i].toString(16).toUpperCase().padStart(2,'0');
        c.dataset.offset = String(i);
        hexCells[i] = c;
        if (isHighlighted(i)) c.classList.add('data-cell-selected');
        if (modifiedOffsets.has(i)) c.classList.add('data-cell-modified');
        if (i === editingOffset) c.classList.add('data-cell-editing');
        c.addEventListener('mouseenter', () => onHover(i));
        c.addEventListener('mouseleave', () => onUnhover());
        c.addEventListener('click', () => startEdit(i));
      } else {
        c.textContent = '  '; c.style.visibility = 'hidden';
      }
      hg.appendChild(c);
    }
    row.appendChild(hg);

    const cg = document.createElement('div'); cg.className = 'cell-group';
    for (let i = startByte; i < startByte + COLS; i++) {
      const c = document.createElement('span'); c.className = 'data-cell data-cell-char';
      if (i < fileSize) {
        const b = bytes[i];
        if (b >= 0x20 && b <= 0x7e) { c.textContent = String.fromCharCode(b); }
        else { c.textContent = '.'; c.classList.add('non-graphic'); }
        c.dataset.offset = String(i);
        charCells[i] = c;
        if (isHighlighted(i)) c.classList.add('data-cell-selected-inactive');
        if (modifiedOffsets.has(i)) c.classList.add('data-cell-modified');
        c.addEventListener('mouseenter', () => onHover(i));
        c.addEventListener('mouseleave', () => onUnhover());
        c.addEventListener('click', () => startEdit(i));
      } else { c.textContent = ' '; c.style.visibility = 'hidden'; }
      cg.appendChild(c);
    }
    row.appendChild(cg);
    return row;
  }

  function onHover(offset) {
    onUnhover();
    [hexCells[offset], charCells[offset]].forEach(el => {
      if (el && !el.classList.contains('data-cell-selected') && !el.classList.contains('data-cell-selected-inactive')) {
        el.classList.add('data-cell-hovered'); hoveredEls.push(el);
      }
    });
  }
  function onUnhover() { hoveredEls.forEach(el => el.classList.remove('data-cell-hovered')); hoveredEls = []; }

  function updateVirtual() {
    const st = scrollArea.scrollTop, vh = scrollArea.clientHeight;
    const first = Math.max(0, Math.floor(st/cellH) - BUFFER);
    const last = Math.min(totalRows-1, Math.ceil((st+vh)/cellH) + BUFFER);
    if (first === renderedRange.start && last === renderedRange.end) return;

    for (let r = renderedRange.start; r <= renderedRange.end; r++) {
      if (r < first || r > last) {
        if (renderedRows[r]) {
          renderedRows[r].remove();
          const s = r*COLS, e = Math.min(s+COLS, fileSize);
          for (let i=s;i<e;i++) { delete hexCells[i]; delete charCells[i]; }
          delete renderedRows[r];
        }
      }
    }
    const frag = document.createDocumentFragment();
    for (let r = first; r <= last; r++) {
      if (!renderedRows[r]) { const el = renderRow(r); renderedRows[r] = el; frag.appendChild(el); }
    }
    virtualContent.appendChild(frag);
    renderedRange = {start:first, end:last};
  }

  scrollArea.addEventListener('scroll', updateVirtual, {passive:true});
  window.addEventListener('resize', () => {
    measureCellHeight(); virtualContent.style.height = (totalRows*cellH)+'px';
    renderedRange = {start:-1,end:-1}; updateVirtual();
  });
  updateVirtual();

  // Keyboard input for editing
  document.addEventListener('keydown', e => {
    if (editingOffset < 0) return;

    // Escape cancels edit
    if (e.key === 'Escape') { stopEdit(); return; }

    // Arrow keys move editing cursor
    if (e.key === 'ArrowRight') { e.preventDefault(); if (editingOffset < fileSize-1) startEdit(editingOffset+1); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); if (editingOffset > 0) startEdit(editingOffset-1); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); if (editingOffset+COLS < fileSize) startEdit(editingOffset+COLS); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (editingOffset-COLS >= 0) startEdit(editingOffset-COLS); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      const next = e.shiftKey ? editingOffset - 1 : editingOffset + 1;
      if (next >= 0 && next < fileSize) startEdit(next);
      return;
    }

    // Hex digit input
    const hexDigit = parseInt(e.key, 16);
    if (!isNaN(hexDigit) && e.key.length === 1) {
      e.preventDefault();
      const oldByte = bytes[editingOffset];
      let newByte;
      if (editNibble === 0) {
        newByte = (hexDigit << 4) | (oldByte & 0x0f);
        editNibble = 1;
      } else {
        newByte = (oldByte & 0xf0) | hexDigit;
        editNibble = 0;
      }
      bytes[editingOffset] = newByte;
      modifiedOffsets.add(editingOffset);
      updateCellContent(editingOffset);

      // Notify extension
      vscodeApi.postMessage({ type: 'edit', offset: editingOffset, newValue: newByte });

      // Auto-advance after both nibbles
      if (editNibble === 0 && editingOffset < fileSize - 1) {
        startEdit(editingOffset + 1);
      }
    }
  });

  // Click outside hex cells to deselect
  document.addEventListener('click', e => {
    if (!e.target.classList.contains('data-cell')) stopEdit();
  });

  // Messages from extension
  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.type === 'highlight') {
      // Clear ALL old highlights by iterating rendered cells
      const oldStart = highlightStart, oldEnd = highlightEnd;
      if (oldStart >= 0) {
        for (let i = oldStart; i < oldEnd && i < fileSize; i++) {
          const hx = hexCells[i], ch = charCells[i];
          if (hx) { hx.classList.remove('data-cell-selected'); }
          if (ch) { ch.classList.remove('data-cell-selected-inactive'); }
        }
      }

      highlightStart = msg.offset; highlightEnd = msg.offset + msg.size;

      for (let i = highlightStart; i < highlightEnd && i < fileSize; i++) {
        const hx = hexCells[i], ch = charCells[i];
        if (hx) { hx.classList.remove('data-cell-hovered'); hx.classList.add('data-cell-selected'); }
        if (ch) { ch.classList.remove('data-cell-hovered'); ch.classList.add('data-cell-selected-inactive'); }
      }
      const targetRow = Math.floor(highlightStart / COLS);
      scrollArea.scrollTop = Math.max(0, targetRow * cellH - scrollArea.clientHeight / 3);
    }
    if (msg.type === 'updateByte') {
      bytes[msg.offset] = msg.value;
      updateCellContent(msg.offset);
    }
  });
})();
</script>
</body>
</html>`;
  }
}
