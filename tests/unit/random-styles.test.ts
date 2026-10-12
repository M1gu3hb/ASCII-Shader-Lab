import { describe, expect, it } from 'vitest';
import { ARCHETYPES, archById, ARCHETYPES_V2 } from '../../src/random/archetypes';
import { STYLES, styleById } from '../../src/random/styles';

describe('nombres de los estilos del azar (primera vista sin el generador)', () => {
  it('la lista ligera es la de las definiciones de hoy, en el mismo orden', () => {
    expect(STYLES.map(s => ({ ...s }))).toEqual(ARCHETYPES.map(a => ({ id: a.id, name: a.name, blurb: a.blurb })));
  });
  it('nombra igual que archById cualquier estilo de las versiones anteriores', () => {
    for (const a of [...ARCHETYPES_V2, ...ARCHETYPES]) expect(styleById(a.id)?.name).toBe(archById(a.id)?.name);
    expect(styleById('no-existe')).toBeUndefined();
  });
});
