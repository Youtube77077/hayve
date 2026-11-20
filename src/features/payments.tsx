import * as Clipboard from 'expo-clipboard';
import { type ReactNode, useEffect, useState } from 'react';
import { Animated, Linking, Platform, Pressable, Share, View } from 'react-native';
import { regions, social } from '../backend/api';
import type { Region } from '../backend/regions';
import { Appear, color, Input, Select, T, tap, usePressScale, useToast } from '../design';
import { useLive } from '../lib/hooks';
import { Icon, type IconName } from '../design/icons';

/* ------------------------------------------------------------- cards -- */

export function cardBrand(digits: string) {
  if (/^4/.test(digits)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'American Express';
  if (/^(50|5[6-9]|6)/.test(digits)) return 'Maestro';
  return 'Card';
}

export function luhn(digits: string) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return digits.length >= 12 && sum % 10 === 0;
}

export interface CardResult {
  brand: string;
  last4: string;
  expiry: string;
  funding: 'debit' | 'credit';
}

/**
 * Simulated card checkout. In production this step is the payment provider's own hosted checkout
 * (for example Stripe Checkout); the card number never reaches Hayve. Here it is simulated and
 * nothing but brand and last four leaves this form.
 */
export function CardForm({ onChange }: { onChange: (card: CardResult | null) => void }) {
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const digits = number.replace(/\D/g, '');
  const brand = cardBrand(digits);
  const numberOk = luhn(digits);
  const expiryOk = /^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry);
  const cvcOk = /^\d{3,4}$/.test(cvc);
  useEffect(() => {
    // The partner reports whether a card is debit or credit; simulated from the card number here.
    onChange(numberOk && expiryOk && cvcOk ? { brand, last4: digits.slice(-4), expiry, funding: Number(digits[6] ?? 0) % 2 ? 'credit' : 'debit' } : null);
  }, [numberOk, expiryOk, cvcOk, brand, digits, expiry, onChange]);
  const groups = digits.slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
  return (
    <View style={{ gap: 12 }}>
      <Input
        label="Card number"
        icon="card-outline"
        placeholder="1234 5678 9012 3456"
        keyboardType="number-pad"
        autoComplete="cc-number"
        textContentType="creditCardNumber"
        value={groups}
        onChangeText={setNumber}
        maxLength={23}
        error={digits.length >= 15 && !numberOk ? 'Check the card number' : null}
        right={digits.length >= 2 ? <T variant="footnote" weight="700">{brand}</T> : undefined}
      />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Input
          containerStyle={{ flex: 1 }}
          label="Expiry"
          placeholder="MM/YY"
          keyboardType="number-pad"
          autoComplete="cc-exp"
          value={expiry}
          maxLength={5}
          onChangeText={(v) => {
            const d = v.replace(/\D/g, '').slice(0, 4);
            setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
          }}
        />
        <Input containerStyle={{ flex: 1 }} label="CVC" placeholder="123" keyboardType="number-pad" autoComplete="cc-csc" secureTextEntry value={cvc} maxLength={4} onChangeText={(v) => setCvc(v.replace(/\D/g, ''))} />
      </View>
      <SecureNote text="Simulated checkout. In the live app this is our payment provider's secure checkout; Hayve never sees your card number." />
    </View>
  );
}

export function SecureNote({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Icon name="lock-closed-outline" size={14} color={color.grey500} />
      <T variant="caption" color={color.grey500} style={{ flex: 1 }}>
        {text}
      </T>
    </View>
  );
}

/* ------------------------------------------------------------- banks -- */

/** The signed-in person's country settings (currency, bank rail, banks…). United States when signed out. */
export function useRegion(): Region {
  return useLive(() => {
    try {
      return regions.region(social.myProfile().profile.country);
    } catch {
      return regions.region(regions.DEFAULT_REGION);
    }
  }).data ?? regions.region(regions.DEFAULT_REGION);
}

/** Country selector (sets currency, payout account format, IDs and tax). */
export function CountrySelect({ value, onChange, label = 'Country' }: { value: string; onChange: (code: string) => void; label?: string }) {
  return <Select label={label} icon="globe-outline" value={value} onChange={onChange} options={regions.REGIONS.map((r) => ({ key: r.code, label: r.name, sub: r.currency }))} />;
}

/** A pressable that winds up (scales down) when pressed, so it feels like a real button. */
export function PressScale({ children, style, outerStyle, onPress, to = 0.96, ...rest }: { children: ReactNode; style?: object; outerStyle?: object; onPress?: () => void; to?: number; disabled?: boolean; accessibilityRole?: 'radio' | 'button'; accessibilityState?: object; accessibilityLabel?: string }) {
  const { scale, onPressIn, onPressOut } = usePressScale(to);
  return (
    <Pressable {...rest} style={outerStyle} onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/* ------------------------------------------------------------- share -- */

/**
 * A short share menu: the four places people actually send money requests, plus "More".
 * (Fewer choices are faster to pick from.)
 */
export function ShareRow({ url, message }: { url: string; message: string }) {
  const toast = useToast();
  const text = `${message} ${url}`;
  const open = async (native: string, web: string) => {
    tap();
    try {
      if (Platform.OS !== 'web' && (await Linking.canOpenURL(native))) return void (await Linking.openURL(native));
      await Linking.openURL(web);
    } catch {
      void Share.share({ message: text });
    }
  };
  const items: { key: string; icon: IconName; label: string; onPress: () => void }[] = [
    { key: 'wa', icon: 'chatbubble-outline', label: 'WhatsApp', onPress: () => void open(`whatsapp://send?text=${encodeURIComponent(text)}`, `https://wa.me/?text=${encodeURIComponent(text)}`) },
    { key: 'snap', icon: 'ghost-outline', label: 'Snapchat', onPress: () => void open(`snapchat://`, `https://www.snapchat.com/scan?attachmentUrl=${encodeURIComponent(url)}`) },
    { key: 'sms', icon: 'sms-outline', label: 'Messages', onPress: () => void open(`sms:${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(text)}`, `sms:?body=${encodeURIComponent(text)}`) },
    {
      key: 'copy',
      icon: 'copy-outline',
      label: 'Copy link',
      onPress: () => {
        tap();
        void Clipboard.setStringAsync(url).then(() => toast('Link copied', 'success'));
      },
    },
    { key: 'more', icon: 'ellipsis-horizontal', label: 'More', onPress: () => void Share.share({ message: text, url }) },
  ];
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 4 }}>
      {items.map((i, n) => (
        <Appear key={i.key} index={n} style={{ flex: 1 }}>
          <PressScale accessibilityRole="button" accessibilityLabel={`Share with ${i.label}`} onPress={i.onPress} to={0.9} style={{ alignItems: 'center', gap: 6 }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: color.grey200, backgroundColor: color.white, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={i.icon} size={22} />
            </View>
            <T variant="caption" weight="600" numberOfLines={1}>
              {i.label}
            </T>
          </PressScale>
        </Appear>
      ))}
    </View>
  );
}
