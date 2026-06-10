/**
 * Device-capability detection for enabling the mobile/touch control scheme.
 *
 * "Phone" is intentionally narrower than "touch device": we want the virtual
 * joystick + drag-look HUD on phones, but NOT on desktops with touch screens or
 * on large tablets (where the desktop mouse/keyboard layout still works well).
 *
 * Testing override (query-only, NOT persisted — a plain load always
 * auto-detects, so a desktop never gets stuck in mobile mode):
 *   • add `?mobile=1` to the URL to FORCE mobile controls for that load
 *   • add `?mobile=0` to FORCE desktop controls for that load
 *   • a normal URL (no `mobile` param) auto-detects
 */

let cachedIsPhone: boolean | null = null;

/** True when the primary pointer is coarse (finger) — i.e. a touch-first device. */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(pointer: coarse)').matches === true ||
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0
  );
}

/** Read the query-string override. Returns null when unset (auto-detect). */
function readForceOverride(): boolean | null {
  if (typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search).get('mobile');
  if (q === null || q === 'auto') return null;
  return q === '1' || q === 'true' || q === 'on';
}

/**
 * True for phones: a manual override if set, otherwise auto-detected from a
 * coarse/hover-less pointer AND a phone-sized short viewport edge (tablets and
 * touch laptops are excluded by the short-side threshold).
 */
export function isPhone(): boolean {
  if (cachedIsPhone !== null) return cachedIsPhone;
  if (typeof window === 'undefined') {
    cachedIsPhone = false;
    return cachedIsPhone;
  }

  const forced = readForceOverride();
  if (forced !== null) {
    cachedIsPhone = forced;
  } else {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches === true;
    const noHover = window.matchMedia?.('(hover: none)').matches === true;
    const touch = isTouchDevice();
    // Shortest viewport side in CSS px. Phones sit well under ~540 in either
    // orientation; tablets' short side is larger (iPad mini ≈ 744).
    const shortSide = Math.min(window.innerWidth, window.innerHeight);
    cachedIsPhone = (coarse || noHover || touch) && shortSide <= 540;
  }

  console.info(
    `[WoP] control scheme: ${cachedIsPhone ? 'MOBILE (touch)' : 'desktop'}` +
      ` — force with ?mobile=1 / ?mobile=0 (query-only, not persisted)`,
  );
  return cachedIsPhone;
}
