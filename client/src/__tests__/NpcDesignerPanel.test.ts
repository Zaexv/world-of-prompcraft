// @vitest-environment happy-dom
/**
 * The World Builder panel's NPC tab drives chat-driven NPC creation: switching
 * to the NPC tab puts the panel in NPC mode, the archetype dropdown reflects the
 * server's archetypes, and submitting routes to onNpcDesign with the chosen
 * archetype (instead of the world-build onSubmit).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { WorldBuilderPanel } from '../ui/WorldBuilderPanel';

beforeEach(() => {
  document.body.innerHTML = '<div id="game-ui"></div>';
});

function makePanel(onNpcDesign: (p: string, a?: string) => void) {
  return new WorldBuilderPanel(
    () => {/* world build */},
    () => {},
    () => {},
    {
      onNpcDesign,
      npcArchetypes: [
        { key: 'friendly_merchant', allowed_tools: ['dialogue', 'trade'], hostile: false },
        { key: 'hostile_monster', allowed_tools: ['offense', 'defense'], hostile: true },
      ],
    }
  );
}

describe('WorldBuilderPanel NPC mode', () => {
  it('populates the archetype dropdown from the provided list', () => {
    makePanel(() => {});
    const select = document.querySelector('.wb-arch') as HTMLSelectElement;
    const keys = Array.from(select.options).map((o) => o.value);
    expect(keys).toEqual(['friendly_merchant', 'hostile_monster']);
  });

  it('routes submit to onNpcDesign with the selected archetype in NPC mode', () => {
    const onNpcDesign = vi.fn();
    makePanel(onNpcDesign);

    (document.querySelector('.wb-tab-npc') as HTMLButtonElement).click();
    const select = document.querySelector('.wb-arch') as HTMLSelectElement;
    select.value = 'hostile_monster';
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = 'a fierce goblin';

    (document.querySelector('.wb-send') as HTMLButtonElement).click();

    expect(onNpcDesign).toHaveBeenCalledWith('a fierce goblin', 'hostile_monster');
  });

  it('setArchetypes replaces dropdown options', () => {
    const panel = makePanel(() => {});
    panel.setArchetypes([{ key: 'friendly_healer', allowed_tools: ['support'], hostile: false }]);
    const select = document.querySelector('.wb-arch') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['friendly_healer']);
  });
});
