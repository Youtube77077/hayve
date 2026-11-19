import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { session } from '../../backend/api';
import { Button, color, Header, HayveLogo, Input, Screen, Segmented, T } from '../../design';
import { useAction } from '../../lib/hooks';

export default function SignUp() {
  const [displayName, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accountType, setType] = useState<'individual' | 'business'>('individual');
  const [error, setError] = useState<string | null>(null);
  const { run, busy } = useAction();

  const submit = () =>
    run(() => session.signUp({ email, password, displayName, username, accountType }), {
      success: 'Welcome to Hayve 🎉',
      onDone: () => router.replace(accountType === 'business' ? '/business' : '/'),
      onError: (e) => setError(e.message),
    });

  return (
    <Screen header={<Header back fallback="/welcome" />} maxWidth={480} keyboard>
      <View style={{ gap: 6, marginTop: 8, marginBottom: 24 }}>
        <HayveLogo height={30} />
        <T variant="title1" style={{ marginTop: 18 }}>
          Create your account
        </T>
        <T color={color.textSecondary}>One account for shopping, payments, rides, food, stays and more.</T>
      </View>
      <View style={{ gap: 14 }}>
        <Segmented
          options={[
            { key: 'individual', label: 'Personal', icon: 'person-outline' },
            { key: 'business', label: 'Business', icon: 'briefcase-outline' },
          ]}
          value={accountType}
          onChange={setType}
        />
        <Input label="Full name" icon="person-outline" value={displayName} onChangeText={setName} autoComplete="name" textContentType="name" placeholder="Alex de Vries" />
        <Input
          label="Username"
          icon="at-outline"
          value={username}
          onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9._]/g, ''))}
          autoCapitalize="none"
          placeholder="alexdv"
          hint="Your public profile and wishlist link: hayve.app/u/username"
        />
        <Input label="Email" icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="you@example.com" />
        <Input label="Password" icon="lock-closed-outline" value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" placeholder="At least 8 characters" error={error} />
        <Button title="Create account" size="lg" full loading={busy} onPress={submit} />
        <T variant="footnote" color={color.textTertiary} center>
          By continuing you agree to the Hayve Terms and Privacy Policy.
        </T>
        <Button title="I already have an account" variant="ghost" full onPress={() => router.replace('/sign-in')} />
      </View>
    </Screen>
  );
}
