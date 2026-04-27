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
  Platform,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { DermAtlasColors as D } from "@/constants/theme";
import type { AdminUser, CreateUserPayload, UpdateUserPayload } from "@/types/admin";
import {
  getUsers,
  createUser,
  updateUser,
  deactivateUser,
} from "@/services/user-service";
import { useRequireRole } from "@/hooks/use-require-role";
import { UserFormModal } from "@/components/user-form-modal";
import { ConfirmDestructiveModal } from "@/components/confirm-destructive-modal";

const DESKTOP_BREAKPOINT = 820;

export default function ManageUsers() {
  const authorized = useRequireRole({ role: "PCP", adminOnly: true });
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= DESKTOP_BREAKPOINT;
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [pendingDeactivate, setPendingDeactivate] = useState<AdminUser | null>(null);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

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
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
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

  function confirmDeactivate(user: AdminUser) {
    setDeactivateError(null);
    setPendingDeactivate(user);
  }

  async function handleDeactivateConfirmed() {
    if (!pendingDeactivate) return;
    const user = pendingDeactivate;
    try {
      await deactivateUser(user.user_id);
      setUsers((prev) =>
        prev.map((u) =>
          u.user_id === user.user_id ? { ...u, is_active: false } : u
        )
      );
      setPendingDeactivate(null);
    } catch (err: unknown) {
      setDeactivateError(
        err instanceof Error ? err.message : "Failed to deactivate user."
      );
      setPendingDeactivate(null);
    }
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
        {isDesktop ? (
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
      ) : isDesktop ? (
        <WebUserList
          users={filtered}
          search={search}
          onSearchChange={setSearch}
          onEdit={openEdit}
          onDeactivate={confirmDeactivate}
        />
      ) : (
        <MobileUserList
          users={filtered}
          search={search}
          onSearchChange={setSearch}
          onEdit={openEdit}
          onDeactivate={confirmDeactivate}
          onRefresh={loadUsers}
        />
      )}

      {!isDesktop && (
        <Pressable style={styles.fab} onPress={openCreate}>
          <MaterialCommunityIcons name="plus" size={26} color={D.onPrimary} />
        </Pressable>
      )}

      {deactivateError && (
        <View style={styles.errorToast}>
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color={D.danger} />
          <Text style={styles.errorToastText}>{deactivateError}</Text>
          <Pressable onPress={() => setDeactivateError(null)}>
            <MaterialCommunityIcons name="close" size={16} color={D.danger} />
          </Pressable>
        </View>
      )}

      <UserFormModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={handleSave}
        existingUser={editingUser}
      />

      <ConfirmDestructiveModal
        visible={pendingDeactivate !== null}
        title="Deactivate User"
        message={
          pendingDeactivate
            ? `You're about to deactivate ${pendingDeactivate.full_name} (${pendingDeactivate.email}). They will lose access immediately.`
            : ""
        }
        finalWarning="This action revokes all active sessions and cannot be undone from this screen. You will need to reactivate the account manually."
        confirmLabel="Deactivate"
        onConfirm={handleDeactivateConfirmed}
        onClose={() => setPendingDeactivate(null)}
      />
    </SafeAreaView>
  );
}

function WebUserList({
  users,
  search,
  onSearchChange,
  onEdit,
  onDeactivate,
}: {
  users: AdminUser[];
  search: string;
  onSearchChange: (v: string) => void;
  onEdit: (u: AdminUser) => void;
  onDeactivate: (u: AdminUser) => void;
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
              onDeactivate={() => onDeactivate(user)}
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
  onDeactivate,
}: {
  user: AdminUser;
  isLast: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
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
        {user.is_active && (
          <Pressable
            style={({ pressed }) => [
              styles.iconBtn,
              styles.iconBtnDanger,
              pressed && styles.iconBtnPressed,
            ]}
            onPress={onDeactivate}
          >
            <MaterialCommunityIcons name="account-off-outline" size={17} color={D.danger} />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

function MobileUserList({
  users,
  search,
  onSearchChange,
  onEdit,
  onDeactivate,
  onRefresh,
}: {
  users: AdminUser[];
  search: string;
  onSearchChange: (v: string) => void;
  onEdit: (u: AdminUser) => void;
  onDeactivate: (u: AdminUser) => void;
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
            <View style={styles.mobileCardHeader}>
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
              <View style={styles.mobileCardBody}>
                <Text style={styles.mobileCardName} numberOfLines={1}>
                  {item.full_name}
                </Text>
                <Text style={styles.mobileCardEmail} numberOfLines={1}>
                  {item.email}
                </Text>
              </View>
            </View>

            <View style={styles.mobileCardBadgeRow}>
              <RoleBadge role={item.role} />
              <StatusBadge active={item.is_active} />
            </View>

            <Text style={styles.mobileCardLastLogin}>
              {item.last_login
                ? `Last login: ${formatDate(item.last_login)}`
                : "Never logged in"}
            </Text>

            <View style={styles.mobileCardActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.mobileActionBtn,
                  pressed && styles.iconBtnPressed,
                ]}
                onPress={() => onEdit(item)}
              >
                <MaterialCommunityIcons
                  name="pencil-outline"
                  size={15}
                  color={D.primary}
                />
                <Text style={styles.mobileActionBtnText}>Edit</Text>
              </Pressable>
              {item.is_active && (
                <Pressable
                  style={({ pressed }) => [
                    styles.mobileActionBtn,
                    styles.mobileActionBtnDanger,
                    pressed && styles.iconBtnPressed,
                  ]}
                  onPress={() => onDeactivate(item)}
                >
                  <MaterialCommunityIcons
                    name="account-off-outline"
                    size={15}
                    color={D.danger}
                  />
                  <Text style={styles.mobileActionBtnDangerText}>Deactivate</Text>
                </Pressable>
              )}
            </View>
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
    backgroundColor: D.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: D.border,
    padding: 14,
    gap: 10,
  },
  mobileCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  mobileCardBody: { flex: 1, gap: 2, minWidth: 0 },
  mobileCardName: { fontSize: 15, fontWeight: "600", color: D.text },
  mobileCardEmail: { fontSize: 13, color: D.muted },
  mobileCardBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  mobileCardLastLogin: { fontSize: 12, color: D.muted },
  mobileCardActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
    flexWrap: "wrap",
  },
  mobileActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: D.infoSurface,
  },
  mobileActionBtnDanger: {
    backgroundColor: D.dangerBg,
  },
  mobileActionBtnText: {
    color: D.primary,
    fontWeight: "600",
    fontSize: 12,
  },
  mobileActionBtnDangerText: {
    color: D.danger,
    fontWeight: "600",
    fontSize: 12,
  },

  errorToast: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: D.dangerBg,
    borderColor: D.danger,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorToastText: { flex: 1, color: D.danger, fontSize: 13, fontWeight: "600" },

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
