import { BadRequestException } from './http-exception';
import { defaultValue, parseIntValue } from './transform';
import { ValidationPipe } from './validation';

/**
 * The bootstrap options from `main.ts`. `transformPrimitive` is a no-op unless
 * transformation is on, so the composition tests below are only meaningful
 * against a pipe configured the way the application configures it.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: {
    enableImplicitConversion: true,
  },
});

const captureBadRequest = (run: () => unknown): BadRequestException => {
  try {
    run();
  } catch (error: unknown) {
    if (error instanceof BadRequestException) {
      return error;
    }
    throw error;
  }
  throw new Error('expected a BadRequestException, but nothing was thrown');
};

/**
 * The three stages exactly as `createPostRouter` composes them for the
 * `limit` and `skip` query parameters, and as `createUserRouter` composes the
 * first two for `withPosts`. Reproduced here rather than imported so a change
 * to the order in a controller shows up as a failure here, not as a silently
 * different number reaching the service.
 */
const resolveLimit = (raw: unknown): number =>
  parseIntValue(defaultValue(pipe.transformPrimitive(raw, Number), 10));

const resolveSkip = (raw: unknown): number =>
  parseIntValue(defaultValue(pipe.transformPrimitive(raw, Number), 0));

const resolveWithPosts = (raw: unknown): boolean =>
  defaultValue(pipe.transformPrimitive(raw, Boolean), false);

describe('defaultValue', () => {
  const substituted: ReadonlyArray<[string, unknown]> = [
    ['null', null],
    ['undefined', undefined],
    ['NaN', NaN],
    ['a NaN produced by coercion', +'abc'],
  ];

  it.each(substituted)('substitutes the fallback for %s', (_label, value) => {
    expect(defaultValue(value, 10)).toBe(10);
  });

  /**
   * Only a numeric NaN is substituted. Zero, the empty string and `false` are
   * all present values and must survive — this is what makes `?limit=` resolve
   * to 0 rather than to the default of 10.
   */
  const preserved: ReadonlyArray<[string, unknown]> = [
    ['zero', 0],
    ['a negative number', -1],
    ['the empty string', ''],
    ['false', false],
    ['the string "NaN"', 'NaN'],
    ['a non-empty string', 'abc'],
  ];

  it.each(preserved)('returns %s unchanged', (_label, value) => {
    expect(defaultValue(value, 10)).toBe(value);
  });

  it('returns the same object reference it was given', () => {
    const value = { id: 1 };

    expect(defaultValue(value, null)).toBe(value);
  });

  it('carries the fallback type through unchanged', () => {
    expect(defaultValue(undefined, false)).toBe(false);
    expect(defaultValue(undefined, 'fallback')).toBe('fallback');
    expect(defaultValue(null, 0)).toBe(0);
  });
});

describe('parseIntValue', () => {
  const accepted: ReadonlyArray<[unknown, number]> = [
    ['42', 42],
    ['0', 0],
    ['-1', -1],
    ['-0', -0],
    ['007', 7],
    [42, 42],
    [0, 0],
    [-1, -1],
  ];

  it.each(accepted)('parses %p into %p', (raw, expected) => {
    expect(parseIntValue(raw)).toBe(expected);
  });

  /**
   * A fractional value is rejected even though `parseInt` would happily
   * truncate it, because the regular expression runs before the parse.
   */
  const rejected: ReadonlyArray<[string, unknown]> = [
    ['a fractional string', '1.5'],
    ['a fractional number', 1.5],
    ['an exponent form', '1e3'],
    ['a signed-positive form', '+42'],
    ['a padded string', ' 42'],
    ['a trailing-garbage string', '42abc'],
    ['a non-numeric string', 'abc'],
    ['the empty string', ''],
    ['a whitespace string', ' '],
    ['null', null],
    ['undefined', undefined],
    ['a boolean', true],
    ['an object', {}],
    ['an array', []],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
  ];

  it.each(rejected)('rejects %s', (_label, raw) => {
    expect(() => parseIntValue(raw)).toThrow(BadRequestException);
  });

  /**
   * All digits, so the regular expression passes, but too large to survive
   * coercion to a double — the `isFinite` guard is the only thing standing
   * between this and an `Infinity` limit reaching the query.
   */
  it('rejects an all-digit string that overflows to Infinity', () => {
    expect(() => parseIntValue('1'.repeat(400))).toThrow(BadRequestException);
  });

  it('renders the numeric-string bad-request envelope', () => {
    const error = captureBadRequest(() => parseIntValue('1.5'));

    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toEqual({
      message: 'Validation failed (numeric string is expected)',
      error: 'Bad Request',
      statusCode: 400,
    });
    expect(error.message).toEqual(
      'Validation failed (numeric string is expected)',
    );
  });
});

/**
 * The seam that matters most: the three stages are separately harmless and
 * only compose into the observed behaviour in the production order. Coercing
 * before defaulting is what turns `?limit=abc` into the default instead of a
 * 400, and defaulting before parsing is what lets `?limit=` stay 0 instead of
 * becoming 10.
 */
describe('GET /posts query resolution', () => {
  const limitCases: ReadonlyArray<[string, unknown, number]> = [
    ['an absent limit falls back to the default', undefined, 10],
    ['an unparseable limit becomes NaN and falls back', 'abc', 10],
    ['an empty limit coerces to zero and stays zero', '', 0],
    ['a negative limit is accepted as is', '-1', -1],
    ['an ordinary limit is parsed', '42', 42],
    ['an explicit zero stays zero', '0', 0],
  ];

  it.each(limitCases)('%s', (_label, raw, expected) => {
    expect(resolveLimit(raw)).toBe(expected);
  });

  it('rejects a fractional limit with a 400 rather than defaulting', () => {
    const error = captureBadRequest(() => resolveLimit('1.5'));

    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toEqual({
      message: 'Validation failed (numeric string is expected)',
      error: 'Bad Request',
      statusCode: 400,
    });
  });

  const skipCases: ReadonlyArray<[string, unknown, number]> = [
    ['an absent skip falls back to zero', undefined, 0],
    ['an unparseable skip falls back to zero', 'abc', 0],
    ['an empty skip coerces to zero', '', 0],
    ['an ordinary skip is parsed', '5', 5],
    ['a negative skip is accepted as is', '-3', -3],
  ];

  it.each(skipCases)('%s', (_label, raw, expected) => {
    expect(resolveSkip(raw)).toBe(expected);
  });

  it('rejects a fractional skip with a 400', () => {
    expect(() => resolveSkip('2.5')).toThrow(BadRequestException);
  });

  it('leaves a free-text q untouched apart from stringification', () => {
    expect(pipe.transformPrimitive('nest', String)).toEqual('nest');
    expect(pipe.transformPrimitive(undefined, String)).toBeUndefined();
  });
});

/**
 * `withPosts` runs through only two of the three stages, and the coercion is
 * strict: anything other than the literal string `true` is false, so an
 * unrecognised value silently opts out rather than erroring.
 */
describe('GET /users/:id withPosts resolution', () => {
  const cases: ReadonlyArray<[string, unknown, boolean]> = [
    ['an absent flag falls back to false', undefined, false],
    ['the literal string true enables it', 'true', true],
    ['an unrecognised value disables it', 'maybe', false],
    ['the literal string false disables it', 'false', false],
    ['an empty flag disables it', '', false],
    ['a capitalised TRUE disables it', 'TRUE', false],
    ['the string 1 disables it', '1', false],
  ];

  it.each(cases)('%s', (_label, raw, expected) => {
    expect(resolveWithPosts(raw)).toBe(expected);
  });
});
