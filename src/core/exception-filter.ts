import { NextFunction, Request, Response } from 'express';
import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from './http-exception';

const isObject = (value: any): value is Record<string, any> =>
  value !== null && typeof value === 'object';

/**
 * A `SyntaxError` is raised by the JSON body parser when the payload cannot be
 * parsed; a `URIError` is raised while decoding a path segment carrying an
 * invalid percent escape. Both surface as a bad request rather than as an
 * unknown failure.
 */
const mapExternalException = (err: unknown): unknown =>
  err instanceof SyntaxError || err instanceof URIError
    ? new BadRequestException((err as Error).message)
    : err;

const isHttpError = (
  err: any,
): err is { statusCode: number; message: string } =>
  Boolean(err?.statusCode) && Boolean(err?.message);

/**
 * Terminal handler for every request that reached no route.
 */
export const notFoundHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  next(new NotFoundException(`Cannot ${req.method} ${req.originalUrl}`));
};

/**
 * Terminal error handler. Registered last so that everything raised by the
 * body parsers, the routers and the handlers lands here.
 */
export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const exception = mapExternalException(err);

  if (res.headersSent) {
    next(err);
    return;
  }

  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    const body = isObject(response)
      ? response
      : { statusCode: exception.getStatus(), message: response };
    res.status(exception.getStatus()).json(body);
    return;
  }

  if (isHttpError(exception)) {
    res.status(exception.statusCode).json({
      statusCode: exception.statusCode,
      message: exception.message,
    });
    return;
  }

  console.error(exception);
  res.status(500).json({ statusCode: 500, message: 'Internal server error' });
};
