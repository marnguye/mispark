import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Image,
  ScrollView,
  Platform,
  StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useForm, Controller } from "react-hook-form";
import * as ImagePicker from "expo-image-picker";
import { TextInput } from "react-native";
import BottomNavbar from "@/components/BottomNavbar";
import { supabase } from "@/lib/supabaseClient";
import styles from "./profile.styles";

interface ProfileFormData {
  username: string;
  birthdate: string;
  profilePhoto?: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState<string>("Uživatel");
  const [isSetupMode, setIsSetupMode] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<ProfileFormData>({
    defaultValues: {
      username: "",
      birthdate: "",
    },
  });

  useEffect(() => {
    checkUserProfile();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        router.replace("/(auth)/login");
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        checkUserProfile();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkUserProfile = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/(auth)/login");
        return;
      }

      setUser(user);

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (!profile) {
        setIsSetupMode(true);
      } else {
        setIsSetupMode(false);
        setValue("username", profile.username);
        setUsername(profile.username || "Uživatel");

        const formatBirthdateForDisplay = (dateStr: string) => {
          const [year, month, day] = dateStr.split("-");
          return `${day}.${month}.${year}`;
        };

        setValue("birthdate", formatBirthdateForDisplay(profile.birthdate));
        if (profile.profile_photo_url) {
          setProfileImage(profile.profile_photo_url);
        }
      }
    } catch (error) {
      console.error("Error checking profile:", error);
      setIsSetupMode(true);
    }
  };

  const pickImage = async () => {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
      Alert.alert(
        "Oprávnění",
        "Pro výběr fotky je potřeba povolení k přístupu k fotkám.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setProfileImage(result.assets[0].uri);
    }
  };

  const uploadImage = async (
    uri: string,
    userId: string,
  ): Promise<string | null> => {
    try {
      const fileExt = uri.split(".").pop() || "jpg";
      const fileName = `avatar.${fileExt}`;
      const filePath = `${userId}/${fileName}`;

      console.log("Uploading to path:", filePath);

      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      const { error: uploadError } = await supabase.storage
        .from("profile-photos")
        .upload(filePath, uint8Array, {
          contentType: `image/${fileExt}`,
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        throw uploadError;
      }

      const { data } = supabase.storage
        .from("profile-photos")
        .getPublicUrl(filePath);

      console.log("Upload successful, public URL:", data.publicUrl);
      return data.publicUrl;
    } catch (error) {
      console.error("Error uploading image:", error);
      return null;
    }
  };

  const onSubmit = async (data: ProfileFormData) => {
    setLoading(true);

    try {
      if (!user) {
        Alert.alert("Chyba", "Uživatel není přihlášen");
        router.replace("/(auth)/login");
        return;
      }

      let profilePhotoUrl = profileImage;

      if (profileImage && profileImage.startsWith("file://")) {
        profilePhotoUrl = await uploadImage(profileImage, user.id);
        if (!profilePhotoUrl) {
          Alert.alert("Chyba", "Nepodařilo se nahrát profilovou fotku");
          return;
        }
      }

      const formatBirthdateForDB = (dateStr: string) => {
        const [day, month, year] = dateStr.split("-");
        return `${day}.${month}.${year}`;
      };

      const { error } = await supabase.from("profiles").upsert({
        user_id: user.id,
        username: data.username,
        birthdate: formatBirthdateForDB(data.birthdate),
        profile_photo_url: profilePhotoUrl,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        throw error;
      }

      setUsername(data.username);

      if (isSetupMode) {
        Alert.alert("Úspěch", "Profil byl úspěšně vytvořen!");
        router.replace("/(main)/home");
      } else {
        Alert.alert("Úspěch", "Uživatelské jméno bylo aktualizováno");
        setIsSetupMode(false);
        checkUserProfile();
      }
    } catch (error: any) {
      Alert.alert("Chyba", "Nepodařilo se uložit uživatelské jméno");
    } finally {
      setLoading(false);
    }
  };

  const handleTabPress = (tab: string) => {
    switch (tab) {
      case "home":
        router.push("/(main)/home");
        break;
      case "map":
        router.push("/map");
        break;
      case "camera":
        router.push("/(main)/home");
        break;
      case "leaderboard":
        router.push("/(main)/leaderboard");
        break;
      case "profile":
        break;
    }
  };

  const handleEditProfile = () => {
    setIsSetupMode(true);
  };

  const handleLogout = async () => {
    Alert.alert("Odhlášení", "Opravdu se chcete odhlásit?", [
      { text: "Zrušit", style: "cancel" },
      {
        text: "Odhlásit",
        style: "destructive",
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  if (isSetupMode) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
        <ScrollView
          style={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>
              {user ? "Upravit profil" : "Dokončete svůj profil"}
            </Text>
            <Text style={styles.subtitle}>Vyplňte základní informace</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.photoSection}>
              <Text style={styles.label}>Profilová fotka (volitelné)</Text>
              <TouchableOpacity
                style={styles.photoContainer}
                onPress={pickImage}
              >
                {profileImage ? (
                  <Image
                    source={{ uri: profileImage }}
                    style={styles.profileImage}
                  />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Ionicons name="camera" size={40} color="#94a3b8" />
                    <Text style={styles.photoPlaceholderText}>
                      Vybrat fotku
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                Uživatelské jméno <Text style={styles.required}>*</Text>
              </Text>
              <Controller
                control={control}
                name="username"
                rules={{
                  required: "Uživatelské jméno je povinné",
                  minLength: {
                    value: 3,
                    message: "Uživatelské jméno musí mít alespoň 3 znaky",
                  },
                }}
                render={({ field: { onChange, onBlur, value } }) => (
                  <View style={styles.inputContainer}>
                    <Ionicons
                      name="person"
                      size={20}
                      color="#64748b"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Zadejte uživatelské jméno"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      placeholderTextColor="#94a3b8"
                    />
                  </View>
                )}
              />
              {errors.username && (
                <Text style={styles.errorText}>{errors.username.message}</Text>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                Datum narození <Text style={styles.required}>*</Text>
              </Text>
              <Controller
                control={control}
                name="birthdate"
                rules={{
                  required: "Datum narození je povinné",
                  pattern: {
                    value: /^\d{2}.\d{2}.\d{4}$/,
                    message: "Zadejte datum ve formátu DD.MM.YYYY",
                  },
                }}
                render={({ field: { onChange, onBlur, value } }) => (
                  <View style={styles.inputContainer}>
                    <Ionicons
                      name="calendar"
                      size={20}
                      color="#64748b"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="DD-MM-YYYY (např. 15-01-1990)"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      placeholderTextColor="#94a3b8"
                    />
                  </View>
                )}
              />
              {errors.birthdate && (
                <Text style={styles.errorText}>{errors.birthdate.message}</Text>
              )}
            </View>

            <TouchableOpacity
              style={[
                styles.submitButton,
                loading && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit(onSubmit)}
              disabled={loading}
            >
              <Text style={styles.submitButtonText}>
                {loading ? "Ukládání..." : "Uložit profil"}
              </Text>
            </TouchableOpacity>

            {!isSetupMode && (
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setIsSetupMode(false)}
              >
                <Text style={styles.cancelButtonText}>Zrušit</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
      <ScrollView
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileHeader}>
          <View style={styles.profileImageContainer}>
            {profileImage ? (
              <Image
                source={{ uri: profileImage }}
                style={styles.profileImageLarge}
              />
            ) : (
              <View style={styles.profileImagePlaceholder}>
                <Ionicons name="person" size={60} color="#94a3b8" />
              </View>
            )}
          </View>

          <Text style={styles.profileName}>{username}</Text>
          <Text style={styles.profileEmail}>{user?.email}</Text>
        </View>

        <View style={styles.profileActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleEditProfile}
          >
            <Ionicons name="create-outline" size={20} color="#3b82f6" />
            <Text style={styles.actionButtonText}>Upravit profil</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#ef4444" />
            <Text style={[styles.actionButtonText, { color: "#ef4444" }]}>
              Odhlásit se
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <BottomNavbar activeTab="profile" onTabPress={handleTabPress} />
    </View>
  );
}
