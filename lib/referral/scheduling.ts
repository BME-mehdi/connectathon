/** Default appointment slot offered when a referral is auto-created:
 * the next weekday at 09:00. The patient can change it from the referral
 * page while the referral is still 'request_sent'. */
export function nextBusinessSlot(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setHours(9, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}
