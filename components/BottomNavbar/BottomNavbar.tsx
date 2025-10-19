import React from "react";
import { View, Text, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import styles from './BottomNavbar.styles';

interface BottomNavbarProps {
  activeTab?: string;
  onTabPress?: (tab: string) => void;
}

export default function BottomNavbar({
  activeTab = "home",
  onTabPress,
}: BottomNavbarProps) {
  const handleTabPress = (tab: string) => {
    onTabPress?.(tab);
  };

  const NavButton = ({
    icon,
    label,
    tabKey,
    isActive = false,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    tabKey: string;
    isActive?: boolean;
  }) => (
    <TouchableOpacity
      style={styles.navButton}
      onPress={() => handleTabPress(tabKey)}
      activeOpacity={0.7}
    >
      <Ionicons
        name={icon}
        size={24}
        color={isActive ? "#3b82f6" : "#64748b"}
      />
      <Text style={[styles.navLabel, isActive && styles.activeLabel]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const CameraButton = () => (
    <TouchableOpacity
      style={styles.cameraButton}
      onPress={() => handleTabPress("camera")}
      activeOpacity={0.8}
    >
      <Ionicons name="add" size={32} color="#fff" />
    </TouchableOpacity>
  );

  return (
    <View style={styles.navbar}>
      <NavButton
        icon="home"
        label="Domů"
        tabKey="home"
        isActive={activeTab === "home"}
      />

      <NavButton
        icon="map"
        label="Mapa"
        tabKey="map"
        isActive={activeTab === "map"}
      />

      <CameraButton />

      <NavButton
        icon="trophy"
        label="Žebříček"
        tabKey="leaderboard"
        isActive={activeTab === "leaderboard"}
      />

      <NavButton
        icon="person"
        label="Profil"
        tabKey="profile"
        isActive={activeTab === "profile"}
      />
    </View>
  );
}


