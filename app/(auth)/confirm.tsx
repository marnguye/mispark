import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabaseClient';

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

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f8fafc"
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#f8fafc"
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1e293b",
    marginBottom: 8,
    textAlign: "center"
  },
  subtitle: {
    fontSize: 16,
    color: "#64748b",
    textAlign: "center"
  }
});
