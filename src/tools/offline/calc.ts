import type { ChatSessionModelFunctions } from "node-llama-cpp";

// Tiny recursive-descent evaluator: + - * / % ^ ( ) and unary minus.
// No eval(), no Function() — only numbers come out.
function evaluate(raw: string): number {
  const expr = raw.replace(/[,\s_]/g, "").replace(/×/g, "*").replace(/÷/g, "/");
  let pos = 0;

  function peek(): string {
    return expr[pos] ?? "";
  }

  function parseExpression(): number {
    let value = parseTerm();
    for (;;) {
      const op = peek();
      if (op === "+" || op === "-") {
        pos++;
        const rhs = parseTerm();
        value = op === "+" ? value + rhs : value - rhs;
      } else {
        return value;
      }
    }
  }

  function parseTerm(): number {
    let value = parseFactor();
    for (;;) {
      const op = peek();
      if (op === "*" || op === "/" || op === "%") {
        pos++;
        const rhs = parseFactor();
        if ((op === "/" || op === "%") && rhs === 0) throw new Error("Division by zero");
        value = op === "*" ? value * rhs : op === "/" ? value / rhs : value % rhs;
      } else {
        return value;
      }
    }
  }

  // Right-associative power: 2^3^2 = 2^(3^2)
  function parseFactor(): number {
    const base = parseUnary();
    if (peek() === "^") {
      pos++;
      return Math.pow(base, parseFactor());
    }
    return base;
  }

  function parseUnary(): number {
    if (peek() === "-") {
      pos++;
      return -parseUnary();
    }
    if (peek() === "+") {
      pos++;
      return parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    if (peek() === "(") {
      pos++;
      const value = parseExpression();
      if (peek() !== ")") throw new Error("Missing closing parenthesis");
      pos++;
      return value;
    }
    const match = /^\d+(?:\.\d+)?/.exec(expr.slice(pos));
    if (!match) throw new Error(`Unexpected character at position ${pos}: "${expr[pos] ?? "end of input"}"`);
    pos += match[0].length;
    return Number(match[0]);
  }

  const result = parseExpression();
  if (pos !== expr.length) throw new Error(`Unexpected character at position ${pos}: "${expr[pos]}"`);
  if (!Number.isFinite(result)) throw new Error("Result is not a finite number");
  return result;
}

export const calcTools = {
  calculate: {
    description: "Evaluate an arithmetic expression EXACTLY: + - * / % ^ and parentheses. ALWAYS use this for any calculation instead of computing numbers yourself — mental arithmetic produces wrong digits.",
    params: {
      type: "object",
      properties: {
        expression: { type: "string", description: "Arithmetic expression, e.g. '23456 * 3938342' or '(1500 + 230) * 1.2'" },
      },
      required: ["expression"],
    } as const,
    handler({ expression }: { expression: string }): string {
      const result = evaluate(expression);
      const precise = Math.abs(result) <= Number.MAX_SAFE_INTEGER;
      const formatted = Number.isInteger(result)
        ? result.toLocaleString("en-US")
        : String(result);
      return `${expression.trim()} = ${formatted}${precise ? "" : " (approximate — beyond exact integer range)"}`;
    },
  },
} satisfies ChatSessionModelFunctions;
