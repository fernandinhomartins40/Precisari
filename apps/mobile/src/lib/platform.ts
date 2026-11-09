import { Alert, Linking, Platform, Share, type ImageSourcePropType } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { t } from '@/i18n';
import { DEMO_PHOTO_URL } from './mock-data';
import demoPhoto from '../../assets/images/studio-campeche.jpg';

/** Cross-platform confirm dialog (Alert on native, window.confirm on web). */
export function confirmAsync(title: string, message: string, confirmLabel: string, destructive = false): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? false);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}

export function haptic(kind: 'success' | 'light' | 'warning' = 'light'): void {
  if (Platform.OS === 'web') return;
  if (kind === 'light') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  else
    void Haptics.notificationAsync(
      kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
    ).catch(() => undefined);
}

/** Copies the price as plain whole reais ("349"), ready to paste in the Airbnb price field. */
export async function copyPrice(cents: number): Promise<void> {
  await Clipboard.setStringAsync(String(Math.round(cents / 100)));
  haptic('success');
}

/** Opens the listing (Airbnb app via universal link when installed), falling back to the Airbnb site. */
export async function openListing(url: string | null | undefined): Promise<void> {
  const target = url ?? 'https://www.airbnb.com.br/hosting/listings';
  await Linking.openURL(target).catch(() => undefined);
}

export async function shareText(message: string): Promise<'shared' | 'copied'> {
  if (Platform.OS !== 'web') {
    try {
      await Share.share({ message });
      return 'shared';
    } catch {
      // fall through to clipboard
    }
  }
  await Clipboard.setStringAsync(message);
  return 'copied';
}

/** Demo photo is bundled; real photos come from the API. */
export function propertyPhotoSource(photoUrl: string | null | undefined): ImageSourcePropType | null {
  if (!photoUrl) return null;
  if (photoUrl === DEMO_PHOTO_URL) return demoPhoto;
  return { uri: photoUrl };
}
