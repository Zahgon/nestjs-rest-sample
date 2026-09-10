import { BadRequestException } from './http-exception';

/**
 * Substitutes a fallback when the incoming value is absent, or when coercion
 * already turned an unparseable value into a number that is not a number.
 */
export const defaultValue = <T>(value: any, fallback: T): any => {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === 'number' && isNaN(value)) {
    return fallback;
  }
  return value;
};

const isNumeric = (value: any): boolean =>
  ['string', 'number'].includes(typeof value) &&
  /^-?\d+$/.test(value) &&
  isFinite(value);

/**
 * Accepts only a whole number, in either string or numeric form. A fractional
 * value is rejected even though it would survive `parseInt`.
 */
export const parseIntValue = (value: any): number => {
  if (!isNumeric(value)) {
    throw new BadRequestException(
      'Validation failed (numeric string is expected)',
    );
  }
  return parseInt(value, 10);
};
