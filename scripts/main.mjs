/**
 * Jisto - Fane's Fourberie
 *
 * Al crearse el efecto "Stance: Fane's Fourberie" en un actor:
 *   1. Busca un mazo (Playing Cards) en su inventario. Si no hay, avisa y quita la postura.
 *   2. Consume 1 mazo y crea un stack de DECK_SIZE cartas como dagger o dart (segun la eleccion
 *      del efecto), copiando las runas/material del mazo.
 * Al borrarse el efecto:
 *   - Si quedan MAS de la mitad de las cartas, el mazo vuelve al inventario (con sus runas).
 *   - Si no, el mazo se pierde (y se avisa en el chat). El stack siempre se elimina.
 *
 * El mazo puede ser un item de tipo "weapon" (permite grabar runas) o el equipamiento
 * "Playing Cards" normal del sistema: este se convierte automaticamente a weapon al activar la postura.
 */

const ID = "pf2e-fanes-fourberie";
const EFFECT_SLUG = "stance-fanes-fourberie";
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

Hooks.once("init", () => {
  game.modules.get(ID).api = { convertDeck, DECK_SIZE };
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
