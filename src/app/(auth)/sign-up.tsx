import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { regions, session } from '../../backend/api';
import { CountrySelect } from '../../features/payments';
import { addressAt, currentPosition } from '../../features/address';
import { detectedCountry } from '../../lib/geo';
import { Button, Card, color, Header, HayveLogo, Icon, Input, Screen, Segmented, T } from '../../design';
import { useAction } from '../../lib/hooks';
import { languageFromLocale, useT } from '../../lib/i18n';

export default function SignUp() {
  const t = useT();
  const [displayName, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accountType, setType] = useState<'individual' | 'business'>('individual');
  // Country from where you are (IP address, then location), changeable here and in Settings.
  const [country, setCountry] = useState(() => detectedCountry());
  const [addr, setAddr] = useState({ line1: '', city: '', postcode: '', country: '' });
  const [locating, setLocating] = useState<'idle' | 'busy' | 'done' | 'denied'>('idle');
  const reg = regions.region(country);

  // Ask for location once: it fills in your address (you can fix it) and your country.
  const locate = async () => {
    setLocating('busy');
    const pos = await currentPosition();
    if (!pos) return setLocating('denied');
    const found = await addressAt(pos);
    if (found) {
      setAddr({ line1: found.line1, city: found.city, postcode: found.postcode, country: found.country });
      if (found.countryCode && regions.REGIONS.some((r) => r.code === found.countryCode)) setCountry(found.countryCode);
    }
    setLocating('done');
  };
  useEffect(() => {
    void locate();
  }, []);
  const [error, setError] = useState<string | null>(null);
  const { run, busy } = useAction();

  const submit = () =>
    run(() => session.signUp({ email, password, displayName, username, accountType, country, language: languageFromLocale(Intl.DateTimeFormat().resolvedOptions().locale), address: addr.line1 ? { ...addr, country: addr.country || reg.name } : undefined }), {
      success: 'Welcome to Hayve 🎉',
      onDone: () => router.replace(accountType === 'business' ? '/business' : '/'),
      onError: (e) => setError(e.message),
    });

  return (
    <Screen header={<Header back fallback="/welcome" />} maxWidth={480} keyboard>
      <View style={{ gap: 6, marginTop: 8, marginBottom: 24 }}>
        <HayveLogo height={30} />
        <T variant="title1" style={{ marginTop: 18 }}>
          {t('Create your account')}
        </T>
        <T color={color.textSecondary}>{t('One account for shopping, payments, rides, food, stays and more.')}</T>
      </View>
      <View style={{ gap: 14 }}>
        <Segmented
          options={[
            { key: 'individual', label: t('Personal'), icon: 'person-outline' },
            { key: 'business', label: t('Business'), icon: 'briefcase-outline' },
          ]}
          value={accountType}
          onChange={setType}
        />
        <Input label={t('Full name')} icon="person-outline" value={displayName} onChangeText={setName} autoComplete="name" textContentType="name" placeholder="Alex Morgan" />
        <CountrySelect label={t('Country')} value={country} onChange={setCountry} />
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name="location-outline" size={20} />
            <View style={{ flex: 1 }}>
              <T variant="headline">{t('Your address')}</T>
              <T variant="footnote" color={color.textSecondary}>
                {locating === 'busy' ? 'Finding where you are…' : locating === 'done' ? 'Filled in from your location. Fix anything that is wrong.' : locating === 'denied' ? 'Location is off. Type your address, or allow location.' : 'For deliveries, rides and maps around you.'}
              </T>
            </View>
          </View>
          {locating !== 'done' && <Button title={locating === 'busy' ? 'Locating…' : t('Use my current location')} icon="navigate-outline" variant="secondary" loading={locating === 'busy'} onPress={() => void locate()} />}
          <Input label={t('Street and number')} value={addr.line1} onChangeText={(line1) => setAddr((a) => ({ ...a, line1 }))} autoComplete="street-address" textContentType="fullStreetAddress" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Input containerStyle={{ flex: 1.4 }} label={t('City')} value={addr.city} onChangeText={(city) => setAddr((a) => ({ ...a, city }))} textContentType="addressCity" />
            <Input containerStyle={{ flex: 1 }} label={reg.postcodeLabel} value={addr.postcode} onChangeText={(postcode) => setAddr((a) => ({ ...a, postcode }))} textContentType="postalCode" />
          </View>
        </Card>
        <Input
          label={t('Username')}
          icon="at-outline"
          value={username}
          onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9._]/g, ''))}
          autoCapitalize="none"
          placeholder="alexmorgan"
          hint="Your public profile and wishlist link: hayve.app/u/username"
        />
        <Input label={t('Email')} icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="you@example.com" />
        <Input label={t('Password')} icon="lock-closed-outline" value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" placeholder="At least 8 characters" error={error} />
        <Button title={t('Create account')} size="lg" full loading={busy} onPress={submit} />
        <T variant="footnote" color={color.textSecondary} center>
          By continuing you agree to the Hayve Terms and{' '}
          <T variant="footnote" color={color.indigo} weight="700" onPress={() => router.push('/privacy')} accessibilityRole="link">
            Privacy Policy
          </T>
          .
        </T>
        <Button title={t('I already have an account')} variant="ghost" full onPress={() => router.replace('/sign-in')} />
      </View>
    </Screen>
  );
}
