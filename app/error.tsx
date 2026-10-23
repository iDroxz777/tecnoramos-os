"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Tecnoramos OS", error);
  }, [error]);

  return (
    <main className="fatal-error">
      <section>
        <span aria-hidden="true">!</span>
        <h1>Não foi possível abrir esta tela</h1>
        <p>Seus dados salvos não foram apagados. Tente carregar o aplicativo novamente.</p>
        <button type="button" onClick={reset}>Tentar novamente</button>
      </section>
    </main>
  );
}
