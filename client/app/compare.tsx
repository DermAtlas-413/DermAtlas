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
import { getUser } from "../lib/api";

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

function SimilarityBar({ value }: { value: number }) {
  const color =
    value >= 85 ? "#10B981" : value >= 75 ? "#F59E0B" : "#E63946";
  return (
    <View style={bar.wrap}>
      <View
        style={[bar.fill, { width: `${value}%` as any, backgroundColor: color }]}
      />
    </View>
  );
}

function SimilarityBadge({ value }: { value: number }) {
  const color =
    value >= 85 ? "#10B981" : value >= 75 ? "#F59E0B" : "#E63946";
  const bg =
    value >= 85 ? "#D1FAE5" : value >= 75 ? "#FEF3C7" : "#FEE2E2";
  return (
    <View style={[bar.badge, { backgroundColor: bg }]}>
      <Text style={[bar.badgeText, { color }]}>{value}%</Text>
    </View>
  );
}

const bar = StyleSheet.create({
  wrap: {
    height: 4,
    backgroundColor: "#E2EBF0",
    borderRadius: 4,
    marginVertical: 6,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 4 },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 11, fontWeight: "700" },
});

export default function Compare() {
  const router = useRouter();
  const user = getUser();

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Analysis Results</Text>
          <Text style={styles.headerSubtitle}>
            {user?.fullName ?? "—"} · {user?.role ?? "—"}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.headerBtn}
            onPress={() => router.push("/profile")}
          >
            <MaterialCommunityIcons
              name="account-circle-outline"
              size={22}
              color="#fff"
            />
          </Pressable>
          <Pressable
            style={styles.headerBtnAlt}
            onPress={() => router.replace("/")}
          >
            <Text style={styles.headerBtnAltText}>Logout</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.page}>
          {/* Patient strip */}
          <View style={styles.patientStrip}>
            <MaterialCommunityIcons
              name="card-account-details-outline"
              size={14}
              color={D.primary}
            />
            <Text style={styles.patientText}>Patient ID # ______</Text>
          </View>

          {/* Submitted image */}
          <View style={styles.imageSection}>
            <Text style={styles.sectionLabel}>Submitted Image</Text>
            <View style={styles.imageCard}>
              <View style={styles.imagePlaceholder}>
                <MaterialCommunityIcons
                  name="image-outline"
                  size={44}
                  color={D.border}
                />
                <Text style={styles.imagePlaceholderText}>Uploaded Image</Text>
              </View>
              <View style={styles.imageControls}>
                <Pressable style={styles.controlBtn}>
                  <MaterialCommunityIcons
                    name="magnify-plus-outline"
                    size={17}
                    color={D.primary}
                  />
                  <Text style={styles.controlBtnText}>Zoom</Text>
                </Pressable>
                <Pressable style={styles.controlBtn}>
                  <MaterialCommunityIcons
                    name="arrow-all"
                    size={17}
                    color={D.primary}
                  />
                  <Text style={styles.controlBtnText}>Pan</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Similar cases */}
          <View>
            <Text style={styles.sectionLabel}>
              Similar Cases &nbsp;
              <Text style={styles.sectionCount}>
                {MOCK_MATCHES.length} matches
              </Text>
            </Text>
            <View style={styles.grid}>
              {MOCK_MATCHES.map((m) => (
                <Pressable
                  key={m.id}
                  style={({ pressed }) => [
                    styles.matchCard,
                    pressed && styles.matchCardPressed,
                  ]}
                  onPress={() =>
                    router.push(`/feedback?matchId=${m.id}`)
                  }
                >
                  <View style={styles.matchImage}>
                    <MaterialCommunityIcons
                      name="image-outline"
                      size={28}
                      color={D.border}
                    />
                    <Text style={styles.matchCaseId}>Case #{m.id}</Text>
                  </View>

                  <View style={styles.matchBody}>
                    <View style={styles.matchTopRow}>
                      <SimilarityBadge value={m.similarity} />
                      <View style={styles.voteRow}>
                        <Pressable hitSlop={8} onPress={() => {}}>
                          <MaterialCommunityIcons
                            name="thumb-up-outline"
                            size={15}
                            color={D.muted}
                          />
                        </Pressable>
                        <Pressable hitSlop={8} onPress={() => {}}>
                          <MaterialCommunityIcons
                            name="thumb-down-outline"
                            size={15}
                            color={D.muted}
                          />
                        </Pressable>
                      </View>
                    </View>

                    <SimilarityBar value={m.similarity} />

                    <Text style={styles.matchDiag} numberOfLines={2}>
                      {m.diagnosis}
                    </Text>

                    <View style={styles.viewMoreRow}>
                      <Text style={styles.viewMoreText}>View details</Text>
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={13}
                        color={D.primary}
                      />
                    </View>
                  </View>
                </Pressable>
              ))}
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
    gap: 8,
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
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
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
    maxWidth: 700,
    alignSelf: "center",
    width: "100%",
  },

  patientStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: D.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: D.border,
  },
  patientText: { color: D.text, fontSize: 13, fontWeight: "600" },

  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: D.text,
    letterSpacing: 0.3,
    marginBottom: 10,
  },
  sectionCount: { color: D.muted, fontWeight: "500" },

  imageSection: {},
  imageCard: {
    backgroundColor: D.surface,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: D.border,
  },
  imagePlaceholder: {
    height: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  imagePlaceholderText: { color: D.muted, fontWeight: "600", fontSize: 13 },
  imageControls: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: D.border,
    padding: 10,
    gap: 10,
  },
  controlBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: D.bg,
    borderWidth: 1,
    borderColor: D.border,
  },
  controlBtnText: { color: D.primary, fontWeight: "600", fontSize: 13 },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  matchCard: {
    width: "48%",
    backgroundColor: D.surface,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: D.border,
  },
  matchCardPressed: { opacity: 0.85 },
  matchImage: {
    height: 120,
    backgroundColor: D.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  matchCaseId: { color: D.muted, fontSize: 11, fontWeight: "600" },
  matchBody: { padding: 10, gap: 2 },
  matchTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  voteRow: { flexDirection: "row", gap: 8 },
  matchDiag: { color: D.text, fontSize: 12, fontWeight: "600" },
  viewMoreRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  viewMoreText: { color: D.primary, fontSize: 11, fontWeight: "600" },
});
