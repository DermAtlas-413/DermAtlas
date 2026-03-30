import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuthStore } from "@/state/auth-store";
import { analyzeLesion } from "@/services/lesion-service";
import type { AnalyzeMatch } from "@/types/api";
import { DermAtlasColors as D } from "@/constants/theme";

export default function Compare() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const { queryId } = useLocalSearchParams<{ queryId?: string }>();
  const [matches, setMatches] = useState<AnalyzeMatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    analyzeLesion(queryId ?? "mock")
      .then((res) => setMatches(res.results))
      .finally(() => setLoading(false));
  }, [queryId]);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={D.onPrimary} />
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
              color={D.onPrimary}
            />
          </Pressable>
          <Pressable
            style={styles.headerBtnAlt}
            onPress={() => {
              clearAuth();
              router.replace("/");
            }}
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
                {matches.length} matches
              </Text>
            </Text>
            {loading ? (
              <ActivityIndicator size="large" color={D.primary} style={{ marginTop: 20 }} />
            ) : (
            <View style={styles.grid}>
              {matches.map((m) => {
                const similarity = Math.round(m.score * 100);
                return (
                <Pressable
                  key={m.reference_id}
                  style={({ pressed }) => [
                    styles.matchCard,
                    pressed && styles.matchCardPressed,
                  ]}
                  onPress={() =>
                    router.push(
                      `/feedback?matchId=${m.reference_id}&queryId=${queryId ?? ""}&referenceId=${m.reference_id}&diagnosis=${encodeURIComponent(m.diagnosis_label ?? "")}&similarity=${similarity}`
                    )
                  }
                >
                  <View style={styles.matchImage}>
                    <MaterialCommunityIcons
                      name="image-outline"
                      size={28}
                      color={D.border}
                    />
                    <Text style={styles.matchCaseId}>Case #{m.reference_id}</Text>
                  </View>

                  <View style={styles.matchBody}>
                    <View style={styles.matchTopRow}>
                      <SimilarityBadge value={similarity} />
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

                    <SimilarityBar value={similarity} />

                    <Text style={styles.matchDiag} numberOfLines={2}>
                      {m.diagnosis_label ?? "Unknown"}
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
                );
              })}
            </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SimilarityBar({ value }: { value: number }) {
  const color =
    value >= 85 ? D.success : value >= 75 ? D.warning : D.danger;
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
    value >= 85 ? D.success : value >= 75 ? D.warning : D.danger;
  const bg =
    value >= 85 ? D.successBg : value >= 75 ? D.warningBg : D.dangerBg;
  return (
    <View style={[bar.badge, { backgroundColor: bg }]}>
      <Text style={[bar.badgeText, { color }]}>{value}%</Text>
    </View>
  );
}

const bar = StyleSheet.create({
  wrap: {
    height: 4,
    backgroundColor: D.barTrack,
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
    backgroundColor: D.onPrimaryOverlay,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { color: D.onPrimary, fontWeight: "700", fontSize: 17 },
  headerSubtitle: { color: D.onPrimaryMuted, fontSize: 11, fontWeight: "500" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
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
