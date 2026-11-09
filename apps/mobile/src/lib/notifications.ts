import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from './api';

export type PushResult = 'granted' | 'denied' | 'unsupported';

export async function getPushPermission(): Promise<PushResult> {
  if (Platform.OS === 'web') return 'unsupported';
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'granted' : 'denied';
}

/**
 * Ask for permission and register the Expo push token with the API (POST /devices).
 * Returns 'unsupported' on web/simulators, where push tokens are unavailable.
 */
export async function enablePushNotifications(): Promise<PushResult> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unsupported';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Precisari',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const status = current.status === 'granted' ? current.status : (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return 'denied';
  try {
    const projectId: string | undefined =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await api.devices.register({ expoPushToken: data, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
  } catch {
    // Permission is granted even if token registration fails (e.g. Expo Go without projectId); retried on next launch.
  }
  return 'granted';
}
