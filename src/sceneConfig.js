// Geometry of the illustrated house (public/art/house_bg.jpg, 2048² image drawn into 1024x1024 world units).
// All numbers were measured on the painting; swapping the art only needs new numbers here.
export const WORLD = { w: 1024, h: 1024, bg: 'art/house_bg.jpg', bgColor: '#0f1526', house: [76, 56, 964, 858] };

// rooms: rect = whole room incl. back wall (tap / zoom box), floor = rects where feet may stand.
// private rooms get an owner (one per agent, in agents.json order); slot = desk sprite feet.
export const ROOMS = [
  { id: 'r1', kind: 'private', rect: [128, 62, 400, 296], floor: [[150, 178, 390, 290]], slot: [283, 263] },
  { id: 'r2', kind: 'private', rect: [400, 62, 640, 292], floor: [[418, 176, 626, 284]], slot: [516, 257] },
  { id: 'r3', kind: 'private', rect: [640, 62, 912, 296], floor: [[652, 182, 898, 290]], slot: [750, 264] },
  { id: 'r4', kind: 'private', rect: [88, 584, 382, 842], floor: [[118, 682, 372, 826]], slot: [250, 790] },
  { id: 'r5', kind: 'private', rect: [648, 584, 946, 842], floor: [[662, 682, 930, 826]], slot: [786, 790] },
  { id: 'kitchen', kind: 'shared', name: 'المطبخ ☕', rect: [84, 290, 338, 592], floor: [[192, 392, 340, 580]] },
  { id: 'hall', kind: 'shared', name: 'صالة العائلة 🛋', rect: [338, 262, 704, 600], floor: [[338, 380, 704, 594]] },
  { id: 'meeting', kind: 'shared', name: 'الاجتماعات 📋', rect: [704, 290, 958, 592], floor: [[710, 384, 936, 578]] },
  { id: 'hallway', kind: 'shared', name: 'المدخل 🚪', rect: [380, 596, 650, 900], floor: [[470, 636, 556, 840]] },
];
// doorways: a/b rooms, rect = walkable bridge through the wall, pa/pb = waypoints on each side
export const DOORS = [
  { a: 'r1', b: 'hall', rect: [350, 278, 392, 394], pa: [370, 284], pb: [372, 392] },
  { a: 'r2', b: 'hall', rect: [588, 272, 626, 394], pa: [606, 278], pb: [608, 392] },
  { a: 'r3', b: 'hall', rect: [652, 278, 694, 394], pa: [672, 286], pb: [672, 392] },
  { a: 'kitchen', b: 'hall', rect: [320, 398, 350, 578], pa: [318, 486], pb: [350, 486] },
  { a: 'meeting', b: 'hall', rect: [696, 398, 720, 578], pa: [722, 486], pb: [694, 486] },
  { a: 'hallway', b: 'hall', rect: [476, 580, 552, 652], pa: [512, 648], pb: [512, 586] },
  { a: 'r4', b: 'hall', rect: [340, 580, 372, 692], pa: [356, 686], pb: [356, 588] },
  { a: 'r5', b: 'hall', rect: [664, 580, 700, 692], pa: [682, 686], pb: [682, 588] },
];
// extra desks for agents beyond the 5 private rooms
export const EXTRA_SLOTS = [[268, 566, 'kitchen'], [880, 566, 'meeting'], [430, 590, 'hall']];

// family hall: furniture cluster + gather ring
export const GATHER_RING = { x: 512, y: 482, rx: 165, ry: 105 };
export const OBSTACLES = [
  { x: 510, y: 478, rx: 48, ry: 30 },  // tea table
  { x: 408, y: 420, rx: 32, ry: 22 }, { x: 618, y: 418, rx: 32, ry: 22 },
  { x: 392, y: 522, rx: 32, ry: 22 }, { x: 632, y: 522, rx: 32, ry: 22 },
  { x: 510, y: 560, rx: 72, ry: 22 },  // sofa
  { x: 800, y: 456, rx: 50, ry: 88 },  // meeting table
];
export const TEA_SPOT = { x: 236, y: 470 }; // where cats go for a glass of tea

// ambience
export const FIRE = { x: 515, y: 352 };
export const LAMPS = [[368, 132], [572, 150], [808, 132], [318, 648], [843, 648], [885, 362], [275, 322], [432, 650], [592, 650]].map(([x, y]) => ({ x, y }));
export const TANK = { x0: 398, y0: 716, x1: 462, y1: 752 };   // procedural aquarium (hallway nook)
export const CAGE = { x: 604, y: 742 };                       // procedural bird cage (hallway nook)
export const PETS = [
  { id: 'cat', img: 'art/cat.webp', x: 470, y: 552, w: 40, kind: 'cat', name: 'كوكي' },
  { id: 'dog', img: 'art/dog.webp', x: 262, y: 545, w: 58, kind: 'dog', name: 'بندق' },
];
const lights = (x0, x1, y, step = 17) => Array.from({ length: Math.floor((x1 - x0) / step) + 1 }, (_, i) => [x0 + i * step, y + Math.sin((i / ((x1 - x0) / step)) * Math.PI) * 5]);
export const LIGHTS = [...lights(185, 395, 88), ...lights(480, 625, 88), ...lights(715, 860, 88), ...lights(752, 892, 322), ...lights(212, 360, 606), ...lights(742, 886, 606)];

export const SIT_H = 112;   // world height of a desk+cat sprite
export const STAND_H = 88;  // world height of a standing cat
export const OWNER_H = 132; // the owner (human) in the overview
export const depthScale = y => 0.94 + 0.1 * Math.min(1, Math.max(0, y / 1024));
