/**
 * The HTTP exception hierarchy the controllers, services and pipes throw.
 *
 * The serialised shape is significant: a message-carrying exception renders as
 * `{ message, error, statusCode }` while an argument-less one renders as
 * `{ message, statusCode }`, and an exception constructed from a bare string
 * renders as `{ statusCode, message }`. The error handler in
 * `./exception-filter` turns the stored response into the body.
 */
export class HttpException extends Error {
  constructor(
    private readonly response: string | Record<string, any>,
    private readonly status: number,
  ) {
    super();
    this.name = this.constructor.name;
    this.message =
      typeof response === 'string'
        ? response
        : typeof (response as Record<string, any>)?.message === 'string'
          ? ((response as Record<string, any>).message as string)
          : this.constructor.name;
  }

  getResponse(): string | Record<string, any> {
    return this.response;
  }

  getStatus(): number {
    return this.status;
  }

  static createBody(
    objectOrError: string | object | any,
    description: string,
    statusCode: number,
  ): Record<string, any> {
    if (!objectOrError) {
      return { message: description, statusCode };
    }
    if (typeof objectOrError === 'string' || Array.isArray(objectOrError)) {
      return { message: objectOrError, error: description, statusCode };
    }
    return objectOrError;
  }
}

export class BadRequestException extends HttpException {
  constructor(
    objectOrError?: string | object | any,
    description = 'Bad Request',
  ) {
    super(HttpException.createBody(objectOrError, description, 400), 400);
  }
}

export class UnauthorizedException extends HttpException {
  constructor(
    objectOrError?: string | object | any,
    description = 'Unauthorized',
  ) {
    super(HttpException.createBody(objectOrError, description, 401), 401);
  }
}

export class ForbiddenException extends HttpException {
  constructor(
    objectOrError?: string | object | any,
    description = 'Forbidden',
  ) {
    super(HttpException.createBody(objectOrError, description, 403), 403);
  }
}

export class NotFoundException extends HttpException {
  constructor(
    objectOrError?: string | object | any,
    description = 'Not Found',
  ) {
    super(HttpException.createBody(objectOrError, description, 404), 404);
  }
}

export class ConflictException extends HttpException {
  constructor(objectOrError?: string | object | any, description = 'Conflict') {
    super(HttpException.createBody(objectOrError, description, 409), 409);
  }
}

export const throttlerMessage = 'ThrottlerException: Too Many Requests';

export class ThrottlerException extends HttpException {
  constructor(message?: string) {
    super(message || throttlerMessage, 429);
  }
}
