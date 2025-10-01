import React, { useState, useEffect, useRef } from "react";
import { Text, View, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { useRouter } from "expo-router"; 
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabaseClient";


export default function HomePage() {
  
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace('/(auth)/login');
    } else {
      setUser(user);
    }
  };

  if (!permission) return <View/>;

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>Povolit přístup ke kameře</Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Ionicons name="camera" size={24} color="#fff" />
            <Text style={styles.permissionButtonText}>Povolit kameru</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  };

  const takePhoto = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync();
      Alert.alert("Photo captured");
    }
  }

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
              
              <TouchableOpacity onPress={takePhoto} style={styles.captureButton}>
                <View style={styles.captureButtonInner}>
                  <Ionicons name="camera" size={32} color="#000"/>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.navButton} onPress={() => router.push('/(main)/profile')}>
                <Ionicons name="person" size={28} color="white"/>
              </TouchableOpacity>
            </View>
          </View>
        </CameraView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "transparent"
  },
  container: {
    flex: 1,
    backgroundColor: "transparent"
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "transparent",
    zIndex: 10
  },
  title: {
    fontSize: 18,
    color: "#fff",
    fontWeight: "600",
    letterSpacing: -0.3,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2
  },
  camera: {
    flex: 1
  },
  cameraOverlay: {
    flex: 1
  },
  navbar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 30,
    paddingHorizontal: 20,
    backgroundColor: "transparent"
  },
  navButton: {
    padding: 18,
    borderRadius: 25,
    backgroundColor: "rgba(59, 130, 246, 0.3)",
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.5)",
    shadowColor: "#3b82f6",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3
  },
  captureButton: {
    padding: 6,
    borderRadius: 40,
    backgroundColor: "#3b82f6",
    shadowColor: "#3b82f6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5
  },
  captureButtonInner: {
    padding: 22,
    borderRadius: 35,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#3b82f6"
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#fff"
  },
  permissionText: {
    fontSize: 18,
    color: "#374151",
    marginBottom: 24,
    textAlign: "center"
  },
  permissionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3b82f6",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8
  },
  permissionButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600"
  }
})
