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

/**
 * Consultation slot for demo purposes:
 * Returns Friday at 13:00.
 */
export function getDemoConsultationSlot(from: Date = new Date()): Date {
  const d = new Date(from);
  const currentDay = d.getDay(); // 0 = Sun, 5 = Fri
  let daysUntilFriday = (5 - currentDay + 7) % 7;

  if (daysUntilFriday === 0 && d.getHours() >= 13) {
    daysUntilFriday = 7;
  }

  d.setDate(d.getDate() + daysUntilFriday);
  d.setHours(13, 0, 0, 0);
  return d;
}
