import React, { useEffect } from "react";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withSequence,
} from "react-native-reanimated";
import styles from "./splash.styles";

export default function SplashScreen() {
  const router = useRouter();

  const translateX = useSharedValue(300);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateX.value = withDelay(
      500,
      withSequence(
        withSpring(-40, { damping: 6, stiffness: 120 }),
        withSpring(20, { damping: 6, stiffness: 120 }),
        withSpring(-10, { damping: 6, stiffness: 120 }),
        withSpring(0, { damping: 7, stiffness: 140 }),
      ),
    );
    opacity.value = withDelay(500, withSpring(1));

    const timer = setTimeout(() => {
      router.replace("/(auth)/login");
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const questionStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.logoContainer}>
          <Ionicons name="car" size={80} color="#3b82f6" />
          <Text style={styles.title}>
            Zaparkovals
            <Animated.Text style={[styles.question, questionStyle]}>
              ?
            </Animated.Text>
          </Text>
          <Text style={styles.subtitle}>Každé auto má své místo.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
