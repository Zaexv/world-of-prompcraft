/**
 * CSS animations for chat bubbles.
 * Injected once into the document head by ChatBubbleSystem.
 */

const BUBBLE_CSS = `
  @keyframes cb-appear {
    0% {
      opacity: 0;
      transform: translateX(-50%) translateY(8px) scale(0.85);
    }
    100% {
      opacity: 1;
      transform: translateX(-50%) translateY(0) scale(1);
    }
  }

  @keyframes cb-fadeout {
    0% {
      opacity: 1;
      transform: translateX(-50%) translateY(0) scale(1);
    }
    100% {
      opacity: 0;
      transform: translateX(-50%) translateY(-12px) scale(0.9);
    }
  }

  .cb-bubble {
    position: absolute;
    pointer-events: none;
    max-width: 320px;
    padding: 10px 16px;
    border-radius: 12px;
    font-family: 'Cinzel', Georgia, serif;
    font-size: 15px;
    line-height: 1.4;
    text-shadow: 0 1px 3px rgba(0,0,0,0.8);
    box-shadow: 0 4px 16px rgba(0,0,0,0.5), 0 0 8px rgba(0,0,0,0.3);
    word-wrap: break-word;
    overflow-wrap: break-word;
    white-space: pre-wrap;
    transform: translateX(-50%);
    animation: cb-appear 0.25s ease-out forwards;
    z-index: 50;
    transition: left 0.08s linear, top 0.08s linear;
  }

  .cb-bubble.cb-fading {
    animation: cb-fadeout 0.8s ease-in forwards;
  }

  .cb-bubble::after {
    content: '';
    position: absolute;
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-top: 8px solid var(--cb-caret-color, rgba(20, 40, 80, 0.92));
  }

  .cb-bubble .cb-name {
    font-weight: 700;
    margin-right: 6px;
  }
`;

let injected = false;

/** Inject bubble CSS into the document head (idempotent). */
export function injectBubbleCSS(): void {
  if (injected) return;
  injected = true;
  const style = document.createElement('style');
  style.id = 'chat-bubble-styles';
  style.textContent = BUBBLE_CSS;
  document.head.appendChild(style);
}
