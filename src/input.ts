import process from "process";

function visibleLen(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

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

      // Redraw every logical line
      for (let i = 0; i < lines.length; i++) {
        stdout.write("\x1b[2K\r");
        stdout.write(i === 0 ? promptStr + lines[i] : indent + lines[i]);
        if (i < lines.length - 1) stdout.write("\n");
      }

      // Erase leftover terminal rows from a previous longer render
      const extra = prevTermRows - totalTermRows;
      for (let j = 0; j < extra; j++) stdout.write("\n\x1b[2K\r");
      if (extra > 0) stdout.write(`\x1b[${extra}A`);

      // Land at col 1 of the last content terminal row
      stdout.write("\r");
      prevTermRows = totalTermRows;

      // ── Cursor positioning ─────────────────────────────────────────────
      // Which terminal row (from top of input) should the cursor be on?
      let cursorTermRow = 0;
      for (let i = 0; i < cursorLine; i++) cursorTermRow += lineTermRows(i, available, tw);
      if (cursorCol > available) {
        cursorTermRow += 1 + Math.floor((cursorCol - available) / tw);
      }

      // Which column on that terminal row?
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
      // Move to the last terminal row of the input, then print newline
      const down = prevTermRows - 1 - cursorRowAfterRender;
      if (down > 0) stdout.write(`\x1b[${down}B`);
      stdout.write("\r\n");
      cleanup();
      resolve(lines.join("\n"));
    }

    function onData(data: string): void {
      let i = 0;
      let needRender = false;

      while (i < data.length) {
        const rem = data.slice(i);

        // Bracketed paste markers
        if (rem.startsWith("\x1b[200~")) { inPaste = true;  i += 6; continue; }
        if (rem.startsWith("\x1b[201~")) { inPaste = false; needRender = true; i += 6; continue; }

        const ch = data[i];

        // Ctrl+C / Ctrl+D → exit
        if (ch === "\x03" || ch === "\x04") {
          cleanup();
          stdout.write("\n");
          resolve(null);
          return;
        }

        // CR (Enter) → submit, but only outside paste
        if (ch === "\r") {
          if (inPaste) { insertNewline(); i++; continue; }
          submit();
          return;
        }

        // LF (Ctrl+J) → always insert new line (works as "new line" key universally)
        if (ch === "\n") {
          insertNewline();
          if (!inPaste) needRender = true;
          i++;
          continue;
        }

        if (ch === "\x1b") {
          // Meta/Option+Enter → new line (for terminals with Meta key configured)
          if (rem.startsWith("\x1b\r") || rem.startsWith("\x1b\n")) {
            insertNewline();
            needRender = true;
            i += 2;
            continue;
          }

          // Option+Backspace / Shift+Option+Delete → delete word backwards
          if (rem.startsWith("\x1b\x7f") || rem.startsWith("\x1b\b")) {
            deleteWordBack();
            needRender = true;
            i += 2;
            continue;
          }

          // CSI sequences (\x1b[...)
          if (rem.startsWith("\x1b[")) {
            if (rem.startsWith("\x1b[A")) { // up
              if (cursorLine > 0) { cursorLine--; cursorCol = Math.min(cursorCol, lines[cursorLine].length); }
              needRender = true; i += 3; continue;
            }
            if (rem.startsWith("\x1b[B")) { // down
              if (cursorLine < lines.length - 1) { cursorLine++; cursorCol = Math.min(cursorCol, lines[cursorLine].length); }
              needRender = true; i += 3; continue;
            }
            if (rem.startsWith("\x1b[C")) { // right
              if (cursorCol < lines[cursorLine].length) cursorCol++;
              else if (cursorLine < lines.length - 1) { cursorLine++; cursorCol = 0; }
              needRender = true; i += 3; continue;
            }
            if (rem.startsWith("\x1b[D")) { // left
              if (cursorCol > 0) cursorCol--;
              else if (cursorLine > 0) { cursorLine--; cursorCol = lines[cursorLine].length; }
              needRender = true; i += 3; continue;
            }
            if (rem.startsWith("\x1b[H")) { cursorCol = 0; needRender = true; i += 3; continue; }
            if (rem.startsWith("\x1b[F")) { cursorCol = lines[cursorLine].length; needRender = true; i += 3; continue; }
            if (rem.startsWith("\x1b[3~")) { // forward delete
              if (cursorCol < lines[cursorLine].length) {
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

          // SS3 sequences (\x1bO...)
          if (rem.startsWith("\x1bO")) {
            if (rem.startsWith("\x1bOH")) { cursorCol = 0; needRender = true; i += 3; continue; }
            if (rem.startsWith("\x1bOF")) { cursorCol = lines[cursorLine].length; needRender = true; i += 3; continue; }
            if (rem.startsWith("\x1bOA")) {
              if (cursorLine > 0) { cursorLine--; cursorCol = Math.min(cursorCol, lines[cursorLine].length); }
              needRender = true; i += 3; continue;
            }
            if (rem.startsWith("\x1bOB")) {
              if (cursorLine < lines.length - 1) { cursorLine++; cursorCol = Math.min(cursorCol, lines[cursorLine].length); }
              needRender = true; i += 3; continue;
            }
            if (rem.startsWith("\x1bOC")) {
              if (cursorCol < lines[cursorLine].length) cursorCol++;
              else if (cursorLine < lines.length - 1) { cursorLine++; cursorCol = 0; }
              needRender = true; i += 3; continue;
            }
            if (rem.startsWith("\x1bOD")) {
              if (cursorCol > 0) cursorCol--;
              else if (cursorLine > 0) { cursorLine--; cursorCol = lines[cursorLine].length; }
              needRender = true; i += 3; continue;
            }
            i += 3; continue;
          }

          // Lone ESC — double-tap within 400 ms clears all input
          const now = Date.now();
          if (now - lastEscTime < 400) {
            lines.length = 1;
            lines[0] = "";
            cursorLine = 0;
            cursorCol = 0;
          }
          lastEscTime = now;
          needRender = true;
          i++;
          continue;
        }

        // Backspace
        if (ch === "\x7f" || ch === "\b") {
          if (cursorCol > 0) {
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

        // Ctrl+W — also delete word backwards
        if (ch === "\x17") {
          deleteWordBack();
          needRender = true; i++; continue;
        }

        // Printable character (including multi-byte UTF-8)
        if (ch.charCodeAt(0) >= 32 || ch > "\x7f") {
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
