import sendgridConfig, { SendgridConfig } from './sendgrid.config';

describe('sendgridConfig', () => {
  let config: SendgridConfig;
  beforeEach(async () => {
    config = sendgridConfig();
  });

  it('should be defined', () => {
    expect(sendgridConfig).toBeDefined();
  });

  it('should contains expiresIn and secret key', async () => {
    expect(config.apiKey).toBeTruthy();
  });
});
