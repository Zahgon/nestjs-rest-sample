import { createMock } from '@golevelup/ts-jest';
import express, { NextFunction, Request, Response } from 'express';
import { EMPTY, of, throwError } from 'rxjs';
import { map } from 'rxjs/operators';
import request from 'supertest';
import { handle, reply, RouteHandler } from './route';

/**
 * `handle` and `reply` stand in for what `ExpressAdapter.reply` used to do, so
 * the assertions below are about the bytes that leave the server rather than
 * about the value a controller returned. Anything that can be observed over
 * the wire is driven through a real express app; the two states a real
 * response cannot be coaxed into — a stream that ended without a header being
 * flushed, and the difference between `send()` and `send(undefined)` — are
 * pinned against a mocked response instead.
 */
const appFor = (
  fn: RouteHandler,
): { app: express.Express; errors: unknown[] } => {
  const app = express();
  const errors: unknown[] = [];

  app.get('/', handle(fn));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    errors.push(err);
    res
      .status(500)
      .json({ caught: err instanceof Error ? err.message : String(err) });
  });

  return { app, errors };
};

describe('reply', () => {
  it('sends with no argument at all when the body is undefined', () => {
    const res = createMock<Response>();

    reply(res, undefined);

    // `send()` and `send(undefined)` are not the same call: only the former
    // leaves express free to skip Content-Length entirely.
    expect(res.send).toHaveBeenCalledWith();
    expect(res.send).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('treats null as nil rather than as an object', () => {
    const res = createMock<Response>();

    reply(res, null);

    expect(res.send).toHaveBeenCalledWith();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('serialises an object with json, passing the very same reference', () => {
    const res = createMock<Response>();
    const body = { id: 'p1' };

    reply(res, body);

    expect(res.json).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(body);
    expect(res.json.mock.calls[0][0]).toBe(body);
    expect(res.send).not.toHaveBeenCalled();
  });

  it('stringifies anything else instead of serialising it', () => {
    const res = createMock<Response>();

    reply(res, 42);

    expect(res.send).toHaveBeenCalledWith('42');
    expect(res.json).not.toHaveBeenCalled();
  });

  it.each([
    ['zero', 0, '0'],
    ['false', false, 'false'],
    ['the empty string', '', ''],
  ])('does not mistake %s for a nil body', (_label, body, expected) => {
    const res = createMock<Response>();

    reply(res, body);

    expect(res.send).toHaveBeenCalledWith(expected);
  });
});

describe('handle — what reaches the wire', () => {
  it('answers a bare string as html, not as json', async () => {
    const { app } = appFor(() => 'Hello World!');

    const res = await request(app).get('/');

    // The root route returns a bare string, so it takes `reply`'s
    // send-the-stringified-value branch and express types it as html. A route
    // that answered `application/json` here would have changed the contract.
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.text).toBe('Hello World!');
  });

  it('answers a number as html too', async () => {
    const { app } = appFor(() => 7);

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.text).toBe('7');
  });

  it('answers an object as json', async () => {
    const { app } = appFor(() => ({ id: 'p1', title: 'a post' }));

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(res.body).toEqual({ id: 'p1', title: 'a post' });
  });

  it('answers an array as json', async () => {
    const { app } = appFor(() => [{ id: 'p1' }, { id: 'p2' }]);

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(res.body).toEqual([{ id: 'p1' }, { id: 'p2' }]);
  });

  it('answers an empty body when the handler returned nothing', async () => {
    const { app } = appFor(() => undefined);

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.text).toBe('');
    expect(res.headers['content-type']).toBeUndefined();
    expect(res.headers['content-length']).toBe('0');
  });
});

describe('handle — unwrapping what the handler returned', () => {
  it('awaits a promise before replying', async () => {
    const { app } = appFor(async () => ({ awaited: true }));

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ awaited: true });
  });

  it('drains an observable before replying', async () => {
    const { app } = appFor(() => of({ streamed: true }));

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ streamed: true });
  });

  it('takes the last value of a multi-valued observable', async () => {
    const { app } = appFor(() => of({ n: 1 }, { n: 2 }, { n: 3 }));

    const res = await request(app).get('/');

    expect(res.body).toEqual({ n: 3 });
  });

  it('unwraps a promise wrapping an observable rather than stopping at one layer', async () => {
    // A route that has to await a pipe before calling its controller hands
    // back a promise of a stream. Peeling one layer leaves the observable
    // itself as the body, which serialises to its internal shape with a 200 —
    // green suite, wrong bytes.
    const { app } = appFor(() =>
      Promise.resolve(of({ id: 'p1' }).pipe(map((post) => post))),
    );

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(res.body).toEqual({ id: 'p1' });
    expect(res.body).not.toHaveProperty('source');
    expect(res.body).not.toEqual({ source: {} });
  });

  it('keeps unwrapping through promise → observable → promise', async () => {
    const { app } = appFor(() =>
      Promise.resolve(of(Promise.resolve({ depth: 3 }))),
    );

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ depth: 3 });
  });

  it('replies empty for an observable that completes without emitting', async () => {
    // Without a default value `lastValueFrom` would reject on an empty
    // stream and the request would end as a 500 instead of an empty 200.
    const { app, errors } = appFor(() => EMPTY);

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.text).toBe('');
    expect(errors).toHaveLength(0);
  });
});

describe('handle — handlers that answered for themselves', () => {
  it('leaves a response the handler already committed alone', async () => {
    const { app, errors } = appFor((_req, res) =>
      res.status(201).json({ created: true }),
    );

    const res = await request(app).get('/');

    // `res.status(201).json(...)` hands back the response object itself. If
    // the already-sent check were missing, that object would be serialised on
    // top of the reply and express would raise ERR_HTTP_HEADERS_SENT.
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ created: true });
    expect(errors).toHaveLength(0);
  });

  it('leaves an empty 204 the handler committed alone', async () => {
    const { app, errors } = appFor((_req, res) => res.status(204).send());

    const res = await request(app).get('/');

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(errors).toHaveLength(0);
  });

  it('ignores a value returned after the handler already wrote', async () => {
    const { app, errors } = appFor(async (_req, res) => {
      res.status(202).send('accepted');
      return { ignored: true };
    });

    const res = await request(app).get('/');

    expect(res.status).toBe(202);
    expect(res.text).toBe('accepted');
    expect(errors).toHaveLength(0);
  });

  it('does not write to a response whose stream has already ended', async () => {
    const res = createMock<Response>({
      headersSent: false,
      writableEnded: true,
    });
    const next = jest.fn();

    await handle(() => ({ late: true }))(createMock<Request>(), res, next);

    expect(res.json).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('writes when neither headersSent nor writableEnded is set', async () => {
    const res = createMock<Response>({
      headersSent: false,
      writableEnded: false,
    });
    const next = jest.fn();

    await handle(() => ({ ok: true }))(createMock<Request>(), res, next);

    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('handle — failures', () => {
  it('forwards a synchronous throw to the error handler', async () => {
    const boom = new Error('thrown synchronously');
    const { app, errors } = appFor(() => {
      throw boom;
    });

    const res = await request(app).get('/');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ caught: 'thrown synchronously' });
    expect(errors).toEqual([boom]);
    expect(errors[0]).toBe(boom);
  });

  it('forwards a rejected promise to the error handler', async () => {
    const boom = new Error('rejected');
    const { app, errors } = appFor(() => Promise.reject(boom));

    const res = await request(app).get('/');

    expect(res.status).toBe(500);
    expect(errors[0]).toBe(boom);
  });

  it('forwards an observable error to the error handler', async () => {
    const boom = new Error('streamed failure');
    const { app, errors } = appFor(() => throwError(() => boom));

    const res = await request(app).get('/');

    expect(res.status).toBe(500);
    expect(errors[0]).toBe(boom);
  });

  it('calls next with the error and never replies itself', async () => {
    const boom = new Error('unit boom');
    const res = createMock<Response>({
      headersSent: false,
      writableEnded: false,
    });
    const next = jest.fn();

    await handle(() => {
      throw boom;
    })(createMock<Request>(), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(boom);
    expect(res.send).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
