import { Stack } from 'expo-router';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '../state/session';
export default function Layout() {
 return <SafeAreaProvider><SessionProvider><StatusBar barStyle="light-content" /><Stack screenOptions={{headerShown: false, contentStyle: {backgroundColor: '#081426'}}} /></SessionProvider></SafeAreaProvider>;
}
