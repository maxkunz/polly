export const SURVEY_LOCK_TTL_MINUTES = 60;

/**
 * Architect liest max. 32.000 Zeichen pro String. Das übersetzte Flow-JSON
 * (Stage/Prod) muss daher in diese Grenze passen, sonst scheitert der Flow
 * erst im laufenden Anruf. Der Draft darf größer sein, Deployen wird dann gesperrt.
 */
export const FLOW_PAYLOAD_MAX_CHARS = 31500;

/** Ab diesem Anteil am Budget zeigt der Editor eine Warnung. */
export const FLOW_PAYLOAD_WARN_RATIO = 0.75;
