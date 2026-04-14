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
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useAuthStore } from "@/state/auth-store";
import { useRequireRole } from "@/hooks/use-require-role";
import { getMyPatientCases } from "@/services/patient-service";
import type { ClinicalImageSummary, PatientMeResponse } from "@/types/api";
import { displayRole } from "@/types/api";
import { DermAtlasColors as D } from "@/constants/theme";

function formatDate(isoStr: string | null): string {
  if (!isoStr) return "Unknown date";
  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(isoStr));
  } catch {
    return isoStr;
  }
}

export default function MyCases() {
  const authorized = useRequireRole("PATIENT");
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [data, setData] = useState<PatientMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authorized) return;
    setError(null);
    getMyPatientCases()
      .then(setData)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load cases.");
      })
      .finally(() => setLoading(false));
  }, [authorized]);

  if (!authorized) return null;

  const displayName = user?.fullName ?? "—";
  const initials =
    displayName !== "—"
      ? displayName
          .split(" ")
          .map((w: string) => w[0])
          .slice(0, 2)
          .join("")
          .toUpperCase()
      : "?";

  const caseCount = data?.clinical_images.length ?? 0;

  function handleLogout() {
    clearAuth();
    router.replace("/");
  }

  function handleCasePress(queryId: string) {
    router.push(`/case-detail?queryId=${encodeURIComponent(queryId)}`);
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerBtn} />
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>My Cases</Text>
          <Text style={styles.headerSubtitle}>
            {displayName} · {displayRole(user?.role)}
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
          <Pressable style={styles.headerBtnAlt} onPress={handleLogout}>
            <Text style={styles.headerBtnAltText}>Logout</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.page}>
          {/* Patient info card */}
          <View style={styles.profileCard}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{displayName}</Text>
              <View style={styles.profileBadges}>
                <View style={styles.badge}>
                  <MaterialCommunityIcons
                    name="account-outline"
                    size={11}
                    color={D.primary}
                  />
                  <Text style={styles.badgeText}>{displayRole(user?.role)}</Text>
                </View>
              </View>
              <Text style={styles.profileEmail}>{user?.email ?? "—"}</Text>
              {data?.physician_name && (
                <View style={styles.physicianRow}>
                  <MaterialCommunityIcons name="stethoscope" size={12} color={D.muted} />
                  <Text style={styles.physicianText}>{data.physician_name}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Section label */}
          <Text style={styles.sectionLabel}>
            My Cases{" "}
            {!loading && !error && (
              <Text style={styles.sectionCount}>{caseCount} {caseCount === 1 ? "case" : "cases"}</Text>
            )}
          </Text>

          {/* Loading */}
          {loading && (
            <ActivityIndicator size="large" color={D.primary} style={{ marginTop: 20 }} />
          )}

          {/* Error */}
          {!loading && error && (
            <View style={styles.errorBanner}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color={D.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Empty state */}
          {!loading && !error && caseCount === 0 && (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="clipboard-text-off-outline"
                size={48}
                color={D.border}
              />
              <Text style={styles.emptyTitle}>No cases available yet</Text>
              <Text style={styles.emptySubtitle}>
                Your physician will share case results when they are ready for you to view.
              </Text>
            </View>
          )}

          {/* Case tiles */}
          {!loading && !error && data && (
            <View style={styles.tileGrid}>
              {data.clinical_images.map((img) => (
                <CaseCard
                  key={img.query_id}
                  image={img}
                  onPress={() => handleCasePress(img.query_id)}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function CaseCard({ image, onPress }: { image: ClinicalImageSummary; onPress: () => void }) {
  const [imgError, setImgError] = useState(false);
  const hasImage = !!image.gcs_uri && !imgError;

  return (
    <Pressable
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
      onPress={onPress}
    >
      <View style={styles.tileThumbnail}>
        {hasImage ? (
          <Image
            source={{ uri: image.gcs_uri }}
            style={styles.tileThumbnailImage}
            contentFit="cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <View style={styles.tilePlaceholder}>
            <MaterialCommunityIcons name="image-outline" size={32} color={D.border} />
          </View>
        )}
      </View>
      <View style={styles.tileBody}>
        <View style={styles.tileLocationRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={14} color={D.primary} />
          <Text style={styles.tileLocation} numberOfLines={1}>{image.lesion_location}</Text>
        </View>
        <Text style={styles.tileMeta}>{formatDate(image.captured_at)}</Text>
      </View>
      <View style={styles.tileFooter}>
        <Text style={styles.tileAction}>View Details</Text>
        <MaterialCommunityIcons name="chevron-right" size={16} color={D.primary} />
      </View>
    </Pressable>
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
    maxWidth: 720,
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
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: D.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: { color: D.onPrimary, fontWeight: "800", fontSize: 20 },
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
  profileEmail: { color: D.muted, fontSize: 12, fontWeight: "500" },
  physicianRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  physicianText: { color: D.muted, fontSize: 12, fontWeight: "500" },

  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: D.text,
    letterSpacing: 0.3,
  },
  sectionCount: { color: D.muted, fontWeight: "500" },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: D.dangerBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: D.danger,
  },
  errorText: { color: D.danger, fontSize: 13, fontWeight: "600", flex: 1 },

  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 10,
  },
  emptyTitle: { color: D.text, fontSize: 16, fontWeight: "600" },
  emptySubtitle: { color: D.muted, fontSize: 13, textAlign: "center", maxWidth: 280 },

  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },

  tile: {
    width: "100%",
    maxWidth: 340,
    flexGrow: 1,
    flexBasis: "45%",
    backgroundColor: D.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: D.border,
    overflow: "hidden",
  },
  tilePressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  tileThumbnail: {
    height: 140,
    backgroundColor: D.bg,
    borderBottomWidth: 1,
    borderBottomColor: D.border,
  },
  tileThumbnailImage: { width: "100%", height: "100%" },
  tilePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tileBody: {
    padding: 14,
    gap: 4,
  },
  tileLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tileLocation: { color: D.text, fontSize: 15, fontWeight: "700", flex: 1 },
  tileMeta: { color: D.muted, fontSize: 12, fontWeight: "500" },
  tileFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 2,
  },
  tileAction: { color: D.primary, fontSize: 12, fontWeight: "700" },
});
