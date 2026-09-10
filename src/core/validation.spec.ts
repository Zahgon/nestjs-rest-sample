import { ClassConstructor } from 'class-transformer';
import { ValidationError } from 'class-validator';
import { BadRequestException } from './http-exception';
import { ValidationPipe } from './validation';
import { RegisterDto } from '../user/register.dto';
import { CreatePostDto } from '../post/create-post.dto';
import { UpdatePostDto } from '../post/update-post.dto';
import { CreateCommentDto } from '../post/create-comment.dto';
import { RefreshTokenDto } from '../auth/dto/refresh-token.dto';

/**
 * The options the application installs in `main.ts`. Every assertion about a
 * rejected payload below is only meaningful against these exact options, so
 * they are spelled out rather than imported: a bootstrap that silently drops
 * `forbidNonWhitelisted` or `enableImplicitConversion` has to fail here.
 */
const productionPipe = (): ValidationPipe =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
  });

/** Exposes the protected error-flattening helpers to the test. */
class ExposedValidationPipe extends ValidationPipe {
  flatten(errors: ValidationError[]): string[] {
    return this.flattenValidationErrors(errors);
  }

  mapChildren(error: ValidationError, parentPath?: string): ValidationError[] {
    return this.mapChildrenToValidationErrors(error, parentPath);
  }

  prepend(parentPath: string, error: ValidationError): ValidationError {
    return this.prependConstraintsWithParentProp(parentPath, error);
  }
}

const validationError = (
  init: Partial<ValidationError> & { property: string },
): ValidationError => Object.assign(new ValidationError(), init);

const captureRejection = async (
  run: () => Promise<unknown>,
): Promise<BadRequestException> => {
  try {
    await run();
  } catch (error: unknown) {
    if (error instanceof BadRequestException) {
      return error;
    }
    throw error;
  }
  throw new Error('expected a BadRequestException, but nothing was thrown');
};

const messagesOf = async (
  pipe: ValidationPipe,
  value: unknown,
  metatype: ClassConstructor<object>,
): Promise<unknown> => {
  const error = await captureRejection(() => pipe.transform(value, metatype));
  const body = error.getResponse();
  return typeof body === 'string' ? body : body.message;
};

const VALID_REGISTRATION = {
  username: 'hantsy',
  email: 'hantsy@gmail.com',
  password: 'password',
  firstName: 'Hantsy',
  lastName: 'Bai',
};

/**
 * The exact array a `POST /register` with an empty body renders. Properties
 * keep their declaration order while the constraints of each property come
 * out in reverse declaration order. The two password messages carry upstream
 * leading and trailing spaces; they are pinned character for character so
 * nobody tidies them away.
 */
const EMPTY_REGISTRATION_MESSAGES = [
  'username should not be empty',
  'email must be an email',
  'email should not be empty',
  " The password can't accept more than 20 characters ",
  ' The min length of password is 8 ',
  'password should not be empty',
  'firstName must be a string',
  'lastName must be a string',
];

const NIL_BODIES: ReadonlyArray<[string, null | undefined]> = [
  ['null', null],
  ['undefined', undefined],
];

describe('ValidationPipe', () => {
  it('should be defined', () => {
    expect(productionPipe()).toBeDefined();
  });

  describe('constructor', () => {
    it('reports transformation off when no options are supplied', () => {
      expect(new ValidationPipe().transformEnabled).toBe(false);
    });

    it('reports transformation off when transform is explicitly false', () => {
      expect(new ValidationPipe({ transform: false }).transformEnabled).toBe(
        false,
      );
    });

    it('reports transformation on for the bootstrap options', () => {
      expect(productionPipe().transformEnabled).toBe(true);
    });
  });

  describe('rejecting a body', () => {
    /**
     * The wire contract of a failed validation: an array-valued `message`,
     * the `Bad Request` error label and a 400. `HttpException.createBody`
     * only produces this shape for a string or an array, so a pipe that
     * flattened its errors into an object would be caught here.
     */
    it('renders the array-message bad-request envelope', async () => {
      const error = await captureRejection(() =>
        productionPipe().transform({}, CreateCommentDto),
      );

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toEqual({
        message: ['content should not be empty'],
        error: 'Bad Request',
        statusCode: 400,
      });
    });

    it('flattens an empty registration into the eight upstream messages, in order', async () => {
      expect(await messagesOf(productionPipe(), {}, RegisterDto)).toEqual(
        EMPTY_REGISTRATION_MESSAGES,
      );
    });

    /**
     * A request that arrives without a content type is never parsed, so the
     * handler sees a nil body. It has to validate as an empty object and
     * render the same array rather than crash on a property read.
     */
    it.each(NIL_BODIES)(
      'treats a nil body (%s) as an empty object rather than crashing',
      async (_label, body) => {
        expect(await messagesOf(productionPipe(), body, RegisterDto)).toEqual(
          EMPTY_REGISTRATION_MESSAGES,
        );
      },
    );

    it('rejects an unknown property when non-whitelisted properties are forbidden', async () => {
      const messages = await messagesOf(
        productionPipe(),
        { title: 'a title', content: 'some content', bogus: 'nope' },
        CreatePostDto,
      );

      expect(messages).toEqual(['property bogus should not exist']);
    });

    it('rejects a short password with only the min-length message', async () => {
      const messages = await messagesOf(
        productionPipe(),
        { ...VALID_REGISTRATION, password: 'short' },
        RegisterDto,
      );

      expect(messages).toEqual([' The min length of password is 8 ']);
    });

    it('rejects an over-long password with only the max-length message', async () => {
      const messages = await messagesOf(
        productionPipe(),
        { ...VALID_REGISTRATION, password: 'p'.repeat(21) },
        RegisterDto,
      );

      expect(messages).toEqual([
        " The password can't accept more than 20 characters ",
      ]);
    });

    it('rejects a malformed email', async () => {
      const messages = await messagesOf(
        productionPipe(),
        { ...VALID_REGISTRATION, email: 'not-an-email' },
        RegisterDto,
      );

      expect(messages).toEqual(['email must be an email']);
    });

    it('rejects an empty update payload', async () => {
      expect(await messagesOf(productionPipe(), {}, UpdatePostDto)).toEqual([
        'title should not be empty',
        'content should not be empty',
      ]);
    });

    it('rejects an empty refresh-token payload in reverse decorator order', async () => {
      expect(await messagesOf(productionPipe(), {}, RefreshTokenDto)).toEqual([
        'refresh_token must be a string',
        'refresh_token should not be empty',
      ]);
    });
  });

  describe('accepting a body', () => {
    it('returns a validated registration as an instance of its class', async () => {
      const result = await productionPipe().transform(
        { ...VALID_REGISTRATION },
        RegisterDto,
      );

      expect(result).toBeInstanceOf(RegisterDto);
      expect({ ...result }).toEqual(VALID_REGISTRATION);
    });

    it('accepts a refresh-token payload', async () => {
      const result = await productionPipe().transform(
        { refresh_token: 'a.b.c' },
        RefreshTokenDto,
      );

      expect(result).toBeInstanceOf(RefreshTokenDto);
      expect(result.refresh_token).toEqual('a.b.c');
    });

    /**
     * Upstream quirk, deliberately preserved: `@IsNotEmpty()` is satisfied by
     * a number, so a numeric title is accepted where a caller would expect a
     * 400. A migration that "fixed" this by adding `@IsString()` would change
     * the observable API, so the quirk is pinned here.
     */
    it('accepts a numeric title on CreatePostDto (upstream quirk)', async () => {
      const result = await productionPipe().transform(
        { title: 123, content: 'x' },
        CreatePostDto,
      );

      expect(result).toBeInstanceOf(CreatePostDto);
      expect(result.content).toEqual('x');
      expect(result.title).toEqual('123');
    });

    it('accepts a numeric content on CreateCommentDto for the same reason', async () => {
      const result = await productionPipe().transform(
        { content: 456 },
        CreateCommentDto,
      );

      expect(result).toBeInstanceOf(CreateCommentDto);
      expect(result.content).toEqual('456');
    });

    it('leaves a numeric value alone when implicit conversion is off', async () => {
      const result = await new ValidationPipe({ transform: true }).transform(
        { title: 123, content: 'x' },
        CreatePostDto,
      );

      expect(result.title).toEqual(123);
    });

    it('returns the original object untouched when transformation is off', async () => {
      const pipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      const payload = { ...VALID_REGISTRATION };

      const result = await pipe.transform(payload, RegisterDto);

      expect(result).toBe(payload);
      expect(result).not.toBeInstanceOf(RegisterDto);
    });

    /**
     * With transformation off a nil body must come back as the nil it arrived
     * as — the `{}` substitution exists only so validation does not crash, and
     * must not leak into the handler argument. Missing properties are skipped
     * here purely so validation gets far enough to return: every DTO in this
     * project rejects an empty object outright.
     */
    it.each(NIL_BODIES)(
      'gives a nil body (%s) back unchanged when transformation is off',
      async (_label, body) => {
        const result = await new ValidationPipe({
          skipMissingProperties: true,
        }).transform(body, CreatePostDto);

        expect(result).toBe(body);
      },
    );

    it('returns the transformed instance for a nil body when transformation is on', async () => {
      const result = await new ValidationPipe({
        skipMissingProperties: true,
        transform: true,
      }).transform(undefined, CreatePostDto);

      expect(result).toBeInstanceOf(CreatePostDto);
    });

    it('strips an unknown property when whitelisting without forbidding', async () => {
      const result = await new ValidationPipe({
        whitelist: true,
        transform: true,
      }).transform(
        { title: 'a title', content: 'some content', bogus: 'nope' },
        CreatePostDto,
      );

      expect(Object.keys({ ...result }).sort()).toEqual(['content', 'title']);
    });
  });

  describe('transformPrimitive', () => {
    const pipe = productionPipe();

    const booleanCases: ReadonlyArray<[unknown, boolean]> = [
      ['true', true],
      [true, true],
      ['false', false],
      [false, false],
      ['maybe', false],
      ['TRUE', false],
      ['1', false],
      [1, false],
      [null, false],
      ['', false],
    ];

    const numberCases: ReadonlyArray<[unknown, number]> = [
      ['42', 42],
      ['-1', -1],
      ['1.5', 1.5],
      ['', 0],
      [null, 0],
      [true, 1],
      [7, 7],
    ];

    it('returns the raw value when transformation is off', () => {
      const off = new ValidationPipe();

      expect(off.transformPrimitive('true', Boolean)).toEqual('true');
      expect(off.transformPrimitive('42', Number)).toEqual('42');
      expect(off.transformPrimitive(42, String)).toEqual(42);
      expect(off.transformPrimitive(undefined, Number)).toBeUndefined();
    });

    it('leaves an absent Boolean value undefined', () => {
      expect(pipe.transformPrimitive(undefined, Boolean)).toBeUndefined();
    });

    it.each(booleanCases)('coerces %p to %p for Boolean', (raw, expected) => {
      expect(pipe.transformPrimitive(raw, Boolean)).toBe(expected);
    });

    it('leaves an absent Number value undefined', () => {
      expect(pipe.transformPrimitive(undefined, Number)).toBeUndefined();
    });

    it.each(numberCases)('coerces %p to %p for Number', (raw, expected) => {
      expect(pipe.transformPrimitive(raw, Number)).toBe(expected);
    });

    it('coerces NaN out of an unparseable numeric query value', () => {
      expect(pipe.transformPrimitive('abc', Number)).toBeNaN();
    });

    it('coerces a non-string to a string for String', () => {
      expect(pipe.transformPrimitive(42, String)).toEqual('42');
      expect(pipe.transformPrimitive(null, String)).toEqual('null');
      expect(pipe.transformPrimitive('already', String)).toEqual('already');
    });

    it('leaves an absent String value undefined rather than the text "undefined"', () => {
      expect(pipe.transformPrimitive(undefined, String)).toBeUndefined();
    });
  });

  describe('error flattening', () => {
    const pipe = new ExposedValidationPipe();

    it('returns a childless error as itself', () => {
      const error = validationError({
        property: 'title',
        constraints: { isNotEmpty: 'title should not be empty' },
      });

      expect(pipe.mapChildren(error)).toEqual([error]);
    });

    it('prefixes a child constraint with its parent path', () => {
      const prefixed = pipe.prepend(
        'profile',
        validationError({
          property: 'city',
          constraints: { isNotEmpty: 'city should not be empty' },
        }),
      );

      expect(prefixed.constraints).toEqual({
        isNotEmpty: 'profile.city should not be empty',
      });
    });

    it('leaves a constraint-less error with an empty constraint map when prefixing', () => {
      const prefixed = pipe.prepend(
        'profile',
        validationError({ property: 'address' }),
      );

      expect(prefixed.constraints).toEqual({});
    });

    it('names a single level of nesting after the parent property', () => {
      const child = validationError({
        property: 'city',
        constraints: { isNotEmpty: 'city should not be empty' },
      });
      const root = validationError({ property: 'address', children: [child] });

      expect(pipe.flatten([root])).toEqual([
        'address.city should not be empty',
      ]);
    });

    it('walks a grandchild through both levels of the parent path', () => {
      const grandchild = validationError({
        property: 'city',
        constraints: { isNotEmpty: 'city should not be empty' },
      });
      const child = validationError({
        property: 'address',
        children: [grandchild],
      });
      const root = validationError({ property: 'profile', children: [child] });

      expect(pipe.flatten([root])).toEqual([
        'profile.address.city should not be empty',
      ]);
    });

    it('drops an error that carries no constraints at all', () => {
      expect(
        pipe.flatten([
          validationError({ property: 'orphan' }),
          validationError({
            property: 'title',
            constraints: { isNotEmpty: 'title should not be empty' },
          }),
        ]),
      ).toEqual(['title should not be empty']);
    });

    it('concatenates every constraint of every error in order', () => {
      expect(
        pipe.flatten([
          validationError({
            property: 'email',
            constraints: {
              isEmail: 'email must be an email',
              isNotEmpty: 'email should not be empty',
            },
          }),
          validationError({
            property: 'username',
            constraints: { isNotEmpty: 'username should not be empty' },
          }),
        ]),
      ).toEqual([
        'email must be an email',
        'email should not be empty',
        'username should not be empty',
      ]);
    });

    it('returns nothing for an empty error list', () => {
      expect(pipe.flatten([])).toEqual([]);
    });
  });
});
