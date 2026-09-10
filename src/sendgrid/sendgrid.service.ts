import { MailService, MailDataRequired, ClientResponse } from '@sendgrid/mail';
import { Observable, from } from 'rxjs';

export class SendgridService {
  constructor(private readonly mailService: MailService) {}

  send(data: MailDataRequired): Observable<[ClientResponse, {}]> {
    return from(this.mailService.send(data, false));
  }
}
