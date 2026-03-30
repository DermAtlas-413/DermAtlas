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
import { getUser, clearAuth } from "../lib/api";

export default function Profile() {
  const router = useRouter();
  const user = getUser();

  const displayName = user?.fullName ?? "—";
  const displayUsername = user?.email ?? "—";
  const displayRole = user?.role === "PCP" ? "PCP, Admin" : (user?.role ?? "—");

  function handleLogout() {
    clearAuth();
    router.replace("/");
  }

  function handleChangePassword() {
    Alert.alert("Change Password", "Password reset is not yet available in this version.");
  }

  function handleManageUsers() {
    Alert.alert("Manage Users", "User management is not yet available in this version.");
  }

  function handleAuditLogs() {
    Alert.alert("View Audit Logs", "Audit log viewer is not yet available in this version.");
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.card}>
          {/* Top Bar */}
          <View style={styles.topBar}>
            <Pressable onPress={() => router.back()} style={styles.topBarBtn}>
              <Text style={styles.backArrow}>‹</Text>
            </Pressable>
            <Text style={styles.doctorText}>Dr. Quach (PCP)</Text>
            <Pressable onPress={handleLogout} style={styles.logoutBtn}>
              <Text style={styles.logout}>Logout</Text>
            </Pressable>
          </View>

          {/* Account Header */}
          <View style={styles.accountHeader}>
            <Text style={styles.accountTitle}>Account</Text>
          </View>

          {/* Profile Info Card */}
          <View style={styles.profileCard}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarIcon}>👤</Text>
            </View>
            <View style={styles.infoPills}>
              <View style={styles.infoPill}>
                <Text style={styles.infoPillText}>Name: {displayName}</Text>
              </View>
              <View style={styles.infoPill}>
                <Text style={styles.infoPillText}>Username: {displayUsername}</Text>
              </View>
              <View style={styles.infoPillAlt}>
                <Text style={styles.infoPillText}>Role: {displayRole}</Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Change Password */}
          <Pressable style={styles.menuRow} onPress={handleChangePassword}>
            <View style={styles.menuLeft}>
              <View style={styles.menuIconWrap}>
                <Text style={styles.menuIcon}>🔒</Text>
              </View>
              <Text style={styles.menuLabel}>Change Password</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>

          <View style={styles.divider} />

          {/* Administrator Controls */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Administrator Controls</Text>
          </View>

          <Pressable style={styles.menuRow} onPress={handleManageUsers}>
            <View style={styles.menuLeft}>
              <View style={styles.menuIconWrap}>
                <Text style={styles.menuIcon}>👤</Text>
              </View>
              <Text style={styles.menuLabel}>Manage Users</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>

          <View style={styles.divider} />

          <Pressable style={styles.menuRow} onPress={handleAuditLogs}>
            <View style={styles.menuLeft}>
              <View style={styles.menuIconWrap}>
                <Text style={styles.menuIcon}>📋</Text>
              </View>
              <Text style={styles.menuLabel}>View Audit Logs</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>

          <View style={styles.divider} />

          {/* Logout Button */}
          <Pressable style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>Logout</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const c = {
  primary: "#118AB2",
  border: "#69B5D3",
  light: "#CFEFFC",
  soft: "#D9EEF7",
  text: "#0B2B3A",
  mid: "#77BFE0",
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFFFF" },
  page: { paddingHorizontal: 22, paddingVertical: 18 },
  card: {
    borderWidth: 2,
    borderColor: c.border,
    borderRadius: 32,
    backgroundColor: "#FFFFFF",
    padding: 18,
  },
  topBar: {
    height: 60,
    backgroundColor: c.primary,
    borderRadius: 20,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  topBarBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  backArrow: { color: "#FFF", fontSize: 28, fontWeight: "900" },
  doctorText: { color: "#FFF", fontSize: 14, fontWeight: "800" },
  logoutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  logout: { color: "#FFF", fontWeight: "800" },
  accountHeader: {
    borderWidth: 2,
    borderColor: c.border,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 18,
  },
  accountTitle: { color: c.primary, fontSize: 18, fontWeight: "900" },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 18,
    paddingHorizontal: 4,
  },
  avatarCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: c.soft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: c.border,
  },
  avatarIcon: { fontSize: 32 },
  infoPills: { flex: 1, gap: 6 },
  infoPill: {
    backgroundColor: c.primary,
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  infoPillAlt: {
    backgroundColor: c.mid,
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  infoPillText: { color: "#FFF", fontWeight: "800", fontSize: 12 },
  divider: { height: 1, backgroundColor: c.light, marginVertical: 4 },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 4,
  },
  menuLeft: { flexDirection: "row", alignItems: "center", gap: 14 },
  menuIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  menuIcon: { fontSize: 18 },
  menuLabel: { color: c.text, fontWeight: "700", fontSize: 15 },
  chevron: { color: c.primary, fontSize: 24, fontWeight: "900" },
  sectionHeader: {
    borderWidth: 2,
    borderColor: c.border,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginVertical: 8,
    alignItems: "center",
  },
  sectionTitle: { color: c.primary, fontWeight: "900", fontSize: 15 },
  logoutButton: {
    borderWidth: 2,
    borderColor: c.border,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 10,
  },
  logoutButtonText: { color: c.primary, fontWeight: "900", fontSize: 16 },
});
