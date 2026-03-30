import React from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { getUser, clearAuth } from "../lib/api";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

function MenuRow({
  icon,
  label,
  sublabel,
  onPress,
  danger,
}: {
  icon: IconName;
  label: string;
  sublabel?: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.menuRow,
        pressed && styles.menuRowPressed,
      ]}
      onPress={onPress}
    >
      <View
        style={[
          styles.menuIconWrap,
          danger && styles.menuIconWrapDanger,
        ]}
      >
        <MaterialCommunityIcons
          name={icon}
          size={20}
          color={danger ? "#E63946" : D.primary}
        />
      </View>
      <View style={styles.menuTextWrap}>
        <Text style={[styles.menuLabel, danger && styles.menuLabelDanger]}>
          {label}
        </Text>
        {sublabel ? (
          <Text style={styles.menuSublabel}>{sublabel}</Text>
        ) : null}
      </View>
      <MaterialCommunityIcons
        name="chevron-right"
        size={20}
        color={danger ? "#E63946" : D.muted}
      />
    </Pressable>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeaderWrap}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
    </View>
  );
}

export default function Profile() {
  const router = useRouter();
  const user = getUser();

  const displayName = user?.fullName ?? "—";
  const displayUsername = user?.email ?? "—";
  const displayRole =
    user?.role === "PCP" ? "PCP, Admin" : user?.role ?? "—";

  const initials =
    displayName !== "—"
      ? displayName
          .split(" ")
          .map((w: string) => w[0])
          .slice(0, 2)
          .join("")
          .toUpperCase()
      : "?";

  function handleLogout() {
    clearAuth();
    router.replace("/");
  }

  function handleChangePassword() {
    Alert.alert(
      "Change Password",
      "Password reset is not yet available in this version."
    );
  }

  function handleManageUsers() {
    Alert.alert(
      "Manage Users",
      "User management is not yet available in this version."
    );
  }

  function handleAuditLogs() {
    Alert.alert(
      "View Audit Logs",
      "Audit log viewer is not yet available in this version."
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Profile</Text>
          <Text style={styles.headerSubtitle}>
            {user?.fullName ?? "—"} · {user?.role ?? "—"}
          </Text>
        </View>
        <Pressable style={styles.headerBtnAlt} onPress={handleLogout}>
          <Text style={styles.headerBtnAltText}>Logout</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.page}>
          {/* Profile card */}
          <View style={styles.profileCard}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{displayName}</Text>
              <View style={styles.profileBadges}>
                <View style={styles.badge}>
                  <MaterialCommunityIcons
                    name="briefcase-outline"
                    size={11}
                    color={D.primary}
                  />
                  <Text style={styles.badgeText}>{displayRole}</Text>
                </View>
              </View>
              <Text style={styles.profileUsername}>{displayUsername}</Text>
            </View>
          </View>

          {/* Account section */}
          <View style={styles.menuGroup}>
            <SectionHeader title="Account" />
            <View style={styles.menuCard}>
              <MenuRow
                icon="lock-outline"
                label="Change Password"
                sublabel="Update your login credentials"
                onPress={handleChangePassword}
              />
            </View>
          </View>

          {/* Admin section */}
          <View style={styles.menuGroup}>
            <SectionHeader title="Administrator Controls" />
            <View style={styles.menuCard}>
              <MenuRow
                icon="account-group-outline"
                label="Manage Users"
                sublabel="Add, remove, or edit user accounts"
                onPress={handleManageUsers}
              />
              <View style={styles.menuDivider} />
              <MenuRow
                icon="clipboard-list-outline"
                label="View Audit Logs"
                sublabel="Review system activity and access history"
                onPress={handleAuditLogs}
              />
            </View>
          </View>

          {/* Sign out */}
          <View style={styles.menuGroup}>
            <View style={styles.menuCard}>
              <MenuRow
                icon="logout"
                label="Sign Out"
                onPress={handleLogout}
                danger
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const D = {
  primary: "#0D6E8A",
  bg: "#EEF6FA",
  surface: "#FFFFFF",
  border: "#B8D9E8",
  text: "#1A3340",
  muted: "#7A9EB0",
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: D.bg },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: D.primary,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { color: "#fff", fontWeight: "700", fontSize: 17 },
  headerSubtitle: { color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: "500" },
  headerBtnAlt: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  headerBtnAltText: { color: "#fff", fontWeight: "600", fontSize: 13 },

  scroll: { flexGrow: 1 },
  page: {
    padding: 20,
    gap: 16,
    maxWidth: 600,
    alignSelf: "center",
    width: "100%",
  },

  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: D.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: D.border,
  },
  avatarCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: D.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: { color: "#fff", fontWeight: "800", fontSize: 24 },
  profileInfo: { flex: 1, gap: 4 },
  profileName: { color: D.text, fontSize: 17, fontWeight: "700" },
  profileBadges: { flexDirection: "row", gap: 6 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: D.bg,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: D.border,
  },
  badgeText: { color: D.primary, fontSize: 11, fontWeight: "600" },
  profileUsername: { color: D.muted, fontSize: 12, fontWeight: "500" },

  menuGroup: { gap: 8 },
  sectionHeaderWrap: { paddingHorizontal: 4 },
  sectionHeaderText: {
    fontSize: 11,
    fontWeight: "700",
    color: D.muted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },

  menuCard: {
    backgroundColor: D.surface,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: D.border,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
  },
  menuRowPressed: { backgroundColor: D.bg },
  menuIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#E0F0F7",
    alignItems: "center",
    justifyContent: "center",
  },
  menuIconWrapDanger: { backgroundColor: "#FEE2E4" },
  menuTextWrap: { flex: 1, gap: 2 },
  menuLabel: { color: D.text, fontWeight: "600", fontSize: 15 },
  menuLabelDanger: { color: "#E63946" },
  menuSublabel: { color: D.muted, fontSize: 12 },
  menuDivider: { height: 1, backgroundColor: D.border, marginLeft: 68 },
});
