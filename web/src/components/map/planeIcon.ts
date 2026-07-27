/**
 * Aircraft marker artwork, drawn to a canvas at runtime.
 *
 * These become WebGL textures via `map.addImage`, which is what lets a single
 * symbol layer render hundreds of rotated aircraft on the GPU. Shipping PNGs
 * would work too, but generating them here keeps the marker colours tied to
 * the design tokens rather than baked into an asset someone forgets to update.
 */

export type AltitudeBand = 'low' | 'cruise' | 'high';

/** Colour by altitude band — `--sky` at varying opacity. Subtle, not a rainbow. */
const BAND_ALPHA: Record<AltitudeBand, number> = {
  low: 0.45,
  cruise: 0.72,
  high: 1,
};

const SKY_RGB = '61, 122, 181';

/**
 * Metres. Below ~3km an aircraft is climbing out or on approach; above ~10km
 * it is in the flight levels. The bands exist to give the map depth, not to
 * be read precisely.
 */
export function altitudeBand(altitudeMetres: number): AltitudeBand {
  if (altitudeMetres < 3000) return 'low';
  if (altitudeMetres < 10000) return 'cruise';
  return 'high';
}

/**
 * A small aircraft silhouette pointing north (0°), so MapLibre's `icon-rotate`
 * can align it to the true_track heading directly.
 */
function drawPlane(ctx: CanvasRenderingContext2D, size: number, fill: string, stroke?: string) {
  const s = size / 24; // artwork is authored on a 24×24 grid
  ctx.translate(size / 2, size / 2);
  ctx.scale(s, s);
  ctx.translate(-12, -12);

  ctx.beginPath();
  // Nose, swept wings, tapered tail — read as an aircraft at 14px.
  ctx.moveTo(12, 2);
  ctx.lineTo(13.4, 9);
  ctx.lineTo(21.5, 14.2);
  ctx.lineTo(21.5, 16.2);
  ctx.lineTo(13.4, 13.6);
  ctx.lineTo(13.1, 19);
  ctx.lineTo(16, 21);
  ctx.lineTo(16, 22.4);
  ctx.lineTo(12, 21.2);
  ctx.lineTo(8, 22.4);
  ctx.lineTo(8, 21);
  ctx.lineTo(10.9, 19);
  ctx.lineTo(10.6, 13.6);
  ctx.lineTo(2.5, 16.2);
  ctx.lineTo(2.5, 14.2);
  ctx.lineTo(10.6, 9);
  ctx.closePath();

  ctx.fillStyle = fill;
  ctx.fill();

  if (stroke) {
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

export interface IconImage {
  id: string;
  data: ImageData;
  pixelRatio: number;
}

/** Ambient traffic markers, one per altitude band. */
export function createTrafficIcons(pixelRatio = 2): IconImage[] {
  const size = 18;

  return (Object.keys(BAND_ALPHA) as AltitudeBand[]).map((band) => {
    const canvas = document.createElement('canvas');
    canvas.width = size * pixelRatio;
    canvas.height = size * pixelRatio;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(pixelRatio, pixelRatio);
    drawPlane(
      ctx,
      size,
      `rgba(${SKY_RGB}, ${BAND_ALPHA[band]})`,
      `rgba(245, 244, 241, ${BAND_ALPHA[band] * 0.35})`,
    );

    return {
      id: `plane-${band}`,
      data: ctx.getImageData(0, 0, canvas.width, canvas.height),
      pixelRatio,
    };
  });
}

/**
 * The one aircraft the user actually booked. Larger, fully opaque, with a
 * pearl outline so it stays legible against a dark basemap and reads as
 * clearly distinct from the ambient traffic around it.
 */
export function createFocusIcon(pixelRatio = 2): IconImage {
  const size = 30;

  const canvas = document.createElement('canvas');
  canvas.width = size * pixelRatio;
  canvas.height = size * pixelRatio;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(pixelRatio, pixelRatio);
  drawPlane(ctx, size, '#ffffff', 'rgba(61, 122, 181, 0.9)');

  return {
    id: 'plane-focus',
    data: ctx.getImageData(0, 0, canvas.width, canvas.height),
    pixelRatio,
  };
}

/**
 * Dot marker for airports on the static route map. Drawn rather than using a
 * circle layer so origin and destination can differ: solid at origin, hollow
 * at destination, matching the timeline visual on the results card.
 */
export function createAirportIcons(pixelRatio = 2): IconImage[] {
  const size = 14;

  const make = (id: string, filled: boolean): IconImage => {
    const canvas = document.createElement('canvas');
    canvas.width = size * pixelRatio;
    canvas.height = size * pixelRatio;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(pixelRatio, pixelRatio);

    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 4.5, 0, Math.PI * 2);

    if (filled) {
      ctx.fillStyle = `rgb(${SKY_RGB})`;
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(11, 12, 16, 0.85)';
      ctx.fill();
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgb(${SKY_RGB})`;
    ctx.stroke();

    return {
      id,
      data: ctx.getImageData(0, 0, canvas.width, canvas.height),
      pixelRatio,
    };
  };

  return [make('airport-origin', true), make('airport-dest', false)];
}
