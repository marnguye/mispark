import React, { useState, useEffect, useRef } from "react";
import { Text, View, TouchableOpacity, Alert } from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabaseClient";
import styles from './camera.styles';

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/(auth)/login");
    } else {
      setUser(user);
    }
  };

  if (!permission) return <View />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>Povolit přístup ke kameře</Text>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={requestPermission}
          >
            <Ionicons name="camera" size={24} color="#fff" />
            <Text style={styles.permissionButtonText}>Povolit kameru</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const takePhoto = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync();
      Alert.alert("Photo captured");
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>mispark</Text>
        </View>

        <CameraView ref={cameraRef} style={styles.camera}>
          <View style={styles.cameraOverlay}>
            <View style={styles.navbar}>
              <TouchableOpacity style={styles.navButton}>
                <Ionicons name="trophy" size={28} color="white" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={takePhoto}
                style={styles.captureButton}
              >
                <View style={styles.captureButtonInner}>
                  <Ionicons name="camera" size={32} color="#000" />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.navButton}
                onPress={() => router.push("/(main)/profile")}
              >
                <Ionicons name="person" size={28} color="white" />
              </TouchableOpacity>
            </View>
          </View>
        </CameraView>
      </View>
    </SafeAreaView>
  );
}

// moved to ./camera.styles
