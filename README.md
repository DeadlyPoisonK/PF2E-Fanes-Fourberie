# PF2E - Fane's Fourberie

Módulo para **Foundry VTT v14** y el sistema **Pathfinder 2e** que automatiza la postura **Fane's Fourberie** del Swashbuckler (cartas como armas).

Por defecto, en PF2e ese feat solo aplica un efecto con un menú «dagger o dart»: no hace nada con las cartas. Este módulo lo completa:

1. Al activar la postura y elegir **Dagger** o **Dart**, busca un mazo (**Playing Cards**) en el inventario. Si no hay, avisa y quita la postura.
2. **Gasta 1 mazo** y crea un montón de **54 cartas** (52 + 2 comodines, como dice la descripción del ítem) con las estadísticas del arma oficial elegida, en mano.
3. Las **runas y el material del mazo** se copian al montón.
4. Al terminar la postura se borra el montón. Si **queda más de la mitad** de las cartas (más de 27), el mazo vuelve al inventario con sus runas. Si no, se pierde y se avisa en el chat.

## El mazo como arma

El mazo puede ser un ítem de tipo **arma**, que permite grabar runas desde su ficha. Si el personaje tiene el «Playing Cards» normal del sistema (equipamiento), el módulo lo **convierte automáticamente a arma** al activar la postura, de modo que queda guardado como arma (admite runas).

## Aura de la postura

Mientras la postura está activa, tres cartas giran alrededor del token, cada una en un círculo que pasa por el centro del token (como tres anillos entrelazados). Requiere [Sequencer](https://foundryvtt.com/packages/sequencer); la dibuja el GM conectado y se quita sola al terminar la postura. Se apaga con el ajuste «Aura de cartas en la postura».

## Fane's Escape

El feat de habilidad **Fane's Escape** (2 acciones) también usa el mazo. Al usarlo desde la tarjeta del feat en el chat, el módulo:

1. **Comprueba el requisito**: un mazo en el inventario, o el stack de la postura si queda más de la mitad de las cartas. Si no hay, avisa y no hace nada.
2. Aplica la condición **Oculto** (Hidden) al personaje. El Sneak y la cobertura quedan para el jugador y el GM.
3. **Transición**: una explosión de cartas cubre el espacio del token y, cuando lo cubre, el token cambia de aspecto. Por defecto queda **fantasma**, con el mismo aspecto cian del estado *Invisible* de Foundry (sigue visible para todos). También se puede elegir **token oculto** de Foundry (los jugadores solo ven el que tienen seleccionado) o **sin cambio**, con el ajuste «Aspecto del token tras Fane's Escape». El aspecto vuelve a la normalidad cuando termina la condición Oculto. La explosión requiere Sequencer (y usa un humo de JB2A debajo si lo tienes) y se apaga con «Explosión de cartas en Fane's Escape».
4. **Esparce el mazo**: pasa a un Item Pile en una casilla contigua al token, listo para recogerse como botín (juntarlo lleva varios minutos). Con la postura activa se esparce el mazo original, con sus runas, el stack se elimina y, al terminar la postura, el mazo **no** vuelve solo.

Esparcir requiere [PF2E - Throw Weapon](https://github.com/DeadlyPoisonK/PF2E-Throw-Weapon) con Item Piles e Item Piles: PF2e. Sin ellos se aplica Oculto, no se toca el mazo y se avisa para quitarlo a mano. Se puede apagar con el ajuste «Automatizar Fane's Escape».

## Con PF2E - Throw Weapon

Es independiente, pero se complementa con [PF2E - Throw Weapon](https://github.com/DeadlyPoisonK/PF2E-Throw-Weapon): las cartas lanzadas se restan del montón y pasan al objetivo o quedan en el piso como botín, con animación de carta si Sequencer y JB2A están activos (el stack lleva `flags.pf2e-throw-weapon.animation = "card"`). Recuperarlas al terminar el combate lo decide el jugador; el módulo no las devuelve solo.

## Instalación

En Foundry: *Add-on Modules → Install Module → Manifest URL*:

```
https://github.com/DeadlyPoisonK/PF2E-Fanes-Fourberie/releases/latest/download/module.json
```

## Requisitos

- Foundry VTT 14
- Sistema PF2e 8.6.1 o superior

## Notas

- Las cartas se llaman «Carts (Dagger)» y «Carts (Dart)» (constante `STACK_NAME` en `scripts/main.mjs`); el tamaño del mazo es `DECK_SIZE`.
- Cada vez que se **crea** el efecto de la postura se gasta un mazo; si el efecto se crea dos veces (por ejemplo, otro módulo que lo aplique y además se pulse «Apply Effect»), se gastarían dos.

## Compatibilidad

Verificado en Foundry 14.369 con PF2e 8.7.0.

## Licencia

MIT
