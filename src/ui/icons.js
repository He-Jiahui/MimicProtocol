// Atlas slots are explicit so reordering a kit or inventory table cannot change its art.
export const HUD_ATLASES = { kit: 'assets/ui/kits.webp', signal: 'assets/ui/signals.webp', item: 'assets/ui/items.webp', gear: 'assets/ui/gear.svg' };
const sheets = {
  kit: [4, 'burstRifle piercingLine tacticalRoll barrage threeStrike whirlSlash lunge execution markerGrenade deploySentry tacticalHop hiveDrones toxicSpit witherCloud acidSlide plagueBurst'],
  signal: [4, 'scan menu credits carry level penalty elite sample core complete host gear unknown loot warning link'],
  // Hand-drawn vector sheet: the six worn slots, pack, drones, aptitudes and hub tools.
  gear: [4, 'slot_weapon slot_head slot_body slot_hands slot_waist slot_shoes pack drone_courier drone_hauler handling conditioning systems key descent_line repair sealed'],
  // Cells 18 to 23 held the retired Charge items; three are reused: the lead cable for Arc Lead,
  // the amber ampoule for Anticoagulant Rounds and the glowing canister for Thermite Tips.
  item: [5, 'hair_trigger spike_gloves plating coolant salvage_eye static_coil venom_sac overwatch hardlight hive_core mimic_heart ghost_signal piercer magnet frag_rounds orbit_blades arc_emitter nova_core capacitor overflow arc_lead anticoagulant thermite echo medkit'],
};
const cells = Object.fromEntries(Object.entries(sheets).flatMap(([sheet, [size, keys]]) => keys.split(' ').map((key, i) =>
  [key, { sheet, size, x: i % size, y: Math.floor(i / size) }])));

export function icon(key) {
  const cell = cells[key];
  if (!cell) return '';
  const { sheet, size, x, y } = cell;
  return `<i aria-hidden="true" class="art art-${sheet}" style="--pos:${100 * x / (size - 1)}% ${100 * y / (size - 1)}%"></i>`;
}

// The same signal silhouettes are used for world-space warnings on the HUD canvas.
export function drawSignal(ctx, image, key, x, y, size) {
  if (!image.naturalWidth) return;
  const cell = cells[key], side = image.naturalWidth / cell.size;
  ctx.drawImage(image, cell.x * side, cell.y * side, side, side, x, y, size, size);
}
