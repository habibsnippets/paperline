const PREMIUM_KEY = "paperline.premium.v1";

export function isPremium() {
  try {
    return localStorage.getItem(PREMIUM_KEY) === "true";
  } catch {
    return false;
  }
}

export function setPremium(v) {
  try {
    if (v) localStorage.setItem(PREMIUM_KEY, "true");
    else localStorage.removeItem(PREMIUM_KEY);
  } catch {
    /* ignore */
  }
}

export function requirePremium() {
  return isPremium();
}
