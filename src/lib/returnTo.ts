/** Where to go after signing in (for example back to a payment link). In memory only. */
let pending: string | null = null;

export function setReturnTo(path: string) {
  pending = path;
}

export function takeReturnTo() {
  const p = pending;
  pending = null;
  return p;
}

export function peekReturnTo() {
  return pending;
}
