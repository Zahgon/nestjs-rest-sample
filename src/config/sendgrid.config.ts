export interface SendgridConfig {
  apiKey: string;
}

export default (): SendgridConfig => ({
  apiKey: process.env.SENDGRID_API_KEY || 'SG.test',
});
