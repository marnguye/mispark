import React, { useState, useEffect, useRef } from "react";
import {
  Text,
  View,
  TouchableOpacity,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  Modal,
  Platform,
  StatusBar,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { supabase } from "../../../lib/supabaseClient";
import BottomNavbar from "../../../components/BottomNavbar";
import { GestureHandlerRootView, Swipeable } from "react-native-gesture-handler";
import { ADMIN_EMAIL, OCR_API_URL, OCR_API_KEY } from "@env";
import styles from './home.styles';

interface Report {
  id: string;
  user_id: string;
  description?: string;
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
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [description, setDescription] = useState("");

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);

  const isAdmin = user?.email === ADMIN_EMAIL;

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
          description,
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
        { event: "INSERT", schema: "public", table: "reports" },
        async (payload) => {
          console.log("Realtime INSERT payload:", payload);
          const { data } = await supabase
            .from("reports")
            .select(
              `
              id,
              user_id,
              description,
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
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "reports" },
        (payload) => {
          console.log("Realtime DELETE payload:", payload);
          const deletedId = payload.old?.id;
          if (deletedId) {
            setReports((prev) => prev.filter((r) => r.id !== deletedId));
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

  const getStoragePathFromPublicUrl = (
    publicUrl?: string | null,
  ): string | null => {
    if (!publicUrl) return null;
    const marker = "/storage/v1/object/public/report-photos/";
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return null;
    const path = publicUrl.substring(idx + marker.length);
    return path || null;
  };

  const deleteReport = async (reportId: string) => {
    console.log("Deleting report:", reportId);
    setReports((prev) => prev.filter((r) => r.id !== reportId));
    setDeletingIds((prev) => new Set(prev).add(reportId));
    try {
      const eqId: any = /^\d+$/.test(String(reportId))
        ? Number(reportId)
        : reportId;
      const { data, error } = await supabase
        .from("reports")
        .delete()
        .eq("id", eqId)
        .select();
      if (error) {
        console.error("Supabase delete error:", error.message || error, {
          code: (error as any)?.code,
          details: (error as any)?.details,
          hint: (error as any)?.hint,
        });
      } else if (!data || (Array.isArray(data) && data.length === 0)) {
        console.warn("Supabase delete returned no rows for id:", reportId);
      } else {
        try {
          const deleted =
            Array.isArray(data) && data.length > 0 ? (data[0] as any) : null;
          const publicUrl: string | undefined = deleted?.photo_url;
          const objectPath = getStoragePathFromPublicUrl(publicUrl);
          if (objectPath) {
            const { error: storageErr } = await supabase.storage
              .from("report-photos")
              .remove([objectPath]);
            if (storageErr) {
              console.warn("Failed to remove storage object:", storageErr);
            }
          }
        } catch (storageCleanupErr) {
          console.warn("Storage cleanup error:", storageCleanupErr);
        }
      }

      try {
        const { data: verifyData, error: verifyErr } = await supabase
          .from("reports")
          .select("id")
          .eq("id", eqId)
          .limit(1);
        if (verifyErr) {
          console.warn("Post-delete verification error:", verifyErr);
        } else if (Array.isArray(verifyData) && verifyData.length > 0) {
          console.warn(
            "Post-delete verification found the row still present. This may indicate RLS denied delete or a soft-delete setup.",
            { id: reportId },
          );
        } else {
          console.log("Post-delete verification: row not found (as expected)", {
            id: reportId,
          });
        }
      } catch (verifyCatch) {
        console.warn("Post-delete verification threw:", verifyCatch);
      }
    } catch (e) {
      console.error("Delete failed:", e);
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(reportId);
        return next;
      });
    }
  };

  const handleDeletePress = (reportId: string) => {
    console.log("handleDeletePress:", reportId);
    Alert.alert("Smazat report", "Opravdu chcete smazat tento report?", [
      { text: "Zrušit", style: "cancel" },
      {
        text: "Smazat",
        style: "destructive",
        onPress: () => deleteReport(reportId),
      },
    ]);
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

      // OCR via OCR.Space API
      let licensePlate: string | null = null;
      try {
        const formData = new FormData();
        formData.append("language", "eng");
        formData.append("isTable", "false");
        formData.append("file", {
          uri: photo.uri,
          type: "image/jpeg",
          name: "photo.jpg",
        } as any);

        const response = await fetch(String(OCR_API_URL), {
          method: "POST",
          headers: {
            apikey: String(OCR_API_KEY || ""),
          },
          body: formData,
        });

        const ocrJson = await response.json();
        const ocrText = ocrJson?.ParsedResults?.[0]?.ParsedText || "";
        licensePlate = extractLicensePlate(ocrText);
        console.log("OCR text (OCR.Space):", ocrText);
        console.log("Detected SPZ:", licensePlate);
      } catch (ocrErr) {
        console.warn("OCR API failed:", ocrErr);
      }

      const photoUrl = await uploadPhoto(photo.uri);
      if (!photoUrl) {
        Alert.alert("Chyba", "Nepodařilo se nahrát fotku");
        return;
      }

      const { error } = await supabase.from("reports").insert({
        user_id: user.id,
        description: description || null,
        photo_url: photoUrl,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        license_plate: licensePlate || null,
      });

      if (error) throw error;

      setCameraModalVisible(false);
      setDescription("");
      Alert.alert("Úspěch", "Report byl úspěšně přidán!");
    } catch (error) {
      console.error("Error taking picture:", error);
      Alert.alert("Chyba", "Nepodařilo se vytvořit report");
    } finally {
      setUploading(false);
    }
  };

  const extractLicensePlate = (text: string): string | null => {
    if (!text) return null;

    text = text.replace(/[^A-Z0-9\s]/gi, "").toUpperCase();
    const regex = /\b[A-Z0-9]{2,4}\s?[A-Z0-9]{2,5}\b/g;
    const matches = text.match(regex);
    if (matches && matches.length > 0) {
      return matches[0];
    }
    return null;
  };

  const uploadPhoto = async (uri: string): Promise<string | null> => {
    try {
      const fileExt = uri.split(".").pop() || "jpg";
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

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

      console.log("Uploading to path: ", filePath);

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

  const renderRightActions = (id: string) => (
    <View style={styles.deleteActionContainer}>
      <TouchableOpacity
        style={[
          styles.deleteActionButton,
          deletingIds.has(id) && { opacity: 0.6 },
        ]}
        onPress={() => {
          console.log("Trash pressed:", id);
          if (!deletingIds.has(id)) handleDeletePress(id);
        }}
        disabled={deletingIds.has(id)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="trash" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  const renderReportItem = ({ item }: { item: Report }) => {
    const content = (
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
          {!!item.description && (
            <Text style={styles.descriptionText}>{item.description}</Text>
          )}
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

    if (!isAdmin) return content;
    return (
      <Swipeable
        renderRightActions={() => renderRightActions(item.id)}
        overshootRight={false}
      >
        {content}
      </Swipeable>
    );
  };

  if (!permission) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.container} />
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
                    <TextInput
                      placeholder="Popis (nepovinné)"
                      placeholderTextColor="#cbd5e1"
                      value={description}
                      onChangeText={setDescription}
                      style={styles.descriptionInput}
                    />
                    <TouchableOpacity
                      style={[
                        styles.captureButton,
                        uploading && styles.captureButtonDisabled,
                      ]}
                      onPress={takePicture}
                      disabled={uploading}
                    >
                      {uploading ? (
                        <Text style={styles.captureButtonText}>
                          Nahrávání...
                        </Text>
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
                  <Text style={styles.permissionButtonText}>
                    Povolit kameru
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </Modal>

        <BottomNavbar activeTab="home" onTabPress={handleTabPress} />
      </View>
    </GestureHandlerRootView>
  );
}

