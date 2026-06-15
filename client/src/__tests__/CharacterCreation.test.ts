// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';

// CharacterPreview spins up a Three.js WebGLRenderer, which happy-dom can't
// provide. Stub it with a lightweight double exposing the same surface.
vi.mock('../ui/screens/CharacterPreview', () => ({
  // `new CharacterPreview()` runs this impl as a constructor under vitest 4, so
  // it must be a function expression (an arrow can't be constructed).
  CharacterPreview: vi.fn().mockImplementation(function () {
    return {
      canvas: document.createElement('canvas'),
      setRace: vi.fn(),
      start: vi.fn(),
      dispose: vi.fn(),
    };
  }),
}));

import { CharacterCreation, type CharacterSelectionResult } from '../ui/screens/CharacterCreation';
import { CharacterPreview } from '../ui/screens/CharacterPreview';

function lastPreview() {
  const results = vi.mocked(CharacterPreview).mock.results;
  return results[results.length - 1].value as {
    setRace: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  };
}

function enterBtn(cc: CharacterCreation): HTMLButtonElement {
  return [...cc.element.querySelectorAll('button')].find(
    (b) => b.textContent === 'Enter World',
  ) as HTMLButtonElement;
}

function raceCard(cc: CharacterCreation, label: string): HTMLDivElement {
  return [...cc.element.querySelectorAll('div')].find(
    (d) => d.textContent === label,
  ) as HTMLDivElement;
}

function submit(cc: CharacterCreation, username: string): CharacterSelectionResult | null {
  const input = cc.element.querySelector('input') as HTMLInputElement;
  input.value = username;
  input.dispatchEvent(new Event('input')); // enables the Enter button
  let result: CharacterSelectionResult | null = null;
  cc.onSubmit = (r) => { result = r; };
  enterBtn(cc).click();
  return result;
}

describe('CharacterCreation', () => {
  beforeEach(() => {
    vi.mocked(CharacterPreview).mockClear();
    // The screen now persists/prefills the last username — isolate tests so a
    // submit in one doesn't prefill the next (e.g. the empty-username case).
    localStorage.clear();
  });

  it('defaults to human / alliance and submits without a skin field', () => {
    const cc = new CharacterCreation();
    const result = submit(cc, 'Hero');
    expect(result).toEqual({ username: 'Hero', race: 'human', faction: 'alliance' });
    expect(result && 'skin' in result).toBe(false);
  });

  it('previews the default race on construction', () => {
    new CharacterCreation();
    expect(lastPreview().setRace).toHaveBeenCalledWith('human');
    expect(lastPreview().start).toHaveBeenCalled();
  });

  it('lists every race (no faction toggle)', () => {
    const cc = new CharacterCreation();
    for (const label of ['Human', 'Night Elf', 'Orc', 'Undead']) {
      expect(raceCard(cc, label)).toBeTruthy();
    }
    // No ALLIANCE / HORDE buttons remain.
    const buttons = [...cc.element.querySelectorAll('button')].map((b) => b.textContent);
    expect(buttons).not.toContain('ALLIANCE');
    expect(buttons).not.toContain('HORDE');
  });

  it('selecting a race updates the selection and the preview', () => {
    const cc = new CharacterCreation();
    raceCard(cc, 'Night Elf').click();
    expect(lastPreview().setRace).toHaveBeenLastCalledWith('night_elf');
    const result = submit(cc, 'Tyrande');
    expect(result).toMatchObject({ race: 'night_elf', faction: 'alliance' });
  });

  it('derives faction from the chosen race', () => {
    const cc = new CharacterCreation();
    raceCard(cc, 'Orc').click();
    const result = submit(cc, 'Grom');
    expect(result).toMatchObject({ race: 'orc', faction: 'horde' });
  });

  it('does not submit when the username is empty', () => {
    const cc = new CharacterCreation();
    let called = false;
    cc.onSubmit = () => { called = true; };
    enterBtn(cc).click();
    expect(called).toBe(false);
  });

  it('remembers the username across reloads (save on submit, prefill on load)', () => {
    submit(new CharacterCreation(), 'Returning');
    expect(localStorage.getItem('wop_username')).toBe('Returning');

    // A fresh screen (simulating a reload) prefills the saved name and is ready
    // to submit it without retyping.
    const reopened = new CharacterCreation();
    const input = reopened.element.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('Returning');
    let result: CharacterSelectionResult | null = null;
    reopened.onSubmit = (r) => { result = r; };
    enterBtn(reopened).click();
    expect(result).toEqual({ username: 'Returning', race: 'human', faction: 'alliance' });
  });

  it('dispose tears down the 3D preview renderer', () => {
    const cc = new CharacterCreation();
    const preview = lastPreview();
    cc.dispose();
    expect(preview.dispose).toHaveBeenCalled();
  });
});
