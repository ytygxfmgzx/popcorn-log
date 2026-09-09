/** uuid v4（现代浏览器/Worker 原生 crypto） */
export function newId(): string {
  return crypto.randomUUID();
}
