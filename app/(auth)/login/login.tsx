import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../../lib/supabaseClient";
import { makeRedirectUri } from "expo-auth-session";
import styles from './login.styles';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) router.replace("/(main)/profile");
    };

    getSession();
  });

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Chyba", "Vyplňte prosím všechna pole");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        Alert.alert("Chyba přihlášení", error.message);
      } else {
        Alert.alert("Úspěch", "Přihlášení proběhlo úspěšně!");
        router.replace("/(main)/profile");
      }
    } catch (error) {
      Alert.alert("Chyba", "Něco se pokazilo");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const redirectUri = makeRedirectUri({ useProxy: true });
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirectUri },
      });

      if (error) Alert.alert("Chyba", "Přihlášení s Google se nezdařilo");
      else Alert.alert("Úspěch", "Přihlášení se zdařilo");
    } catch (error) {
      Alert.alert("Chyba", "Něco se pokazilo");
    }
  };

  const goToRegister = () => {
    router.push("/(auth)/register");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Zaparkovals?</Text>
          <Text style={styles.subtitle}>Přihlášení</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Ionicons
              name="mail"
              size={20}
              color="#64748b"
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor="#94a3b8"
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons
              name="lock-closed"
              size={20}
              color="#64748b"
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Heslo"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholderTextColor="#94a3b8"
            />
          </View>

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.loginButtonText}>
              {loading ? "Přihlašování..." : "Přihlásit se"}
            </Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>nebo</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.googleButton}
            onPress={handleGoogleLogin}
          >
            <Ionicons
              name="logo-google"
              size={20}
              color="#4285f4"
              style={styles.googleIcon}
            />
            <Text style={styles.googleButtonText}>Pokračovat s Google</Text>
          </TouchableOpacity>

          <View style={styles.registerContainer}>
            <Text style={styles.registerText}>Nemáte účet? </Text>
            <TouchableOpacity onPress={goToRegister}>
              <Text style={styles.registerLink}>Zaregistrujte se</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
 
