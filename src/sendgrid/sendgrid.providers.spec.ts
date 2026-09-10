import { MailService } from '@sendgrid/mail';
import sendgridConfig from '../config/sendgrid.config';
import { createMailService } from './sendgrid.providers';

describe('SendgridProviders', () => {
  let provider: MailService;

  beforeEach(async () => {
    provider = createMailService(sendgridConfig());
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
