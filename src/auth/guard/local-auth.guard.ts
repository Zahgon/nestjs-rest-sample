import { AuthGuard } from '../../core/auth-guard';

export class LocalAuthGuard extends AuthGuard {
  constructor() {
    super('local');
  }
}
