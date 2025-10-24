export function sanitizeJs(fromLlm: string) {
  let s = (fromLlm ?? "").trim();
  // strip ```javascript ... ``` or ``` ... ```
  if (s.startsWith("```")) {
    s = s.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "");
  }
  // hard bans so the model only touches existing DOM
  s = s.replace(/document\.createElement/gi, "// BLOCKED:createElement");
  s = s.replace(/appendChild\s*\(/gi, "// BLOCKED:appendChild(");
  s = s.replace(/setTimeout\s*\(/gi, "// BLOCKED:setTimeout(");
  s = s.replace(/window\.location/gi, "// BLOCKED:navigate");
  return s.trim();
}

export const SYSTEM_RULES = [
  "Return ONLY JavaScript. No markdown, no backticks.",
  "Never create elements (no document.createElement/appendChild). Interact with EXISTING controls.",
  "Do NOT use :contains() or setTimeout.",
  "Use let (not const) for reassignable variables.",
  "After setting input/textarea/select values, dispatch BOTH 'input' and 'change' with { bubbles: true } (Angular Reactive Forms).",
  "Prefer selectors: [formcontrolname], [name], #id, [placeholder] and visible button text.",
  "If a control isn't found, search by label text via Array.from(...).find(...) and match normalized innerText.",
].join("\n");
