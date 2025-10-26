import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  RefreshControl,
  Platform,
  StatusBar,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {supabase} from "@/lib/supabaseClient";
import BottomNavbar from "@/components/BottomNavbar";
import styles from './leaderboard.styles';

interface LeaderboardUser {
  user_id: string;
  username: string;
  profile_photo_url?: string;
  total_reports: number;
}

interface UserRanking {
  rank: number;
  total_reports: number;
}

export default function LeaderboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [currentUserRank, setCurrentUserRank] = useState<UserRanking | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    checkUser();
    loadLeaderboard();
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
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();
      setUserProfile(profile);
      loadCurrentUserRank(user.id);
    }
  };

  const loadLeaderboard = async () => {
    try {
      const { data, error } = await supabase.rpc("get_leaderboard");

      if (error) {
        console.error("Error loading leaderboard:", error);
      } else {
        setLeaderboard(data || []);
      }
    } catch (error) {
      console.error("Error loading leaderboard:", error);
      Alert.alert("Chyba", "Nepodařilo se načíst žebříček");
    } finally {
      setLoading(false);
    }
  };

  const loadCurrentUserRank = async (userId: string) => {
    try {
      const { data, error } = await supabase.rpc("get_user_ranking", {
        target_user_id: userId,
      });

      if (error) throw error;
      setCurrentUserRank(data?.[0] || null);
    } catch (error) {
      console.error("Error loading user rank:", error);
    }
  };

  const setupRealtimeSubscription = () => {
    const subscription = supabase
      .channel("leaderboard-reports")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reports",
        },
        () => {
          loadLeaderboard();
          if (user) {
            loadCurrentUserRank(user.id);
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
    await loadLeaderboard();
    if (user) {
      await loadCurrentUserRank(user.id);
    }
    setRefreshing(false);
  };

  const handleTabPress = (tab: string) => {
    switch (tab) {
      case "home":
        router.push("/(main)/home");
        break;
      case "map":
        router.push("/(main)/map");
        break;
      case "camera":
        router.push("/(main)/home");
        break;
      case "leaderboard":
        break;
      case "profile":
        router.push("/(main)/profile");
        break;
    }
  };

  const renderTopThree = () => {
    const topThree = leaderboard.slice(0, 3);
    if (topThree.length === 0) return null;

    return (
      <View style={styles.topThreeContainer}>
        <Text style={styles.sectionTitle}>Top 3</Text>
        <View style={styles.podiumContainer}>
          {topThree.map((user, index) => (
            <View
              key={user.user_id}
              style={[styles.podiumItem, index === 0 && styles.firstPlace]}
            >
              <View style={[styles.rankBadge, getRankBadgeStyle(index + 1)]}>
                <Text style={styles.rankBadgeText}>{index + 1}</Text>
              </View>
              {user.profile_photo_url ? (
                <Image
                  source={{ uri: user.profile_photo_url }}
                  style={[
                    styles.topUserAvatar,
                    index === 0 && styles.firstPlaceAvatar,
                  ]}
                />
              ) : (
                <View
                  style={[
                    styles.topUserAvatarPlaceholder,
                    index === 0 && styles.firstPlaceAvatar,
                  ]}
                >
                  <Ionicons
                    name="person"
                    size={index === 0 ? 32 : 24}
                    color="#94a3b8"
                  />
                </View>
              )}
              <Text
                style={[
                  styles.topUsername,
                  index === 0 && styles.firstPlaceText,
                ]}
                numberOfLines={1}
              >
                {user.username}
              </Text>
              <Text
                style={[styles.topScore, index === 0 && styles.firstPlaceScore]}
              >
                {user.total_reports} bodů
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const getRankBadgeStyle = (rank: number) => {
    switch (rank) {
      case 1:
        return styles.goldBadge;
      case 2:
        return styles.silverBadge;
      case 3:
        return styles.bronzeBadge;
      default:
        return styles.defaultBadge;
    }
  };

  const renderLeaderboardItem = ({
    item,
    index,
  }: {
    item: LeaderboardUser;
    index: number;
  }) => {
    const actualRank = index + 4;

    return (
      <View style={styles.leaderboardItem}>
        <View style={styles.rankContainer}>
          <Text style={styles.rankNumber}>{actualRank}</Text>
        </View>

        {item.profile_photo_url ? (
          <Image
            source={{ uri: item.profile_photo_url }}
            style={styles.userAvatar}
          />
        ) : (
          <View style={styles.userAvatarPlaceholder}>
            <Ionicons name="person" size={20} color="#94a3b8" />
          </View>
        )}

        <View style={styles.userInfo}>
          <Text style={styles.username}>{item.username}</Text>
          <Text style={styles.reportCount}>{item.total_reports} reportů</Text>
        </View>

        <Text style={styles.points}>{item.total_reports}</Text>
      </View>
    );
  };

  const renderCurrentUser = () => {
    if (!currentUserRank) return null;

    return (
      <View style={styles.currentUserContainer}>
        <Text style={styles.currentUserTitle}>Vaše pozice</Text>
        <View style={styles.currentUserCard}>
          <View style={styles.currentUserRank}>
            <Text style={styles.currentUserRankText}>
              {currentUserRank.rank}.
            </Text>
            <Text style={styles.currentUserRankLabel}>místo</Text>
          </View>

          {userProfile?.profile_photo_url ? (
            <Image
              source={{ uri: userProfile.profile_photo_url }}
              style={styles.currentUserAvatar}
            />
          ) : (
            <View style={styles.currentUserAvatarPlaceholder}>
              <Ionicons name="person" size={24} color="#3b82f6" />
            </View>
          )}

          <View style={styles.currentUserInfo}>
            <Text style={styles.currentUserName}>
              {userProfile?.username || "Uživatel"}
            </Text>
            <Text style={styles.currentUserScore}>
              {currentUserRank.total_reports} bodů
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const remainingUsers = leaderboard.slice(3);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

      <View style={styles.header}>
        <Text style={styles.title}>Žebříček</Text>
        <Text style={styles.subtitle}>
          Nejlepší hlásitelé špatného parkování
        </Text>
      </View>

      <FlatList
        data={remainingUsers}
        renderItem={renderLeaderboardItem}
        keyExtractor={(item) => item.user_id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={renderTopThree}
        ListFooterComponent={renderCurrentUser}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !loading && leaderboard.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="trophy" size={48} color="#94a3b8" />
              <Text style={styles.emptyText}>Zatím žádní uživatelé</Text>
              <Text style={styles.emptySubtext}>
                Buďte první, kdo nahlásí špatně zaparkované auto!
              </Text>
            </View>
          ) : null
        }
      />

      <BottomNavbar activeTab="leaderboard" onTabPress={handleTabPress} />
    </View>
  );
}
