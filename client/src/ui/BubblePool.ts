/**
 * Simple object pool for chat bubble DOM elements.
 * Recycles div elements to reduce DOM churn.
 */
export class BubblePool {
  private pool: HTMLDivElement[] = [];
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /** Get a div from the pool or create a new one. */
  acquire(): HTMLDivElement {
    const div = this.pool.pop() ?? document.createElement('div');
    // Reset all inline styles and classes
    div.className = 'cb-bubble';
    div.style.cssText = '';
    div.innerHTML = '';
    div.style.position = 'absolute';
    div.style.pointerEvents = 'none';
    this.container.appendChild(div);
    return div;
  }

  /** Return a div to the pool for later reuse. */
  release(div: HTMLDivElement): void {
    div.remove();
    // Reset state for clean reuse
    div.className = '';
    div.style.cssText = '';
    div.innerHTML = '';
    // Cap pool size to prevent memory leak
    if (this.pool.length < 20) {
      this.pool.push(div);
    }
  }

  /** Release all divs and clear the pool. */
  clear(): void {
    this.pool.length = 0;
  }
}
