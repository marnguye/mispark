import React, { useEffect } from 'react';
import { View, Text, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../../lib/supabaseClient';
import styles from './confirm.styles';

export default function ConfirmScreen() {
  const router = useRouter();
  const { token_hash, type } = useLocalSearchParams();

  useEffect(() => {
    if (token_hash && type) {
      verifyOtp();
    }
  }, [token_hash, type]);

  const verifyOtp = async () => {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: token_hash as string,
        type: type as any,
      });

      if (error) {
        Alert.alert('Chyba', 'Ověření se nezdařilo: ' + error.message);
        router.replace('/(auth)/login');
      } else {
        Alert.alert('Úspěch', 'Váš účet byl úspěšně ověřen!');
        router.replace('/(main)/home');
      }
    } catch (error) {
      Alert.alert('Chyba', 'Něco se pokazilo');
      router.replace('/(auth)/login');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Ověřování účtu...</Text>
        <Text style={styles.subtitle}>Prosím čekejte</Text>
      </View>
    </SafeAreaView>
  );
}
