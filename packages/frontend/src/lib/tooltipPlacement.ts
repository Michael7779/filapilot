export interface AnchorRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface TooltipPlacement {
  // Mittelpunkt der Blase waagerecht und die Kante, an der sie haengt (oben = Unterkante der Blase, unten = Oberkante)
  left: number;
  top: number;
  placement: "above" | "below";
}

const HALF_WIDTH = 90;
const EDGE_MARGIN = 8;
const GAP = 8;
const ROOM_ABOVE = 44;

// Platz fuer die Sprechblase am Symbol (Touch-Geraete ohne Mouseover): bevorzugt ueber dem Symbol, bei zu wenig Platz oben
// darunter; waagerecht so geklemmt, dass die Blase (Breite grob "HALF_WIDTH" je Seite) nie ueber den Bildschirmrand ragt.
export function placeTooltip(anchor: AnchorRect, viewportWidth: number): TooltipPlacement {
  const center = (anchor.left + anchor.right) / 2;
  const min = EDGE_MARGIN + HALF_WIDTH;
  const max = viewportWidth - EDGE_MARGIN - HALF_WIDTH;
  const left = min > max ? viewportWidth / 2 : Math.min(Math.max(center, min), max);
  if (anchor.top < ROOM_ABOVE) {
    return { left, top: anchor.bottom + GAP, placement: "below" };
  }
  return { left, top: anchor.top - GAP, placement: "above" };
}
