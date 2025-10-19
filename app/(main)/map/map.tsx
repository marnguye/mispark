import React, { useEffect, useState, useRef } from "react";
import MapView, { Marker } from "react-native-maps";
import {
  View,
  Alert,
  TouchableOpacity,
  Text,
  Platform,
  StatusBar,
  Modal,
  Image,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import BottomNavbar from "../../components/BottomNavbar";
import { supabase } from "../../lib/supabaseClient";
import styles from './map.styles';

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
  displayAddress?: string;
}

export default function MapPage() {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [userLocation, setUserLocation] = useState<any>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<MapView>(null);

  const pragueRegion = {
    latitude: 50.0755,
    longitude: 14.4378,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  useEffect(() => {
    checkUser();
    loadReports();
    getUserLocation();
    setupRealtimeSubscription();
  }, []);

  const checkUser = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/(auth)/login");
    }
  };

  const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Povolení odmítnuto", "Bez povolení nelze zjistit polohu.");
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      setUserLocation(location);
    } catch (error) {
      console.error("Error getting location:", error);
    }
  };

  const getAddressFromCoords = async (
    latitude: number,
    longitude: number,
  ): Promise<string | null> => {
    try {
      const results = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });
      if (results && results.length > 0) {
        const r = results[0];
        const parts = [
          r.name,
          r.street,
          r.city || r.subregion,
          r.region,
          r.country,
        ]
          .filter(Boolean)
          .map((s) => String(s));
        if (parts.length > 0) return parts.join(", ");
      }
      return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    } catch (e) {
      return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
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
      console.error("Error loading reports:", error);
      Alert.alert("Chyba", "Nepodařilo se načíst reporty");
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeSubscription = () => {
    const subscription = supabase
      .channel("map-reports")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "reports",
        },
        async (payload) => {
          const newReport = payload.new;
          if (!newReport) return;

          const fields = [
            "id",
            "user_id",
            "license_plate",
            "photo_url",
            "latitude",
            "longitude",
            "created_at",
            "status",
            "profiles(username,profile_photo_url)",
          ];

          const selectString = fields.join(",");

          const { data } = await supabase
            .from("reports")
            .select(selectString)
            .eq("id", newReport.id)
            .single();

          if (!data) return;

          const address = await getAddressFromCoords(
            data.latitude,
            data.longitude,
          );

          const transformedData = {
            ...data,
            profiles: Array.isArray(data.profiles)
              ? data.profiles[0]
              : data.profiles,
            displayAddress: address,
          };
          setReports((prev) => [transformedData as Report, ...prev]);
        },
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  };

  const handleMarkerPress = (report: Report) => {
    setSelectedReport(report);
    setModalVisible(true);
  };

  const handleTabPress = (tab: string) => {
    switch (tab) {
      case "home":
        router.push("/(main)/home");
        break;
      case "map":
        break;
      case "camera":
        router.push("/(main)/home");
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

  const centerOnUserLocation = () => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: userLocation.coords.latitude,
        longitude: userLocation.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

      <View style={styles.header}>
        <Text style={styles.title}>Mapa reportů</Text>
        <Text style={styles.subtitle}>{reports.length} reportů na mapě</Text>
      </View>

      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={pragueRegion}
          showsUserLocation={true}
          showsMyLocationButton={false}
        >
          {reports.map((report) => (
            <Marker
              key={report.id}
              coordinate={{
                latitude: report.latitude,
                longitude: report.longitude,
              }}
              onPress={() => handleMarkerPress(report)}
            >
              <View style={styles.markerContainer}>
                <View style={styles.redMarker}>
                  <Image
                    source={{ uri: report.photo_url }}
                    style={styles.markerImage}
                    resizeMode="cover"
                  />
                </View>
              </View>
            </Marker>
          ))}
        </MapView>

        <TouchableOpacity
          style={styles.locationButton}
          onPress={centerOnUserLocation}
        >
          <Ionicons name="locate" size={24} color="#3b82f6" />
        </TouchableOpacity>
      </View>

      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Detail reportu</Text>
            <TouchableOpacity
              style={styles.closeModalButton}
              onPress={() => setModalVisible(false)}
            >
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>

          {selectedReport && (
            <ScrollView
              style={styles.modalContent}
              showsVerticalScrollIndicator={false}
            >
              <Image
                source={{ uri: selectedReport.photo_url }}
                style={styles.modalImage}
                resizeMode="cover"
              />

              <View style={styles.modalInfo}>
                <View style={styles.infoRow}>
                  <Ionicons name="person" size={20} color="#64748b" />
                  <Text style={styles.infoLabel}>Nahlásil:</Text>
                  <Text style={styles.infoValue}>
                    {selectedReport.profiles?.username || "Neznámý uživatel"}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Ionicons name="time" size={20} color="#64748b" />
                  <Text style={styles.infoLabel}>Čas:</Text>
                  <Text style={styles.infoValue}>
                    {formatDate(selectedReport.created_at)}
                  </Text>
                </View>

                {selectedReport.license_plate && (
                  <View style={styles.infoRow}>
                    <Ionicons name="car" size={20} color="#64748b" />
                    <Text style={styles.infoLabel}>SPZ:</Text>
                    <Text style={[styles.infoValue, styles.licensePlate]}>
                      {selectedReport.license_plate}
                    </Text>
                  </View>
                )}

                <View style={styles.infoRow}>
                  <Ionicons name="location" size={20} color="#64748b" />
                  <Text style={styles.infoLabel}>Poloha:</Text>
                  <Text style={styles.infoValue}>
                    {selectedReport.displayAddress ||
                      `${selectedReport.latitude.toFixed(4)}, ${selectedReport.longitude.toFixed(4)}`}
                  </Text>
                </View>
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>

      <BottomNavbar activeTab="map" onTabPress={handleTabPress} />
    </View>
  );
}

/* moved to ./map.styles */
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
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 4,
  },
  mapContainer: {
    flex: 1,
    position: "relative",
  },
  map: {
    flex: 1,
  },
  markerContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  markerImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  redMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  locationButton: {
    position: "absolute",
    top: 20,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingTop: Platform.OS === "ios" ? 50 : 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1e293b",
  },
  closeModalButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  modalContent: {
    flex: 1,
  },
  modalImage: {
    width: "100%",
    height: 300,
    backgroundColor: "#f1f5f9",
  },
  modalInfo: {
    padding: 20,
    gap: 16,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  infoLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: "#64748b",
    minWidth: 60,
  },
  infoValue: {
    fontSize: 16,
    color: "#1e293b",
    flex: 1,
  },
  licensePlate: {
    fontWeight: "600",
    color: "#3b82f6",
  },
});
