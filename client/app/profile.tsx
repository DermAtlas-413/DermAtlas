import React from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuthStore } from "@/state/auth-store";
import { displayRole } from "@/types/api";
import { DermAtlasColors as D } from "@/constants/theme";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export default function Profile() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const displayName = user?.fullName ?? "—";
  const displayUsername = user?.email ?? "—";
  const roleLabel = displayRole(user?.role);

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
    router.push("/change-password");
  }

  function handleMyUploads() {
    router.push("/my-uploads");
  }

  function handleManageUsers() {
    router.push("/admin/users");
  }

  function handleManagePatients() {
    router.push("/admin/patients");
  }

  function handleAuditLogs() {
    router.push("/admin/audit-logs");
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={D.onPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Profile</Text>
          <Text style={styles.headerSubtitle}>
            {user?.fullName ?? "—"} · {roleLabel}
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
                  <Text style={styles.badgeText}>{roleLabel}</Text>
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
          {/* Inbox section - PCP only */}
{user?.role === "PCP" && (
  <View style={styles.menuGroup}>
    <SectionHeader title="Communication" />
    <View style={styles.menuCard}>
      <MenuRow
        icon="inbox-outline"
        label="Inbox"
        sublabel="View consultation requests"
        onPress={() => router.push("/inbox")}
      />
    </View>
  </View>
)}

          {/* PCP-only: previous uploads */}
          {user?.role === "PCP" && (
            <View style={styles.menuGroup}>
              <SectionHeader title="Clinical" />
              <View style={styles.menuCard}>
                <MenuRow
                  icon="folder-image"
                  label="My Uploaded Cases"
                  sublabel="Review lesion images you have analyzed"
                  onPress={handleMyUploads}
                />
              </View>
            </View>
          )}

          {/* Admin section — network admins only */}
          {user?.role === "PCP" && user?.isAdmin && (
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
                  icon="account-switch-outline"
                  label="Manage Patients"
                  sublabel="Reassign patients to a different physician"
                  onPress={handleManagePatients}
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
          )}

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
          color={danger ? D.danger : D.primary}
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
        color={danger ? D.danger : D.muted}
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
    backgroundColor: D.onPrimaryOverlay,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { color: D.onPrimary, fontWeight: "700", fontSize: 17 },
  headerSubtitle: { color: D.onPrimaryMuted, fontSize: 11, fontWeight: "500" },
  headerBtnAlt: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: D.onPrimaryOverlay,
  },
  headerBtnAltText: { color: D.onPrimary, fontWeight: "600", fontSize: 13 },

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
  avatarInitials: { color: D.onPrimary, fontWeight: "800", fontSize: 24 },
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
    backgroundColor: D.infoSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  menuIconWrapDanger: { backgroundColor: D.dangerBg },
  menuTextWrap: { flex: 1, gap: 2 },
  menuLabel: { color: D.text, fontWeight: "600", fontSize: 15 },
  menuLabelDanger: { color: D.danger },
  menuSublabel: { color: D.muted, fontSize: 12 },
  menuDivider: { height: 1, backgroundColor: D.border, marginLeft: 68 },
});
