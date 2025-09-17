import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface BottomNavbarProps {
  activeTab?: string;
  onTabPress?: (tab: string) => void;
}

export default function BottomNavbar({ activeTab = 'home', onTabPress }: BottomNavbarProps) {
  const handleTabPress = (tab: string) => {
    onTabPress?.(tab);
  };

  const NavButton = ({ 
    icon, 
    label, 
    tabKey, 
    isActive = false 
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
        color={isActive ? '#3b82f6' : '#64748b'} 
      />
      <Text style={[styles.navLabel, isActive && styles.activeLabel]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const CameraButton = () => (
    <TouchableOpacity 
      style={styles.cameraButton} 
      onPress={() => handleTabPress('camera')}
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
        isActive={activeTab === 'home'} 
      />
      
      <NavButton 
        icon="map" 
        label="Mapa" 
        tabKey="map" 
        isActive={activeTab === 'map'} 
      />
      
      <CameraButton />
      
      <NavButton 
        icon="trophy" 
        label="Žebříček" 
        tabKey="leaderboard" 
        isActive={activeTab === 'leaderboard'} 
      />
      
      <NavButton 
        icon="person" 
        label="Profil" 
        tabKey="profile" 
        isActive={activeTab === 'profile'} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  navbar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 12,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  navButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    flex: 1,
  },
  navLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    fontWeight: '500',
  },
  activeLabel: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  cameraButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -20,
    shadowColor: '#3b82f6',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
