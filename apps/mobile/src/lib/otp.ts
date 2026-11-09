/** Pure state logic for the 6-box OTP input (auto-advance, paste, backspace). */
export const OTP_LENGTH = 6;

export interface OtpState {
  digits: string[];
  /** Index that should receive focus next (OTP_LENGTH - 1 max). */
  focus: number;
}

export function emptyOtp(): string[] {
  return Array.from({ length: OTP_LENGTH }, () => '');
}

/**
 * Apply a change in box `index`. `text` may be a single digit, a full pasted code
 * (or SMS autofill), or garbage. Digits fill forward from `index`.
 */
export function applyOtpInput(digits: readonly string[], index: number, text: string): OtpState {
  const next = [...digits];
  const incoming = text.replace(/\D/g, '');
  if (incoming === '') {
    next[index] = '';
    return { digits: next, focus: index };
  }
  // When a box already had a digit and the user typed another, TextInput gives "old+new": keep the newest.
  const chars = incoming.length === 2 && digits[index] && incoming.startsWith(digits[index] ?? '')
    ? incoming.slice(1)
    : incoming;
  let i = index;
  for (const ch of chars) {
    if (i >= OTP_LENGTH) break;
    next[i] = ch;
    i += 1;
  }
  return { digits: next, focus: Math.min(i, OTP_LENGTH - 1) };
}

/** Backspace on an empty box clears and moves to the previous one. */
export function applyOtpBackspace(digits: readonly string[], index: number): OtpState {
  const next = [...digits];
  if (next[index]) {
    next[index] = '';
    return { digits: next, focus: index };
  }
  const prev = Math.max(0, index - 1);
  next[prev] = '';
  return { digits: next, focus: prev };
}

export function otpCode(digits: readonly string[]): string {
  return digits.join('');
}

export function isOtpComplete(digits: readonly string[]): boolean {
  return digits.length === OTP_LENGTH && digits.every((d) => /^\d$/.test(d));
}

/** Seconds left on the resend timer. */
export function resendSecondsLeft(sentAt: number, now: number, cooldownSec = 30): number {
  return Math.max(0, Math.ceil(cooldownSec - (now - sentAt) / 1000));
}
