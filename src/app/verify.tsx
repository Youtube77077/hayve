import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { business } from '../backend/api';
import { Button, color, Header, Icon, type IconName, radius, Screen, SimBadge, T, useReducedMotion } from '../design';
import { celebrate } from '../features/celebrate';
import { useAction } from '../lib/hooks';

type Step = 'intro' | 'licence' | 'id' | 'face' | 'photo';
const POSES: { key: string; say: string; icon: IconName }[] = [
  { key: 'front', say: 'Look straight at the camera', icon: 'person-outline' },
  { key: 'left', say: 'Slowly turn your head left', icon: 'arrow-back' },
  { key: 'right', say: 'Now turn your head right', icon: 'arrow-forward' },
];

/**
 * "Check your ID in 1 minute" for drivers and couriers: licence (drivers), ID, a live face check
 * (straight, left, right), then the straight-on photo can become the profile picture.
 * Demo build: the checks pass automatically; nothing is sent to an identity provider.
 */
export default function Verify() {
  const { role = 'driver' } = useLocalSearchParams<{ role?: 'driver' | 'courier' }>();
  const steps: Step[] = role === 'driver' ? ['intro', 'licence', 'id', 'face', 'photo'] : ['intro', 'id', 'face', 'photo'];
  const [step, setStep] = useState<Step>('intro');
  const [licence, setLicence] = useState<string | null>(null);
  const [idDoc, setIdDoc] = useState<string | null>(null);
  const [faces, setFaces] = useState<string[]>([]);
  const { run, busy } = useAction();
  const next = () => setStep(steps[Math.min(steps.length - 1, steps.indexOf(step) + 1)]);
  const at = steps.indexOf(step);

  const finish = (useAsPhoto: boolean) =>
    run(() => business.verifyIdentity({ role, licencePhoto: licence ?? undefined, idPhoto: idDoc!, faces, profilePhoto: useAsPhoto ? faces[0] : undefined }), {
      onDone: () => {
        celebrate({ title: 'You’re verified!', body: role === 'driver' ? 'Add your car and start driving.' : 'Add your vehicle and start delivering.' });
        router.replace(role === 'driver' ? '/business/driver' : '/business/courier');
      },
    });

  return (
    <Screen header={<Header back title="Check your ID" fallback="/business" right={<SimBadge />} />} maxWidth={520}>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 20 }}>
        {steps.slice(1).map((s, i) => (
          <View key={s} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i < at ? color.indigo : color.grey100 }} />
        ))}
      </View>

      {step === 'intro' && (
        <View style={{ gap: 18 }}>
          <T variant="title1">Check your ID in 1 minute</T>
          <T color={color.textSecondary}>So riders and customers know who’s coming. You’ll need:</T>
          {[
            ...(role === 'driver' ? [{ icon: 'car-outline' as IconName, text: 'Your driving licence' }] : []),
            { icon: 'card-outline' as IconName, text: 'Your passport or ID card' },
            { icon: 'camera-outline' as IconName, text: 'A quick face check with your camera' },
          ].map((x) => (
            <View key={x.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Icon name={x.icon} size={24} />
              <T variant="headline">{x.text}</T>
            </View>
          ))}
          <Button title="Start" size="lg" full onPress={next} style={{ marginTop: 12 }} />
        </View>
      )}

      {step === 'licence' && <DocStep title="Your driving licence" hint="Front side, all four corners in the photo" value={licence} onChange={setLicence} onNext={next} />}
      {step === 'id' && <DocStep title="Your passport or ID card" hint="The page with your photo, no glare" value={idDoc} onChange={setIdDoc} onNext={next} />}
      {step === 'face' && <FaceCheck onDone={(f) => { setFaces(f); next(); }} />}

      {step === 'photo' && faces[0] && (
        <View style={{ alignItems: 'center', gap: 18 }}>
          <T variant="title2" center>
            Use this as your profile photo?
          </T>
          <View style={{ width: 180, height: 180, borderRadius: 90, overflow: 'hidden', borderWidth: 4, borderColor: color.grey100 }}>
            <Image source={{ uri: faces[0] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </View>
          <T color={color.textSecondary} center>
            Riders see it when you pick them up. You can change it any time.
          </T>
          <View style={{ alignSelf: 'stretch', gap: 6 }}>
            <Button title={busy ? 'Checking…' : 'Allow'} size="lg" full loading={busy} onPress={() => finish(true)} />
            <Button title="Not now" variant="ghost" full onPress={() => finish(false)} />
          </View>
        </View>
      )}
    </Screen>
  );
}

function DocStep({ title, hint, value, onChange, onNext }: { title: string; hint: string; value: string | null; onChange: (uri: string) => void; onNext: () => void }) {
  const take = async (camera: boolean) => {
    const r = camera ? await ImagePicker.launchCameraAsync({ quality: 0.8 }).catch(() => ImagePicker.launchImageLibraryAsync({ quality: 0.8 })) : await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (!r.canceled && r.assets[0]) onChange(r.assets[0].uri);
  };
  return (
    <View style={{ gap: 16 }}>
      <T variant="title2">{title}</T>
      <T color={color.textSecondary}>{hint}</T>
      <View style={{ aspectRatio: 1.58, borderRadius: radius.lg, borderWidth: 2, borderStyle: value ? 'solid' : 'dashed', borderColor: value ? color.black : color.grey500, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {value ? <Image source={{ uri: value }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <Icon name="card-outline" size={40} color={color.grey500} />}
      </View>
      {value ? (
        <>
          <Button title="Looks good" size="lg" full onPress={onNext} />
          <Button title="Retake" variant="ghost" full onPress={() => void take(true)} />
        </>
      ) : (
        <>
          <Button title="Take a photo" icon="camera-outline" size="lg" full onPress={() => void take(true)} />
          <Button title="Upload a photo" variant="ghost" full onPress={() => void take(false)} />
        </>
      )}
    </View>
  );
}

/** Live face check: straight, left, right. Each pose is captured after a short countdown. */
function FaceCheck({ onDone }: { onDone: (frames: string[]) => void }) {
  const [perm, requestPerm] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [pose, setPose] = useState(0);
  const [count, setCount] = useState(3);
  const [ready, setReady] = useState(false);
  const frames = useRef<string[]>([]);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!ready || pose >= POSES.length) return;
    if (count > 0) {
      const t = setTimeout(() => setCount((c) => c - 1), reduced ? 600 : 800);
      return () => clearTimeout(t);
    }
    void (async () => {
      try {
        const shot = await cam.current?.takePictureAsync({ quality: 0.6, skipProcessing: true });
        frames.current.push(shot?.uri ?? '');
      } catch {
        frames.current.push('');
      }
      if (pose + 1 >= POSES.length) onDone(frames.current.filter(Boolean).length === 3 ? frames.current : frames.current.map((f) => f || 'about:blank'));
      else {
        setPose((p) => p + 1);
        setCount(3);
      }
    })();
  }, [ready, pose, count]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!perm) return <T color={color.textSecondary}>Opening the camera…</T>;
  if (!perm.granted)
    return (
      <View style={{ gap: 16 }}>
        <T variant="title2">Quick face check</T>
        <T color={color.textSecondary}>We need your camera for a few seconds to check it’s really you.</T>
        <Button title="Turn on the camera" size="lg" full onPress={() => void requestPerm()} />
      </View>
    );

  const p = POSES[Math.min(pose, POSES.length - 1)];
  return (
    <View style={{ gap: 16, alignItems: 'center' }}>
      <T variant="title2" center>
        {p.say}
      </T>
      <View style={{ width: 260, height: 260, borderRadius: 130, overflow: 'hidden', borderWidth: 6, borderColor: color.indigo }}>
        <CameraView ref={cam} facing="front" style={{ flex: 1 }} onCameraReady={() => setReady(true)} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name={p.icon} size={22} />
        <T variant="headline">{ready ? (count > 0 ? `Hold still… ${count}` : 'Got it') : 'Starting the camera…'}</T>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {POSES.map((x, i) => (
          <View key={x.key} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: i < pose ? color.indigo : color.grey200 }} />
        ))}
      </View>
    </View>
  );
}
