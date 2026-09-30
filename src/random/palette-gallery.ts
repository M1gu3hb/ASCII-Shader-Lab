import type { Palette } from './palettes';

export type PaletteMood = 'calma' | 'cosmos' | 'tinta' | 'energia' | 'naturaleza';
export interface GalleryPalette extends Palette { mood: PaletteMood }

/** Additional hand-curated ramps, ordered from the least to the most dense glyph. */
export const PALETTE_GALLERY: GalleryPalette[] = [
  { name: 'Sal marina', mood: 'calma', bg: '#081c26', stops: ['#163844', '#6dadae', '#e9e6cd'], light: false },
  { name: 'Niebla de perla', mood: 'calma', bg: '#161d2b', stops: ['#313f53', '#a4b5b6', '#f7eee1'], light: false },
  { name: 'Cielo de porcelana', mood: 'calma', bg: '#f1f3eb', stops: ['#d9e3dc', '#829da1', '#24364d'], light: true },
  { name: 'Lavanda gris', mood: 'calma', bg: '#181625', stops: ['#39324b', '#9992b5', '#e9dbeb'], light: false },
  { name: 'Lago al alba', mood: 'calma', bg: '#081723', stops: ['#19364b', '#5b8d96', '#f1d8b3'], light: false },
  { name: 'Lino y lluvia', mood: 'calma', bg: '#f5f0e5', stops: ['#d6d5c9', '#879899', '#344149'], light: true },
  { name: 'Obsidiana lunar', mood: 'calma', bg: '#0b101c', stops: ['#242a41', '#7e93ad', '#e5e5dd'], light: false },
  { name: 'Rosa de cuarzo', mood: 'calma', bg: '#211923', stops: ['#493146', '#bd8395', '#f9d9d1'], light: false },
  { name: 'Nebulosa cobre', mood: 'cosmos', bg: '#100916', stops: ['#351e45', '#a04e82', '#f5aa75', '#ffe6c3'], light: false },
  { name: 'Vacío violeta', mood: 'cosmos', bg: '#08091f', stops: ['#242252', '#685abf', '#bac2fb'], light: false },
  { name: 'Púlsar', mood: 'cosmos', bg: '#070a19', stops: ['#182c55', '#376de2', '#84e4ef', '#f7fbff'], light: false },
  { name: 'Satélite oxidado', mood: 'cosmos', bg: '#0d1020', stops: ['#293453', '#aa6c6e', '#f4d9aa'], light: false },
  { name: 'Frontera estelar', mood: 'cosmos', bg: '#090617', stops: ['#2d2350', '#b369d3', '#f5c9f0'], light: false },
  { name: 'Mar de estrellas', mood: 'cosmos', bg: '#05101a', stops: ['#143449', '#4998b7', '#b2e7dd', '#ffefd0'], light: false },
  { name: 'Cobalto solar', mood: 'cosmos', bg: '#0a0d23', stops: ['#283974', '#758de0', '#f2be75', '#fff1d2'], light: false },
  { name: 'Eclipse', mood: 'cosmos', bg: '#0c0a10', stops: ['#3b2b35', '#b86a57', '#ffd799'], light: false },
  { name: 'Grafito cálido', mood: 'tinta', bg: '#ebe7df', stops: ['#d0cbc0', '#79756d', '#20211f'], light: true },
  { name: 'Índigo impreso', mood: 'tinta', bg: '#f2eddf', stops: ['#cfdbd5', '#5c768b', '#16294c'], light: true },
  { name: 'Tinta de ciruela', mood: 'tinta', bg: '#f4e9e2', stops: ['#dfc8c2', '#9e596e', '#402339'], light: true },
  { name: 'Riso bosque', mood: 'tinta', bg: '#f4ebd8', stops: ['#d3cbbb', '#72a48d', '#214239'], light: true },
  { name: 'Papel quemado', mood: 'tinta', bg: '#e9dfc8', stops: ['#bda990', '#9b5a3d', '#2a241f'], light: true },
  { name: 'Prensa azul', mood: 'tinta', bg: '#e8e5dc', stops: ['#b6c3c9', '#367a9a', '#183247'], light: true },
  { name: 'Carboncillo', mood: 'tinta', bg: '#f5f2e9', stops: ['#d7d1c6', '#77716a', '#171717'], light: true },
  { name: 'Riso mandarina', mood: 'tinta', bg: '#f8eee0', stops: ['#e8d9c3', '#fc7648', '#4e344e'], light: true },
  { name: 'Voltaje', mood: 'energia', bg: '#080915', stops: ['#292155', '#b637c7', '#fc6c8c', '#fff4b7'], light: false },
  { name: 'Ácido azul', mood: 'energia', bg: '#071119', stops: ['#163e49', '#16c3c2', '#b6ff6b'], light: false },
  { name: 'Láser granate', mood: 'energia', bg: '#16070d', stops: ['#4b122d', '#df245b', '#ff9e73', '#fff0c7'], light: false },
  { name: 'Cromo eléctrico', mood: 'energia', bg: '#070b18', stops: ['#202e59', '#7569fc', '#5fe5ee', '#f1ffff'], light: false },
  { name: 'Fósforo coral', mood: 'energia', bg: '#141015', stops: ['#4c2833', '#fb6754', '#ffcd84'], light: false },
  { name: 'Rayos de lima', mood: 'energia', bg: '#0b1110', stops: ['#294637', '#8ac64c', '#f3ffb2'], light: false },
  { name: 'Magma azul', mood: 'energia', bg: '#080819', stops: ['#2f2561', '#db438c', '#ffa44c', '#fff6bd'], light: false },
  { name: 'Rosa magnético', mood: 'energia', bg: '#110917', stops: ['#4a2464', '#d45aef', '#ffc6f2'], light: false },
  { name: 'Musgo profundo', mood: 'naturaleza', bg: '#09140e', stops: ['#234734', '#6ba272', '#e4dfa4'], light: false },
  { name: 'Cobre húmedo', mood: 'naturaleza', bg: '#131310', stops: ['#414833', '#a7985d', '#f3e2b7'], light: false },
  { name: 'Arrecife', mood: 'naturaleza', bg: '#0a1a23', stops: ['#175267', '#51adab', '#ffb992', '#ffede3'], light: false },
  { name: 'Bosque brumoso', mood: 'naturaleza', bg: '#0d1819', stops: ['#244749', '#799f8a', '#e6dfbd'], light: false },
  { name: 'Helechos', mood: 'naturaleza', bg: '#10201a', stops: ['#2e5345', '#89b78c', '#e9e2ad'], light: false },
  { name: 'Arcilla rosa', mood: 'naturaleza', bg: '#f0e7dd', stops: ['#dfcfbd', '#c1786b', '#563c3e'], light: true },
  { name: 'Tierra húmeda', mood: 'naturaleza', bg: '#17130e', stops: ['#473927', '#ac754c', '#e9c793'], light: false },
  { name: 'Piedra y sal', mood: 'naturaleza', bg: '#edeae0', stops: ['#c7cbc2', '#7e8e82', '#253b39'], light: true },
];

export const PALETTE_MOODS: Record<PaletteMood, string> = {
  calma: 'Calma', cosmos: 'Cosmos', tinta: 'Tinta', energia: 'Energía', naturaleza: 'Naturaleza',
};
