import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/studio/engineBridge', () => ({ getEngine: () => null }));
vi.mock('../../src/studio/toast', () => ({ toast: () => {} }));

/** A-11: an export renders the moment again until no family is short of it; never a partial state. */
describe('renderComplete', () => {
  const fake = (shortFor: number) => {
    let renders = 0;
    return {
      renders: () => renders,
      eng: {
        renderAt: () => { renders++; },
        familyInfo: () => (renders <= shortFor ? [{ name: 'Reacción–difusión', partial: true, debt: 100 * (shortFor - renders + 1) }] : [{ name: 'Reacción–difusión', partial: false, debt: 0 }]),
      } as never,
    };
  };

  it('repite el cuadro hasta que el estado está completo, con progreso', async () => {
    const { renderComplete } = await import('../../src/studio/exporting');
    const f = fake(3);
    const seen: string[] = [];
    await renderComplete(f.eng, 10, 10, { progress: (_p, l) => { if (l) seen.push(l); } });
    expect(f.renders()).toBe(4);
    expect(seen[0]).toMatch(/Calculando «Reacción–difusión»/);
  });

  it('cancelar lo detiene; pasado el límite falla diciendo qué familia', async () => {
    const { renderComplete } = await import('../../src/studio/exporting');
    await expect(renderComplete(fake(5).eng, 1, 1, { cancel: { cancelled: true } })).rejects.toThrow('cancelado');
    await expect(renderComplete(fake(1e9).eng, 1, 1, { limitMs: 30 })).rejects.toThrow(/Reacción–difusión.*necesita más cálculo/);
  });

  it('sin familias con memoria pendientes, un solo render', async () => {
    const { renderComplete } = await import('../../src/studio/exporting');
    const f = fake(0);
    await renderComplete(f.eng, 1);
    expect(f.renders()).toBe(1);
  });
});
