import { useId } from 'react';
import './css/data.css';

/** What each way of keeping or sending a piece contains, in one line each. */
export const GLOSSARY: Array<[string, string]> = [
  ['Semilla', 'Una palabra que el dado convierte en pieza. No lleva tus ediciones ni tus archivos, y sólo repite la pieza con la misma versión del generador.'],
  ['Receta', 'Un .json con todos los ajustes de la pieza. Exacta; de tu imagen o video guarda el nombre y las medidas, no el archivo.'],
  ['Favorito', 'Una pieza guardada con ★ en este navegador, con su imagen o video. El historial nunca la descarta.'],
  ['Enlace', 'La receta dentro de una dirección web. Exacto, pero sin tu imagen o video ni su nombre: quien lo abre elige los suyos.'],
  ['Proyecto exportado', 'Un .zip con la receta y la imagen o el video original. Exacto y completo: se abre igual en otro equipo.'],
  ['Sesión', 'Un .zip con todo tu historial y tu colección y, si quieres, sus imágenes y videos. Para tener una copia o cambiar de equipo.'],
];

export function Glossary({ title = 'Qué guarda cada cosa' }: { title?: string }) {
  const id = useId();
  return (
    <section className="glossary" aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      <dl>
        {GLOSSARY.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}
      </dl>
    </section>
  );
}
