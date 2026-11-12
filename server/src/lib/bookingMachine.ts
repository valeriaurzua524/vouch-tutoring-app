/**
 * Booking lifecycle (backlog E1):
 *
 *   requested --accept--> accepted --confirm--> scheduled --complete--> completed
 *       |                    |                      |
 *       +--decline--> declined                      |
 *       +--cancel----------- +--cancel------------- +--cancel--> cancelled
 *
 * "complete" is never called by a user. It fires when both parties have
 * attested that the session took place (routes/bookings.ts).
 */
export type BookingState = 'requested' | 'accepted' | 'scheduled' | 'completed' | 'declined' | 'cancelled';
export type BookingAction = 'accept' | 'decline' | 'confirm' | 'cancel' | 'complete';
export type Actor = 'student' | 'tutor' | 'system';

interface Rule {
  from: BookingState[];
  to: BookingState;
  by: Actor[];
}

export const TRANSITIONS: Record<BookingAction, Rule> = {
  accept: { from: ['requested'], to: 'accepted', by: ['tutor'] },
  decline: { from: ['requested'], to: 'declined', by: ['tutor'] },
  confirm: { from: ['accepted'], to: 'scheduled', by: ['student'] },
  cancel: { from: ['requested', 'accepted', 'scheduled'], to: 'cancelled', by: ['student', 'tutor'] },
  complete: { from: ['scheduled'], to: 'completed', by: ['system'] },
};

/** Bookings in these states count toward a tutor's load and keep a request off the market. */
export const ACTIVE_STATES: BookingState[] = ['requested', 'accepted', 'scheduled'];

export type TransitionCheck = { ok: true; to: BookingState } | { ok: false; reason: 'WRONG_ACTOR' | 'WRONG_STATE' };

export function checkTransition(state: BookingState, action: BookingAction, actor: Actor): TransitionCheck {
  const rule = TRANSITIONS[action];
  if (!rule.by.includes(actor)) return { ok: false, reason: 'WRONG_ACTOR' };
  if (!rule.from.includes(state)) return { ok: false, reason: 'WRONG_STATE' };
  return { ok: true, to: rule.to };
}
