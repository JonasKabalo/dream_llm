import process from "process";

// ── Sticky input layout ───────────────────────────────────────────────────────
// The terminal is split into two zones:
//   • Scroll region  — rows 1 … (rows - INPUT_ROWS)      — output lives here
//   • Input zone     — rows (rows - INPUT_ROWS + 1) … rows — always at the bottom
//
// VT100 scroll regions mean output never touches the input zone rows.
// Shared by main.ts (zone management) and input.ts (viewport sizing + resize).

export const INPUT_ROWS = 6; // 1 top blank + up to 3 content rows + 1 bottom blank + 1 status bar

export function termRows(): number {
  return process.stdout.rows || 24;
}

export function scrollEnd(): number {
  return Math.max(1, termRows() - INPUT_ROWS);
}

export function inputTop(): number {
  return scrollEnd() + 1;
}

export function setupLayout(): void {
  process.stdout.write(`\x1b[1;${scrollEnd()}r`); // set scroll region
  // Clear input zone so no stale content shows before first render
  for (let r = inputTop(); r <= termRows(); r++) {
    process.stdout.write(`\x1b[${r};1H\x1b[2K`);
  }
  toOutputZone();
}

export function toOutputZone(): void {
  process.stdout.write(`\x1b[${scrollEnd()};1H`);
}

export function toInputZone(): void {
  process.stdout.write(`\x1b[${inputTop()};1H`);
}

export function clearInputZone(): void {
  for (let r = inputTop(); r <= termRows(); r++) {
    process.stdout.write(`\x1b[${r};1H\x1b[2K`);
  }
}

export function resetLayout(): void {
  process.stdout.write("\x1b[r"); // reset scroll region to full screen
  process.stdout.write(`\x1b[${termRows()};1H`); // cursor to last row
}
