import React, { useMemo, useRef, useState } from "react";
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
import { submitFeedback } from "../lib/api";

type Slide = { key: string; label: string };

export default function Feedback() {
  const router = useRouter();
  const { matchId, queryId, referenceId, diagnosis, similarity } =
    useLocalSearchParams<{
      matchId?: string;
      queryId?: string;
      referenceId?: string;
      diagnosis?: string;
      similarity?: string;
    }>();

  const slides: Slide[] = useMemo(
    () => [
      { key: "1", label: `[Match ${matchId ?? "1"}]` },
      { key: "2", label: `[Alt View]` },
      { key: "3", label: `[Close-up]` },
    ],
    [matchId]
  );

  const [activeIndex, setActiveIndex] = useState(0);
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleVote(direction: "up" | "down") {
    const next = vote === direction ? null : direction;
    setVote(next);
    if (next === null) return; // toggled off — no API call
    if (!queryId || !referenceId) return; // params not available yet
    setSubmitting(true);
    try {
      await submitFeedback(queryId, referenceId, next === "up");
    } catch {
      Alert.alert("Error", "Failed to submit feedback. Please try again.");
      setVote(vote); // revert
    } finally {
      setSubmitting(false);
    }
  }

  const W = Dimensions.get("window").width;
  const CARD_PAD = 22;
  const CARD_INNER_PAD = 18;
  const carouselWidth = W - CARD_PAD * 2 - CARD_INNER_PAD * 2;

  const scrollRef = useRef<ScrollView>(null);

  const goTo = (idx: number) => {
    const next = Math.max(0, Math.min(idx, slides.length - 1));
    setActiveIndex(next);
    scrollRef.current?.scrollTo({ x: next * carouselWidth, animated: true });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.page}>
        <View style={styles.card}>
          <View style={styles.topBar}>
            <Pressable onPress={() => router.back()} style={styles.topBarBtn}>
              <Text style={styles.backArrow}>‹</Text>
            </Pressable>

            <Pressable onPress={() => router.push("/profile")}>
              <Text style={styles.doctor}>Dr. Quach (PCP)</Text>
            </Pressable>

            <Pressable onPress={() => router.replace("/")} style={styles.logoutBtn}>
              <Text style={styles.logout}>Logout</Text>
            </Pressable>
          </View>

          <View style={styles.titlePill}>
            <Text style={styles.titlePillText}>
              Similar Case: Match #{matchId ?? "__"}
            </Text>
          </View>

          <View style={styles.carouselWrap}>
            <View style={styles.carouselRow}>
              <Pressable
                style={[styles.navBtn, activeIndex === 0 && styles.navBtnDisabled]}
                onPress={() => goTo(activeIndex - 1)}
                disabled={activeIndex === 0}
              >
                <Text style={styles.navBtnText}>‹</Text>
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
                  setActiveIndex(Math.max(0, Math.min(idx, slides.length - 1)));
                }}
                style={{ width: carouselWidth }}
              >
                {slides.map((item) => (
                  <View key={item.key} style={[styles.slide, { width: carouselWidth }]}>
                    <Text style={styles.slideIcon}>🖼️</Text>
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
                <Text style={styles.navBtnText}>›</Text>
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
              <Text style={styles.webHint}>Tip: use ‹ › buttons or click dots</Text>
            ) : null}
          </View>

          <View style={styles.pills}>
            <View style={styles.diagPill}>
              <Text style={styles.pillText}>
                Diagnosis: {diagnosis ?? "____________"}
              </Text>
            </View>
            <View style={styles.simPill}>
              <Text style={styles.pillText}>
                {similarity != null ? `${similarity}% Similarity` : "__ % Similarity"}
              </Text>
            </View>
          </View>

          <View style={styles.feedbackBox}>
            <Text style={styles.feedbackQuestion}>
              Does this match help with{"\n"}your clinical assessment?
            </Text>

            <View style={styles.voteRow}>
              <Pressable
                style={[styles.voteBtn, vote === "up" && styles.voteBtnActive]}
                onPress={() => handleVote("up")}
                disabled={submitting}
              >
                <Text style={styles.voteIcon}>👍</Text>
                <Text style={styles.voteLabel}>Helpful</Text>
              </Pressable>

              <Pressable
                style={[styles.voteBtn, vote === "down" && styles.voteBtnActive]}
                onPress={() => handleVote("down")}
                disabled={submitting}
              >
                <Text style={styles.voteIcon}>👎</Text>
                <Text style={styles.voteLabel}>Not Helpful</Text>
              </Pressable>
            </View>

            {submitting ? (
              <Text style={styles.submittingText}>Saving…</Text>
            ) : vote !== null ? (
              <Text style={styles.submittedText}>Feedback recorded</Text>
            ) : null}
          </View>
        </View>
      </View>
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
  page: { flex: 1, justifyContent: "center", paddingHorizontal: 22 },
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

  titlePill: {
    borderWidth: 2,
    borderColor: c.border,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 14,
  },
  titlePillText: { color: c.primary, fontWeight: "900" },

  carouselWrap: { alignItems: "center", marginBottom: 10 },
  carouselRow: { flexDirection: "row", alignItems: "center", gap: 10 },

  slide: {
    height: 300,
    backgroundColor: c.soft,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  slideIcon: { fontSize: 44, opacity: 0.55, marginBottom: 8 },
  slideLabel: { color: c.primary, fontWeight: "900" },

  dots: { flexDirection: "row", gap: 8, marginTop: 10 },
  dot: { width: 10, height: 10, borderRadius: 999 },
  dotActive: { backgroundColor: c.primary },
  dotIdle: { backgroundColor: "#A9D8EC" },

  webHint: {
    marginTop: 8,
    fontSize: 12,
    color: "#2C6A80",
    fontWeight: "600",
  },

  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: c.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  navBtnDisabled: { opacity: 0.35 },
  navBtnText: { color: "#FFF", fontSize: 22, fontWeight: "900" },

  pills: { alignItems: "center", gap: 10, marginTop: 8, marginBottom: 14 },
  diagPill: {
    backgroundColor: c.primary,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    width: "90%",
    alignItems: "center",
  },
  simPill: {
    backgroundColor: c.mid,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    width: "55%",
    alignItems: "center",
  },
  pillText: { color: "#FFF", fontWeight: "900" },

  feedbackBox: {
    borderWidth: 2,
    borderColor: c.border,
    borderRadius: 20,
    padding: 14,
    alignItems: "center",
  },
  feedbackQuestion: {
    color: c.primary,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 12,
  },
  voteRow: { flexDirection: "row", gap: 16 },
  voteBtn: {
    width: 120,
    backgroundColor: c.soft,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  voteBtnActive: {
    borderColor: c.primary,
    backgroundColor: c.light,
  },
  voteIcon: { fontSize: 26, marginBottom: 6 },
  voteLabel: { color: c.primary, fontWeight: "900" },
  submittingText: { marginTop: 10, fontSize: 12, color: c.primary, fontWeight: "600" },
  submittedText: { marginTop: 10, fontSize: 12, color: "#2C6A80", fontWeight: "700" },
});
