import React, { useState, useEffect, useRef } from "react";
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  Modal,
  Platform,
  StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../lib/supabaseClient";
import BottomNavbar from "../../components/BottomNavbar";

interface Report {
  id: string;
  user_id: string;
  photo_url: string;
  license_plate?: string;
  latitude: number;
  longitude: number;
  created_at: string;
  status?: string;
  profiles: {
    username: string;
    profile_photo_url?: string;
  };
}

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);

  useEffect(() => {
    checkUser();
    loadReports();
    setupRealtimeSubscription();
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

  const loadReports = async () => {
    try {
      const { data, error } = await supabase
        .from("reports")
        .select(
          `
          id,
          user_id,
          license_plate,
          photo_url,
          latitude,
          longitude,
          created_at,
          status,
          profiles(username, profile_photo_url)
        `,
        )
        .order("created_at", { ascending: false });

      if (error) throw error;

      const transformedData =
        data?.map((report) => ({
          ...report,
          profiles: Array.isArray(report.profiles)
            ? report.profiles[0]
            : report.profiles,
        })) || [];
      setReports(transformedData as Report[]);
    } catch (error) {
      console.error(error);
      Alert.alert("Chyba", "Nepodařilo se načíst reporty");
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeSubscription = () => {
    const subscription = supabase
      .channel("reports")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "reports",
        },
        async (payload) => {
          // Fetch the new report with profile data
          const { data } = await supabase
            .from("reports")
            .select(
              `
              id,
              user_id,
              license_plate,
              photo_url,
              latitude,
              longitude,
              created_at,
              status,
              profiles(username, profile_photo_url)
            `,
            )
            .eq("id", payload.new.id)
            .single();

          if (data) {
            // Transform the data to match our interface
            const transformedData = {
              ...data,
              profiles: Array.isArray(data.profiles)
                ? data.profiles[0]
                : data.profiles,
            };
            setReports((prev) => [transformedData as Report, ...prev]);
          }
        },
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReports();
    setRefreshing(false);
  };

  const takePicture = async () => {
    if (!cameraRef.current) return;

    try {
      setUploading(true);

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Chyba", "Potřebujeme přístup k poloze");
        return;
      }

      const location = await Location.getCurrentPositionAsync({});

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
      });

      const photoUrl = await uploadPhoto(photo.uri);
      if (!photoUrl) {
        Alert.alert("Chyba", "Nepodařilo se nahrát fotku");
        return;
      }

      const { error } = await supabase.from("reports").insert({
        user_id: user.id,
        photo_url: photoUrl,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (error) throw error;

      setCameraModalVisible(false);
      Alert.alert("Úspěch", "Report byl úspěšně přidán!");
    } catch (error) {
      console.error("Error taking picture:", error);
      Alert.alert("Chyba", "Nepodařilo se vytvořit report");
    } finally {
      setUploading(false);
    }
  };

  const uploadPhoto = async (uri: string): Promise<string | null> => {
    try {
      const fileExt = uri.split(".").pop() || "jpg";
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `reports/${user.id}/${fileName}`;

      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      const { error: uploadError } = await supabase.storage
        .from("report-photos")
        .upload(filePath, uint8Array, {
          contentType: `image/${fileExt}`,
          cacheControl: "3600",
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("report-photos")
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error) {
      console.error("Error uploading photo:", error);
      return null;
    }
  };

  const handleTabPress = (tab: string) => {
    switch (tab) {
      case "home":
        break;
      case "map":
        router.push("/(main)/map");
        break;
      case "camera":
        setCameraModalVisible(true);
        break;
      case "leaderboard":
        router.push("/(main)/leaderboard");
        break;
      case "profile":
        router.push("/(main)/profile");
        break;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("cs-CZ", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderReportItem = ({ item }: { item: Report }) => (
    <View style={styles.reportItem}>
      <Image source={{ uri: item.photo_url }} style={styles.reportImage} />
      <View style={styles.reportContent}>
        <View style={styles.reportHeader}>
          <View style={styles.userInfo}>
            {item.profiles?.profile_photo_url ? (
              <Image
                source={{ uri: item.profiles.profile_photo_url }}
                style={styles.userAvatar}
              />
            ) : (
              <View style={styles.userAvatarPlaceholder}>
                <Ionicons name="person" size={16} color="#94a3b8" />
              </View>
            )}
            <Text style={styles.reportUser}>
              {item.profiles?.username || "Neznámý uživatel"}
            </Text>
          </View>
          <Text style={styles.reportDate}>{formatDate(item.created_at)}</Text>
        </View>
        {item.license_plate && (
          <Text style={styles.licensePlate}>SPZ: {item.license_plate}</Text>
        )}
        <View style={styles.locationContainer}>
          <Ionicons name="location" size={14} color="#64748b" />
          <Text style={styles.locationText}>
            {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
          </Text>
        </View>
      </View>
    </View>
  );

  if (!permission) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

      <View style={styles.header}>
        <Text style={styles.title}>Reporty špatného parkování</Text>
      </View>

      <FlatList
        data={reports}
        renderItem={renderReportItem}
        keyExtractor={(item) => item.id}
        style={styles.feedList}
        contentContainerStyle={styles.feedContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="car" size={48} color="#94a3b8" />
            <Text style={styles.emptyText}>Zatím žádné reporty</Text>
            <Text style={styles.emptySubtext}>
              Buďte první, kdo nahlásí špatně zaparkované auto!
            </Text>
          </View>
        }
      />

      {/* Camera Modal */}
      <Modal
        visible={cameraModalVisible}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <View style={styles.cameraContainer}>
          {permission?.granted ? (
            <CameraView ref={cameraRef} style={styles.camera}>
              <View style={styles.cameraOverlay}>
                <View style={styles.cameraHeader}>
                  <TouchableOpacity
                    style={styles.closeButton}
                    onPress={() => setCameraModalVisible(false)}
                  >
                    <Ionicons name="close" size={24} color="#fff" />
                  </TouchableOpacity>
                </View>

                <View style={styles.cameraFooter}>
                  <TouchableOpacity
                    style={[
                      styles.captureButton,
                      uploading && styles.captureButtonDisabled,
                    ]}
                    onPress={takePicture}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <Text style={styles.captureButtonText}>Nahrávání...</Text>
                    ) : (
                      <Ionicons name="camera" size={32} color="#fff" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </CameraView>
          ) : (
            <View style={styles.permissionContainer}>
              <Text style={styles.permissionText}>
                Potřebujeme přístup ke kameře
              </Text>
              <TouchableOpacity
                style={styles.permissionButton}
                onPress={requestPermission}
              >
                <Ionicons name="camera" size={24} color="#fff" />
                <Text style={styles.permissionButtonText}>Povolit kameru</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      <BottomNavbar activeTab="home" onTabPress={handleTabPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#f8fafc",
    paddingTop: Platform.OS === "ios" ? 50 : StatusBar.currentHeight || 0,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1e293b",
  },
  feedList: {
    flex: 1,
  },
  feedContent: {
    paddingBottom: 100,
  },
  reportItem: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  reportImage: {
    width: "100%",
    height: 200,
    backgroundColor: "#f1f5f9",
  },
  reportContent: {
    padding: 16,
  },
  reportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f1f5f9",
  },
  userAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  reportUser: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1e293b",
  },
  reportDate: {
    fontSize: 14,
    color: "#64748b",
  },
  licensePlate: {
    fontSize: 14,
    fontWeight: "500",
    color: "#3b82f6",
    marginBottom: 8,
  },
  locationContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  locationText: {
    fontSize: 12,
    color: "#64748b",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 40,
  },
  cameraContainer: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: "transparent",
  },
  cameraHeader: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 20,
    left: 20,
    right: 20,
    zIndex: 1,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  cameraFooter: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#ef4444",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "#fff",
  },
  captureButtonDisabled: {
    backgroundColor: "#94a3b8",
  },
  captureButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#fff",
  },
  permissionText: {
    fontSize: 18,
    color: "#374151",
    marginBottom: 24,
    textAlign: "center",
  },
  permissionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3b82f6",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  permissionButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
