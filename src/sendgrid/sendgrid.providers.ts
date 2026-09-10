import { MailService } from '@sendgrid/mail';
import { SendgridConfig } from '../config/sendgrid.config';

export const createMailService = (config: SendgridConfig): MailService => {
  const mail = new MailService();
  mail.setApiKey(config.apiKey);
  mail.setTimeout(5000);
  //mail.setTwilioEmailAuth(username, password)
  return mail;
};
