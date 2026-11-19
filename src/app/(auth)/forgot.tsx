import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { session } from '../../backend/api';
import { Button, color, Header, Input, Notice, Screen, T } from '../../design';
import { useAction } from '../../lib/hooks';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const { run, busy } = useAction();

  return (
    <Screen header={<Header back fallback="/sign-in" />} maxWidth={480} keyboard>
      <T variant="title1" style={{ marginTop: 8 }}>
        {step === 'request' ? 'Reset your password' : 'Choose a new password'}
      </T>
      <T color={color.textSecondary} style={{ marginTop: 6, marginBottom: 24 }}>
        {step === 'request' ? "Enter your email and we'll send you a 6-digit code." : `We sent a code to ${email}.`}
      </T>
      {step === 'request' ? (
        <View style={{ gap: 14 }}>
          <Input label="Email" icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Button title="Send code" size="lg" full loading={busy} onPress={() => run(() => session.requestPasswordReset(email), { onDone: () => setStep('reset') })} />
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          <Notice tone="warning" icon="flask-outline" title="Simulated email" body="Emails are not sent in this build. Use code 246810." />
          <Input label="6-digit code" icon="keypad-outline" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
          <Input label="New password" icon="lock-closed-outline" value={password} onChangeText={setPassword} secureTextEntry />
          <Button title="Update password" size="lg" full loading={busy} onPress={() => run(() => session.resetPassword(email, code, password), { success: 'Password updated. Please sign in.', onDone: () => router.replace('/sign-in') })} />
        </View>
      )}
    </Screen>
  );
}
