import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, Share, View } from 'react-native';
import { color, Input, radius, Segmented, T, tap, useToast } from '../design';
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
 * Card entry. In production this is the payment partner's secure field (Stripe Elements /
 * PaymentSheet): the number goes straight to the partner and Hayve only receives brand, last four,
 * expiry and debit/credit. Here it is simulated and nothing but those four values leaves this form.
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
      <SecureNote text="Your card number goes straight to our payment partner. Hayve never sees or stores it." />
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

export const BANK_LIST = ['ABN AMRO', 'ING', 'Rabobank', 'bunq', 'ASN Bank', 'Knab', 'Revolut', 'SNS', 'Triodos Bank', 'N26'] as const;

/** iDEAL | Wero: pick your bank, then approve in your bank app. */
export function BankPicker({ value, onChange }: { value: string | null; onChange: (bank: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {BANK_LIST.map((b) => {
        const on = value === b;
        return (
          <Pressable
            key={b}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => {
              tap();
              onChange(b);
            }}
            style={({ hovered }: { pressed: boolean; hovered?: boolean }) => ({ width: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: on ? 1.5 : 1, borderColor: on ? color.indigo : hovered ? color.black : color.grey200 })}
          >
            <Icon name="bank-outline" size={18} color={on ? color.indigo : color.black} />
            <T variant="subhead" weight="600" numberOfLines={1} style={{ flex: 1 }}>
              {b}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** "Approve in your bank app" step shown while the (simulated) bank confirms. */
export function useBankApproval() {
  const [state, setState] = useState<'idle' | 'approving'>('idle');
  const approve = (then: () => void) => {
    setState('approving');
    setTimeout(() => {
      setState('idle');
      then();
    }, 1400);
  };
  return { approving: state === 'approving', approve };
}

export function ConnectionChoice({ value, onChange }: { value: 'ideal_wero' | 'sepa_debit'; onChange: (v: 'ideal_wero' | 'sepa_debit') => void }) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={[
        { key: 'ideal_wero', label: 'iDEAL | Wero' },
        { key: 'sepa_debit', label: 'IBAN + mandate' },
      ]}
    />
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
      {items.map((i) => (
        <Pressable key={i.key} accessibilityRole="button" accessibilityLabel={`Share with ${i.label}`} onPress={i.onPress} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
          {({ pressed }) => (
            <>
              <View style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: color.grey200, backgroundColor: pressed ? color.grey100 : color.white, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.94 : 1 }] }}>
                <Icon name={i.icon} size={22} />
              </View>
              <T variant="caption" weight="600" numberOfLines={1}>
                {i.label}
              </T>
            </>
          )}
        </Pressable>
      ))}
    </View>
  );
}
