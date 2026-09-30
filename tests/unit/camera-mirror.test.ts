import { describe, expect, it } from 'vitest';
import {
  cameraConstraints, cameraList, defaultMirror, facingOf, mirrorFor, parseChoices, rememberMirror, type MirrorChoices,
} from '../../src/studio/cameraMirror';

describe('which way the camera looks', () => {
  it('reads the track settings: environment is the rear camera, anything else faces the person', () => {
    expect(facingOf('environment')).toBe('environment');
    expect(facingOf('user')).toBe('user');
    // a desktop webcam usually reports nothing: it faces the person
    expect(facingOf(undefined)).toBe('user');
    expect(facingOf(null)).toBe('user');
    expect(facingOf('')).toBe('user');
    expect(facingOf('left')).toBe('user');
  });
});

describe('the mirror of the camera', () => {
  it('mirrors the front camera by default, not the rear one (as a phone camera app does)', () => {
    expect(defaultMirror('user')).toBe(true);
    expect(defaultMirror('environment')).toBe(false);
    expect(mirrorFor('user', {})).toBe(true);
    expect(mirrorFor('environment', {})).toBe(false);
  });

  it('the person\'s choice wins over the default, per way of looking', () => {
    let c: MirrorChoices = {};
    c = rememberMirror(c, 'user', false);
    expect(mirrorFor('user', c)).toBe(false);
    // the rear camera keeps its own default
    expect(mirrorFor('environment', c)).toBe(false);
    c = rememberMirror(c, 'environment', true);
    expect(mirrorFor('environment', c)).toBe(true);
    expect(mirrorFor('user', c)).toBe(false);
    // choosing again replaces the choice; the object given is not changed
    const before = { ...c };
    const d = rememberMirror(c, 'user', true);
    expect(mirrorFor('user', d)).toBe(true);
    expect(c).toEqual(before);
  });

  it('remembered choices come back from storage, and anything malformed is ignored', () => {
    expect(parseChoices(JSON.stringify({ user: false, environment: true }))).toEqual({ user: false, environment: true });
    expect(parseChoices(JSON.stringify({ user: 'no', other: true }))).toEqual({});
    expect(parseChoices('{nope')).toEqual({});
    expect(parseChoices(null)).toEqual({});
    expect(parseChoices('')).toEqual({});
    // a restart in the same session: the remembered «no mirror» for the front camera holds
    const back = parseChoices(JSON.stringify(rememberMirror({}, 'user', false)));
    expect(mirrorFor('user', back)).toBe(false);
  });
});

describe('the list of cameras', () => {
  it('names cameras without a label, and leaves out what is not a camera or has no id', () => {
    const list = cameraList([
      { kind: 'audioinput', deviceId: 'mic', label: 'Micrófono' },
      { kind: 'videoinput', deviceId: 'a', label: '' },
      { kind: 'videoinput', deviceId: 'b', label: 'Cámara trasera (back)' },
      { kind: 'videoinput', deviceId: '', label: '' },
    ]);
    expect(list).toEqual([{ id: 'a', label: 'Cámara 1' }, { id: 'b', label: 'Cámara trasera (back)' }]);
  });

  it('asks for a picked device exactly, and for a way of looking only as a preference', () => {
    expect(cameraConstraints({ facing: 'environment' })).toMatchObject({ facingMode: { ideal: 'environment' } });
    expect(cameraConstraints({ facing: 'user', deviceId: null })).toMatchObject({ facingMode: { ideal: 'user' } });
    const picked = cameraConstraints({ facing: 'user', deviceId: 'b' });
    expect(picked).toMatchObject({ deviceId: { exact: 'b' } });
    expect(picked).not.toHaveProperty('facingMode');
  });
});
