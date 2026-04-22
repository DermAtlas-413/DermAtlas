import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Modal,
  Platform,
  useWindowDimensions,
} from "react-native";

const DESKTOP_BREAKPOINT = 820;
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { DermAtlasColors as D } from "@/constants/theme";
import { useRequireRole } from "@/hooks/use-require-role";
import {
  getAdminPatients,
  getUsers,
  reassignPatientPhysician,
} from "@/services/user-service";
import type { AdminPatient, AdminUser } from "@/types/admin";

export default function ManagePatients() {
  const authorized = useRequireRole({ role: "PCP", adminOnly: true });
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= DESKTOP_BREAKPOINT;
  const [patients, setPatients] = useState<AdminPatient[]>([]);
  const [pcps, setPcps] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminPatient | null>(null);

  useEffect(() => {
    if (!authorized) return;
    load();
  }, [authorized]);

  if (!authorized) return null;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [ps, users] = await Promise.all([getAdminPatients(), getUsers()]);
      setPatients(ps);
      setPcps(users.filter((u) => u.role === "PCP"));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load patients.");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(
    () =>
      patients.filter((p) => {
        const q = search.toLowerCase();
        return (
          p.full_name.toLowerCase().includes(q) ||
          p.mrn_internal.toLowerCase().includes(q) ||
          p.primary_physician_name.toLowerCase().includes(q)
        );
      }),
    [patients, search],
  );

  async function handleReassign(physicianId: number) {
    if (!editing) return;
    try {
      const updated = await reassignPatientPhysician(
        editing.patient_id,
        physicianId,
      );
      setPatients((prev) =>
        prev.map((p) => (p.patient_id === updated.patient_id ? updated : p)),
      );
      setEditing(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Reassignment failed.");
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons
            name="arrow-left"
            size={22}
            color={D.onPrimary}
          />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Manage Patients</Text>
          <Text style={styles.headerSubtitle}>
            {patients.length} patient{patients.length !== 1 ? "s" : ""}
          </Text>
        </View>
        <View style={styles.headerBtn} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={D.primary} size="large" />
          <Text style={styles.loadingText}>Loading patients…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={40}
            color={D.danger}
          />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.page}>
            <View style={styles.searchWrap}>
              <MaterialCommunityIcons
                name="magnify"
                size={18}
                color={D.muted}
              />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search patient, MRN, or physician…"
                placeholderTextColor={D.muted}
                autoCorrect={false}
              />
            </View>

            <View style={styles.tableCard}>
              {isDesktop && (
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderCell, { flex: 2 }]}>
                    Patient
                  </Text>
                  <Text style={[styles.tableHeaderCell, { flex: 1 }]}>MRN</Text>
                  <Text style={[styles.tableHeaderCell, { flex: 2 }]}>
                    Current PCP
                  </Text>
                  <Text
                    style={[
                      styles.tableHeaderCell,
                      { flex: 1, textAlign: "right" },
                    ]}
                  >
                    Actions
                  </Text>
                </View>
              )}

              {filtered.length === 0 ? (
                <View style={styles.emptyRow}>
                  <Text style={styles.emptyText}>No patients found.</Text>
                </View>
              ) : (
                filtered.map((p, idx) => (
                  <PatientRow
                    key={p.patient_id}
                    patient={p}
                    isLast={idx === filtered.length - 1}
                    isDesktop={isDesktop}
                    onReassign={() => setEditing(p)}
                  />
                ))
              )}
            </View>
          </View>
        </ScrollView>
      )}

      <ReassignModal
        visible={editing !== null}
        patient={editing}
        pcps={pcps}
        onClose={() => setEditing(null)}
        onSelect={handleReassign}
      />
    </SafeAreaView>
  );
}

function PatientRow({
  patient,
  isLast,
  isDesktop,
  onReassign,
}: {
  patient: AdminPatient;
  isLast: boolean;
  isDesktop: boolean;
  onReassign: () => void;
}) {
  return (
    <View
      style={[
        isDesktop ? styles.tableRow : styles.mobileRow,
        !isLast && styles.rowBorder,
      ]}
    >
      {isDesktop ? (
        <>
          <View style={{ flex: 2, gap: 2 }}>
            <Text style={styles.patientName}>{patient.full_name}</Text>
            {patient.patient_email && (
              <Text style={styles.patientEmail}>{patient.patient_email}</Text>
            )}
          </View>
          <Text style={[styles.tableCell, { flex: 1 }]}>
            {patient.mrn_internal}
          </Text>
          <View style={{ flex: 2, gap: 2 }}>
            <Text style={styles.tableCell}>{patient.primary_physician_name}</Text>
            <Text style={styles.pcpEmail}>
              {patient.primary_physician_email}
            </Text>
          </View>
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              justifyContent: "flex-end",
            }}
          >
            <Pressable
              style={({ pressed }) => [
                styles.reassignBtn,
                pressed && styles.reassignBtnPressed,
              ]}
              onPress={onReassign}
            >
              <MaterialCommunityIcons
                name="account-switch-outline"
                size={16}
                color={D.primary}
              />
              <Text style={styles.reassignBtnText}>Reassign</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <View style={styles.mobileBody}>
          <Text style={styles.patientName} numberOfLines={1}>
            {patient.full_name}
          </Text>
          <Text style={styles.patientEmail} numberOfLines={2}>
            MRN {patient.mrn_internal}
            {patient.patient_email ? ` · ${patient.patient_email}` : ""}
          </Text>
          <View style={styles.pcpRow}>
            <MaterialCommunityIcons
              name="stethoscope"
              size={12}
              color={D.muted}
            />
            <Text style={styles.pcpMobile} numberOfLines={1}>
              {patient.primary_physician_name}
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.reassignBtnMobile,
              pressed && styles.reassignBtnPressed,
            ]}
            onPress={onReassign}
          >
            <MaterialCommunityIcons
              name="account-switch-outline"
              size={16}
              color={D.primary}
            />
            <Text style={styles.reassignBtnText}>Reassign PCP</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function ReassignModal({
  visible,
  patient,
  pcps,
  onClose,
  onSelect,
}: {
  visible: boolean;
  patient: AdminPatient | null;
  pcps: AdminUser[];
  onClose: () => void;
  onSelect: (physicianId: number) => void;
}) {
  if (!patient) return null;
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Reassign Physician</Text>
            <Pressable onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color={D.muted} />
            </Pressable>
          </View>
          <Text style={styles.modalSubtitle}>
            Select a new primary physician for{" "}
            <Text style={{ fontWeight: "700" }}>{patient.full_name}</Text>.
          </Text>

          <ScrollView style={styles.pcpList}>
            {pcps.length === 0 && (
              <Text style={styles.emptyText}>
                No PCPs in your network yet.
              </Text>
            )}
            {pcps.map((pcp) => {
              const isCurrent =
                Number(pcp.user_id) === patient.primary_physician_id;
              return (
                <Pressable
                  key={pcp.user_id}
                  disabled={isCurrent}
                  style={({ pressed }) => [
                    styles.pcpOption,
                    isCurrent && styles.pcpOptionCurrent,
                    pressed && !isCurrent && styles.pcpOptionPressed,
                  ]}
                  onPress={() => onSelect(Number(pcp.user_id))}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pcpOptionName}>{pcp.full_name}</Text>
                    <Text style={styles.pcpOptionEmail}>{pcp.email}</Text>
                  </View>
                  {isCurrent ? (
                    <Text style={styles.pcpCurrentTag}>CURRENT</Text>
                  ) : (
                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={18}
                      color={D.muted}
                    />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
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

  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 20,
  },
  loadingText: { color: D.muted, fontSize: 14 },
  errorText: { color: D.danger, fontSize: 14, textAlign: "center" },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: D.primary,
  },
  retryBtnText: { color: D.onPrimary, fontWeight: "600" },

  scroll: { flexGrow: 1 },
  page: { padding: 20, gap: 16, maxWidth: 1000, alignSelf: "center", width: "100%" },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: D.surface,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: D.border,
    paddingHorizontal: 12,
    height: 40,
  },
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
    gap: 12,
  },
  mobileRow: {
    padding: 14,
  },
  mobileBody: { gap: 4, minWidth: 0 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: D.border },
  tableCell: { fontSize: 14, color: D.text },

  patientName: { color: D.text, fontWeight: "600", fontSize: 14 },
  patientEmail: { color: D.muted, fontSize: 12 },
  pcpEmail: { color: D.muted, fontSize: 11 },
  pcpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  pcpMobile: { color: D.text, fontSize: 13, fontWeight: "500", flex: 1 },

  reassignBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: D.infoSurface,
  },
  reassignBtnMobile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: D.infoSurface,
    alignSelf: "flex-start",
    marginTop: 8,
  },
  reassignBtnPressed: { opacity: 0.7 },
  reassignBtnText: { color: D.primary, fontWeight: "600", fontSize: 12 },

  emptyRow: { padding: 32, alignItems: "center" },
  emptyText: { color: D.muted, fontSize: 14 },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "80%",
    backgroundColor: D.surface,
    borderRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: { color: D.text, fontSize: 17, fontWeight: "700" },
  modalSubtitle: { color: D.muted, fontSize: 13, marginTop: 6, marginBottom: 14 },
  pcpList: { flexGrow: 0 },
  pcpOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderWidth: 1.5,
    borderColor: D.border,
    borderRadius: 10,
    marginBottom: 8,
  },
  pcpOptionPressed: { backgroundColor: D.bg },
  pcpOptionCurrent: { backgroundColor: D.bg, opacity: 0.6 },
  pcpOptionName: { color: D.text, fontSize: 14, fontWeight: "600" },
  pcpOptionEmail: { color: D.muted, fontSize: 12 },
  pcpCurrentTag: {
    color: D.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
});
