import { brand } from '../config/brand';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ComponentProps, PropsWithChildren } from 'react';
export const palette = { background: '#081426', card: '#11233D', gold: brand.accent, ink: '#FFF5DF', muted: '#9BACC2', green: '#69DFB2', red: '#FF9B91' };
export function Button({ title, onPress, disabled = false, secondary = false }: {title: string; onPress: () => void; disabled?: boolean; secondary?: boolean}) {
 return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={[styles.button, secondary && styles.secondary, disabled && {opacity: .4}]}><Text style={[styles.buttonText, secondary && {color: palette.gold}]}>{title}</Text></Pressable>;
}
export function Field(props: ComponentProps<typeof TextInput>) { return <TextInput placeholderTextColor={palette.muted} {...props} style={styles.input} />; }
export function PasswordField(props: Omit<ComponentProps<typeof TextInput>, 'secureTextEntry'>) {
 const [visible, setVisible] = useState(false);
 return <View style={styles.passwordContainer}>
  <TextInput placeholderTextColor={palette.muted} {...props} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} autoComplete="off" style={[styles.input, styles.passwordInput]} />
  <Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Ocultar clave' : 'Mostrar clave'} onPress={() => setVisible(current => !current)} style={styles.eyeButton}>
   <View accessible={false} style={styles.eyeOutline}><View style={styles.eyePupil} /></View>
   {!visible && <View accessible={false} style={styles.eyeSlash} />}
  </Pressable>
 </View>;
}
export function Card({children}: PropsWithChildren) { return <View style={styles.card}>{children}</View>; }
export const styles = StyleSheet.create({
 passwordContainer: {flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#3C4D65', borderRadius: 12, backgroundColor: palette.background},
 passwordInput: {flex: 1, borderWidth: 0, backgroundColor: 'transparent'}, eyeButton: {width: 50, minHeight: 50, alignItems: 'center', justifyContent: 'center'},
 eyeOutline: {width: 23, height: 15, borderWidth: 2, borderColor: palette.gold, borderRadius: 12, alignItems: 'center', justifyContent: 'center'}, eyePupil: {width: 6, height: 6, borderRadius: 3, backgroundColor: palette.gold}, eyeSlash: {position: 'absolute', width: 26, height: 2, backgroundColor: palette.gold, transform: [{rotate: '-40deg'}]},
 screen: {flex: 1, backgroundColor: palette.background}, content: {padding: 22, gap: 18, paddingBottom: 40},
 brand: {color: palette.gold, letterSpacing: 3, fontSize: 12, fontWeight: '700'}, title: {color: palette.ink, fontSize: 32, fontWeight: '700', lineHeight: 39},
 heading: {color: palette.ink, fontSize: 19, fontWeight: '600'}, text: {color: palette.ink, fontSize: 16}, muted: {color: palette.muted, lineHeight: 21, fontSize: 14},
 card: {backgroundColor: palette.card, padding: 19, borderRadius: 20, gap: 14, borderWidth: 1, borderColor: '#2C3C53'},
 input: {padding: 14, backgroundColor: palette.background, borderWidth: 1, borderColor: '#3C4D65', borderRadius: 12, fontSize: 16, color: palette.ink},
 button: {padding: 15, borderRadius: 12, backgroundColor: palette.gold, alignItems: 'center'}, secondary: {backgroundColor: 'transparent', borderColor: '#746548', borderWidth: 1}, buttonText: {fontSize: 15, color: palette.background, fontWeight: '700'},
 row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10}, number: {fontSize: 28, color: palette.ink, fontWeight: '600'},
 divider: {height: 1, backgroundColor: '#2C3C53'}, pill: {paddingVertical: 9, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: '#3C4D65'},
});
