#!/bin/sh
# Arma assets/luces.json: la lista de normal maps (*_n.png) y brillos (*_e.png) que hay en assets/.
# Lo corre solo el hook de git en cada commit (tools/hooks/post-commit); tambien se puede correr a mano.
cd "$(dirname "$0")/.." || exit 0
lista() { find assets -iname "*_$1.png" | sort | sed 's/.*/    "&"/' | sed '$!s/$/,/'; }
{
  printf '{\n  "_ayuda": "Lo arma solo tools/luces.sh (en cada commit). Normal maps: nombre_n.png; brillos: nombre_e.png, al lado del sprite.",\n'
  printf '  "normales": [\n%s\n  ],\n' "$(lista n)"
  printf '  "brillos": [\n%s\n  ]\n}\n' "$(lista e)"
} | sed '/^$/d' > assets/luces.json
