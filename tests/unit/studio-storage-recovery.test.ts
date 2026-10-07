import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), keys: vi.fn(), values: vi.fn(), gc: vi.fn() }));
vi.mock('../../src/studio/idb', () => ({ idbRead: db.read, idbWrite: db.write, idbKeys: db.keys, idbValues: db.values, isQuotaError: () => false }));
vi.mock('../../src/studio/mediaStore', () => ({ gcMedia: db.gc }));

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('addEventListener', vi.fn());
  vi.stubGlobal('removeEventListener', vi.fn());
  vi.stubGlobal('document', { addEventListener: vi.fn(), visibilityState: 'visible' });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  vi.clearAllMocks();
  db.write.mockResolvedValue('written');
  db.values.mockResolvedValue([]);
  db.keys.mockResolvedValue({ values: [undefined], keys: [[], []] });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('recuperación del historial: nunca sobrescribir una lectura insegura', () => {
  it.each(['versión futura', 'índice inválido', 'lectura fallida'])('%s: editar y guardar ★ no escribe ni limpia los datos anteriores', async kind => {
    if (kind === 'lectura fallida') db.read.mockRejectedValue(new Error('lectura interrumpida'));
    else db.read.mockResolvedValue([{ v: kind === 'versión futura' ? 4 : 3, ids: kind === 'versión futura' ? ['anterior'] : null }, undefined, [], []]);
    const store = await import('../../src/studio/store');
    expect(await store.hydrate()).toBe(false); // a failed read is never a first visit
    store.rollDice('recuperacion');
    store.saveFavorite();
    await store.persistNow();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(db.write).not.toHaveBeenCalled();
    expect(db.gc).not.toHaveBeenCalled();
    expect(db.keys).not.toHaveBeenCalled();
    expect(store.useStudio.getState().storage).not.toBe('ok');
  });

  it('una primera visita vacía sigue creando y guardando una pieza', async () => {
    db.read.mockResolvedValue([undefined, undefined, undefined, undefined]);
    const store = await import('../../src/studio/store');
    expect(await store.hydrate()).toBe(true);
    expect(store.useStudio.getState().entries).toHaveLength(1);
    expect(db.write).toHaveBeenCalled();
    expect(store.useStudio.getState().storage).toBe('ok');
  });

  it('un índice legible con un cuerpo desaparecido tampoco se sobrescribe como primera visita', async () => {
    db.read.mockResolvedValueOnce([{ v: 3, ids: ['anterior'], cursor: 0 }, undefined, [], []]).mockResolvedValue([undefined]);
    const store = await import('../../src/studio/store');
    expect(await store.hydrate()).toBe(false);
    await store.persistNow(); await vi.advanceTimersByTimeAsync(20_000);
    expect(db.write).not.toHaveBeenCalled(); expect(db.gc).not.toHaveBeenCalled();
  });

  it('una lectura que no responde abre el estudio protegido; su respuesta tardía no habilita guardados', async () => {
    let finish!: (values: unknown[]) => void;
    db.read.mockReturnValue(new Promise<unknown[]>(r => { finish = r; }));
    const store = await import('../../src/studio/store');
    const loading = store.hydrate();
    await vi.advanceTimersByTimeAsync(8000);
    expect(await loading).toBe(false);
    expect(store.useStudio.getState().ready).toBe(true);
    finish([undefined, undefined, undefined, undefined]);
    await vi.advanceTimersByTimeAsync(20_000);
    store.rollDice('despues-del-timeout');
    await store.persistNow();
    expect(db.write).not.toHaveBeenCalled();
    expect(db.gc).not.toHaveBeenCalled();
  });

  it('un guardado inicial que termina después de activar la protección no oculta el aviso', async () => {
    db.read.mockResolvedValue([undefined, undefined, undefined, undefined]);
    let finish!: (value: string) => void;
    db.write.mockReturnValue(new Promise<string>(r => { finish = r; }));
    const store = await import('../../src/studio/store');
    const loading = store.hydrate();
    await vi.advanceTimersByTimeAsync(0);
    expect(db.write).toHaveBeenCalledOnce();
    store.protectStudio();
    finish('written'); await loading;
    expect(store.useStudio.getState().storage).toBe('protected');
    store.rollDice('guardado-tardio'); await store.persistNow();
    expect(db.write).toHaveBeenCalledOnce();
  });
});
