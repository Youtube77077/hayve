import { Icon } from '../../design/icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { session } from '../../backend/api';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../../backend/seed';
import { Button, color, Header, HayveLogo, Input, radius, Screen, T } from '../../design';
import { useAction } from '../../lib/hooks';
import { useT } from '../../lib/i18n';

export default function SignIn() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { run, busy } = useAction();

  const submit = (e = email, p = password) => {
    setError(null); // clear first so a repeated wrong password shakes again
    return run(() => session.signIn(e, p), {
      onDone: () => router.replace('/'),
      onError: (err) => setTimeout(() => setError(err.message), 0),
    });
  };

  return (
    <Screen header={<Header back fallback="/welcome" />} maxWidth={480} keyboard>
      <View style={{ gap: 6, marginTop: 8, marginBottom: 28 }}>
        <HayveLogo height={30} />
        <T variant="title1" style={{ marginTop: 18 }}>
          {t('Welcome back')}
        </T>
        <T color={color.textSecondary}>Sign in to your Hayve account.</T>
      </View>
      <View style={{ gap: 14 }}>
        <Input label={t('Email')} icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="you@example.com" />
        <Input label={t('Password')} icon="lock-closed-outline" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" placeholder="••••••••" error={error} onSubmitEditing={() => submit()} returnKeyType="go" />
        <Pressable onPress={() => router.push('/forgot')} style={{ alignSelf: 'flex-end' }} hitSlop={8}>
          <T variant="subhead" color={color.primary} weight="700">
            Forgot password?
          </T>
        </Pressable>
        <Button title={t('Sign in')} size="lg" full loading={busy} onPress={() => submit()} disabled={!email || !password} />
        <Button title="Create an account" variant="ghost" full onPress={() => router.replace('/sign-up')} />
      </View>

      <View style={{ marginTop: 32, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="flask-outline" size={16} color={color.warning} />
          <T variant="overline" color={color.textTertiary}>
            Demo accounts · password {DEMO_PASSWORD}
          </T>
        </View>
        {DEMO_ACCOUNTS.map((a) => (
          <Pressable
            key={a.email}
            testID={`demo-${a.email.split('@')[0]}`}
            accessibilityLabel={`Sign in as ${a.label}`}
            onPress={() => {
              setEmail(a.email);
              setPassword(DEMO_PASSWORD);
              void submit(a.email, DEMO_PASSWORD);
            }}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: pressed ? color.primarySoft : color.surface, borderWidth: 1, borderColor: color.line })}
          >
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' }}>
              <T variant="caption" color={color.white} weight="800">
                {a.label
                  .split(' ')
                  .map((s) => s[0])
                  .join('')}
              </T>
            </View>
            <View style={{ flex: 1 }}>
              <T variant="headline">{a.label}</T>
              <T variant="footnote" color={color.textSecondary}>
                {a.hint}
              </T>
            </View>
            <Icon name="arrow-forward" size={18} color={color.textTertiary} />
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
