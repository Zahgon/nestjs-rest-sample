import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  ThrottlerException,
  UnauthorizedException,
  throttlerMessage,
} from './http-exception';

/**
 * The serialised envelope is the wire contract, so the assertions compare
 * `JSON.stringify` output rather than object equality: `toEqual` is blind to
 * key order, and the order is the part that differs between an exception built
 * from a bare string (`{ statusCode, message }`) and one built through
 * `createBody` (`{ message, error, statusCode }`).
 */
const serialised = (exception: HttpException): string =>
  JSON.stringify(exception.getResponse());

/**
 * The declared response type excludes `null`, so a null response is reachable
 * only at runtime — from parsed data, say. The constructor guards it with
 * optional chaining, so the branch is exercised rather than left uncovered.
 */
const nullResponse = (): string | Record<string, any> => JSON.parse('null');

describe('HttpException.createBody', () => {
  describe('when objectOrError is falsy', () => {
    it.each([
      ['undefined', undefined],
      ['null', null],
      ['an empty string', ''],
      ['zero', 0],
      ['false', false],
      ['NaN', NaN],
    ])(
      'renders { message: description, statusCode } for %s',
      (_label, value) => {
        const body = HttpException.createBody(value, 'Unauthorized', 401);

        expect(body).toEqual({ message: 'Unauthorized', statusCode: 401 });
        expect(JSON.stringify(body)).toBe(
          '{"message":"Unauthorized","statusCode":401}',
        );
      },
    );
  });

  describe('when objectOrError is a string', () => {
    it('renders { message, error, statusCode }', () => {
      const body = HttpException.createBody(
        'id is invalid',
        'Bad Request',
        400,
      );

      expect(body).toEqual({
        message: 'id is invalid',
        error: 'Bad Request',
        statusCode: 400,
      });
      expect(JSON.stringify(body)).toBe(
        '{"message":"id is invalid","error":"Bad Request","statusCode":400}',
      );
    });
  });

  describe('when objectOrError is an array', () => {
    it('renders the array verbatim as the message', () => {
      const body = HttpException.createBody(
        ['title should not be empty', 'content should not be empty'],
        'Bad Request',
        400,
      );

      expect(JSON.stringify(body)).toBe(
        '{"message":["title should not be empty","content should not be empty"],' +
          '"error":"Bad Request","statusCode":400}',
      );
    });

    it('treats an empty array as truthy and keeps it as the message', () => {
      const body = HttpException.createBody([], 'Bad Request', 400);

      expect(JSON.stringify(body)).toBe(
        '{"message":[],"error":"Bad Request","statusCode":400}',
      );
    });
  });

  describe('when objectOrError is any other object', () => {
    it('returns it verbatim, by reference, without adding error or statusCode', () => {
      const supplied = {
        statusCode: 418,
        message: 'I am a teapot',
        extra: true,
      };
      const body = HttpException.createBody(supplied, 'Bad Request', 400);

      expect(body).toBe(supplied);
      expect(JSON.stringify(body)).toBe(
        '{"statusCode":418,"message":"I am a teapot","extra":true}',
      );
    });

    it('does not rescue an object that carries no message at all', () => {
      const supplied = { foo: 'bar' };

      expect(HttpException.createBody(supplied, 'Conflict', 409)).toBe(
        supplied,
      );
    });
  });
});

describe('HttpException', () => {
  it('stores the response and the status verbatim', () => {
    const response = { message: 'boom', statusCode: 500 };
    const exception = new HttpException(response, 500);

    expect(exception.getResponse()).toBe(response);
    expect(exception.getStatus()).toBe(500);
  });

  it('is an Error', () => {
    const exception = new HttpException('boom', 500);

    expect(exception).toBeInstanceOf(Error);
    expect(exception).toBeInstanceOf(HttpException);
    expect(exception.name).toBe('HttpException');
  });

  describe('message derivation', () => {
    it('uses the response when it is a string', () => {
      expect(new HttpException('plain text failure', 500).message).toBe(
        'plain text failure',
      );
    });

    it('uses response.message when it is a string', () => {
      expect(
        new HttpException({ message: 'nested failure' }, 500).message,
      ).toBe('nested failure');
    });

    it('falls back to the class name when the response is null', () => {
      expect(new HttpException(nullResponse(), 500).message).toBe(
        'HttpException',
      );
    });

    it('falls back to the class name when the response carries no message', () => {
      expect(new HttpException({ error: 'Conflict' }, 409).message).toBe(
        'HttpException',
      );
    });

    it('falls back to the class name when response.message is not a string', () => {
      // A validation failure stores an array of messages, so the Error message
      // degrades to the class name rather than to the array.
      const exception = new BadRequestException(['title should not be empty']);

      expect(exception.message).toBe('BadRequestException');
    });

    it('reports the subclass name, not HttpException', () => {
      expect(new ConflictException().name).toBe('ConflictException');
      expect(new ConflictException().message).toBe('Conflict');
    });
  });
});

describe('the exception subclasses', () => {
  const cases: ReadonlyArray<{
    name: string;
    status: number;
    description: string;
    build: (objectOrError?: string | object) => HttpException;
  }> = [
    {
      name: 'BadRequestException',
      status: 400,
      description: 'Bad Request',
      build: (objectOrError?: string | object) =>
        new BadRequestException(objectOrError),
    },
    {
      name: 'UnauthorizedException',
      status: 401,
      description: 'Unauthorized',
      build: (objectOrError?: string | object) =>
        new UnauthorizedException(objectOrError),
    },
    {
      name: 'ForbiddenException',
      status: 403,
      description: 'Forbidden',
      build: (objectOrError?: string | object) =>
        new ForbiddenException(objectOrError),
    },
    {
      name: 'NotFoundException',
      status: 404,
      description: 'Not Found',
      build: (objectOrError?: string | object) =>
        new NotFoundException(objectOrError),
    },
    {
      name: 'ConflictException',
      status: 409,
      description: 'Conflict',
      build: (objectOrError?: string | object) =>
        new ConflictException(objectOrError),
    },
  ];

  describe.each(cases)('$name', ({ name, status, description, build }) => {
    it('is an HttpException carrying its own status', () => {
      const exception = build();

      expect(exception).toBeInstanceOf(HttpException);
      expect(exception.name).toBe(name);
      expect(exception.getStatus()).toBe(status);
    });

    it('renders { message: description, statusCode } with no argument', () => {
      expect(serialised(build())).toBe(
        JSON.stringify({ message: description, statusCode: status }),
      );
    });

    it('renders { message, error, statusCode } from a string', () => {
      expect(serialised(build('something went wrong'))).toBe(
        JSON.stringify({
          message: 'something went wrong',
          error: description,
          statusCode: status,
        }),
      );
    });

    it('returns a supplied object verbatim', () => {
      const supplied = { message: 'custom', reason: 'because' };

      expect(serialised(build(supplied))).toBe(JSON.stringify(supplied));
    });
  });

  it('UnauthorizedException renders the documented envelope', () => {
    expect(serialised(new UnauthorizedException())).toBe(
      '{"message":"Unauthorized","statusCode":401}',
    );
  });

  it('NotFoundException renders the documented route-miss envelope', () => {
    expect(serialised(new NotFoundException('Cannot GET /nope'))).toBe(
      '{"message":"Cannot GET /nope","error":"Not Found","statusCode":404}',
    );
  });

  it('BadRequestException renders the documented body-parser envelope', () => {
    expect(
      serialised(new BadRequestException('Unexpected end of JSON input')),
    ).toBe(
      '{"message":"Unexpected end of JSON input","error":"Bad Request","statusCode":400}',
    );
  });

  describe('the description override', () => {
    it.each([
      [
        'BadRequestException',
        new BadRequestException('nope', 'Custom Description'),
        '{"message":"nope","error":"Custom Description","statusCode":400}',
      ],
      [
        'UnauthorizedException',
        new UnauthorizedException(undefined, 'Custom Description'),
        '{"message":"Custom Description","statusCode":401}',
      ],
      [
        'ForbiddenException',
        new ForbiddenException('nope', 'Custom Description'),
        '{"message":"nope","error":"Custom Description","statusCode":403}',
      ],
      [
        'NotFoundException',
        new NotFoundException('nope', 'Custom Description'),
        '{"message":"nope","error":"Custom Description","statusCode":404}',
      ],
      [
        'ConflictException',
        new ConflictException('nope', 'Custom Description'),
        '{"message":"nope","error":"Custom Description","statusCode":409}',
      ],
    ])('%s honours it', (_name, exception, expected) => {
      expect(serialised(exception)).toBe(expected);
    });
  });
});

describe('ThrottlerException', () => {
  it('stores a bare string rather than a createBody envelope', () => {
    const exception = new ThrottlerException();

    expect(exception).toBeInstanceOf(HttpException);
    expect(exception.name).toBe('ThrottlerException');
    expect(exception.getStatus()).toBe(429);
    expect(exception.getResponse()).toBe(throttlerMessage);
    expect(exception.message).toBe('ThrottlerException: Too Many Requests');
  });

  it('exports the default message', () => {
    expect(throttlerMessage).toBe('ThrottlerException: Too Many Requests');
  });

  it('accepts an override', () => {
    expect(new ThrottlerException('slow down').getResponse()).toBe('slow down');
  });

  it.each([
    ['undefined', undefined],
    ['an empty string', ''],
  ])('falls back to the default message for %s', (_label, message) => {
    expect(new ThrottlerException(message).getResponse()).toBe(
      throttlerMessage,
    );
  });
});
