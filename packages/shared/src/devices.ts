import { z } from 'zod';
import { DevicePlatform } from './enums';

export const RegisterDeviceBody = z.object({
  expoPushToken: z.string().regex(/^(Expo|Exponent)PushToken\[.+\]$/),
  platform: DevicePlatform,
});
export type RegisterDeviceBody = z.infer<typeof RegisterDeviceBody>;
