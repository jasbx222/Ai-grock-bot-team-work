// Geometry of the illustrated room (public/art/room_bg.jpg).
// World units = pixels of the 1280x720 reference grid (the image itself is 2560x1440).
// Everything here was measured on the painted background, so if the room art is
// swapped, only this file needs new numbers.
export const WORLD = { w: 1280, h: 720, bg: 'art/room_bg.jpg', bgColor: '#141a2b' };

// round family table (gather point)
export const TABLE = { x: 634, y: 418 };
// gather ring around the table (feet positions)
export const GATHER_RING = { x: 634, y: 424, rx: 196, ry: 118 };

// walkable floor (polygon) and solid furniture (ellipses on the floor)
export const WALK_POLY = [[112, 505], [400, 358], [560, 296], [780, 318], [1000, 432], [1042, 500], [662, 702], [612, 702]];
export const OBSTACLES = [
  { x: 634, y: 416, rx: 150, ry: 88 }, // round table
  { x: 290, y: 535, rx: 80, ry: 54 },  // left armchair
  { x: 915, y: 522, rx: 82, ry: 56 },  // right armchair
];

// Parts of the painting that must be drawn IN FRONT of anybody standing behind
// them (depth sorted by baseY): redrawn from the background through a clip path.
const ell = (cx, cy, rx, ry, n = 28) => Array.from({ length: n }, (_, i) => [cx + rx * Math.cos((i / n) * Math.PI * 2), cy + ry * Math.sin((i / n) * Math.PI * 2)]);
export const OCCLUDERS = [
  { name: 'table', baseY: 505, polys: [ell(634, 412, 127, 77), [[636, 470], [664, 470], [664, 550], [636, 550]], [[542, 455], [562, 455], [562, 506], [542, 506]], [[716, 455], [737, 455], [737, 502], [716, 502]]] },
  { name: 'chairL', baseY: 592, polys: [[[232, 452], [270, 438], [302, 444], [332, 468], [360, 492], [364, 532], [348, 562], [332, 592], [300, 612], [254, 606], [222, 590], [212, 558], [218, 500]]] },
  { name: 'chairR', baseY: 590, polys: [[[848, 470], [880, 438], [922, 426], [962, 433], [988, 455], [998, 500], [992, 560], [966, 582], [930, 602], [880, 612], [843, 596], [833, 540], [838, 494]]] },
];

// desk slots (feet of the desk sprite = bottom centre). First the hand-placed
// ones around the rug, then extra agents get auto slots (see scene2d.js).
export const DESK_SLOTS = [[452, 386], [834, 386], [452, 600], [776, 616], [612, 672]];

// ambience
export const FIRE = { x: 258, y: 330 };
export const LAMPS = [{ x: 115, y: 305 }, { x: 1032, y: 292 }];
export const TANK = { x0: 1064, y0: 340, x1: 1212, y1: 446 };
export const WINDOWS = [
  [[650, 0], [876, 0], [876, 228], [650, 176]],
  [[906, 50], [1084, 112], [1084, 290], [906, 252]],
];
export const BIRD = { x: 1205, y: 262 };
export const PETS = [
  { id: 'cat', img: 'art/cat.png', x: 318, y: 420, w: 74, kind: 'cat', name: 'كوكي' },
  { id: 'dog', img: 'art/dog.png', x: 978, y: 470, w: 92, kind: 'dog', name: 'بندق' },
];
// string-light bulbs detected on the painting (for twinkle)
export const LIGHTS = [[568, 6], [595, 14], [544, 14], [608, 15], [710, 16], [638, 20], [694, 22], [665, 22], [668, 27], [740, 32], [518, 38], [738, 38], [764, 54], [766, 49], [496, 52], [890, 58], [788, 64], [898, 68], [864, 69], [815, 72], [840, 73], [866, 72], [918, 87], [942, 110], [938, 114], [328, 121], [966, 132], [298, 132], [302, 141], [991, 145], [1096, 147], [1018, 154], [1073, 155], [1045, 156], [1070, 160], [1046, 161], [302, 166], [1112, 169], [315, 178], [190, 180], [186, 188], [298, 183], [1128, 194], [281, 194], [206, 197], [266, 203], [1141, 210], [239, 212], [209, 224], [210, 228], [192, 241], [250, 298]];

export const SIT_H = 150;   // world height of a seated desk sprite at depth 1
export const STAND_H = 142; // world height of a standing person at depth 1
export const depthScale = y => 0.8 + 0.32 * Math.min(1, Math.max(0, (y - 290) / 410));
