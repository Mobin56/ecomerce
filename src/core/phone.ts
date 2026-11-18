/** Bangladesh mobile numbers: 01[3-9]XXXXXXXX (11 digits). */
const BD_MOBILE = /^01[3-9]\d{8}$/;

/** Normalise "+880 1712-345678", "8801712345678", "1712345678" → "01712345678". */
export function normalizeBDPhone(input: string): string | null {
  let digits = input.replace(/[^\d]/g, "");
  if (digits.startsWith("880")) digits = digits.slice(2);
  else if (digits.startsWith("88")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("1")) digits = `0${digits}`;
  return BD_MOBILE.test(digits) ? digits : null;
}

/** Heuristic for obviously fake numbers (01711111111, 01234567890...). */
export function phoneLooksSuspicious(phone: string): boolean {
  const tail = phone.slice(3);
  if (/^(\d)\1+$/.test(tail)) return true;
  if ("0123456789".includes(tail) || "9876543210".includes(tail)) return true;
  return false;
}

/** E.164 for Meta/WhatsApp: 8801712345678 */
export function toE164Digits(phone: string): string {
  return `88${phone}`;
}

export function maskPhone(phone: string): string {
  return phone.length < 6 ? "***" : `${phone.slice(0, 3)}*****${phone.slice(-3)}`;
}
