export {};

declare global {
  interface Window {
    bhaiBridge: {
      invoke: (channel: string, payload: any) => Promise<any>;
      onEvent: (channel: string, callback: (data: any) => void) => () => void;
    };
  }
}

async function runRendererSmoke() {
  const outputEl = document.getElementById('output');
  if (!outputEl) return;

  try {
    outputEl.textContent = 'Verifying sandbox environment...\n';
    
    // Check absence of Node globals
    const hasProcess = typeof (window as any).process !== 'undefined';
    const hasRequire = typeof (window as any).require !== 'undefined';
    const hasBuffer = typeof (window as any).Buffer !== 'undefined';

    if (hasProcess || hasRequire || hasBuffer) {
      outputEl.innerHTML += `<span class="badge fail">FAIL</span> Node integration detected in renderer!\n`;
      return;
    }
    outputEl.innerHTML += `<span class="badge pass">PASS</span> Renderer sandbox intact (no process/require/Buffer)\n`;

    // Test ping to main & utility engine
    const pong = await window.bhaiBridge.invoke('bhai:ping', {});
    outputEl.innerHTML += `<span class="badge pass">PASS</span> IPC roundtrip successful: utility PID ${pong.data?.pid}, node ${pong.data?.versions?.node}\n`;
  } catch (err: any) {
    outputEl.innerHTML += `<span class="badge fail">ERROR</span> ${err?.message}\n`;
  }
}

window.addEventListener('DOMContentLoaded', runRendererSmoke);
