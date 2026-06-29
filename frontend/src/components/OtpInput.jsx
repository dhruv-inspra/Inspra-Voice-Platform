import { useEffect, useMemo, useRef } from "react";

/**
 * OtpInput — segmented one-time-code field.
 *
 * Controlled by `value` (a digits string). Auto-advances as you type, supports
 * paste and backspace, and calls `onComplete(code)` the moment all cells are
 * filled — so the parent can submit without a button press.
 */
export default function OtpInput({
  length = 6,
  value = "",
  onChange,
  onComplete,
  disabled = false,
  autoFocus = false
}) {
  const refs = useRef([]);
  const completedFor = useRef(null);

  const cells = useMemo(() => Array.from({ length }), [length]);

  useEffect(() => {
    if (autoFocus && refs.current[0]) {
      refs.current[0].focus();
    }
  }, [autoFocus]);

  // Fire onComplete once per fully-entered code (reset if the code changes).
  useEffect(() => {
    if (value.length === length && completedFor.current !== value) {
      completedFor.current = value;
      onComplete?.(value);
    }
    if (value.length < length) {
      completedFor.current = null;
    }
  }, [value, length, onComplete]);

  function setDigit(index, digit) {
    const next = value.split("");
    next[index] = digit;
    // Trim trailing empties so length reflects how many digits exist.
    const joined = next.join("").replace(/\D/g, "").slice(0, length);
    onChange?.(joined);
  }

  function handleChange(index, event) {
    const raw = event.target.value.replace(/\D/g, "");
    if (!raw) return;

    if (raw.length > 1) {
      // User typed/auto-filled multiple digits into one cell — spread them.
      const merged = (value.slice(0, index) + raw).replace(/\D/g, "").slice(0, length);
      onChange?.(merged);
      const focusAt = Math.min(merged.length, length - 1);
      refs.current[focusAt]?.focus();
      return;
    }

    setDigit(index, raw);
    if (index < length - 1) {
      refs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index, event) {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (value[index]) {
        setDigit(index, "");
      } else if (index > 0) {
        refs.current[index - 1]?.focus();
        setDigit(index - 1, "");
      }
    } else if (event.key === "ArrowLeft" && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < length - 1) {
      refs.current[index + 1]?.focus();
    }
  }

  function handlePaste(event) {
    event.preventDefault();
    const pasted = (event.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    onChange?.(pasted);
    const focusAt = Math.min(pasted.length, length - 1);
    refs.current[focusAt]?.focus();
  }

  return (
    <div className="otp" role="group" aria-label={`${length}-digit verification code`}>
      {cells.map((_, index) => (
        <input
          key={index}
          ref={(el) => (refs.current[index] = el)}
          className="otp-cell"
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={value[index] || ""}
          disabled={disabled}
          aria-label={`Digit ${index + 1}`}
          onChange={(event) => handleChange(index, event)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          onFocus={(event) => event.target.select()}
        />
      ))}
    </div>
  );
}
