import { defineSecret } from 'firebase-functions/params';

/** Owner sets this in *their* Secret Manager. Never sent to PUFworks. */
export const dpirdApiKey = defineSecret('DPIRD_API_KEY');
