import { sanitizeTitle, TITLE_MAX_LENGTH } from './title.prompt.js';

describe('sanitizeTitle', () => {
  it.each([
    ['Docker em containers', 'Docker em containers'],
    ['"Docker em containers"', 'Docker em containers'],
    ['“Docker em containers”.', 'Docker em containers'],
    ['Título: Docker em containers', 'Docker em containers'],
    ['**Docker em containers**', 'Docker em containers'],
    ['# Docker   em containers', 'Docker em containers'],
    ['\n\nDocker em containers\nEspero ter ajudado!', 'Docker em containers'],
  ])('cleans %j', (raw, expected) => {
    expect(sanitizeTitle(raw)).toBe(expected);
  });

  it('returns null when nothing usable is left', () => {
    expect(sanitizeTitle('')).toBeNull();
    expect(sanitizeTitle('  "" \n ')).toBeNull();
  });

  it('cuts long titles at a word boundary', () => {
    const title = sanitizeTitle('palavra '.repeat(20))!;

    expect(title.length).toBeLessThanOrEqual(TITLE_MAX_LENGTH + 1);
    expect(title.endsWith('…')).toBe(true);
    expect(title).not.toMatch(/\s…$/);
  });
});
