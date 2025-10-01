import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  RefreshControl,
  Platform,
  StatusBar,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabaseClient";
import BottomNavbar from "../../components/BottomNavbar";

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
        <Text style={styles.sectionTitle}>🏆 Top 3</Text>
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
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 4,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 100,
  },
  topThreeContainer: {
    backgroundColor: "#fff",
    margin: 16,
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
    textAlign: "center",
    marginBottom: 20,
  },
  podiumContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-end",
  },
  podiumItem: {
    alignItems: "center",
    flex: 1,
    marginHorizontal: 4,
  },
  firstPlace: {
    transform: [{ scale: 1.1 }],
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  goldBadge: {
    backgroundColor: "#fbbf24",
  },
  silverBadge: {
    backgroundColor: "#9ca3af",
  },
  bronzeBadge: {
    backgroundColor: "#d97706",
  },
  defaultBadge: {
    backgroundColor: "#64748b",
  },
  rankBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  topUserAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "#e2e8f0",
  },
  firstPlaceAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderColor: "#fbbf24",
    borderWidth: 3,
  },
  topUserAvatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "#e2e8f0",
  },
  topUsername: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1e293b",
    textAlign: "center",
    marginBottom: 4,
  },
  firstPlaceText: {
    fontSize: 16,
    color: "#fbbf24",
  },
  topScore: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "500",
  },
  firstPlaceScore: {
    fontSize: 14,
    color: "#fbbf24",
    fontWeight: "700",
  },
  leaderboardItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginVertical: 4,
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  rankContainer: {
    width: 32,
    alignItems: "center",
    marginRight: 12,
  },
  rankNumber: {
    fontSize: 16,
    fontWeight: "700",
    color: "#64748b",
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  userAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1e293b",
  },
  reportCount: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 2,
  },
  points: {
    fontSize: 18,
    fontWeight: "700",
    color: "#3b82f6",
  },
  currentUserContainer: {
    margin: 16,
    marginTop: 24,
  },
  currentUserTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 12,
    textAlign: "center",
  },
  currentUserCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3b82f6",
    padding: 20,
    borderRadius: 16,
    shadowColor: "#3b82f6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  currentUserRank: {
    alignItems: "center",
    marginRight: 16,
  },
  currentUserRankText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
  },
  currentUserRankLabel: {
    fontSize: 12,
    color: "#dbeafe",
    fontWeight: "500",
  },
  currentUserAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 16,
    borderWidth: 2,
    borderColor: "#fff",
  },
  currentUserAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  currentUserInfo: {
    flex: 1,
  },
  currentUserName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  currentUserScore: {
    fontSize: 14,
    color: "#dbeafe",
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 16,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 8,
  },
});
