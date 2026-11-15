import React, { useRef, useEffect } from 'react';
import { CornerDownLeft } from 'lucide-react';

interface CommandInputProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  onEscape: () => void;
}

export const CommandInput: React.FC<CommandInputProps> = ({
  value,
  onChange,
  onSubmit,
  isLoading,
  onEscape
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      onEscape();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && value.trim()) {
        onSubmit();
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;
    // Automatically strip leading 'bhai ' if user types or pastes it
    if (/^\s*bhai\s+/i.test(raw)) {
      raw = raw.replace(/^\s*bhai\s+/i, '');
    }
    onChange(raw);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (/^\s*bhai\s+/i.test(pasted)) {
      e.preventDefault();
      const cleaned = pasted.replace(/^\s*bhai\s+/i, '');
      const input = inputRef.current;
      if (input) {
        const start = input.selectionStart ?? 0;
        const end = input.selectionEnd ?? 0;
        const nextVal = value.substring(0, start) + cleaned + value.substring(end);
        onChange(nextVal);
      } else {
        onChange(cleaned);
      }
    }
  };

  return (
    <footer className="command-footer">
      <form
        className="command-bar-box"
        onSubmit={(e) => {
          e.preventDefault();
          if (!isLoading && value.trim()) {
            onSubmit();
          }
        }}
      >
        {/* Fixed Non-Editable 'bhai' Prefix Badge */}
        <div className="composer-prefix-badge" aria-hidden="true" title="Assistant trigger prefix">
          bhai
        </div>

        {/* Text Input Field */}
        <input
          ref={inputRef}
          className="command-text-field"
          type="text"
          placeholder="Type a command…"
          value={value}
          onChange={handleInputChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          aria-label="Command palette input"
        />

        {/* Action Button */}
        <button
          type="submit"
          className="submit-return-btn"
          disabled={isLoading || !value.trim()}
          title="Run command (Return)"
          aria-label="Execute command"
        >
          {isLoading ? (
            <div className="btn-spinner" />
          ) : (
            <CornerDownLeft size={13} strokeWidth={2.2} />
          )}
        </button>
      </form>
    </footer>
  );
};
