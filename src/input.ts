import process from "process";
import chalk from "chalk";

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
    let selAnchor: SelPos | null = null;

    // Track actual terminal rows (not logical lines) so line-wrap doesn't break cursor math.
    let prevTermRows = 0;       // content rows from last render (excludes status bar)
    let cursorRowAfterRender = 0; // 0-indexed terminal row where cursor sits after render

    let lastEscTime = 0;
    let inPaste = false;

    const promptLen = visibleLen(promptStr);
    const indent = " ".repeat(promptLen);

    function lineTermRows(idx: number, available: number, tw: number): number {
      const len = lines[idx].length;
      if (len <= available) return 1;
      return 1 + Math.ceil((len - available) / tw);
    }

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

    function lineContent(idx: number): string {
      const content = lines[idx];
      const sel = selRange();
      if (!sel || sel.end.line < idx || sel.start.line > idx) return content;

      const hlStart = sel.start.line < idx ? 0              : sel.start.col;
      const hlEnd   = sel.end.line   > idx ? content.length : sel.end.col;
      if (hlStart >= hlEnd) return content;

      return (
        content.slice(0, hlStart) +
        "\x1b[7m" + content.slice(hlStart, hlEnd) + "\x1b[27m" +
        content.slice(hlEnd)
      );
    }

    function getStatusBar(): string {
      const sel = selRange();
      if (sel) {
        const n = sel.end.line - sel.start.line + 1;
        const info = n > 1 ? `${n} lines selected` : "selection active";
        return (
          chalk.bold.yellow(info) +
          chalk.dim("  ·  ⌫ delete  ·  type to replace  ·  ") +
          chalk.cyan("ESC") +
          chalk.dim(" cancel")
        );
      }
      return (
        chalk.dim("Enter ↵ send  ·  Ctrl+J new line  ·  ESC×2 clear  ·  ") +
        chalk.cyan("/keys") +
        chalk.dim(" for shortcuts")
      );
    }

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

      // Jump back to the top of the input area
      if (cursorRowAfterRender > 0) stdout.write(`\x1b[${cursorRowAfterRender}A`);
      stdout.write("\r");

      // Redraw every logical line
      for (let i = 0; i < lines.length; i++) {
        stdout.write("\x1b[0m\x1b[2K\r");
        stdout.write(i === 0 ? promptStr + lineContent(i) : indent + lineContent(i));
        // Clear to EOL so leftover chars from a previously longer/wrapped line don't remain
        stdout.write("\x1b[K");
        if (i < lines.length - 1) stdout.write("\n");
      }

      // Clear old content overflow AND the old status bar row.
      // totalClear covers: (rows that disappeared) + 1 for the old status bar line.
      const extra = prevTermRows - totalTermRows;
      const totalClear = Math.max(0, extra) + (prevTermRows > 0 ? 1 : 0);
      for (let j = 0; j < totalClear; j++) stdout.write("\n\x1b[0m\x1b[2K\r");
      if (totalClear > 0) stdout.write(`\x1b[${totalClear}A`);

      stdout.write("\x1b[0m\r");
      prevTermRows = totalTermRows;

      // ── Status bar (always 1 row below last content row) ──────────────
      stdout.write("\n\x1b[0m\x1b[2K\r  " + getStatusBar());

      // ── Cursor positioning ────────────────────────────────────────────
      // We are now on the status bar row (prevTermRows). Go up to cursorTermRow.
      let cursorTermRow = 0;
      for (let i = 0; i < cursorLine; i++) cursorTermRow += lineTermRows(i, available, tw);
      if (cursorCol > available) {
        cursorTermRow += 1 + Math.floor((cursorCol - available) / tw);
      }

      const cursorTermCol =
        cursorCol <= available
          ? promptLen + cursorCol
          : (cursorCol - available) % tw;

      const up = totalTermRows - cursorTermRow; // from status bar row up to cursorTermRow
      if (up > 0) stdout.write(`\x1b[${up}A`);
      stdout.write(`\x1b[${cursorTermCol + 1}G`);

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

    // Move to the status bar row and clear it, ready for a final newline.
    function goToStatusBar(): void {
      const down = prevTermRows - cursorRowAfterRender;
      if (down > 0) stdout.write(`\x1b[${down}B`);
      stdout.write("\x1b[0m\x1b[2K\r"); // clear status bar
    }

    function cleanup(): void {
      stdout.write("\x1b[?2004l");
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
    }

    function submit(): void {
      selAnchor = null;
      goToStatusBar();                 // cursor on cleared status bar row
      stdout.write("\x1b[1A\x1b[0m\r\n"); // up to last content row, then newline
      cleanup();
      resolve(lines.join("\n"));
    }

    function onData(data: string): void {
      let i = 0;
      let needRender = false;

      while (i < data.length) {
        const rem = data.slice(i);

        // Bracketed paste start — delete any active selection first
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
          goToStatusBar();
          stdout.write("\x1b[1A\x1b[0m\r\n");
          cleanup();
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

          // Option+Backspace → delete selection or word back
          if (rem.startsWith("\x1b\x7f") || rem.startsWith("\x1b\b")) {
            if (selAnchor !== null) deleteSelection(); else deleteWordBack();
            needRender = true;
            i += 2;
            continue;
          }

          // ── CSI sequences (\x1b[...) ──────────────────────────────────
          if (rem.startsWith("\x1b[")) {

            // SELECT TO END: Shift+Ctrl/Alt+Down (6 chars)
            if (rem.startsWith("\x1b[1;6B") || rem.startsWith("\x1b[1;4B")) {
              if (!selAnchor) selAnchor = { line: cursorLine, col: cursorCol };
              cursorLine = lines.length - 1; cursorCol = lines[cursorLine].length;
              needRender = true; i += 6; continue;
            }
            // Shift+Meta/Cmd+Down (7 chars)
            if (rem.startsWith("\x1b[1;10B")) {
              if (!selAnchor) selAnchor = { line: cursorLine, col: cursorCol };
              cursorLine = lines.length - 1; cursorCol = lines[cursorLine].length;
              needRender = true; i += 7; continue;
            }

            // SELECT TO START: Shift+Ctrl/Alt+Up (6 chars)
            if (rem.startsWith("\x1b[1;6A") || rem.startsWith("\x1b[1;4A")) {
              if (!selAnchor) selAnchor = { line: cursorLine, col: cursorCol };
              cursorLine = 0; cursorCol = 0;
              needRender = true; i += 6; continue;
            }
            // Shift+Meta/Cmd+Up (7 chars)
            if (rem.startsWith("\x1b[1;10A")) {
              if (!selAnchor) selAnchor = { line: cursorLine, col: cursorCol };
              cursorLine = 0; cursorCol = 0;
              needRender = true; i += 7; continue;
            }

            // EXTEND SELECTION one step
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
            if (rem.startsWith("\x1b[1;2F")) { // Shift+End
              if (!selAnchor) selAnchor = { line: cursorLine, col: cursorCol };
              cursorCol = lines[cursorLine].length;
              needRender = true; i += 6; continue;
            }
            if (rem.startsWith("\x1b[1;2H")) { // Shift+Home
              if (!selAnchor) selAnchor = { line: cursorLine, col: cursorCol };
              cursorCol = 0;
              needRender = true; i += 6; continue;
            }

            // PLAIN NAVIGATION (clears selection)
            if (rem.startsWith("\x1b[A")) { selAnchor = null; if (cursorLine > 0) { cursorLine--; cursorCol = Math.min(cursorCol, lines[cursorLine].length); } needRender = true; i += 3; continue; }
            if (rem.startsWith("\x1b[B")) { selAnchor = null; if (cursorLine < lines.length - 1) { cursorLine++; cursorCol = Math.min(cursorCol, lines[cursorLine].length); } needRender = true; i += 3; continue; }
            if (rem.startsWith("\x1b[C")) { selAnchor = null; if (cursorCol < lines[cursorLine].length) cursorCol++; else if (cursorLine < lines.length - 1) { cursorLine++; cursorCol = 0; } needRender = true; i += 3; continue; }
            if (rem.startsWith("\x1b[D")) { selAnchor = null; if (cursorCol > 0) cursorCol--; else if (cursorLine > 0) { cursorLine--; cursorCol = lines[cursorLine].length; } needRender = true; i += 3; continue; }
            if (rem.startsWith("\x1b[H")) { selAnchor = null; cursorCol = 0; needRender = true; i += 3; continue; }
            if (rem.startsWith("\x1b[F")) { selAnchor = null; cursorCol = lines[cursorLine].length; needRender = true; i += 3; continue; }
            if (rem.startsWith("\x1b[3~")) { // forward delete
              if (selAnchor !== null) { deleteSelection(); }
              else if (cursorCol < lines[cursorLine].length) { lines[cursorLine] = lines[cursorLine].slice(0, cursorCol) + lines[cursorLine].slice(cursorCol + 1); }
              else if (cursorLine < lines.length - 1) { lines[cursorLine] += lines[cursorLine + 1]; lines.splice(cursorLine + 1, 1); }
              needRender = true; i += 4; continue;
            }
            // Skip unknown CSI sequences
            const end = rem.slice(2).search(/[A-Za-z~]/);
            i += end >= 0 ? end + 3 : 2;
            continue;
          }

          // SS3 sequences — clear selection on navigation
          if (rem.startsWith("\x1bO")) {
            if (rem.startsWith("\x1bOH")) { selAnchor = null; cursorCol = 0; needRender = true; i += 3; continue; }
            if (rem.startsWith("\x1bOF")) { selAnchor = null; cursorCol = lines[cursorLine].length; needRender = true; i += 3; continue; }
            if (rem.startsWith("\x1bOA")) { selAnchor = null; if (cursorLine > 0) { cursorLine--; cursorCol = Math.min(cursorCol, lines[cursorLine].length); } needRender = true; i += 3; continue; }
            if (rem.startsWith("\x1bOB")) { selAnchor = null; if (cursorLine < lines.length - 1) { cursorLine++; cursorCol = Math.min(cursorCol, lines[cursorLine].length); } needRender = true; i += 3; continue; }
            if (rem.startsWith("\x1bOC")) { selAnchor = null; if (cursorCol < lines[cursorLine].length) cursorCol++; else if (cursorLine < lines.length - 1) { cursorLine++; cursorCol = 0; } needRender = true; i += 3; continue; }
            if (rem.startsWith("\x1bOD")) { selAnchor = null; if (cursorCol > 0) cursorCol--; else if (cursorLine > 0) { cursorLine--; cursorCol = lines[cursorLine].length; } needRender = true; i += 3; continue; }
            i += 3; continue;
          }

          // Lone ESC: single clears selection; double clears all input
          const now = Date.now();
          if (now - lastEscTime < 400) {
            lines.length = 1; lines[0] = "";
            cursorLine = 0; cursorCol = 0; selAnchor = null;
          } else {
            selAnchor = null;
          }
          lastEscTime = now;
          needRender = true;
          i++;
          continue;
        }

        // Backspace
        if (ch === "\x7f" || ch === "\b") {
          if (selAnchor !== null) { deleteSelection(); }
          else if (cursorCol > 0) { lines[cursorLine] = lines[cursorLine].slice(0, cursorCol - 1) + lines[cursorLine].slice(cursorCol); cursorCol--; }
          else if (cursorLine > 0) { const prevLen = lines[cursorLine - 1].length; lines[cursorLine - 1] += lines[cursorLine]; lines.splice(cursorLine, 1); cursorLine--; cursorCol = prevLen; }
          needRender = true; i++; continue;
        }

        // Ctrl+W — delete selection or word back
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

        i++;
      }

      if (needRender) render();
    }

    stdin.on("data", onData);
    render();
  });
}
