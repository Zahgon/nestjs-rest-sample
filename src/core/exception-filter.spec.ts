import { createMock } from '@golevelup/ts-jest';
import express, { Express, Request, Response } from 'express';
import request from 'supertest';
import { errorHandler, notFoundHandler } from './exception-filter';
import {
  ForbiddenException,
  HttpException,
  NotFoundException,
  ThrottlerException,
  throttlerMessage,
} from './http-exception';

interface ResponseProbe {
  res: Response;
  status: jest.Mock;
  json: jest.Mock;
}

/**
 * `errorHandler` writes through `res.status(code).json(body)`, so the probe
 * hangs the same `json` spy off both the response and the value `status`
 * returns. `headersSent` is a plain property on the express response and has to
 * be seeded up front — the handler reads it before it writes anything.
 */
const createResponse = (headersSent = false): ResponseProbe => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res: Response = createMock<Response>({ headersSent, status, json });

  return { res, status, json };
};

/** The object actually handed to `res.json`, key order intact. */
const bodyOf = (probe: ResponseProbe): unknown => probe.json.mock.calls[0][0];

/**
 * The declared response type excludes `null`, so a null response is reachable
 * only at runtime. `isObject` guards it explicitly, so the branch is exercised
 * rather than left uncovered.
 */
const nullResponse = (): string | Record<string, any> => JSON.parse('null');

const serialisedBodyOf = (probe: ResponseProbe): string =>
  JSON.stringify(bodyOf(probe));

describe('notFoundHandler', () => {
  it('forwards a NotFoundException naming the method and the original url', () => {
    const req = createMock<Request>({ method: 'GET', originalUrl: '/nope' });
    const probe = createResponse();
    const next = jest.fn();

    notFoundHandler(req, probe.res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const forwarded: unknown = next.mock.calls[0][0];
    expect(forwarded).toBeInstanceOf(NotFoundException);
    expect((forwarded as NotFoundException).getStatus()).toBe(404);
    expect(JSON.stringify((forwarded as NotFoundException).getResponse())).toBe(
      '{"message":"Cannot GET /nope","error":"Not Found","statusCode":404}',
    );
  });

  it('does not write to the response itself', () => {
    const req = createMock<Request>({ method: 'GET', originalUrl: '/nope' });
    const probe = createResponse();

    notFoundHandler(req, probe.res, jest.fn());

    expect(probe.status).not.toHaveBeenCalled();
    expect(probe.json).not.toHaveBeenCalled();
  });

  it.each([
    [
      'POST',
      '/posts',
      '{"message":"Cannot POST /posts","error":"Not Found","statusCode":404}',
    ],
    [
      'DELETE',
      '/posts/1?force=1',
      '{"message":"Cannot DELETE /posts/1?force=1","error":"Not Found","statusCode":404}',
    ],
  ])('keeps the query string for %s %s', (method, originalUrl, expected) => {
    const next = jest.fn();

    notFoundHandler(
      createMock<Request>({ method, originalUrl }),
      createResponse().res,
      next,
    );

    expect(JSON.stringify(next.mock.calls[0][0].getResponse())).toBe(expected);
  });
});

describe('errorHandler', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  describe('when the headers were already sent', () => {
    it('forwards the original error and writes nothing', () => {
      const original = new SyntaxError('Unexpected end of JSON input');
      const probe = createResponse(true);
      const next = jest.fn();

      errorHandler(original, createMock<Request>(), probe.res, next);

      // The original error is forwarded, not the BadRequestException that
      // mapExternalException produced a line earlier.
      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0]).toBe(original);
      expect(probe.status).not.toHaveBeenCalled();
      expect(probe.json).not.toHaveBeenCalled();
    });

    it('forwards an HttpException untouched rather than answering twice', () => {
      const original = new ForbiddenException();
      const probe = createResponse(true);
      const next = jest.fn();

      errorHandler(original, createMock<Request>(), probe.res, next);

      expect(next.mock.calls[0][0]).toBe(original);
      expect(probe.json).not.toHaveBeenCalled();
    });
  });

  describe('when the error is an HttpException', () => {
    const handle = (err: unknown): ResponseProbe => {
      const probe = createResponse();
      errorHandler(err, createMock<Request>(), probe.res, jest.fn());
      return probe;
    };

    it('writes an object response verbatim', () => {
      const probe = handle(new ForbiddenException());

      expect(probe.status).toHaveBeenCalledWith(403);
      expect(bodyOf(probe)).toEqual({ message: 'Forbidden', statusCode: 403 });
      expect(serialisedBodyOf(probe)).toBe(
        '{"message":"Forbidden","statusCode":403}',
      );
    });

    it('keeps the createBody key order of a message-carrying exception', () => {
      const probe = handle(new NotFoundException('Cannot GET /nope'));

      expect(probe.status).toHaveBeenCalledWith(404);
      expect(serialisedBodyOf(probe)).toBe(
        '{"message":"Cannot GET /nope","error":"Not Found","statusCode":404}',
      );
    });

    it('wraps a bare-string response as { statusCode, message }', () => {
      const probe = handle(new ThrottlerException());

      expect(probe.status).toHaveBeenCalledWith(429);
      expect(bodyOf(probe)).toEqual({
        statusCode: 429,
        message: throttlerMessage,
      });
      expect(serialisedBodyOf(probe)).toBe(
        '{"statusCode":429,"message":"ThrottlerException: Too Many Requests"}',
      );
    });

    it('treats a null response as a bare value, not as an object', () => {
      const probe = handle(new HttpException(nullResponse(), 500));

      expect(probe.status).toHaveBeenCalledWith(500);
      expect(serialisedBodyOf(probe)).toBe('{"statusCode":500,"message":null}');
      expect(consoleError).not.toHaveBeenCalled();
    });

    it('treats an array response as an object and writes it verbatim', () => {
      const probe = handle(
        new HttpException(['title should not be empty'], 400),
      );

      expect(probe.status).toHaveBeenCalledWith(400);
      expect(serialisedBodyOf(probe)).toBe('["title should not be empty"]');
    });

    it('never falls through to the console for a handled exception', () => {
      handle(new ForbiddenException());

      expect(consoleError).not.toHaveBeenCalled();
    });
  });

  describe('when the error comes from outside the hierarchy', () => {
    const handle = (err: unknown): ResponseProbe => {
      const probe = createResponse();
      errorHandler(err, createMock<Request>(), probe.res, jest.fn());
      return probe;
    };

    it('maps a SyntaxError to a bad request carrying its message', () => {
      const probe = handle(new SyntaxError('Unexpected end of JSON input'));

      expect(probe.status).toHaveBeenCalledWith(400);
      expect(serialisedBodyOf(probe)).toBe(
        '{"message":"Unexpected end of JSON input","error":"Bad Request","statusCode":400}',
      );
      expect(consoleError).not.toHaveBeenCalled();
    });

    it('maps a URIError to a bad request carrying its message', () => {
      const probe = handle(new URIError('Failed to decode param'));

      expect(probe.status).toHaveBeenCalledWith(400);
      expect(serialisedBodyOf(probe)).toBe(
        '{"message":"Failed to decode param","error":"Bad Request","statusCode":400}',
      );
    });

    it('renders a statusCode-carrying error as { statusCode, message }', () => {
      const probe = handle(
        Object.assign(new Error('request entity too large'), {
          statusCode: 413,
        }),
      );

      expect(probe.status).toHaveBeenCalledWith(413);
      expect(bodyOf(probe)).toEqual({
        statusCode: 413,
        message: 'request entity too large',
      });
      expect(serialisedBodyOf(probe)).toBe(
        '{"statusCode":413,"message":"request entity too large"}',
      );
      expect(consoleError).not.toHaveBeenCalled();
    });

    it('accepts a plain object that is not an Error', () => {
      const probe = handle({ statusCode: 403, message: 'forbidden by proxy' });

      expect(probe.status).toHaveBeenCalledWith(403);
      expect(serialisedBodyOf(probe)).toBe(
        '{"statusCode":403,"message":"forbidden by proxy"}',
      );
    });

    it('drops any extra fields the foreign error carried', () => {
      const probe = handle({
        statusCode: 413,
        message: 'too large',
        type: 'entity.too.large',
      });

      expect(serialisedBodyOf(probe)).toBe(
        '{"statusCode":413,"message":"too large"}',
      );
    });

    describe('falling back to 500', () => {
      it.each([
        ['a plain Error', new Error('kaboom')],
        [
          'a falsy statusCode',
          Object.assign(new Error('kaboom'), { statusCode: 0 }),
        ],
        ['an empty message', Object.assign(new Error(''), { statusCode: 500 })],
        ['a message with no statusCode', { message: 'kaboom' }],
        ['a statusCode with no message', { statusCode: 500 }],
        ['null', null],
        ['undefined', undefined],
        ['a string', 'kaboom'],
      ])('renders the generic envelope for %s', (_label, err) => {
        const probe = handle(err);

        expect(probe.status).toHaveBeenCalledWith(500);
        expect(bodyOf(probe)).toEqual({
          statusCode: 500,
          message: 'Internal server error',
        });
        expect(serialisedBodyOf(probe)).toBe(
          '{"statusCode":500,"message":"Internal server error"}',
        );
      });

      it('logs the unhandled error', () => {
        const err = new Error('kaboom');

        handle(err);

        expect(consoleError).toHaveBeenCalledTimes(1);
        expect(consoleError).toHaveBeenCalledWith(err);
      });

      it('does not call next', () => {
        const probe = createResponse();
        const next = jest.fn();

        errorHandler(
          new Error('kaboom'),
          createMock<Request>(),
          probe.res,
          next,
        );

        expect(next).not.toHaveBeenCalled();
      });
    });
  });
});

describe('the handlers over the wire', () => {
  let consoleError: jest.SpyInstance;
  let app: Express;

  beforeEach(() => {
    consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    app = express();
    app.use(express.json());
    app.get('/forbidden', () => {
      throw new ForbiddenException();
    });
    app.get('/throttled', () => {
      throw new ThrottlerException();
    });
    app.get('/teapot', () => {
      throw new HttpException(
        { statusCode: 418, message: 'I am a teapot' },
        418,
      );
    });
    app.get('/syntax', () => {
      throw new SyntaxError('Unexpected end of JSON input');
    });
    app.get('/uri', () => {
      throw new URIError('Failed to decode param');
    });
    app.get('/too-large', () => {
      throw Object.assign(new Error('request entity too large'), {
        statusCode: 413,
      });
    });
    app.get('/boom', () => {
      throw new Error('kaboom');
    });
    app.post('/echo', (_req, res) => {
      res.status(200).json({ ok: true });
    });
    app.use(notFoundHandler);
    app.use(errorHandler);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it.each([
    [
      'GET',
      '/nope',
      404,
      '{"message":"Cannot GET /nope","error":"Not Found","statusCode":404}',
    ],
    ['GET', '/forbidden', 403, '{"message":"Forbidden","statusCode":403}'],
    [
      'GET',
      '/throttled',
      429,
      '{"statusCode":429,"message":"ThrottlerException: Too Many Requests"}',
    ],
    ['GET', '/teapot', 418, '{"statusCode":418,"message":"I am a teapot"}'],
    [
      'GET',
      '/syntax',
      400,
      '{"message":"Unexpected end of JSON input","error":"Bad Request","statusCode":400}',
    ],
    [
      'GET',
      '/uri',
      400,
      '{"message":"Failed to decode param","error":"Bad Request","statusCode":400}',
    ],
    [
      'GET',
      '/too-large',
      413,
      '{"statusCode":413,"message":"request entity too large"}',
    ],
    [
      'GET',
      '/boom',
      500,
      '{"statusCode":500,"message":"Internal server error"}',
    ],
  ])(
    '%s %s answers %i with the exact envelope bytes',
    async (_method, path, status, body) => {
      const res = await request(app).get(path);

      expect(res.status).toBe(status);
      expect(res.headers['content-type']).toBe(
        'application/json; charset=utf-8',
      );
      expect(res.text).toBe(body);
    },
  );

  it('answers a route miss on a known path but an unknown method', async () => {
    const res = await request(app).post('/forbidden').send({});

    expect(res.status).toBe(404);
    expect(res.text).toBe(
      '{"message":"Cannot POST /forbidden","error":"Not Found","statusCode":404}',
    );
  });

  it('turns an unparseable JSON payload into a bad request envelope', async () => {
    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{"title":');

    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    // The wording belongs to the body parser; the envelope belongs to the seam.
    expect(Object.keys(res.body)).toEqual(['message', 'error', 'statusCode']);
    expect(res.body.error).toBe('Bad Request');
    expect(res.body.statusCode).toBe(400);
    expect(typeof res.body.message).toBe('string');
    expect(res.body.message.length).toBeGreaterThan(0);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('still serves a route that does not throw', async () => {
    const res = await request(app).post('/echo').send({ title: 'ok' });

    expect(res.status).toBe(200);
    expect(res.text).toBe('{"ok":true}');
  });
});
