"use client";

import * as React from "react";
import { guardarPreferenciaUI } from "@/app/(app)/prefs-actions";

// La preferencia que SIGUE a la persona: se pinta con el valor que el servidor leyó de su
// perfil y cada cambio se guarda allá (fuego-y-olvido). A diferencia de usePreferenciaLocal,
// esto no se queda en un navegador: «a mí me gusta por nombre» aplica en cualquier equipo.
export function usePreferenciaUsuario<T extends string>(
  clave: string,
  inicial: T | undefined,
  porDefecto: T,
): [T, (v: T) => void] {
  const [valor, setValor] = React.useState<T>(inicial ?? porDefecto);
  const cambiar = React.useCallback(
    (v: T) => {
      setValor(v);
      void guardarPreferenciaUI(clave, v);
    },
    [clave],
  );
  return [valor, cambiar];
}
