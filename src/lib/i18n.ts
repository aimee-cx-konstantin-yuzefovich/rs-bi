export function pluralRu(n: number, forms: [string, string, string]) {
  const ten = n % 10;
  const hundred = n % 100;
  if (hundred >= 11 && hundred <= 14) return forms[2];
  if (ten === 1) return forms[0];
  if (ten >= 2 && ten <= 4) return forms[1];
  return forms[2];
}
