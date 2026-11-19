/**
 * Єдина точка в `src/**`, де помилка перехоплюється (spec-02, §6).
 *
 * Потрібна двом інфраструктурним механізмам: `transaction.ts` (ROLLBACK перед пробросом) і `retry.ts`
 * (повтор лише на SQLITE_BUSY). Бізнес-код і роути працюють без `try/catch` — помилки летять у глобальний обробник.
 */

export type Attempt<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: unknown };

export const attempt = <T>(operation: () => T): Attempt<T> => {
  try {
    return { ok: true, value: operation() };
  } catch (error) {
    return { ok: false, error };
  }
};
