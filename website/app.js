const copyButton = document.querySelector('#copy-install');
const commands = document.querySelector('#install-commands');
const copyStatus = document.querySelector('#copy-status');

// Leave the commands readable and selectable when clipboard access is unavailable.
if (copyButton && commands && copyStatus && navigator.clipboard?.writeText) {
  copyButton.hidden = false;
  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(commands.textContent);
      copyStatus.textContent = 'Commands copied.';
    } catch {
      copyStatus.textContent = 'Select the commands above and copy them manually.';
    }
  });
}
