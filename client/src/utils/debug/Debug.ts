/**
 * Debug utilities — logging, timing, and performance tracking.
 */

/**
 * Log with timestamp and component name.
 */
export function debugLog(component: string, message: string, data?: unknown): void {
  const timestamp = new Date().toLocaleTimeString();
  console.warn(
    `%c[${timestamp}] ${component}%c ${message}`,
    'color: #00aa00; font-weight: bold',
    'color: inherit'
  );
  if (data) {
    console.error(data);
  }
}

/**
 * Measure function execution time.
 */
export function measureTime(
  label: string,
  fn: () => void
): number {
  const start = performance.now();
  fn();
  const end = performance.now();
  const duration = end - start;
  console.warn(`⏱  ${label}: ${duration.toFixed(2)}ms`);
  return duration;
}

/**
 * Assert condition; log error if false.
 */
export function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ Assertion failed: ${message}`);
  }
}

/**
 * Warn if value is unexpected type.
 */
export function typeWarn(value: unknown, expectedType: string, context: string): void {
  const actualType = typeof value;
  if (actualType !== expectedType) {
    console.warn(`⚠️  Type mismatch in ${context}: expected ${expectedType}, got ${actualType}`);
  }
}
