import { View, Text, TextInput, Alert, StyleSheet, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabaseClient';
 
export default function LoginScreen() {

  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      Alert.alert("Přihlášení se nezdařilo", error.message);
    } else {
      Alert.alert("Jste přihlášeni");
      router.replace("/home");
    }
  };

  const handleGoogleLogin = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
    });

    if (error) {
      Alert.alert("Přihlášení přes Google se nezdařilo", error.message);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Vítejte zpátky</Text>
        <Text style={styles.subtitle}>Přihlásit se</Text>
        <TextInput 
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize='none'
        />
        <TextInput 
          style={styles.input}
          placeholder="Heslo"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize='none'
        />
        <TouchableOpacity style={styles.button} onPress={handleLogin}>
          <Text style={styles.buttonText}>Přihlásit se</Text>
        </TouchableOpacity>
        
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>nebo</Text>
          <View style={styles.dividerLine} />
        </View>
        
        <TouchableOpacity style={styles.googleButton} onPress={handleGoogleLogin}>
          <Text style={styles.googleButtonText}>Pokračovat s Google</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push("/(auth)/register")}>
          <Text style={styles.secondaryButtonText}>Nemáte ještě účet? Zaregistrujte se</Text>
        </TouchableOpacity>
        
      </View>
    </SafeAreaView>
  )
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
    fontSize: 32, 
    fontWeight: "bold", 
    color: "#1e293b",
    marginBottom: 8,
    textAlign: "center"
  },
  subtitle: {
    fontSize: 16,
    color: "#64748b",
    marginBottom: 32,
    textAlign: "center"
  },
  input: {
    width: "100%", 
    borderWidth: 1, 
    borderColor: "#e2e8f0", 
    borderRadius: 12, 
    padding: 16, 
    marginBottom: 16,
    backgroundColor: "#fff",
    fontSize: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  button: {
    backgroundColor: "#3b82f6",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
    width: "100%",
    shadowColor: "#3b82f6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600"
  },
  secondaryButton: {
    marginTop: 24,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: "#3b82f6",
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center"
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
    width: "100%"
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#e2e8f0"
  },
  dividerText: {
    marginHorizontal: 16,
    color: "#64748b",
    fontSize: 14
  },
  googleButton: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 8,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  googleButtonText: {
    color: "#374151",
    fontSize: 16,
    fontWeight: "500"
  }
})
