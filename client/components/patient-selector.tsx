import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  TextInput,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { PatientResponse } from "@/types/api";
import { getPatients } from "@/services/patient-service";
import { DermAtlasColors as D } from "@/constants/theme";

type Props = {
  selectedPatient: PatientResponse | null;
  onSelect: (patient: PatientResponse) => void;
};

export function PatientSelector({ selectedPatient, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [patients, setPatients] = useState<PatientResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    getPatients()
      .then(setPatients)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load patients")
      )
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = query.trim()
    ? patients.filter((p) =>
        p.mrn_internal.toLowerCase().includes(query.trim().toLowerCase())
      )
    : patients;

  function handleSelect(patient: PatientResponse) {
    onSelect(patient);
    setOpen(false);
    setQuery("");
  }

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
        onPress={() => setOpen(true)}
      >
        <MaterialCommunityIcons
          name="card-account-details-outline"
          size={18}
          color={D.muted}
        />
        <Text style={[styles.triggerText, !selectedPatient && styles.placeholder]}>
          {selectedPatient
            ? `${selectedPatient.mrn_internal} · ID ${selectedPatient.patient_id}`
            : "Select Patient"}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={18} color={D.muted} />
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Patient</Text>
            <Pressable onPress={() => setOpen(false)} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={22} color={D.text} />
            </Pressable>
          </View>

          <View style={styles.searchWrap}>
            <MaterialCommunityIcons name="magnify" size={18} color={D.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by MRN"
              placeholderTextColor={D.muted}
              style={styles.searchInput}
              autoFocus
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery("")}>
                <MaterialCommunityIcons
                  name="close-circle"
                  size={16}
                  color={D.muted}
                />
              </Pressable>
            )}
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={D.primary} />
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => String(item.patient_id)}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [
                    styles.row,
                    pressed && styles.rowPressed,
                    selectedPatient?.patient_id === item.patient_id &&
                      styles.rowSelected,
                  ]}
                  onPress={() => handleSelect(item)}
                >
                  <View style={styles.rowMain}>
                    <Text style={styles.rowMrn}>{item.mrn_internal}</Text>
                    <Text style={styles.rowSub}>
                      ID {item.patient_id} · DOB {item.date_of_birth} ·{" "}
                      {item.gender}
                    </Text>
                  </View>
                  {selectedPatient?.patient_id === item.patient_id && (
                    <MaterialCommunityIcons
                      name="check"
                      size={18}
                      color={D.primary}
                    />
                  )}
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={styles.center}>
                  <Text style={styles.emptyText}>No patients found</Text>
                </View>
              }
            />
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: D.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1.5,
    borderColor: D.border,
  },
  triggerPressed: { opacity: 0.8 },
  triggerText: { flex: 1, fontSize: 15, color: D.text },
  placeholder: { color: D.muted },

  modal: { flex: 1, backgroundColor: D.bg },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: D.surface,
    borderBottomWidth: 1,
    borderBottomColor: D.border,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: D.text },
  closeBtn: { padding: 4 },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    margin: 16,
    backgroundColor: D.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: D.border,
  },
  searchInput: { flex: 1, fontSize: 15, color: D.text },

  list: { paddingHorizontal: 16, paddingBottom: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: D.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: D.border,
  },
  rowPressed: { opacity: 0.8 },
  rowSelected: { borderColor: D.primary, borderWidth: 1.5 },
  rowMain: { flex: 1, gap: 3 },
  rowMrn: { fontSize: 15, fontWeight: "700", color: D.text },
  rowSub: { fontSize: 12, color: D.muted, fontWeight: "500" },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  errorText: { color: D.danger, fontSize: 14, textAlign: "center" },
  emptyText: { color: D.muted, fontSize: 14 },
});
