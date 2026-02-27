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

type Match = {
  id: string;
  similarity: number;
  diagnosis: string;
};

const MOCK_MATCHES: Match[] = [
  { id: "1", similarity: 87, diagnosis: "Seborrheic keratosis" },
  { id: "2", similarity: 82, diagnosis: "Benign nevus" },
  { id: "3", similarity: 78, diagnosis: "Actinic keratosis" },
  { id: "4", similarity: 74, diagnosis: "Basal cell carcinoma" },
];

export default function Compare() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.card}>
          {/* Top Bar */}
          <View style={styles.topBar}>
            <Pressable onPress={() => router.back()} style={styles.topBarBtn}>
              <Text style={styles.backArrow}>‹</Text>
            </Pressable>

            <Text style={styles.doctor}>Dr. Quach (PCP)</Text>

            <Pressable onPress={() => router.replace("/")} style={styles.logoutBtn}>
              <Text style={styles.logout}>Logout</Text>
            </Pressable>
          </View>

          {/* Patient ID pill */}
          <View style={styles.patientPill}>
            <Text style={styles.patientPillText}>Patient ID # ______</Text>
          </View>

          {/* Uploaded image panel */}
          <View style={styles.uploadPanel}>
            <Text style={styles.imageIcon}>🖼️</Text>
            <Text style={styles.uploadedLabel}>[Uploaded Image]</Text>
          </View>

          {/* Zoom / Pan buttons */}
          <View style={styles.actionsRow}>
            <Pressable style={styles.actionBtn} onPress={() => {}}>
              <Text style={styles.actionBtnText}>🔍  Zoom</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={() => {}}>
              <Text style={styles.actionBtnText}>✥  Pan</Text>
            </Pressable>
          </View>

          {/* Similar cases header */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>Similar Cases:</Text>
          </View>

          {/* Grid */}
          <View style={styles.grid}>
            {MOCK_MATCHES.map((m) => (
              <Pressable
                key={m.id}
                style={styles.matchCard}
                onPress={() => router.push(`/feedback?matchId=${m.id}`)}
              >
                <View style={styles.matchImage}>
                  <Text style={styles.matchIcon}>🖼️</Text>
                  <Text style={styles.matchLabel}>[Match {m.id}]</Text>
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.simPill}>
                    <Text style={styles.simPillText}>— {m.similarity}% Similarity</Text>
                  </View>

                  <View style={styles.voteRow}>
                    <Pressable hitSlop={8} onPress={() => {}}>
                      <Text style={styles.voteIcon}>👍</Text>
                    </Pressable>
                    <Pressable hitSlop={8} onPress={() => {}}>
                      <Text style={styles.voteIcon}>👎</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.diagRow}>
                  <Text style={styles.diagText}>Diagnosis: {m.diagnosis}</Text>
                </View>
              </Pressable>
            ))}
          </View>
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
    marginBottom: 14,
  },
  topBarBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  backArrow: { color: "#FFF", fontSize: 28, fontWeight: "900" },
  doctor: { color: "#FFF", fontSize: 14, fontWeight: "800" },
  logoutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  logout: { color: "#FFF", fontWeight: "800" },

  patientPill: {
    alignSelf: "flex-start",
    backgroundColor: c.primary,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 10,
  },
  patientPillText: { color: "#FFF", fontWeight: "800", fontSize: 12 },

  uploadPanel: {
    backgroundColor: c.soft,
    borderRadius: 20,
    height: 190,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  imageIcon: { fontSize: 44, opacity: 0.55, marginBottom: 8 },
  uploadedLabel: { color: c.primary, fontWeight: "900" },

  actionsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: "#77BFE0",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  actionBtnText: { color: "#FFF", fontWeight: "900" },

  sectionHeader: {
    alignSelf: "flex-start",
    backgroundColor: c.primary,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },
  sectionHeaderText: { color: "#FFF", fontWeight: "900" },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },

  matchCard: {
    width: "48%",
    backgroundColor: c.soft,
    borderRadius: 18,
    padding: 10,
  },
  matchImage: {
    height: 110,
    backgroundColor: c.light,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  matchIcon: { fontSize: 28, opacity: 0.6 },
  matchLabel: { marginTop: 6, color: c.primary, fontWeight: "900", fontSize: 12 },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  simPill: {
    flex: 1,
    backgroundColor: "#77BFE0",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginRight: 6,
  },
  simPillText: { color: "#FFF", fontWeight: "900", fontSize: 10 },

  voteRow: { flexDirection: "row", gap: 6 },
  voteIcon: { fontSize: 14 },

  diagRow: {
    backgroundColor: "#77BFE0",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  diagText: { color: "#FFF", fontWeight: "900", fontSize: 10 },
});