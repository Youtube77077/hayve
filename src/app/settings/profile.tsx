import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { social } from '../../backend/api';
import { BIO_MAX_CHARS } from '../../backend/config';
import { Avatar, Button, color, Header, Icon, Input, Screen, Segmented, Sheet, T, useToast } from '../../design';
import { pickAvatar, type AvatarSource } from '../../lib/avatar';
import { useAction, useLive } from '../../lib/hooks';

export default function EditProfile() {
  const me = useLive(() => social.myProfile()).data;
  const toast = useToast();
  const { run, busy } = useAction();
  const [displayName, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [accountType, setType] = useState<'individual' | 'business'>('individual');
  const [picker, setPicker] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!me) return;
    setName(me.profile.displayName);
    setUsername(me.profile.username);
    setBio(me.profile.bio);
    setCity(me.profile.city);
    setType(me.profile.accountType);
  }, [me?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = async (source: AvatarSource) => {
    setPicker(false);
    setWorking(true);
    try {
      const res = await pickAvatar(source);
      if (!res) return;
      if ('error' in res) return toast(res.error, 'error');
      run(() => social.setAvatar(res), { success: 'Profile picture updated' });
    } catch {
      toast('That image could not be processed. Try another one.', 'error');
    } finally {
      setWorking(false);
    }
  };

  const left = BIO_MAX_CHARS - bio.length;

  return (
    <Screen
      header={<Header back title="Edit profile" fallback="/profile" />}
      maxWidth={560}
      keyboard
      footer={<Button title="Save" size="lg" full loading={busy} onPress={() => run(() => social.updateProfile({ displayName, username, bio, city, accountType }), { success: 'Profile saved', onDone: () => router.back() })} />}
    >
      <View style={{ alignItems: 'center', gap: 8, marginVertical: 16 }}>
        <Pressable onPress={() => setPicker(true)} accessibilityRole="button" accessibilityLabel="Change profile picture" style={{ borderRadius: 60 }}>
          <Avatar uri={me?.profile.avatar} name={displayName} size={112} />
          <View style={{ position: 'absolute', right: 0, bottom: 0, width: 36, height: 36, borderRadius: 18, backgroundColor: color.black, borderWidth: 3, borderColor: color.white, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="camera-outline" size={16} color={color.white} />
          </View>
        </Pressable>
        <Button title={working ? 'Processing…' : 'Change photo'} variant="ghost" size="sm" loading={working} onPress={() => setPicker(true)} />
        <T variant="caption" color={color.textSecondary}>JPG, PNG or WEBP · up to 5 MB</T>
      </View>
      <View style={{ gap: 16 }}>
        <Segmented value={accountType} onChange={setType} options={[{ key: 'individual', label: 'Personal' }, { key: 'business', label: 'Business' }]} />
        <Input label="Display name" value={displayName} onChangeText={setName} maxLength={40} />
        <Input label="Username" icon="at-outline" autoCapitalize="none" value={username} onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9._]/g, ''))} hint={`hayve.app/u/${username}`} />
        <View>
          <Input label="Bio" multiline maxLength={BIO_MAX_CHARS} value={bio} onChangeText={setBio} placeholder="A line or two about you" />
          <T variant="caption" color={left <= 20 ? color.black : color.textSecondary} weight={left <= 20 ? '700' : '400'} style={{ alignSelf: 'flex-end', marginTop: 6 }} accessibilityLiveRegion="polite">
            {bio.length}/{BIO_MAX_CHARS}
          </T>
        </View>
        <Input label="City" icon="location-outline" value={city} onChangeText={setCity} />
      </View>
      <Sheet visible={picker} onClose={() => setPicker(false)} title="Profile picture">
        <View style={{ gap: 10 }}>
          <Button title="Take a photo" icon="camera-outline" variant="secondary" full onPress={() => choose('camera')} />
          <Button title="Choose from device" icon="images-outline" variant="secondary" full onPress={() => choose('library')} />
          {me?.profile.avatar ? <Button title="Remove photo" variant="ghost" full onPress={() => { setPicker(false); run(() => social.setAvatar(null), { success: 'Photo removed' }); }} /> : null}
          <T variant="footnote" color={color.textSecondary} style={{ marginTop: 4 }}>
            You can crop to a circle. We store a 400×400 picture and a small 96×96 version.
          </T>
        </View>
      </Sheet>
    </Screen>
  );
}
