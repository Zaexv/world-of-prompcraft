// @vitest-environment happy-dom
/**
 * The World Builder panel's NPC tab drives chat-driven NPC creation: switching
 * to the NPC tab puts the panel in NPC mode, the archetype dropdown reflects the
 * server's archetypes, and submitting routes to onNpcDesign with the chosen
 * archetype (instead of the world-build onSubmit).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { WorldBuilderPanel, type NpcDesignOptions } from '../ui/WorldBuilderPanel';

beforeEach(() => {
  document.body.innerHTML = '<div id="game-ui"></div>';
});

type NpcRow = { id: string; name: string; archetype?: string; hp?: number };

function makePanel(
  onNpcDesign: (p: string, opts?: NpcDesignOptions) => void,
  getNpcs?: () => NpcRow[],
) {
  return new WorldBuilderPanel(
    () => {/* world build */},
    () => {},
    () => {},
    {
      onNpcDesign,
      getNpcs,
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

    const skin = document.querySelector('.wb-skin') as HTMLSelectElement;
    skin.value = 'orc';

    (document.querySelector('.wb-send') as HTMLButtonElement).click();

    // Defaults to a fixed NPC, so no movement fields are sent.
    expect(onNpcDesign).toHaveBeenCalledWith('a fierce goblin', {
      archetype: 'hostile_monster',
      skin: 'orc',
      fixed: true,
      movementStyle: undefined,
      wanderRadius: undefined,
    });
  });

  it('sends movement settings when the NPC is set to roam (Fixed unchecked)', () => {
    const onNpcDesign = vi.fn();
    makePanel(onNpcDesign);

    (document.querySelector('.wb-tab-npc') as HTMLButtonElement).click();
    (document.querySelector('textarea') as HTMLTextAreaElement).value = 'a town crier';

    const fixed = document.querySelector('.wb-npc-fixed') as HTMLInputElement;
    fixed.checked = false;
    fixed.dispatchEvent(new Event('change'));

    (document.querySelector('.wb-move') as HTMLSelectElement).value = 'patrol';
    (document.querySelector('.wb-wander') as HTMLInputElement).value = '12';

    (document.querySelector('.wb-send') as HTMLButtonElement).click();

    expect(onNpcDesign).toHaveBeenCalledWith('a town crier', expect.objectContaining({
      fixed: false,
      movementStyle: 'patrol',
      wanderRadius: 12,
    }));
  });

  it('lists existing NPCs from getNpcs when the NPC tab opens', () => {
    makePanel(() => {}, () => [
      { id: 'des_1', name: 'Greta', archetype: 'friendly_merchant', hp: 100 },
    ]);
    (document.querySelector('.wb-tab-npc') as HTMLButtonElement).click();
    const list = document.querySelector('.wb-npc-list') as HTMLElement;
    expect(list.textContent).toContain('Greta');
    expect(list.textContent).toContain('friendly_merchant');
  });

  it('populates the skin dropdown', () => {
    makePanel(() => {});
    const skin = document.querySelector('.wb-skin') as HTMLSelectElement;
    const values = Array.from(skin.options).map((o) => o.value);
    expect(values).toContain('dragon');
    expect(values).toContain('merchant');
  });

  it('setArchetypes replaces dropdown options', () => {
    const panel = makePanel(() => {});
    panel.setArchetypes([{ key: 'friendly_healer', allowed_tools: ['support'], hostile: false }]);
    const select = document.querySelector('.wb-arch') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['friendly_healer']);
  });
});
