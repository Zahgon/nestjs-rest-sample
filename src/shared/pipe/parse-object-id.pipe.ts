import * as mongoose from 'mongoose';
import { BadRequestException } from '../../core/http-exception';

export class ParseObjectIdPipe {
  transform(value: string) {
    if (!mongoose.isValidObjectId(value)) {
      throw new BadRequestException(`$value is not a valid mongoose object id`);
    }
    return value;
  }
}
