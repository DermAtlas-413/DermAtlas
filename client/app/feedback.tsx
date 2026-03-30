import React, { useRef, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  ScrollView,
  Platform,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { submitFeedback } from "@/services/feedback-service";
import { useAuthStore } from "@/state/auth-store";
import { DermAtlasColors as D } from "@/constants/theme";

type Slide = { key: string; label: string };

export default function Feedback() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const { matchId, queryId, referenceId, diagnosis, similarity } =
    useLocalSearchParams<{
      matchId?: string;
      queryId?: string;
      referenceId?: string;
      diagnosis?: string;
      similarity?: string;
    }>();

  const slides: Slide[] = [
    { key: "1", label: `Match ${matchId ?? "1"}` },
    { key: "2", label: `Alt View` },
    { key: "3", label: `Close-up` },
  ];

  const [activeIndex, setActiveIndex] = useState(0);
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleVote(direction: "up" | "down") {
    const next = vote === direction ? null : direction;
    setVote(next);
    if (next === null) return;
    if (!queryId || !referenceId) return;
    setSubmitting(true);
    try {
      await submitFeedback(queryId, referenceId, next === "up");
    } catch {
      Alert.alert("Error", "Failed to submit feedback. Please try again.");
      setVote(vote);
    } finally {
      setSubmitting(false);
    }
  }

  const W = Dimensions.get("window").width;
  const HORIZ_PAD = 20;
  const carouselWidth = Math.min(W - HORIZ_PAD * 2, 560);

  const scrollRef = useRef<ScrollView>(null);

  const goTo = (idx: number) => {
    const next = Math.max(0, Math.min(idx, slides.length - 1));
    setActiveIndex(next);
    scrollRef.current?.scrollTo({ x: next * carouselWidth, animated: true });
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={D.onPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Similar Case · Match #{matchId ?? "—"}</Text>
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
          {/* Carousel */}
          <View style={styles.carouselSection}>
            <View style={styles.carouselTopRow}>
              <Text style={styles.sectionLabel}>Case Images</Text>
              <View style={styles.slideCounter}>
                <Text style={styles.slideCounterText}>
                  {activeIndex + 1} / {slides.length}
                </Text>
              </View>
            </View>

            <View style={styles.carouselRow}>
              <Pressable
                style={[
                  styles.navBtn,
                  activeIndex === 0 && styles.navBtnDisabled,
                ]}
                onPress={() => goTo(activeIndex - 1)}
                disabled={activeIndex === 0}
              >
                <MaterialCommunityIcons
                  name="chevron-left"
                  size={22}
                  color={activeIndex === 0 ? D.border : D.primary}
                />
              </Pressable>

              <ScrollView
                ref={scrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={carouselWidth}
                decelerationRate="fast"
                bounces={false}
                scrollEventThrottle={16}
                onMomentumScrollEnd={(e) => {
                  const x = e.nativeEvent.contentOffset.x;
                  const idx = Math.round(x / carouselWidth);
                  setActiveIndex(
                    Math.max(0, Math.min(idx, slides.length - 1))
                  );
                }}
                style={{ width: carouselWidth }}
              >
                {slides.map((item) => (
                  <View
                    key={item.key}
                    style={[styles.slide, { width: carouselWidth }]}
                  >
                    <MaterialCommunityIcons
                      name="image-outline"
                      size={48}
                      color={D.border}
                    />
                    <Text style={styles.slideLabel}>{item.label}</Text>
                  </View>
                ))}
              </ScrollView>

              <Pressable
                style={[
                  styles.navBtn,
                  activeIndex === slides.length - 1 && styles.navBtnDisabled,
                ]}
                onPress={() => goTo(activeIndex + 1)}
                disabled={activeIndex === slides.length - 1}
              >
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={22}
                  color={
                    activeIndex === slides.length - 1 ? D.border : D.primary
                  }
                />
              </Pressable>
            </View>

            <View style={styles.dots}>
              {slides.map((s, i) => (
                <Pressable key={s.key} onPress={() => goTo(i)} hitSlop={8}>
                  <View
                    style={[
                      styles.dot,
                      i === activeIndex ? styles.dotActive : styles.dotIdle,
                    ]}
                  />
                </Pressable>
              ))}
            </View>

            {Platform.OS === "web" ? (
              <Text style={styles.webHint}>
                Use ‹ › buttons or click dots to navigate
              </Text>
            ) : null}
          </View>

          {/* Diagnosis and similarity */}
          <View style={styles.metaRow}>
            <View style={styles.metaCard}>
              <MaterialCommunityIcons
                name="stethoscope"
                size={18}
                color={D.primary}
              />
              <View style={styles.metaCardContent}>
                <Text style={styles.metaCardLabel}>Diagnosis</Text>
                <Text style={styles.metaCardValue} numberOfLines={2}>
                  {diagnosis ?? "—"}
                </Text>
              </View>
            </View>
            <View style={styles.metaCard}>
              <MaterialCommunityIcons
                name="chart-bar"
                size={18}
                color={D.primary}
              />
              <View style={styles.metaCardContent}>
                <Text style={styles.metaCardLabel}>Similarity</Text>
                <Text style={styles.metaCardValue}>
                  {similarity != null ? `${similarity}%` : "—"}
                </Text>
              </View>
            </View>
          </View>

          {/* Feedback */}
          <View style={styles.feedbackSection}>
            <Text style={styles.sectionLabel}>Clinical Feedback</Text>
            <Text style={styles.feedbackQuestion}>
              Does this match assist with your clinical assessment?
            </Text>

            <View style={styles.voteRow}>
              <Pressable
                style={[
                  styles.voteBtn,
                  vote === "up" && styles.voteBtnUp,
                ]}
                onPress={() => handleVote("up")}
                disabled={submitting}
              >
                <MaterialCommunityIcons
                  name={vote === "up" ? "thumb-up" : "thumb-up-outline"}
                  size={24}
                  color={vote === "up" ? D.onPrimary : D.primary}
                />
                <Text
                  style={[
                    styles.voteLabel,
                    vote === "up" && styles.voteLabelActive,
                  ]}
                >
                  Helpful
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.voteBtn,
                  vote === "down" && styles.voteBtnDown,
                ]}
                onPress={() => handleVote("down")}
                disabled={submitting}
              >
                <MaterialCommunityIcons
                  name={vote === "down" ? "thumb-down" : "thumb-down-outline"}
                  size={24}
                  color={vote === "down" ? D.onPrimary : D.muted}
                />
                <Text
                  style={[
                    styles.voteLabel,
                    vote === "down" && styles.voteLabelActive,
                    vote === "down" && styles.voteLabelDown,
                  ]}
                >
                  Not Helpful
                </Text>
              </Pressable>
            </View>

            {submitting && (
              <Text style={styles.statusText}>Saving feedback…</Text>
            )}
            {!submitting && vote !== null && (
              <View style={styles.statusRow}>
                <MaterialCommunityIcons
                  name="check-circle-outline"
                  size={14}
                  color={D.success}
                />
                <Text style={styles.statusSuccess}>Feedback recorded</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
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
  headerSubtitle: {
    color: D.onPrimaryMuted,
    fontSize: 11,
    fontWeight: "500",
  },
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
    maxWidth: 600,
    alignSelf: "center",
    width: "100%",
  },

  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: D.text,
    letterSpacing: 0.3,
  },

  // Carousel
  carouselSection: {
    backgroundColor: D.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: D.border,
    gap: 12,
  },
  carouselTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  slideCounter: {
    backgroundColor: D.bg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  slideCounterText: { color: D.muted, fontSize: 12, fontWeight: "600" },

  carouselRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  slide: {
    height: 240,
    backgroundColor: D.bg,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  slideLabel: { color: D.muted, fontWeight: "600", fontSize: 13 },

  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: D.bg,
    borderWidth: 1.5,
    borderColor: D.border,
    alignItems: "center",
    justifyContent: "center",
  },
  navBtnDisabled: { opacity: 0.4 },

  dots: { flexDirection: "row", gap: 6, justifyContent: "center" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { backgroundColor: D.primary },
  dotIdle: { backgroundColor: D.border },

  webHint: { fontSize: 11, color: D.muted, fontWeight: "500", textAlign: "center" },

  // Meta
  metaRow: { flexDirection: "row", gap: 12 },
  metaCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: D.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: D.border,
  },
  metaCardContent: { flex: 1 },
  metaCardLabel: {
    fontSize: 11,
    color: D.muted,
    fontWeight: "600",
    marginBottom: 2,
  },
  metaCardValue: { fontSize: 14, color: D.text, fontWeight: "700" },

  // Feedback
  feedbackSection: {
    backgroundColor: D.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: D.border,
    gap: 12,
  },
  feedbackQuestion: {
    fontSize: 13,
    color: D.muted,
    fontWeight: "500",
    lineHeight: 18,
  },

  voteRow: { flexDirection: "row", gap: 12 },
  voteBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: D.border,
    backgroundColor: D.bg,
  },
  voteBtnUp: { backgroundColor: D.primary, borderColor: D.primary },
  voteBtnDown: { backgroundColor: D.danger, borderColor: D.danger },
  voteLabel: { color: D.primary, fontWeight: "700", fontSize: 13 },
  voteLabelActive: { color: D.onPrimary },
  voteLabelDown: { color: D.onPrimary },

  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusText: { fontSize: 12, color: D.muted, fontWeight: "600" },
  statusSuccess: { fontSize: 12, color: D.success, fontWeight: "600" },
});
