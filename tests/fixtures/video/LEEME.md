# Videos de prueba

Hechos con ffmpeg a partir de fuentes sintéticas (sin personas ni obras de terceros), para `tests/e2e/core-integrity.spec.ts`.

`recortado-sin-recomprimir.mp4` (64 × 64, 30 fps, VP9 + Opus en MP4, 2 s): un contador (el cuadro N tiene luma 16 + 3N)
con un pitido de 1 kHz sólo en [1,0; 1,2) s del original, recortado en 1,0 s sin recomprimir. El MP4 guarda el segundo
cortado como pre-roll con marcas de tiempo negativas (lista de edición): el video empieza en el cuadro 30 y con el pitido.

```sh
SRC="color=c=black:s=64x64:r=30:d=3,geq=lum='16+3*N':cb=128:cr=128"
ffmpeg -f lavfi -i "$SRC" -f lavfi -i "sine=frequency=1000:duration=3,volume='between(t,1,1.2)':eval=frame" \
  -c:v libvpx-vp9 -g 60 -b:v 200k -c:a libopus -b:a 32k -shortest pitido.mp4
ffmpeg -ss 1.0 -i pitido.mp4 -c copy recortado-sin-recomprimir.mp4
```
