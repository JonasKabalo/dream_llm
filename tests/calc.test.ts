import { test } from "node:test";
import assert from "node:assert/strict";
import { calcTools } from "../src/tools/offline/calc.js";

const calc = (expression: string): string =>
  calcTools.calculate.handler({ expression });

test("REGRESSION: the multiplication Phi-4 hallucinated is now exact", () => {
  // The model answered 92,348,787,872 in chat — the real answer is 92,377,749,952.
  assert.match(calc("23456 * 3938342"), /92,377,749,952/);
});

test("operator precedence and parentheses", () => {
  assert.match(calc("2 + 3 * 4"), /= 14$/);
  assert.match(calc("(2 + 3) * 4"), /= 20$/);
  assert.match(calc("10 - 4 / 2"), /= 8$/);
});

test("unary minus and power (right-associative)", () => {
  assert.match(calc("-5 + 3"), /= -2$/);
  assert.match(calc("2 ^ 3 ^ 2"), /= 512$/);
  assert.match(calc("-(2 + 3)"), /= -5$/);
});

test("decimals, percent operator, commas and unicode operators", () => {
  assert.match(calc("1.5 * 4"), /= 6$/);
  assert.match(calc("10 % 3"), /= 1$/);
  assert.match(calc("1,000 * 2"), /= 2,000$/);
  assert.match(calc("6 × 7"), /= 42$/);
  assert.match(calc("84 ÷ 2"), /= 42$/);
});

test("division by zero and garbage input produce clear errors", () => {
  assert.throws(() => calc("1 / 0"), /Division by zero/);
  assert.throws(() => calc("2 + banana"), /Unexpected character/);
  assert.throws(() => calc("(1 + 2"), /Missing closing parenthesis/);
});
