/**
 * Генерація ідентифікаторів для in-memory драйвера (spec-02, §2).
 *
 * SQLite видає `INTEGER PRIMARY KEY` сам; у пам'яті лічильник має давати ті самі послідовні id,
 * щоб один набір тестів проходив на обох драйверах.
 */

export type IdGenerator = () => number;

export const createIdGenerator = (start = 1): IdGenerator => {
  let next = start;
  return () => {
    const id = next;
    next += 1;
    return id;
  };
};
