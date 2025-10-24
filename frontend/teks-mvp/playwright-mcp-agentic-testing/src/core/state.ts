// src/core/state.ts
import { getSharedMcpClient, pageUrl, pageTitle, unwrapText } from "./mcpClient.js";

export type DomSnapshot = {
  route: string;
  title: string;
  forms: Array<{
    name?: string;
    actionBtnTexts: string[];
    inputs: Array<{ name?: string; id?: string; formControlName?: string; type?: string; labelText?: string; placeholder?: string }>;  }>;
  buttons: Array<{ text: string; type?: string; id?: string }>;
};

const stack: string[] = [];
let memory: Record<string, any> = {}; // last used selectors, IDs, new entity IDs, etc.

export async function getDomSnapshot(): Promise<DomSnapshot> {
  const mcp = getSharedMcpClient();

  const res = await mcp.call("browser_evaluate", {
    function: `() => {
      const q = (s) => Array.from(document.querySelectorAll(s));
      const labelFor = (el) => el?.id ? (document.querySelector('label[for="'+el.id+'"]')?.innerText?.trim() || undefined) : undefined;

      const forms = q('form').map(f => ({
        name: f.getAttribute('name') || undefined,
        actionBtnTexts: q('button', f).map(b => (b.innerText || '').trim()).filter(Boolean),
        inputs: q('input, textarea, select', f).map(el => ({
          name: el.name || undefined,
          id: el.id || undefined,
          formControlName: el.getAttribute('formcontrolname') || undefined,
          type: el.type || el.tagName.toLowerCase(),
          labelText: labelFor(el),
          placeholder: el.getAttribute('placeholder') || undefined,
        }))
      }));

      const buttons = [
        ...q('button').map(b => ({
          text: (b.getAttribute('aria-label') || b.innerText || '').trim(),
          type: b.type || undefined,
          id: b.id || undefined
        })),
        ...q('a.btn').map(a => ({
          text: (a.getAttribute('aria-label') || a.innerText || '').trim(),
          type: 'link-button',
          id: a.id || undefined
        })),
        ...q('a[routerlinkactive], a[routerlink]').map(a => ({
          text: (a.getAttribute('aria-label') || a.innerText || '').trim(),
          type: 'nav-link',
          id: a.id || undefined
        }))
      ];

      return { route: location.href, title: document.title, forms, buttons };
    }`
  });

  const json = unwrapText(res);
  // The result is double-stringified, so parse twice
  const parsed = JSON.parse(json);
  return (typeof parsed === 'string' ? JSON.parse(parsed) : parsed) as DomSnapshot;
}

export function remember(k: string, v: any) { memory[k] = v; }
export function recall<T = any>(k: string): T | undefined { return memory[k] as T; }
export function navTrail() { return [...stack]; }
