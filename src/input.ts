import process from "process";

function visibleLen(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

type SelPos = { line: number; col: number };

export async function readInput(promptStr: string): Promise<string | null> {
  if (!process.stdin.isTTY) {
    return new Promise((resolve) => {
      process.stdout.write(promptStr);
      let buf = "";
      const onData = (chunk: Buffer | string) => {
        buf += chunk.toString();
        const nl = buf.indexOf("\n");
        if (nl >= 0) {
          process.stdin.removeListener("data", onData);
          resolve(buf.slice(0, nl).trim());
        }
      };
      process.stdin.on("data", onData);
      process.stdin.resume();
    });
  }

  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();

    stdout.write("\x1b[?2004h"); // enable bracketed paste

    const lines: string[] = [""];
    let cursorLine = 0;
    let cursorCol = 0;
    let selAnchor: SelPos | null = null; // selection anchor; cursor is the active end

    // Track actual terminal rows (not logical lines) so line-wrap doesn't break cursor math.
    let prevTermRows = 0;
    let cursorRowAfterRender = 0; // 0-indexed terminal row where cursor sits after render

    let lastEscTime = 0;
    let inPaste = false;

    const promptLen = visibleLen(promptStr);
    const indent = " ".repeat(promptLen);

    // How many terminal rows does logical line idx occupy?
    function lineTermRows(idx: number, available: number, tw: number): number {
      const len = lines[idx].length;
      if (len <= available) return 1;
      return 1 + Math.ceil((len - available) / tw);
    }

    // Normalize anchor + cursor into an ordered {start, end}, or null if empty/none.
    function selRange(): { start: SelPos; end: SelPos } | null {
      if (!selAnchor) return null;
      const cur: SelPos = { line: cursorLine, col: cursorCol };
      if (selAnchor.line === cur.line && selAnchor.col === cur.col) return null;
      const aFirst =
        selAnchor.line < cur.line ||
        (selAnchor.line === cur.line && selAnchor.col < cur.col);
      return aFirst
        ? { start: selAnchor, end: cur }
        : { start: cur, end: selAnchor };
    }

    // Return line content with reverse-video ANSI applied to the selected portion.
    function lineContent(idx: number): string {
      const content = lines[idx];
      const sel = selRange();
      if (!sel || sel.end.line < idx || sel.start.line > idx) return content;

      const hlStart = sel.start.line < idx ? 0                : sel.start.col;
      const hlEnd   = sel.end.line   > idx ? content.length   : sel.end.col;
      if (hlStart >= hlEnd) return content;

      return (
        content.slice(0, hlStart) +
        "\x1b[7m" + content.slice(hlStart, hlEnd) + "\x1b[27m" +
        content.slice(hlEnd)
      );
    }

    // Delete the selected region, place cursor at selection start, clear anchor.
    function deleteSelection(): void {
      const sel = selRange();
      if (!sel) { selAnchor = null; return; }
      const { start, end } = sel;
      if (start.line === end.line) {
        lines[start.line] =
          lines[start.line].slice(0, start.col) + lines[start.line].slice(end.col);
      } else {
        const before = lines[start.line].slice(0, start.col);
        const after  = lines[end.line].slice(end.col);
        lines.splice(start.line, end.line - start.line + 1, before + after);
      }
      cursorLine = start.line;
      cursorCol  = start.col;
      selAnchor  = null;
    }

    function render(): void {
      const tw = process.stdout.columns || 80;
      const available = Math.max(1, tw - promptLen);

      let totalTermRows = 0;
      for (let i = 0; i < lines.length; i++) {
        totalTermRows += lineTermRows(i, available, tw);
      }

      // Jump back to the top of the input area from wherever the cursor is
      if (cursorRowAfterRender > 0) stdout.write(`\x1b[${cursorRowAfterRender}A`);
      stdout.write("\r");

      // Redraw every logical line (reset attrs before clearing to avoid highlight bleed)
      for (let i = 0; i < lines.length; i++) {
        stdout.write("\x1b[0m\x1b[2K\r");
        stdout.write(i === 0 ? promptStr + lineContent(i) : indent + lineContent(i));
        // Clear to EOL on the last terminal row of this logical line so that
        // leftover characters from a previously longer/wrapped version don't remain.
        stdout.write("\x1b[K");
        if (i < lines.length - 1) stdout.write("\n");
      }

      // Erase leftover terminal rows from a previous longer render
      const extra = prevTermRows - totalTermRows;
      for (let j = 0; j < extra; j++) stdout.write("\n\x1b[0m\x1b[2K\r");
      if (extra > 0) stdout.write(`\x1b[${extra}A`);

      // Reset attrs, land at col 1 of the last content terminal row
      stdout.write("\x1b[0m\r");
      prevTermRows = totalTermRows;

      // ── Cursor positioning ────────────────────────────────────────────
      let cursorTermRow = 0;
      for (let i = 0; i < cursorLine; i++) cursorTermRow += lineTermRows(i, available, tw);
      if (cursorCol > available) {
        cursorTermRow += 1 + Math.floor((cursorCol - available) / tw);
      }

      const cursorTermCol =
        cursorCol <= available
          ? promptLen + cursorCol
          : (cursorCol - available) % tw;

      const up = totalTermRows - 1 - cursorTermRow;
      if (up > 0) stdout.write(`\x1b[${up}A`);
      stdout.write(`\x1b[${cursorTermCol + 1}G`); // 1-indexed

      cursorRowAfterRender = cursorTermRow;
    }

    function insertChar(ch: string): void {
      lines[cursorLine] =
        lines[cursorLine].slice(0, cursorCol) + ch + lines[cursorLine].slice(cursorCol);
      cursorCol++;
    }

    function insertNewline(): void {
      const cur = lines[cursorLine];
      lines[cursorLine] = cur.slice(0, cursorCol);
      lines.splice(cursorLine + 1, 0, cur.slice(cursorCol));
      cursorLine++;
      cursorCol = 0;
    }

    function deleteWordBack(): void {
      if (cursorCol > 0) {
        const line = lines[cursorLine];
        let j = cursorCol;
        while (j > 0 && line[j - 1] === " ") j--;
        while (j > 0 && line[j - 1] !== " ") j--;
        lines[cursorLine] = line.slice(0, j) + line.slice(cursorCol);
        cursorCol = j;
      } else if (cursorLine > 0) {
        const prevLen = lines[cursorLine - 1].length;
        lines[cursorLine - 1] += lines[cursorLine];
        lines.splice(cursorLine, 1);
        cursorLine--;
        cursorCol = prevLen;
      }
    }

    function cleanup(): void {
      stdout.write("\x1b[?2004l");
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
    }

    function submit(): void {
      selAnchor = null;
      const down = prevTermRows - 1 - cursorRowAfterRender;
      if (down > 0) stdout.write(`\x1b[${down}B`);
      stdout.write("\x1b[0m\r\n");
      cleanup();
      resolve(lines.join("\n"));
    }

    function onData(data: string): void {
      let i = 0;
      let needRender = false;

      while (i < data.length) {
        const rem = data.slice(i);

        // Bracketed paste start — delete any active selection first, then insert at cursor
        if (rem.startsWith("\x1b[200~")) {
          if (selAnchor !== null) deleteSelection();
          inPaste = true;
          i += 6;
          continue;
        }
        if (rem.startsWith("\x1b[201~")) { inPaste = false; needRender = true; i += 6; continue; }

        const ch = data[i];

        // Ctrl+C / Ctrl+D → exit
        if (ch === "\x03" || ch === "\x04") {
          cleanup();
          stdout.write("\n");
          resolve(null);
          return;
        }

        // CR (Enter) → submit outside paste; new line inside paste
        if (ch === "\r") {
          if (inPaste) { insertNewline(); i++; continue; }
          submit();
          return;
        }

        // LF (Ctrl+J) → always insert new line
        if (ch === "\n") {
          if (!inPaste && selAnchor !== null) deleteSelection();
          insertNewline();
          if (!inPaste) needRender = true;
          i++;
          continue;
        }

        if (ch === "\x1b") {
          // Meta/Option+Enter → new line
          if (rem.startsWith("\x1b\r") || rem.startsWith("\x1b\n")) {
            if (selAnchor !== null) deleteSelection();
            insertNewline();
            needRender = true;
            i += 2;
            continue;
          }

          // Option+Backspace → delete selection if any, otherwise delete word back
          if (rem.startsWith("\x1b\x7f") || rem.startsWith("\x1b\b")) {
            if (selAnchor !== null) deleteSelection(); else deleteWordBack();
            needRender = true;
            i += 2;
            continue;
          }

          // ── CSI sequences (\x1b[...) ──────────────────────────────────
          if (rem.startsWith("\x1b[")) {

            // ── SELECT TO END OF BUFFER: Shift+Ctrl/Alt+Down (6 chars) ──
            if (rem.startsWith("\x1b[1;6B") || rem.startsWith("\x1b[1;4B")) {
              if (!selAnchor) selAnchor = { line: cursorLine, col: cursorCol };
              cursorLine = lines.length - 1; cursorCol = lines[cursorLine].length;
              needRender = true; i += 6; continue;
            }
            // Shift+Meta/Cmd+Down (7 chars, modifier=10)
            if (rem.startsWith("\x1b[1;10B")) {
              if (!selAnchor) selAnchor = { line: cursorLine, col: cursorCol };
              cursorLine = lines.length - 1; cursorCol = lines[cursorLine].length;
              needRender = true; i += 7; continue;
            }

            // ── SELECT TO START OF BUFFER: Shift+Ctrl/Alt+Up (6 chars) ──
            if (rem.startsWith("\x1b[1;6A") || rem.startsWith("\x1b[1;4A")) {
              if (!selAnchor) selAnchor = { line: cursorLine, col: cursorCol };
              cursorLine = 0; cursorCol = 0;
              needRender = true; i += 6; continue;
            }
            // Shift+Meta/Cmd+Up (7 chars, modifier=10)
            if (rem.startsWith("\x1b[1;10A")) {
              if (!selAnchor) selAnchor = { line: cursorLine, col: cursorCol };
              cursorLine = 0; cursorCol = 0;
              needRender = true; i += 7; continue;
            }

            // ── EXTEND SELECTION one step ──────────────────────────────
            if (rem.startsWith("\x1b[1;2B")) { // Shift+Down
              if (!selAnchor) selAnchor = { line: cursorLine, col: cursorCol };
              if (cursorLine < lines.length - 1) { cursorLine++; cursorCol = Math.min(cursorCol, lines[cursorLine].length); }
              needRender = true; i += 6; continue;
            }
            if (rem.startsWith("\x1b[1;2A")) { // Shift+Up
              if (!selAnchor) selAnchor = { line: cursorLine, col: cursorCol };
              if (cursorLine > 0) { cursorLine--; cursorCol = Math.min(cursorCol, lines[cursorLine].length); }
              needRender = true; i += 6; continue;
            }
            if (rem.startsWith("\x1b[1;2C")) { // Shift+Right
              if (!selAnchor) selAnchor = { line: cursorLine, col: cursorCol };
              if (cursorCol < lines[cursorLine].length) cursorCol++;
              else if (cursorLine < lines.length - 1) { cursorLine++; cursorCol = 0; }
              needRender = true; i += 6; continue;
            }
            if (rem.startsWith("\x1b[1;2D")) { // Shift+Left
              if (!selAnchor) selAnchor = { line: cursorLine, col: cursorCol };
              if (cursorCol > 0) cursorCol--;
              else if (cursorLine > 0) { cursorLine--; cursorCol = lines[cursorLine].length; }
              needRender = true; i += 6; continue;
            }
            if (rem.startsWith("\x1b[1;2F")) { // Shift+End → extend to end of line
              if (!selAnchor) selAnchor = { line: cursorLine, col: cursorCol };
              cursorCol = lines[cursorLine].length;
              needRender = true; i += 6; continue;
            }
            if (rem.startsWith("\x1b[1;2H")) { // Shift+Home → extend to start of line
              if (!selAnchor) selAnchor = { line: cursorLine, col: cursorCol };
              cursorCol = 0;
              needRender = true; i += 6; continue;
            }

            // ── PLAIN NAVIGATION (clears selection) ───────────────────
            if (rem.startsWith("\x1b[A")) { // up
              selAnchor = null;
              if (cursorLine > 0) { cursorLine--; cursorCol = Math.min(cursorCol, lines[cursorLine].length); }
              needRender = true; i += 3; continue;
            }
            if (rem.startsWith("\x1b[B")) { // down
              selAnchor = null;
              if (cursorLine < lines.length - 1) { cursorLine++; cursorCol = Math.min(cursorCol, lines[cursorLine].length); }
              needRender = true; i += 3; continue;
            }
            if (rem.startsWith("\x1b[C")) { // right
              selAnchor = null;
              if (cursorCol < lines[cursorLine].length) cursorCol++;
              else if (cursorLine < lines.length - 1) { cursorLine++; cursorCol = 0; }
              needRender = true; i += 3; continue;
            }
            if (rem.startsWith("\x1b[D")) { // left
              selAnchor = null;
              if (cursorCol > 0) cursorCol--;
              else if (cursorLine > 0) { cursorLine--; cursorCol = lines[cursorLine].length; }
              needRender = true; i += 3; continue;
            }
            if (rem.startsWith("\x1b[H")) { selAnchor = null; cursorCol = 0; needRender = true; i += 3; continue; }
            if (rem.startsWith("\x1b[F")) { selAnchor = null; cursorCol = lines[cursorLine].length; needRender = true; i += 3; continue; }
            if (rem.startsWith("\x1b[3~")) { // forward delete
              if (selAnchor !== null) {
                deleteSelection();
              } else if (cursorCol < lines[cursorLine].length) {
                lines[cursorLine] = lines[cursorLine].slice(0, cursorCol) + lines[cursorLine].slice(cursorCol + 1);
              } else if (cursorLine < lines.length - 1) {
                lines[cursorLine] += lines[cursorLine + 1];
                lines.splice(cursorLine + 1, 1);
              }
              needRender = true; i += 4; continue;
            }
            // Skip unknown CSI sequences
            const end = rem.slice(2).search(/[A-Za-z~]/);
            i += end >= 0 ? end + 3 : 2;
            continue;
          }

          // ── SS3 sequences (\x1bO...) — clear selection on navigation ──
          if (rem.startsWith("\x1bO")) {
            if (rem.startsWith("\x1bOH")) { selAnchor = null; cursorCol = 0; needRender = true; i += 3; continue; }
            if (rem.startsWith("\x1bOF")) { selAnchor = null; cursorCol = lines[cursorLine].length; needRender = true; i += 3; continue; }
            if (rem.startsWith("\x1bOA")) {
              selAnchor = null;
              if (cursorLine > 0) { cursorLine--; cursorCol = Math.min(cursorCol, lines[cursorLine].length); }
              needRender = true; i += 3; continue;
            }
            if (rem.startsWith("\x1bOB")) {
              selAnchor = null;
              if (cursorLine < lines.length - 1) { cursorLine++; cursorCol = Math.min(cursorCol, lines[cursorLine].length); }
              needRender = true; i += 3; continue;
            }
            if (rem.startsWith("\x1bOC")) {
              selAnchor = null;
              if (cursorCol < lines[cursorLine].length) cursorCol++;
              else if (cursorLine < lines.length - 1) { cursorLine++; cursorCol = 0; }
              needRender = true; i += 3; continue;
            }
            if (rem.startsWith("\x1bOD")) {
              selAnchor = null;
              if (cursorCol > 0) cursorCol--;
              else if (cursorLine > 0) { cursorLine--; cursorCol = lines[cursorLine].length; }
              needRender = true; i += 3; continue;
            }
            i += 3; continue;
          }

          // ── Lone ESC ──────────────────────────────────────────────────
          // Single tap: clear selection only
          // Double tap (within 400 ms): clear all input
          const now = Date.now();
          if (now - lastEscTime < 400) {
            lines.length = 1;
            lines[0] = "";
            cursorLine = 0;
            cursorCol = 0;
            selAnchor = null;
          } else {
            selAnchor = null; // cancel selection without touching text
          }
          lastEscTime = now;
          needRender = true;
          i++;
          continue;
        }

        // Backspace — delete selection if any, otherwise delete char/merge line
        if (ch === "\x7f" || ch === "\b") {
          if (selAnchor !== null) {
            deleteSelection();
          } else if (cursorCol > 0) {
            lines[cursorLine] = lines[cursorLine].slice(0, cursorCol - 1) + lines[cursorLine].slice(cursorCol);
            cursorCol--;
          } else if (cursorLine > 0) {
            const prevLen = lines[cursorLine - 1].length;
            lines[cursorLine - 1] += lines[cursorLine];
            lines.splice(cursorLine, 1);
            cursorLine--;
            cursorCol = prevLen;
          }
          needRender = true; i++; continue;
        }

        // Ctrl+W — delete selection if any, otherwise delete word back
        if (ch === "\x17") {
          if (selAnchor !== null) deleteSelection(); else deleteWordBack();
          needRender = true; i++; continue;
        }

        // Printable character (including multi-byte UTF-8)
        if (ch.charCodeAt(0) >= 32 || ch > "\x7f") {
          if (!inPaste && selAnchor !== null) deleteSelection();
          insertChar(ch);
          if (!inPaste) needRender = true;
          i++;
          continue;
        }

        i++; // skip other control characters
      }

      if (needRender) render();
    }

    stdin.on("data", onData);
    render();
  });
}
