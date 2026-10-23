import { api } from '../api/client';
import type { PublicConfig } from '../api/types';

/**
 * Signs the customer in with LINE. The real system runs the LIFF SDK and has the server verify the
 * ID token with LINE; the demo has no LINE channel, so it signs in as a sample LINE account.
 */
export async function lineSignIn(_config: PublicConfig | undefined): Promise<{ name: string } | null> {
  return api.post<{ name: string }>('/me/dev-login', { lineUserId: 'Udemo000000000000000000000000001', name: 'ณัฐวุฒิ (LINE ตัวอย่าง)' });
}
