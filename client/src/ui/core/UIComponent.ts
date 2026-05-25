/**
 * Base class for all UI components.
 * Provides common lifecycle methods and DOM management.
 *
 * All UI panels should extend this class to ensure consistent behavior:
 * - Automatic lifecycle management (render, show, hide, dispose)
 * - Consistent event handling
 * - Standard CSS class naming
 * - Memory leak prevention
 *
 * Usage:
 * ```typescript
 * export class MyPanel extends UIComponent {
 *   constructor() {
 *     super('ui-root', 'my-panel');
 *   }
 *
 *   render(): void {
 *     this.container.innerHTML = `<h2>My Panel</h2>`;
 *   }
 * }
 * ```
 */
export abstract class UIComponent {
  protected container: HTMLElement;
  protected isVisible: boolean = false;
  protected componentName: string;

  /**
   * Initialize the UI component.
   * @param parentId - ID of the parent DOM element to attach to
   * @param componentName - Name of this component (used for CSS classes)
   */
  constructor(parentId: string, componentName: string = 'ui-component') {
    const parent = document.getElementById(parentId);
    if (!parent) {
      throw new Error(
        `Parent element with ID "${parentId}" not found in DOM. ` +
          `Make sure the parent element exists before creating ${componentName}.`
      );
    }

    this.componentName = componentName;
    this.container = document.createElement('div');
    this.container.className = `ui-panel ${componentName}`;
    this.container.style.display = 'none'; // Hidden by default
    parent.appendChild(this.container);

    // Render initial content
    this.render();
  }

  /**
   * Render the component's HTML content.
   * Called during initialization and can be called again to re-render.
   * Subclasses should override this to define their UI.
   */
  abstract render(): void;

  /**
   * Show the component by setting display to block.
   */
  show(): void {
    this.container.style.display = 'block';
    this.isVisible = true;
    this.onShow();
  }

  /**
   * Hide the component by setting display to none.
   */
  hide(): void {
    this.container.style.display = 'none';
    this.isVisible = false;
    this.onHide();
  }

  /**
   * Toggle visibility.
   */
  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Check if component is visible.
   */
  getIsVisible(): boolean {
    return this.isVisible;
  }

  /**
   * Dispose of the component and clean up resources.
   * Called when the component is no longer needed.
   * Subclasses should override onDispose() to add custom cleanup.
   */
  dispose(): void {
    this.onDispose();
    if (this.container && this.container.parentNode) {
      this.container.removeChild(this.container);
    }
  }

  /**
   * Clear all child elements from the container.
   */
  protected clear(): void {
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }
  }

  /**
   * Set container content as HTML string.
   */
  protected setHTML(html: string): void {
    this.container.innerHTML = html;
  }

  /**
   * Add a CSS class to the container.
   */
  protected addClass(className: string): void {
    this.container.classList.add(className);
  }

  /**
   * Remove a CSS class from the container.
   */
  protected removeClass(className: string): void {
    this.container.classList.remove(className);
  }

  /**
   * Add an event listener to the container.
   * Listeners added this way are easier to clean up.
   */
  protected addEventListener(
    event: string,
    handler: EventListener,
    options?: AddEventListenerOptions
  ): void {
    this.container.addEventListener(event, handler, options);
  }

  /**
   * Remove an event listener from the container.
   */
  protected removeEventListener(
    event: string,
    handler: EventListener
  ): void {
    this.container.removeEventListener(event, handler);
  }

  /**
   * Hook called when component is shown.
   * Override to add custom behavior.
   */
  protected onShow(): void {
    // Override in subclass
  }

  /**
   * Hook called when component is hidden.
   * Override to add custom behavior.
   */
  protected onHide(): void {
    // Override in subclass
  }

  /**
   * Hook called when component is disposed.
   * Override to clean up resources, event listeners, timers, etc.
   */
  protected onDispose(): void {
    // Override in subclass
  }
}
