/**
 * PF2E - Fane's Fourberie
 *
 * FANE'S FOURBERIE (postura). Al crearse el efecto "Stance: Fane's Fourberie" en un actor:
 *   1. Busca un mazo (Playing Cards) en su inventario. Si no hay, avisa y quita la postura.
 *   2. Consume 1 mazo y crea un stack de DECK_SIZE cartas como dagger o dart (segun la eleccion
 *      del efecto), copiando las runas/material del mazo.
 * Al borrarse el efecto:
 *   - Si quedan MAS de la mitad de las cartas, el mazo vuelve al inventario (con sus runas).
 *   - Si no, el mazo se pierde (y se avisa en el chat). El stack siempre se elimina.
 *
 * FANE'S ESCAPE (feat de habilidad, 2 acciones). Al usarlo (tarjeta del feat en el chat):
 *   - Requisito: un mazo en el inventario, o el stack de la postura si queda mas de la mitad de las cartas.
 *   - El personaje queda Oculto (condicion Hidden). El Sneak queda para el jugador.
 *   - El mazo queda esparcido: pasa a un Item Pile en una casilla contigua al token (hace falta
 *     PF2E - Throw Weapon con Item Piles; si no esta, no se toca el mazo y se avisa).
 *     Con la postura activa se esparce el mazo original (con sus runas) y el stack se elimina;
 *     al terminar la postura el mazo NO vuelve solo.
 *
 * El mazo puede ser un item de tipo "weapon" (permite grabar runas) o el equipamiento
 * "Playing Cards" normal del sistema: este se convierte automaticamente a weapon al activar la postura.
 */

const ID = "pf2e-fanes-fourberie";
const EFFECT_SLUG = "stance-fanes-fourberie";
const ESCAPE_SLUG = "fanes-escape";
const THROW_ID = "pf2e-throw-weapon";
const CHOICE_FLAG = "stanceFanesFourberie";
const DECK_SIZE = 54; // Old Mage deck: 52 + 2 comodines (segun la descripcion del item)
const DECK_SLUG = "playing-cards";
const STACK_NAME = { dagger: "Carts (Dagger)", dart: "Carts (Dart)" };
const BASE_UUID = {
  dagger: "Compendium.pf2e.equipment-srd.Item.rQWaJhI5Bko5x14Z",
  dart: "Compendium.pf2e.equipment-srd.Item.Tt4Qw64fwrxhr5gT",
};

// Se leen/escriben flags directo (no con getFlag/setFlag) para no depender de que el modulo este "activo".
const isDeck = (i) =>
  i.flags?.[ID]?.deck === true ||
  (i.type === "equipment" && i.slug === DECK_SLUG) ||
  (i.type === "weapon" && i.slug === DECK_SLUG);

const runesKey = (i) =>
  JSON.stringify([i.system.runes ?? null, i.system.material ?? null]);

function say(actor, html) {
  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: html,
  });
}

/** Elige el mazo a consumir: prefiere los de tipo weapon (pueden tener runas). */
function findDeck(actor) {
  const decks = actor.items.filter((i) => isDeck(i) && (i.system.quantity ?? 1) > 0);
  return decks.find((i) => i.type === "weapon") ?? decks[0] ?? null;
}

async function onStanceStart(effect) {
  const actor = effect.parent;
  if (!(actor instanceof Actor)) return;
  const choice = effect.flags?.pf2e?.rulesSelections?.[CHOICE_FLAG];
  if (!BASE_UUID[choice]) {
    ui.notifications.warn(`Fane's Fourberie: no pude leer la eleccion (dagger/dart) del efecto.`);
    return;
  }

  // Si el mazo es el equipamiento normal del sistema, se convierte a weapon (queda guardado como arma,
  // asi puede llevar runas) antes de gastarlo.
  let converted = 0;
  if (actor.items.some((i) => i.type === "equipment" && i.slug === DECK_SLUG)) {
    converted = await convertDeck(actor);
  }

  const deck = findDeck(actor);
  if (!deck) {
    ui.notifications.warn(`${actor.name} no tiene un mazo de Playing Cards: no se puede activar Fane's Fourberie.`);
    await effect.delete();
    return;
  }

  const base = await fromUuid(BASE_UUID[choice]);
  const stack = base.toObject();
  delete stack._id;
  stack.name = STACK_NAME[choice];
  stack.system.quantity = DECK_SIZE;
  stack.system.bulk = { value: 0 }; // 54 cartas pesan ~L, el mazo ya no cuenta mientras tanto
  stack.system.equipped = { carryType: "held", handsHeld: 1 };
  if (deck.type === "weapon") {
    stack.system.runes = foundry.utils.deepClone(deck.system.runes);
    if (deck.system.material) stack.system.material = foundry.utils.deepClone(deck.system.material);
  }
  stack.flags = { [ID]: { stack: true }, "pf2e-throw-weapon": { animation: "card" } };

  // Datos del mazo para poder devolverlo igual (con runas) al terminar la postura.
  const deckData = deck.toObject();
  delete deckData._id;
  deckData.system.quantity = 1;

  const [created] = await actor.createEmbeddedDocuments("Item", [stack]);
  if ((deck.system.quantity ?? 1) > 1) await deck.update({ "system.quantity": deck.system.quantity - 1 });
  else await deck.delete();

  await effect.update({ [`flags.${ID}.state`]: { stackId: created.id, deckData, choice } });
  say(actor, `<p><strong>Fane's Fourberie</strong>: ${actor.name} saca un mazo y lo convierte en ${DECK_SIZE} cartas (${choice}).${converted ? " Su mazo normal queda ahora como arma guardada (admite runas)." : ""}</p>`);
}

async function onStanceEnd(effect) {
  const actor = effect.parent;
  const state = effect.flags?.[ID]?.state;
  if (!(actor instanceof Actor) || !state) return;

  const stack = actor.items.get(state.stackId);
  const remaining = stack?.system.quantity ?? 0;
  if (stack) await stack.delete();

  if (state.scattered) {
    say(actor, `<p><strong>Fane's Fourberie</strong> termina: el mazo de ${actor.name} quedo esparcido por Fane's Escape; no vuelve solo (hay que recogerlo del piso).</p>`);
    return;
  }

  if (remaining * 2 > DECK_SIZE) {
    const data = foundry.utils.deepClone(state.deckData);
    const tmp = new Item.implementation(data);
    const same = actor.items.find((i) => i.type === data.type && isDeck(i) && runesKey(i) === runesKey(tmp));
    if (same) await same.update({ "system.quantity": (same.system.quantity ?? 1) + 1 });
    else await actor.createEmbeddedDocuments("Item", [data]);
    say(actor, `<p><strong>Fane's Fourberie</strong> termina: ${actor.name} recupera el mazo (${remaining}/${DECK_SIZE} cartas).</p>`);
  } else {
    say(actor, `<p><strong>Fane's Fourberie</strong> termina: a ${actor.name} le quedan solo ${remaining}/${DECK_SIZE} cartas; el mazo se pierde.</p>`);
  }
}

/**
 * Convierte los "Playing Cards" de equipamiento del actor en items de tipo weapon (mazo con runas).
 * Conserva cantidad, precio, bulk y descripcion. Devuelve cuantos convirtio.
 */
async function convertDeck(actor) {
  const olds = actor.items.filter((i) => i.type === "equipment" && i.slug === DECK_SLUG);
  if (!olds.length) return 0;
  const dart = await fromUuid(BASE_UUID.dart);
  const created = [];
  for (const old of olds) {
    const data = dart.toObject();
    delete data._id;
    data.name = old.name;
    data.img = old.img;
    data.system.slug = DECK_SLUG;
    data.system.description = foundry.utils.deepClone(old.system.description);
    data.system.quantity = old.system.quantity;
    data.system.bulk = foundry.utils.deepClone(old.system.bulk);
    data.system.price = foundry.utils.deepClone(old.system.price);
    data.system.traits = { ...data.system.traits, value: [] };
    data.system.range = null;
    data.system.group = null;
    data.system.baseItem = null;
    data.system.equipped = { carryType: "stowed" };
    data.flags = { [ID]: { deck: true } };
    created.push(data);
  }
  await actor.createEmbeddedDocuments("Item", created);
  await actor.deleteEmbeddedDocuments("Item", olds.map((i) => i.id));
  return created.length;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ESC_CARDS = 28;
const ESC_COVER_MS = 550; // tiempo hasta que las cartas cubren el token y este desaparece
const sequencerOn = () => game.modules.get("sequencer")?.active && typeof Sequencer !== "undefined";

/** Explosion de cartas que cubre el espacio del token (Sequencer; JB2A pone un humo debajo si existe). */
function escapeBurst(token) {
  const obj = token.object;
  if (!obj) return false;
  const seq = new Sequence();
  const puff = "jb2a.smoke.puff.centered.grey.0";
  if (Sequencer.Database.entryExists(puff)) {
    seq.effect().file(puff).atLocation(obj).scaleToObject(2).fadeOut(400).zIndex(25).opacity(0.8);
  }
  for (let i = 0; i < ESC_CARDS; i++) {
    const ang = Math.random() * 2 * Math.PI;
    const dist = (i % 5 === 0 ? 0.55 : 0.1) + Math.random() * (i % 5 === 0 ? 0.4 : 0.45); // casillas desde el centro
    const rot0 = Math.random() * 360;
    const spin = (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540);
    seq
      .effect()
      .file(AURA_FILE)
      .atLocation(obj)
      .scaleToObject(0.3 + Math.random() * 0.12)
      .delay(Math.random() * 120)
      .animateProperty("sprite", "position.x", { from: 0, to: Math.cos(ang) * dist, duration: 450, ease: "easeOutCubic", gridUnits: true })
      .animateProperty("sprite", "position.y", { from: 0, to: Math.sin(ang) * dist, duration: 450, ease: "easeOutCubic", gridUnits: true })
      .animateProperty("sprite", "rotation", { from: rot0, to: rot0 + spin, duration: 1400, ease: "easeOutQuad" })
      .duration(1500)
      .fadeIn(60)
      .fadeOut(450)
      .zIndex(30 + i);
  }
  seq.play();
  return true;
}

/** Transicion de Fane's Escape: explosion de cartas y, cuando cubren el token, este cambia de aspecto
 *  ("ghost": mismo aspecto fantasmal del estado Invisible de Foundry; "hidden": token oculto; "none"). */
async function escapeTransition(token) {
  let fx = false;
  if (game.settings.get(ID, "escapeFx") && sequencerOn()) fx = escapeBurst(token);
  const look = game.settings.get(ID, "escapeLook");
  if (look === "none") return;
  if (fx) await sleep(ESC_COVER_MS);
  const update = { [`flags.${ID}.hiddenByEscape`]: look };
  if (look === "hidden") update.hidden = true;
  await token.update(update);
  console.log(`${ID} | Fane's Escape: token de ${token.name} -> ${look}`);
}

/** Devuelve el token a su aspecto normal (solo si lo cambiamos nosotros). */
async function escapeRestore(token) {
  const mode = token.flags?.[ID]?.hiddenByEscape;
  if (!mode) return;
  const update = { [`flags.${ID}.-=hiddenByEscape`]: null };
  if (mode === "hidden") update.hidden = false;
  await token.update(update);
  console.log(`${ID} | ${token.name} deja de estar Oculto: el token vuelve a verse normal`);
}

// Al terminar la condicion Oculto, el token que cambiamos vuelve a su aspecto normal.
Hooks.on("deleteItem", (item) => {
  if (item.type !== "condition" || item.slug !== "hidden" || !(item.parent instanceof Actor)) return;
  if (game.user !== game.users.activeGM) return;
  for (const t of canvas.scene?.tokens ?? []) {
    if (t.actor === item.parent || t.actor?.id === item.parent.id) escapeRestore(t).catch((e) => console.warn(`${ID} | restaurar token`, e));
  }
});

/* ---------- Aspecto fantasma: el mismo filtro de Foundry que usa el estado Invisible ---------- */
const GHOST_KEY = `${ID}-ghost-filter`;

/** Pone o quita el filtro segun la marca del token. Se llama en cada refresco, asi sobrevive a redibujados. */
function applyGhost(token) {
  const mesh = token?.mesh;
  const Filter = foundry.canvas.rendering.filters?.InvisibilityFilter;
  if (!mesh || !Filter) return;
  const want = token.document.flags?.[ID]?.hiddenByEscape === "ghost" && game.settings.get(ID, "escapeLook") === "ghost";
  let f = mesh[GHOST_KEY];
  if (want) {
    if (!f) f = mesh[GHOST_KEY] = Filter.create({});
    mesh.filters ??= [];
    if (!mesh.filters.includes(f)) mesh.filters.push(f);
    f.enabled = true;
  } else if (f) {
    mesh.filters = (mesh.filters ?? []).filter((x) => x !== f);
    delete mesh[GHOST_KEY];
  }
}
Hooks.on("refreshToken", applyGhost);
Hooks.on("drawToken", applyGhost);
Hooks.on("updateToken", (doc, changes) => {
  if (changes.flags) applyGhost(doc.object);
});
/**
 * Fane's Escape: el personaje queda Oculto, el mazo queda esparcido (Item Pile junto al token) y una
 * explosion de cartas cubre el token, que se oculta. Solo se actua si se cumple el requisito (mazo en posesion).
 */
async function onEscape(actor, message) {
  const effect = actor.itemTypes.effect.find((e) => e.slug === EFFECT_SLUG && e.flags?.[ID]?.state);
  const state = effect?.flags?.[ID]?.state;
  const stack = state ? actor.items.get(state.stackId) : null;
  const useStack = !!stack && (stack.system.quantity ?? 0) * 2 > DECK_SIZE; // "queda el mazo" = mas de la mitad
  const deck = useStack ? null : findDeck(actor);
  if (!useStack && !deck) {
    ui.notifications.warn(`${actor.name} no tiene un mazo de cartas en su poder: Fane's Escape no se puede usar.`);
    return;
  }

  try {
    if (!actor.hasCondition("hidden")) await actor.increaseCondition("hidden");
  } catch (e) {
    console.warn(`${ID} | no pude aplicar la condicion Oculto`, e);
    ui.notifications.warn("Fane's Escape: no pude aplicar la condicion Oculto; aplicala a mano.");
  }

  const throwApi = game.modules.get(THROW_ID)?.active ? game.modules.get(THROW_ID).api : null;
  const tokenId = message.speaker?.token;
  const token = (tokenId && canvas.scene?.tokens.get(tokenId)) || actor.getActiveTokens()[0]?.document || null;
  if (token) escapeTransition(token).catch((e) => console.warn(`${ID} | transicion de Escape`, e));
  if (!throwApi?.dropToFloor || !token) {
    ui.notifications.warn("Fane's Escape: para esparcir las cartas hace falta PF2E - Throw Weapon (con Item Piles) y un token en la escena. No se toco el mazo: quitalo a mano.");
    return;
  }

  const source = useStack ? stack : deck;
  const data = foundry.utils.deepClone(useStack ? state.deckData : source.toObject());
  delete data._id;
  data.system.quantity = 1;
  try {
    await throwApi.dropToFloor(token, data, source);
  } catch (e) {
    console.warn(`${ID} | no pude esparcir el mazo`, e);
    ui.notifications.warn("Fane's Escape: no pude esparcir el mazo (Item Piles); no se toco el inventario.");
    return;
  }

  if (useStack) {
    await stack.delete();
    await effect.update({ [`flags.${ID}.state.scattered`]: true });
  } else if ((deck.system.quantity ?? 1) > 1) await deck.update({ "system.quantity": deck.system.quantity - 1 });
  else await deck.delete();

  ui.notifications.info(`${actor.name}: Fane's Escape - queda Oculto y las cartas del mazo quedan esparcidas junto a su token (juntarlas lleva varios minutos).`);
  console.log(`${ID} | Fane's Escape: ${actor.name} oculto, mazo esparcido (${useStack ? "desde el stack de la postura" : "desde el inventario"})`);
}

Hooks.once("init", () => {
  game.modules.get(ID).api = { convertDeck, DECK_SIZE, escapeBurst, escapeTransition, escapeRestore };
  game.settings.register(ID, "escape", {
    name: "Automatizar Fane's Escape",
    hint: "Al usar el feat: aplica Oculto y esparce el mazo (Item Pile junto al token). Requiere PF2E - Throw Weapon con Item Piles para esparcir.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
  game.settings.register(ID, "escapeFx", {
    name: "Explosion de cartas en Fane's Escape",
    hint: "Al usar Fane's Escape, una explosion de cartas cubre el token. Requiere Sequencer.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
  game.settings.register(ID, "escapeLook", {
    name: "Aspecto del token tras Fane's Escape",
    hint: "Fantasma: el mismo aspecto del estado Invisible de Foundry (el token sigue visible para todos). Oculto: token oculto de Foundry, los jugadores solo ven el que tienen seleccionado. Se quita al terminar la condicion Oculto.",
    scope: "world",
    config: true,
    type: String,
    choices: { ghost: "Fantasma (como Invisible)", hidden: "Token oculto", none: "Sin cambio" },
    default: "ghost",
    onChange: () => canvas.tokens?.placeables.forEach((t) => applyGhost(t)),
  });
  game.settings.register(ID, "aura", {
    name: "Aura de cartas en la postura",
    hint: "Mientras la postura Fane's Fourberie esta activa, tres cartas orbitan el token. Requiere Sequencer; lo dibuja el GM.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => syncAuras(),
  });
});

/* ---------- Aura visual de la postura (Sequencer, opcional) ---------- */

const AURA_FILE = `modules/${ID}/assets/card.png`;
const AURA_CARDS = 3;
const AURA_MS = 9000; // una vuelta completa de cada carta
const AURA_R = 0.25; // radio de cada circulo, en casillas (cada circulo pasa por el centro del token; maximo 2R = 0.5 del centro)
const AURA_CARD_SCALE = 0.19; // tamano de la carta (fraccion del token)
const AURA_STEPS = 48; // puntos por vuelta (trayectoria suave con interpolacion lineal)

/**
 * Trayectoria de la carta i: circulo de radio R cuyo centro esta a distancia R del centro del token
 * (centros a 120 grados entre si, como tres anillos entrelazados). Cada carta pasa por el centro
 * del token en un momento distinto de la vuelta.
 */
function auraPath(i) {
  const rad = (d) => (d * Math.PI) / 180;
  const phi = i * (360 / AURA_CARDS) - 90; // direccion del centro del circulo (la primera apunta arriba)
  const start = phi + 180 + i * (360 / AURA_CARDS); // posicion inicial, escalonada
  const xs = [], ys = [], rot = [];
  for (let k = 0; k <= AURA_STEPS; k++) {
    const th = start + (360 * k) / AURA_STEPS;
    xs.push(AURA_R * (Math.cos(rad(phi)) + Math.cos(rad(th))));
    ys.push(AURA_R * (Math.sin(rad(phi)) + Math.sin(rad(th))));
    rot.push(th); // la carta va de canto a su trayectoria
  }
  return { xs, ys, rot };
}
const auraName = (tokenId) => `${ID}-aura-${tokenId}`;
const isStanceActive = (actor) =>
  !!actor?.itemTypes.effect.some((e) => e.slug === EFFECT_SLUG && e.flags?.[ID]?.state);

// Solo la dibuja el GM activo (el efecto persistente se guarda en la escena y se ve en todos los clientes).
const auraCanRun = () =>
  game.user === game.users.activeGM && game.modules.get("sequencer")?.active && typeof Sequencer !== "undefined";

async function auraStop(tokenId) {
  await Sequencer.EffectManager.endEffects({ name: `${auraName(tokenId)}-*` });
}

async function auraStart(tokenDoc) {
  const token = tokenDoc.object;
  if (!token) return;
  // Exactamente una carta por indice; si falta alguna o sobra (p. ej. al reponer efectos persistentes), se rehace entero.
  const have = Sequencer.EffectManager.getEffects({ name: `${auraName(tokenDoc.id)}-*` })
    .map((e) => e.data.name)
    .sort();
  const want = Array.from({ length: AURA_CARDS }, (_, i) => `${auraName(tokenDoc.id)}-${i}`).sort();
  if (have.length === want.length && have.every((n, i) => n === want[i])) return;
  if (have.length) await auraStop(tokenDoc.id);
  const seq = new Sequence();
  for (let i = 0; i < AURA_CARDS; i++) {
    const { xs, ys, rot } = auraPath(i);
    // En Sequencer, `duration` es el tiempo de cada tramo entre dos puntos (no de la vuelta completa).
    const loop = { duration: AURA_MS / AURA_STEPS, ease: "linear" };
    seq
      .effect()
      .file(AURA_FILE)
      .name(`${auraName(tokenDoc.id)}-${i}`)
      .attachTo(token, { bindVisibility: true })
      .scaleToObject(AURA_CARD_SCALE)
      .loopProperty("sprite", "position.x", { ...loop, values: xs, gridUnits: true })
      .loopProperty("sprite", "position.y", { ...loop, values: ys, gridUnits: true })
      .loopProperty("sprite", "rotation", { ...loop, values: rot })
      .persist()
      .fadeIn(500)
      .fadeOut(300)
      .zIndex(20);
  }
  await seq.play();
  console.log(`${ID} | aura de cartas activada en ${tokenDoc.name}`);
}

/** Deja las auras de la escena actual igual que las posturas activas (o sin auras si el ajuste esta apagado). */
async function syncAuras() {
  if (!auraCanRun() || !canvas.scene) return;
  const on = game.settings.get(ID, "aura");
  for (const t of canvas.scene.tokens) {
    if (on && isStanceActive(t.actor)) await auraStart(t);
    else await auraStop(t.id);
  }
}

const refreshAura = (actor) => {
  if (!auraCanRun() || !canvas.scene || !actor) return;
  const on = game.settings.get(ID, "aura");
  for (const t of actor.getActiveTokens(false, true)) {
    (on && isStanceActive(actor) ? auraStart(t) : auraStop(t.id)).catch((e) => console.warn(`${ID} | aura`, e));
  }
};
const isStanceEffect = (i) => i.type === "effect" && i.slug === EFFECT_SLUG && i.parent instanceof Actor;

// La postura guarda su estado (flags.state) cuando ya consumio el mazo: ahi empieza el aura.
Hooks.on("updateItem", (item, changes) => {
  if (isStanceEffect(item) && changes.flags?.[ID]?.state) refreshAura(item.parent);
});
Hooks.on("deleteItem", (item) => {
  if (isStanceEffect(item)) refreshAura(item.parent);
});
// Al cargar una escena se reponen las auras que falten (Sequencer repone las persistentes por su cuenta).
// Se comprueba dos veces porque la reposicion de Sequencer y la nuestra pueden cruzarse y dejar una carta de menos.
Hooks.on("canvasReady", () => {
  for (const ms of [2000, 7000]) setTimeout(() => syncAuras().catch((e) => console.warn(`${ID} | aura`, e)), ms);
});

Hooks.on("createChatMessage", (message, _options, userId) => {
  if (userId !== game.user.id) return;
  const item = message.item;
  if (item?.type !== "feat" || item.slug !== ESCAPE_SLUG || !item.actor) return;
  if (!game.settings.get(ID, "escape")) return;
  onEscape(item.actor, message).catch((e) => {
    console.error(`${ID} | escape`, e);
    ui.notifications.error("Fane's Escape: error, mira la consola (F12).");
  });
});

Hooks.on("createItem", (item, _options, userId) => {
  if (userId !== game.user.id) return;
  if (item.type !== "effect" || item.slug !== EFFECT_SLUG || !item.parent) return;
  onStanceStart(item).catch((e) => console.error(`${ID} | start`, e));
});

Hooks.on("deleteItem", (item, _options, userId) => {
  if (userId !== game.user.id) return;
  if (item.type !== "effect" || item.slug !== EFFECT_SLUG || !item.parent) return;
  onStanceEnd(item).catch((e) => console.error(`${ID} | end`, e));
});
