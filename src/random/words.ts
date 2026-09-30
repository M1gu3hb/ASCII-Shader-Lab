/**
 * The words the dice write as a Texto piece's text, by generator version, and the words the studio itself
 * writes: what version 5 tells apart from a person's own words (gen5.ts, fuente5). No imports: generator.ts
 * (versions 1–4) and gen5.ts both read it.
 */

/** Versions 1–4 (generator.ts). Fixed: the seeds noted with them must keep weaving the same piece. */
export const TIPO_WORDS_1 = ['TRAMA', 'ECO', 'SEÑAL', 'LUZ', 'RUIDO', 'HOLA', 'ONDA', 'PULSO', 'GLIFO', 'TINTA', 'NOCHE', 'VIBRA', 'MAREA', 'FARO'];

/** Version 5 (gen5.ts, diceWord5): GLYPHOS where SEÑAL was, and more. */
export const TIPO_WORDS_5 = ['GLYPHOS', 'TRAMA', 'ECO', 'LUZ', 'RUIDO', 'HOLA', 'ONDA', 'PULSO', 'GLIFO', 'TINTA', 'NOCHE', 'VIBRA', 'MAREA', 'FARO', 'ÓRBITA', 'CHISPA', 'BRUMA', 'ASCII', 'NUBE', 'FUEGO'];

/**
 * Words nobody typed: the dice's of every version and the brand's names of each era (GLYPHOS, the default
 * text; MONOTRAMA, the default before it; SEÑAL, the older dice's). A roll of version 5 changes them (a
 * person's own words stay). The studio also knows its recipes' and scenes' words, and what the person typed
 * (studio/ownWords.ts): it tells the dice (GenInput.ownText).
 */
export const STUDIO_WORDS: ReadonlySet<string> = new Set([...TIPO_WORDS_1, ...TIPO_WORDS_5, 'GLYPHOS', 'MONOTRAMA', 'SEÑAL']);

/** Whether a text is one of those words (spaces around it do not count). */
export const isStudioWord = (text: string) => STUDIO_WORDS.has(text.trim());
