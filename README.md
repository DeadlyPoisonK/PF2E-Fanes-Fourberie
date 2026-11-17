# PF2E - Fane's Fourberie

Módulo para **Foundry VTT v14** y el sistema **Pathfinder 2e** que automatiza la postura **Fane's Fourberie** del Swashbuckler (cartas como armas).

Por defecto, en PF2e ese feat solo aplica un efecto con un menú «dagger o dart»: no hace nada con las cartas. Este módulo lo completa:

1. Al activar la postura y elegir **Dagger** o **Dart**, busca un mazo (**Playing Cards**) en el inventario. Si no hay, avisa y quita la postura.
2. **Gasta 1 mazo** y crea un montón de **54 cartas** (52 + 2 comodines, como dice la descripción del ítem) con las estadísticas del arma oficial elegida, en mano.
3. Las **runas y el material del mazo** se copian al montón.
4. Al terminar la postura se borra el montón. Si **queda más de la mitad** de las cartas (más de 27), el mazo vuelve al inventario con sus runas. Si no, se pierde y se avisa en el chat.

## El mazo como arma

El mazo puede ser un ítem de tipo **arma**, que permite grabar runas desde su ficha. Si el personaje tiene el «Playing Cards» normal del sistema (equipamiento), el módulo lo **convierte automáticamente a arma** al activar la postura, de modo que queda guardado como arma (admite runas).

## Con PF2E - Throw Weapon

Es independiente, pero se complementa con [PF2E - Throw Weapon](https://github.com/DeadlyPoisonK/PF2E-Throw-Weapon): las cartas lanzadas se restan del montón y pasan al objetivo o quedan en el piso como botín. Recuperarlas al terminar el combate lo decide el jugador; el módulo no las devuelve solo.

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
