// Auto-layout: everyone sits around ONE shared family table.
// Seats alternate north / south side from the west end; with an odd count the
// last person takes the head of the table (east end). The table grows east as
// agents are added, and the room grows east (offset E) when the table needs it.
export const SEAT_SPACING = 2.2;
const TABLE_WEST = -5.2;       // the west end is fixed (fireplace corner lives beyond it)
const FIRST_X = -4.2;
const NORTH_Z = -0.9, SOUTH_Z = 1.0, ROOM_EAST = 5.5;

export function computeLayout(count) {
  const n = Math.max(1, count);
  const hasEnd = n >= 3 && n % 2 === 1;
  const perSide = Math.max(1, Math.ceil((n - (hasEnd ? 1 : 0)) / 2));
  const seats = [];
  for (let i = 0; i < perSide; i++) {
    seats.push({ x: FIRST_X + i * SEAT_SPACING, z: NORTH_Z, rot: Math.PI });
    seats.push({ x: FIRST_X + i * SEAT_SPACING, z: SOUTH_Z, rot: 0 });
  }
  const sideEdge = FIRST_X + (perSide - 1) * SEAT_SPACING + 0.85;
  let tableEast = sideEdge + 0.15, endSeat = null;
  if (hasEnd) { endSeat = { x: sideEdge + 0.875, z: 0.05, rot: Math.PI / 2 }; tableEast = endSeat.x + 0.05; }
  const ordered = seats.slice(0, n - (hasEnd ? 1 : 0));
  if (hasEnd) ordered.push(endSeat);
  const occupiedEast = (hasEnd ? endSeat.x + 0.9 : tableEast) ;
  const E = Math.max(0, occupiedEast + 2.6 - ROOM_EAST); // grow the room if needed
  const lampXs = [];
  for (let x = TABLE_WEST + 1.0; x < tableEast - 0.4; x += SEAT_SPACING) lampXs.push(x);
  return {
    seats: ordered, tableWest: TABLE_WEST, tableEast, tableZ: 0.05, tableDepth: 2.05,
    E, maxX: ROOM_EAST + E, lampXs,
    center: { x: (TABLE_WEST + tableEast) / 2, z: 0.05 },
  };
}
