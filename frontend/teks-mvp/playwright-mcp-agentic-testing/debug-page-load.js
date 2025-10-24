// Debug script to check what's on the page
import { initializeMcp } from './dist/core/mcpClient.js';

async function debug() {
  const mcp = await initializeMcp();
  
  await mcp.call("browser_navigate", { url: "http://localhost:4200/students/" });
  
  console.log("\n=== Waiting 5 seconds for page load ===\n");
  await new Promise(r => setTimeout(r, 5000));
  
  const res = await mcp.call("browser_evaluate", { 
    function: `() => {
      return {
        title: document.title,
        url: location.href,
        bodyText: document.body?.innerText?.slice(0, 500),
        buttonCount: document.querySelectorAll('button').length,
        tableCount: document.querySelectorAll('table').length,
        hasActiveStudents: document.body?.innerText?.includes('Active Students'),
        appState: document.querySelector('app-root')?.innerHTML?.slice(0, 200)
      };
    }`
  });
  
  console.log("\n=== Page State ===\n", JSON.stringify(res, null, 2));
  
  process.exit(0);
}

debug().catch(console.error);
