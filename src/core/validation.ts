import {
  ClassConstructor,
  ClassTransformOptions,
  plainToInstance,
} from 'class-transformer';
import { validate, ValidationError, ValidatorOptions } from 'class-validator';
import { BadRequestException } from './http-exception';

export interface ValidationPipeOptions extends ValidatorOptions {
  transform?: boolean;
  transformOptions?: ClassTransformOptions;
}

type Primitive = NumberConstructor | BooleanConstructor | StringConstructor;

/**
 * The application-wide payload pipe.
 *
 * A body is turned into an instance of its declared class and validated; the
 * collected constraint messages are flattened into the array carried by the
 * bad-request payload. Query and path values are primitives and are only
 * coerced when transformation is switched on.
 */
export class ValidationPipe {
  private readonly validatorOptions: ValidatorOptions;
  private readonly transformOptions: ClassTransformOptions | undefined;
  private readonly isTransformEnabled: boolean;

  constructor(options: ValidationPipeOptions = {}) {
    const { transform, transformOptions, ...validatorOptions } = options;
    this.isTransformEnabled = !!transform;
    this.transformOptions = transformOptions;
    this.validatorOptions = { forbidUnknownValues: false, ...validatorOptions };
  }

  get transformEnabled(): boolean {
    return this.isTransformEnabled;
  }

  async transform<T>(value: any, metatype: ClassConstructor<T>): Promise<T> {
    const originalValue = value;
    value = value === null || value === undefined ? {} : value;
    const isNil = value !== originalValue;

    const entity = plainToInstance(metatype, value, this.transformOptions);
    const errors = await validate(entity as object, this.validatorOptions);
    if (errors.length > 0) {
      throw new BadRequestException(this.flattenValidationErrors(errors));
    }
    if (this.isTransformEnabled) {
      return entity;
    }
    return (isNil ? originalValue : value) as T;
  }

  /**
   * Mirrors the coercion applied to a single query or path value before the
   * value-level pipes see it.
   */
  transformPrimitive(value: any, metatype: Primitive): any {
    if (!this.isTransformEnabled) {
      return value;
    }
    if (metatype === Boolean) {
      if (value === undefined) {
        return undefined;
      }
      return value === true || value === 'true';
    }
    if (metatype === Number) {
      if (value === undefined) {
        return undefined;
      }
      return +value;
    }
    if (metatype === String && value !== undefined) {
      return String(value);
    }
    return value;
  }

  protected flattenValidationErrors(
    validationErrors: ValidationError[],
  ): string[] {
    return validationErrors
      .map((error) => this.mapChildrenToValidationErrors(error))
      .reduce((acc, item) => acc.concat(item), [])
      .filter((item) => !!item.constraints)
      .map((item) => Object.values(item.constraints as Record<string, string>))
      .reduce((acc, item) => acc.concat(item), []);
  }

  protected mapChildrenToValidationErrors(
    error: ValidationError,
    parentPath?: string,
  ): ValidationError[] {
    if (!(error.children && error.children.length)) {
      return [error];
    }
    const validationErrors: ValidationError[] = [];
    parentPath = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    for (const item of error.children) {
      if (item.children && item.children.length) {
        validationErrors.push(
          ...this.mapChildrenToValidationErrors(item, parentPath),
        );
      }
      validationErrors.push(
        this.prependConstraintsWithParentProp(parentPath, item),
      );
    }
    return validationErrors;
  }

  protected prependConstraintsWithParentProp(
    parentPath: string,
    error: ValidationError,
  ): ValidationError {
    const constraints: Record<string, string> = {};
    for (const key in error.constraints) {
      constraints[key] = `${parentPath}.${error.constraints[key]}`;
    }
    return { ...error, constraints };
  }
}
