/**
 * UIFactory — Utilities for UI panel creation and composition.
 *
 * Provides reusable patterns for button creation, form construction,
 * and panel styling to reduce boilerplate across UI panels.
 */

/**
 * Button factory with consistent styling.
 */
export function createButton(
  label: string,
  onClick: () => void,
  options?: {
    className?: string;
    disabled?: boolean;
    ariaLabel?: string;
  }
): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = label;
  button.onclick = onClick;

  if (options?.className) {
    button.className = options.className;
  }

  if (options?.disabled) {
    button.disabled = true;
  }

  if (options?.ariaLabel) {
    button.setAttribute('aria-label', options.ariaLabel);
  }

  return button;
}

/**
 * Input field factory.
 */
export function createInput(
  type: string = 'text',
  options?: {
    placeholder?: string;
    value?: string;
    className?: string;
    required?: boolean;
  }
): HTMLInputElement {
  const input = document.createElement('input');
  input.type = type;

  if (options?.placeholder) input.placeholder = options.placeholder;
  if (options?.value) input.value = options.value;
  if (options?.className) input.className = options.className;
  if (options?.required) input.required = true;

  return input;
}

/**
 * Label + input pair.
 */
export function createLabeledInput(
  label: string,
  inputElement: HTMLInputElement,
  options?: { className?: string }
): HTMLDivElement {
  const container = document.createElement('div');
  if (options?.className) container.className = options.className;

  const labelEl = document.createElement('label');
  labelEl.textContent = label;

  container.appendChild(labelEl);
  container.appendChild(inputElement);

  return container;
}

/**
 * Health/mana bar component.
 */
export function createProgressBar(
  containerId: string,
  current: number,
  max: number,
  options?: {
    color?: string;
    backgroundColor?: string;
    borderColor?: string;
    showText?: boolean;
  }
): HTMLDivElement {
  const container = document.createElement('div');
  container.id = containerId;

  const barBg = document.createElement('div');
  Object.assign(barBg.style, {
    position: 'relative',
    width: '100%',
    height: '20px',
    backgroundColor: options?.backgroundColor ?? '#333',
    border: `1px solid ${options?.borderColor ?? '#666'}`,
    borderRadius: '4px',
    overflow: 'hidden',
  });

  const barFill = document.createElement('div');
  const percentage = Math.max(0, Math.min(100, (current / max) * 100));
  Object.assign(barFill.style, {
    width: `${percentage}%`,
    height: '100%',
    backgroundColor: options?.color ?? '#4a90e2',
    transition: 'width 0.2s ease-out',
  });

  barBg.appendChild(barFill);

  if (options?.showText) {
    const text = document.createElement('span');
    text.textContent = `${current} / ${max}`;
    Object.assign(text.style, {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      color: '#fff',
      fontSize: '12px',
      fontWeight: 'bold',
      textShadow: '0 0 3px rgba(0,0,0,0.8)',
      pointerEvents: 'none',
    });
    barBg.appendChild(text);
  }

  container.appendChild(barBg);
  return container;
}

/**
 * Modal overlay factory.
 */
export function createModal(options?: {
  title?: string;
  className?: string;
  zIndex?: number;
}): { backdrop: HTMLDivElement; modal: HTMLDivElement; content: HTMLDivElement } {
  const backdrop = document.createElement('div');
  Object.assign(backdrop.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.7)',
    display: 'none',
    zIndex: String(options?.zIndex ?? 1000),
  });

  const modal = document.createElement('div');
  if (options?.className) modal.className = options.className;
  Object.assign(modal.style, {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: '#1a1a1a',
    border: '2px solid #c5a55a',
    borderRadius: '8px',
    padding: '20px',
    maxWidth: '600px',
    maxHeight: '80vh',
    overflow: 'auto',
    zIndex: String((options?.zIndex ?? 1000) + 1),
  });

  if (options?.title) {
    const title = document.createElement('h2');
    title.textContent = options.title;
    Object.assign(title.style, {
      marginTop: '0',
      marginBottom: '15px',
      color: '#c5a55a',
      fontSize: '18px',
      fontWeight: 'bold',
    });
    modal.appendChild(title);
  }

  const content = document.createElement('div');
  modal.appendChild(content);

  return { backdrop, modal, content };
}

/**
 * Scrollable list component.
 */
export function createScrollableList(options?: {
  className?: string;
  maxHeight?: string;
}): HTMLDivElement {
  const container = document.createElement('div');
  if (options?.className) container.className = options.className;

  Object.assign(container.style, {
    overflowY: 'auto',
    maxHeight: options?.maxHeight ?? '400px',
    paddingRight: '8px',
  });

  return container;
}
