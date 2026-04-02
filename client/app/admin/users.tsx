import React, { useState, useEffect } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { DermAtlasColors as D } from "@/constants/theme";
import type { AdminUser, CreateUserPayload, UpdateUserPayload } from "@/types/admin";
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
} from "@/services/user-service";
import { useAuthStore } from "@/state/auth-store";
import { useRequireRole } from "@/hooks/use-require-role";
import { UserFormModal } from "@/components/user-form-modal";

export default function ManageUsers() {
  const authorized = useRequireRole("PCP");
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);

  useEffect(() => {
    if (!authorized) return;
    loadUsers();
  }, [authorized]);

  if (!authorized) return null;

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }

  const filtered = users.filter(
    (u) =>
      u.user_id !== currentUser?.userId &&
      (u.full_name.toLowerCase().includes(search.toLowerCase()) ||
       u.email.toLowerCase().includes(search.toLowerCase()))
  );

  function openCreate() {
    setEditingUser(null);
    setModalVisible(true);
  }

  function openEdit(user: AdminUser) {
    setEditingUser(user);
    setModalVisible(true);
  }

  async function handleSave(data: CreateUserPayload | UpdateUserPayload) {
    if (editingUser) {
      const updated = await updateUser(editingUser.user_id, data as UpdateUserPayload);
      setUsers((prev) => prev.map((u) => (u.user_id === updated.user_id ? updated : u)));
    } else {
      const created = await createUser(data as CreateUserPayload);
      setUsers((prev) => [...prev, created]);
    }
  }

  function confirmDelete(user: AdminUser) {
    Alert.alert(
      "Delete User",
      `Are you sure you want to permanently delete ${user.full_name}? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteUser(user.user_id);
              setUsers((prev) => prev.filter((u) => u.user_id !== user.user_id));
            } catch (err: unknown) {
              Alert.alert("Error", err instanceof Error ? err.message : "Failed to delete user.");
            }
          },
        },
      ]
    );
  }

  function showMobileActions(user: AdminUser) {
    Alert.alert(user.full_name, undefined, [
      { text: "Edit", onPress: () => openEdit(user) },
      { text: "Delete", style: "destructive" as const, onPress: () => confirmDelete(user) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={D.onPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Manage Users</Text>
          <Text style={styles.headerSubtitle}>
            {users.length} user{users.length !== 1 ? "s" : ""}
          </Text>
        </View>
        {Platform.OS === "web" ? (
          <Pressable style={styles.addBtnHeader} onPress={openCreate}>
            <MaterialCommunityIcons name="plus" size={16} color={D.onPrimary} />
            <Text style={styles.addBtnHeaderText}>Add User</Text>
          </Pressable>
        ) : (
          <View style={styles.headerBtn} />
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={D.primary} size="large" />
          <Text style={styles.loadingText}>Loading users…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <MaterialCommunityIcons name="alert-circle-outline" size={40} color={D.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={loadUsers}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : Platform.OS === "web" ? (
        <WebUserList
          users={filtered}
          search={search}
          onSearchChange={setSearch}
          onEdit={openEdit}
          onDelete={confirmDelete}
        />
      ) : (
        <MobileUserList
          users={filtered}
          search={search}
          onSearchChange={setSearch}
          onActions={showMobileActions}
          onRefresh={loadUsers}
        />
      )}

      {Platform.OS !== "web" && (
        <Pressable style={styles.fab} onPress={openCreate}>
          <MaterialCommunityIcons name="plus" size={26} color={D.onPrimary} />
        </Pressable>
      )}

      <UserFormModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={handleSave}
        existingUser={editingUser}
      />
    </SafeAreaView>
  );
}

function WebUserList({
  users,
  search,
  onSearchChange,
  onEdit,
  onDelete,
}: {
  users: AdminUser[];
  search: string;
  onSearchChange: (v: string) => void;
  onEdit: (u: AdminUser) => void;
  onDelete: (u: AdminUser) => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.webContainer}>
      <View style={styles.webToolbar}>
        <View style={styles.searchWrap}>
          <MaterialCommunityIcons
            name="magnify"
            size={18}
            color={D.muted}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={onSearchChange}
            placeholder="Search by name or email…"
            placeholderTextColor={D.muted}
            autoCorrect={false}
          />
        </View>
      </View>

      <View style={styles.tableCard}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Name</Text>
          <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Email</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Role</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Status</Text>
          <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Last Login</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: "right" }]}>
            Actions
          </Text>
        </View>

        {users.length === 0 ? (
          <View style={styles.emptyRow}>
            <Text style={styles.emptyText}>No users found.</Text>
          </View>
        ) : (
          users.map((user, idx) => (
            <WebTableRow
              key={user.user_id}
              user={user}
              isLast={idx === users.length - 1}
              onEdit={() => onEdit(user)}
              onDelete={() => onDelete(user)}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

function WebTableRow({
  user,
  isLast,
  onEdit,
  onDelete,
}: {
  user: AdminUser;
  isLast: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.tableRow,
        !isLast && styles.tableRowBorder,
        pressed && styles.tableRowPressed,
      ]}
    >
      <View style={{ flex: 2, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={styles.avatarSmall}>
          <Text style={styles.avatarSmallText}>
            {user.full_name
              .split(" ")
              .map((w) => w[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </Text>
        </View>
        <Text style={styles.tableCell} numberOfLines={1}>
          {user.full_name}
        </Text>
      </View>
      <Text style={[styles.tableCell, { flex: 3 }]} numberOfLines={1}>
        {user.email}
      </Text>
      <View style={{ flex: 1 }}>
        <RoleBadge role={user.role} />
      </View>
      <View style={{ flex: 1 }}>
        <StatusBadge active={user.is_active} />
      </View>
      <Text style={[styles.tableCell, styles.tableCellMuted, { flex: 2 }]}>
        {user.last_login ? formatDateTime(user.last_login) : "Never"}
      </Text>
      <View style={{ flex: 1, flexDirection: "row", justifyContent: "flex-end", gap: 6 }}>
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
          onPress={onEdit}
        >
          <MaterialCommunityIcons name="pencil-outline" size={17} color={D.primary} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.iconBtn,
            styles.iconBtnDanger,
            pressed && styles.iconBtnPressed,
          ]}
          onPress={onDelete}
        >
          <MaterialCommunityIcons name="trash-can-outline" size={17} color={D.danger} />
        </Pressable>
      </View>
    </Pressable>
  );
}

function MobileUserList({
  users,
  search,
  onSearchChange,
  onActions,
  onRefresh,
}: {
  users: AdminUser[];
  search: string;
  onSearchChange: (v: string) => void;
  onActions: (u: AdminUser) => void;
  onRefresh: () => void;
}) {
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  }

  return (
    <>
      <View style={styles.mobileSearchBar}>
        <MaterialCommunityIcons name="magnify" size={18} color={D.muted} />
        <TextInput
          style={styles.mobileSearchInput}
          value={search}
          onChangeText={onSearchChange}
          placeholder="Search by name or email…"
          placeholderTextColor={D.muted}
          autoCorrect={false}
        />
      </View>
      <FlatList
        data={users}
        keyExtractor={(u) => u.user_id}
        contentContainerStyle={styles.mobileList}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No users found.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.mobileCard}>
            <View style={styles.mobileCardLeft}>
              <View style={styles.avatarMedium}>
                <Text style={styles.avatarMediumText}>
                  {item.full_name
                    .split(" ")
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </Text>
              </View>
            </View>
            <View style={styles.mobileCardBody}>
              <View style={styles.mobileCardTopRow}>
                <Text style={styles.mobileCardName}>{item.full_name}</Text>
                <RoleBadge role={item.role} />
              </View>
              <Text style={styles.mobileCardEmail} numberOfLines={1}>
                {item.email}
              </Text>
              <View style={styles.mobileCardBottomRow}>
                <StatusBadge active={item.is_active} />
                <Text style={styles.mobileCardLastLogin}>
                  {item.last_login ? `Last: ${formatDate(item.last_login)}` : "Never logged in"}
                </Text>
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.moreBtn,
                pressed && styles.moreBtnPressed,
              ]}
              onPress={() => onActions(item)}
            >
              <MaterialCommunityIcons
                name="dots-vertical"
                size={20}
                color={D.muted}
              />
            </Pressable>
          </View>
        )}
      />
    </>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <View style={[styles.badge, role === "PCP" ? styles.badgePCP : styles.badgePatient]}>
      <Text style={[styles.badgeText, role === "PCP" ? styles.badgeTextPCP : styles.badgeTextPatient]}>
        {role}
      </Text>
    </View>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <View style={[styles.badge, active ? styles.badgeActive : styles.badgeInactive]}>
      <View style={[styles.statusDot, { backgroundColor: active ? D.success : D.muted }]} />
      <Text style={[styles.badgeText, active ? styles.badgeTextActive : styles.badgeTextInactive]}>
        {active ? "Active" : "Inactive"}
      </Text>
    </View>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
  addBtnHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: D.onPrimaryOverlay,
  },
  addBtnHeaderText: { color: D.onPrimary, fontWeight: "600", fontSize: 13 },

  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 20 },
  loadingText: { color: D.muted, fontSize: 14 },
  errorText: { color: D.danger, fontSize: 14, textAlign: "center" },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: D.primary,
  },
  retryBtnText: { color: D.onPrimary, fontWeight: "600" },

  // Web layout
  webContainer: { padding: 20, gap: 16 },
  webToolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: D.surface,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: D.border,
    paddingHorizontal: 12,
    height: 40,
  },
  searchIcon: { marginRight: 6 },
  searchInput: { flex: 1, color: D.text, fontSize: 14 },

  tableCard: {
    backgroundColor: D.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: D.border,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: D.bg,
    borderBottomWidth: 1.5,
    borderBottomColor: D.border,
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: "700",
    color: D.muted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tableRowBorder: { borderBottomWidth: 1, borderBottomColor: D.border },
  tableRowPressed: { backgroundColor: D.bg },
  tableCell: { fontSize: 14, color: D.text },
  tableCellMuted: { color: D.muted, fontSize: 13 },
  emptyRow: { padding: 32, alignItems: "center" },
  emptyText: { color: D.muted, fontSize: 14 },

  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 7,
    backgroundColor: D.infoSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnDanger: { backgroundColor: D.dangerBg },
  iconBtnPressed: { opacity: 0.7 },

  avatarSmall: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: D.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarSmallText: { color: D.onPrimary, fontWeight: "700", fontSize: 11 },

  // Mobile layout
  mobileSearchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 16,
    marginBottom: 0,
    backgroundColor: D.surface,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: D.border,
    paddingHorizontal: 12,
    height: 44,
  },
  mobileSearchInput: { flex: 1, color: D.text, fontSize: 15 },
  mobileList: { padding: 16, gap: 10, paddingBottom: 80 },

  mobileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: D.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: D.border,
    padding: 14,
    gap: 12,
  },
  mobileCardLeft: {},
  mobileCardBody: { flex: 1, gap: 4 },
  mobileCardTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  mobileCardName: { fontSize: 15, fontWeight: "600", color: D.text, flex: 1 },
  mobileCardEmail: { fontSize: 13, color: D.muted },
  mobileCardBottomRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  mobileCardLastLogin: { fontSize: 11, color: D.muted },

  moreBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  moreBtnPressed: { backgroundColor: D.bg },

  avatarMedium: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: D.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarMediumText: { color: D.onPrimary, fontWeight: "700", fontSize: 15 },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  badgePCP: { backgroundColor: D.infoSurface },
  badgePatient: { backgroundColor: D.warningBg },
  badgeActive: { backgroundColor: D.successBg },
  badgeInactive: { backgroundColor: D.bg, borderWidth: 1, borderColor: D.border },
  badgeText: { fontSize: 11, fontWeight: "600" },
  badgeTextPCP: { color: D.primary },
  badgeTextPatient: { color: "#B45309" },
  badgeTextActive: { color: "#065F46" },
  badgeTextInactive: { color: D.muted },
  statusDot: { width: 6, height: 6, borderRadius: 3 },

  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: D.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
});
