import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Share, View } from 'react-native';
import { session, social } from '../../backend/api';
import type { NotificationKind } from '../../backend/types';
import { Button, color, Group, Header, Input, ListRow, Notice, Screen, Section, Select, Sheet, Split, SwitchRow, T } from '../../design';
import { useAction, useLive } from '../../lib/hooks';
import { CountrySelect } from '../../features/payments';

const NOTIF: { kind: NotificationKind; label: string }[] = [
  { kind: 'order', label: 'Orders & purchases' },
  { kind: 'sale', label: 'Sales' },
  { kind: 'delivery', label: 'Delivery updates' },
  { kind: 'ride', label: 'Ride updates' },
  { kind: 'rental', label: 'Rental bookings' },
  { kind: 'stay', label: 'Accommodation bookings' },
  { kind: 'payment', label: 'Payments' },
  { kind: 'refund', label: 'Refunds' },
  { kind: 'message', label: 'Messages' },
  { kind: 'business', label: 'Business activity' },
];

export default function Settings() {
  const me = useLive(() => social.myProfile()).data;
  const { run, busy } = useAction();
  const [verify, setVerify] = useState(false);
  const [code, setCode] = useState('');
  const [pw, setPw] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [del, setDel] = useState(false);
  const [delPw, setDelPw] = useState('');
  const [terms, setTerms] = useState(false);
  const [tfaOn, setTfaOn] = useState(false);
  const [tfaOff, setTfaOff] = useState(false);
  const [tfaCode, setTfaCode] = useState('');
  const [tfaPw, setTfaPw] = useState('');

  const download = () =>
    run(
      async () => {
        const json = JSON.stringify(social.exportMyData(), null, 2);
        if (Platform.OS === 'web' && typeof document !== 'undefined') {
          const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
          const a = document.createElement('a');
          a.href = url;
          a.download = 'hayve-my-data.json';
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } else {
          await Share.share({ title: 'My Hayve data', message: json });
        }
      },
      { success: 'Your data export is ready' },
    );
  if (!me) return null;
  const p = me.profile;

  return (
    <Screen header={<Header back title="Settings" large fallback="/profile" />}>
      <Split
        left={
          <View>
            <Section title="Privacy" style={{ marginTop: 8 }}>
              <Group>
                <SwitchRow icon="globe-outline" title="Public profile" subtitle="Others can see your listings, reviews and bio" value={p.isPublic} onChange={(v) => run(() => social.updateProfile({ isPublic: v }))} />
                <ListRow icon="gift-outline" title="Wishlist privacy" subtitle="Who can see your wishlist" value={p.wishlistVisibility === 'public' ? 'Public' : p.wishlistVisibility === 'link' ? 'Anyone with the link' : 'Private'} onPress={() => router.push('/wishlist')} />
              </Group>
              <T variant="footnote" color={color.textTertiary} style={{ marginTop: 8 }}>
                Gift purchasers are always anonymous. Hayve never reveals who bought an item from your wishlist.
              </T>
            </Section>
            <Section title="Security">
              <Group>
                <ListRow icon="mail-outline" title="Email" subtitle={me.user.email} value={me.user.emailVerified ? 'Verified' : 'Verify'} onPress={me.user.emailVerified ? undefined : () => setVerify(true)} />
                <ListRow icon="key-outline" title="Change password" onPress={() => setPw(true)} />
                <ListRow icon="shield-checkmark-outline" title="Two-step verification" subtitle={me.user.roles.includes('admin') ? 'Required for admin access' : 'Ask for a code when signing in on a new device'} value={p.twoFactor ? 'On' : 'Off'} onPress={() => (p.twoFactor ? setTfaOff(true) : setTfaOn(true))} />
              </Group>
            </Section>
            <Section title="Preferences">
              <View style={{ gap: 12 }}>
                <Select
                  label="Language"
                  value={p.language}
                  onChange={(language) => run(() => social.updateProfile({ language }), { success: 'Language saved. Translations arrive in a future update.' })}
                  options={[
                    { key: 'en', label: 'English' },
                    { key: 'nl', label: 'Nederlands' },
                    { key: 'fr', label: 'Français' },
                    { key: 'de', label: 'Deutsch' },
                    { key: 'es', label: 'Español' },
                  ]}
                />
                <CountrySelect label="Country and currency" value={p.country} onChange={(country) => run(() => social.updateProfile({ country }), { success: 'Country updated. Prices, banks and IDs now follow it.' })} />
              </View>
            </Section>
          </View>
        }
        right={
          <View>
            <Section title="Notifications" style={{ marginTop: 8 }}>
              <Group>
                {NOTIF.map((n) => (
                  <SwitchRow key={n.kind} title={n.label} value={p.notificationPrefs[n.kind] !== false} onChange={(v) => run(() => social.setNotificationPref(n.kind, v))} />
                ))}
              </Group>
              <T variant="footnote" color={color.textTertiary} style={{ marginTop: 8 }}>
                Security alerts are always on.
              </T>
            </Section>
            <Section title="Legal & account">
              <Group>
                <ListRow icon="document-text-outline" title="Terms & conditions" onPress={() => setTerms(true)} />
                <ListRow icon="shield-outline" title="Privacy policy" onPress={() => router.push('/privacy')} />
                <ListRow icon="download-outline" title="Download my data" subtitle="A copy of everything linked to your account (JSON)" onPress={download} />
                <ListRow icon="help-buoy-outline" title="Help & support" onPress={() => router.push('/settings/help')} />
                <ListRow icon="trash-outline" title="Delete account" danger onPress={() => setDel(true)} />
              </Group>
            </Section>
          </View>
        }
      />

      <Sheet visible={verify} onClose={() => setVerify(false)} title="Verify your email" footer={<Button title="Verify" size="lg" full loading={busy} onPress={() => run(() => session.verifyEmail(code), { success: 'Email verified', onDone: () => setVerify(false) })} />}>
        <View style={{ gap: 12 }}>
          <Notice icon="flask-outline" title="Preview" body="Use code 246810." />
          <Input label="6-digit code" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} />
        </View>
      </Sheet>
      <Sheet visible={pw} onClose={() => setPw(false)} title="Change password" footer={<Button title="Update password" size="lg" full loading={busy} onPress={() => run(() => session.changePassword(current, next), { success: 'Password changed', onDone: () => { setPw(false); setCurrent(''); setNext(''); } })} />}>
        <View style={{ gap: 12 }}>
          <Input label="Current password" secureTextEntry value={current} onChangeText={setCurrent} />
          <Input label="New password" secureTextEntry value={next} onChangeText={setNext} hint="At least 8 characters" />
        </View>
      </Sheet>
      <Sheet visible={del} onClose={() => setDel(false)} title="Delete your account">
        <View style={{ gap: 12 }}>
          <Notice tone="danger" icon="warning-outline" title="This can't be undone" body="Your profile, listings and wishlist are removed. Records required for completed orders and payments are kept anonymised." />
          <Input label="Enter your password to confirm" secureTextEntry value={delPw} onChangeText={setDelPw} />
          <Button title="Delete my account" variant="danger" size="lg" full loading={busy} onPress={() => run(() => session.deleteAccount(delPw), { success: 'Account deleted' })} />
        </View>
      </Sheet>
      <Sheet visible={tfaOn} onClose={() => setTfaOn(false)} title="Turn on two-step verification" footer={<Button title="Turn on" size="lg" full loading={busy} onPress={() => run(() => session.enableTwoFactor(tfaCode), { success: 'Two-step verification is on', onDone: () => { setTfaOn(false); setTfaCode(''); } })} />}>
        <View style={{ gap: 12 }}>
          <T color={color.textSecondary}>Enter the 6-digit code from your authenticator app.</T>
          <Notice icon="flask-outline" title="Preview" body="In this preview the code is always 246810." />
          <Input label="6-digit code" keyboardType="number-pad" maxLength={6} value={tfaCode} onChangeText={setTfaCode} />
        </View>
      </Sheet>
      <Sheet visible={tfaOff} onClose={() => setTfaOff(false)} title="Turn off two-step verification" footer={<Button title="Turn off" variant="outline" size="lg" full loading={busy} onPress={() => run(() => session.disableTwoFactor(tfaPw), { success: 'Two-step verification is off', onDone: () => { setTfaOff(false); setTfaPw(''); } })} />}>
        <View style={{ gap: 12 }}>
          {me.user.roles.includes('admin') && <Notice icon="alert-circle" title="Admin access needs this" body="While it is off you cannot open the admin panel." />}
          <Input label="Confirm with your password" secureTextEntry value={tfaPw} onChangeText={setTfaPw} />
        </View>
      </Sheet>
      <Sheet visible={terms} onClose={() => setTerms(false)} title="Terms & conditions">
        <T color={color.textSecondary}>
          This is a preview build of Hayve. Payments, wallet balances, rides, rentals, accommodation and deliveries are simulated (marked Demo) and have no monetary value. Do not enter real card numbers. Regulated services (payments, card issuing, money transmission, transport and rental contracts) will only operate through licensed partners once launched.
        </T>
      </Sheet>
    </Screen>
  );
}
