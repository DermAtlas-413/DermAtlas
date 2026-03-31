import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Animated,
  PanResponder,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image, type ImageSource } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { DermAtlasColors as D } from "@/constants/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  uploadedSource?: ImageSource | string | number | null;
  referenceSource?: ImageSource | string | number | null;
  uploadedSublabel?: string;
  referenceSublabel?: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function ComparisonModal({
  visible,
  onClose,
  uploadedSource,
  referenceSource,
  uploadedSublabel,
  referenceSublabel,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const DIVIDER = 1;
  const H_PAD = 12;
  const panelW = Math.floor((screenW - H_PAD * 2 - DIVIDER) / 2);
  const HEADER_H = 52;
  const FOOTER_H = 40;
  const LABEL_H = 36;
  const imageH =
    screenH - insets.top - insets.bottom - HEADER_H - FOOTER_H - LABEL_H;

  // Shared animated values — both panels read the same objects → guaranteed sync
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const txAnim = useRef(new Animated.Value(0)).current;
  const tyAnim = useRef(new Animated.Value(0)).current;

  // Mutable math refs — always fresh inside gesture callbacks (no stale closure)
  const scale = useRef(1);
  const tx = useRef(0);
  const ty = useRef(0);

  // Best-estimate dimensions; updated with accurate DOM values on first wheel event
  // and by the left panel's onLayout. Do NOT overwrite on every render.
  const dims = useRef({ panelW, imageH });

  // Gesture tracking refs
  const startDist = useRef(0);
  const startScale = useRef(1);
  const startTx = useRef(0);
  const startTy = useRef(0);
  const startMidX = useRef(0);
  const startMidY = useRef(0);
  const prevTouchCount = useRef(0);
  const lastTap = useRef(0);

  // Ref to the outer row container (used for web wheel listener)
  const rowRef = useRef<View>(null);

  // Mobile web portrait detection
  const [isPortrait, setIsPortrait] = useState(false);

  function resetTransform() {
    scale.current = 1;
    tx.current = 0;
    ty.current = 0;
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }),
      Animated.spring(txAnim, { toValue: 0, useNativeDriver: true }),
      Animated.spring(tyAnim, { toValue: 0, useNativeDriver: true }),
    ]).start();
  }

  // PanResponder created once; reads mutable refs so callbacks are always current
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        prevTouchCount.current = touches.length;
        if (touches.length >= 2) {
          const dx = touches[1].pageX - touches[0].pageX;
          const dy = touches[1].pageY - touches[0].pageY;
          startDist.current = Math.sqrt(dx * dx + dy * dy);
          startScale.current = scale.current;
          startMidX.current = (touches[0].pageX + touches[1].pageX) / 2;
          startMidY.current = (touches[0].pageY + touches[1].pageY) / 2;
        }
        startTx.current = tx.current;
        startTy.current = ty.current;
      },
      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;
        const count = touches.length;
        const { panelW: pw, imageH: ih } = dims.current;

        // Re-snapshot when finger count changes mid-gesture
        if (count !== prevTouchCount.current) {
          if (count >= 2) {
            const dx = touches[1].pageX - touches[0].pageX;
            const dy = touches[1].pageY - touches[0].pageY;
            startDist.current = Math.sqrt(dx * dx + dy * dy);
            startScale.current = scale.current;
            startMidX.current = (touches[0].pageX + touches[1].pageX) / 2;
            startMidY.current = (touches[0].pageY + touches[1].pageY) / 2;
          }
          startTx.current = tx.current;
          startTy.current = ty.current;
          prevTouchCount.current = count;
        }

        if (count >= 2) {
          // Pinch-to-zoom + 2-finger pan
          const dx = touches[1].pageX - touches[0].pageX;
          const dy = touches[1].pageY - touches[0].pageY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const newScale = clamp(
            startScale.current * (dist / startDist.current),
            1,
            5
          );
          scale.current = newScale;
          scaleAnim.setValue(newScale);

          const midX = (touches[0].pageX + touches[1].pageX) / 2;
          const midY = (touches[0].pageY + touches[1].pageY) / 2;
          // Clamp per-panel: each panel clips to panelW, not totalW
          const maxX = (pw * (newScale - 1)) / 2;
          const maxY = (ih * (newScale - 1)) / 2;
          tx.current = clamp(
            startTx.current + (midX - startMidX.current),
            -maxX,
            maxX
          );
          ty.current = clamp(
            startTy.current + (midY - startMidY.current),
            -maxY,
            maxY
          );
          txAnim.setValue(tx.current);
          tyAnim.setValue(ty.current);
        } else {
          // Single-finger pan (also handles web mouse drag via gestureState.dx/dy)
          const maxX = (dims.current.panelW * (scale.current - 1)) / 2;
          const maxY = (dims.current.imageH * (scale.current - 1)) / 2;
          tx.current = clamp(
            startTx.current + gestureState.dx,
            -maxX,
            maxX
          );
          ty.current = clamp(
            startTy.current + gestureState.dy,
            -maxY,
            maxY
          );
          txAnim.setValue(tx.current);
          tyAnim.setValue(ty.current);
        }
      },
      onPanResponderRelease: (_evt, gestureState) => {
        // Double-tap / double-click to reset
        const now = Date.now();
        const wasTap =
          Math.abs(gestureState.dx) < 8 && Math.abs(gestureState.dy) < 8;
        if (wasTap && now - lastTap.current < 300) {
          resetTransform();
        }
        lastTap.current = now;
        prevTouchCount.current = 0;
      },
    })
  ).current;

  // Reset zoom/pan state when modal opens
  useEffect(() => {
    if (visible) {
      scale.current = 1;
      tx.current = 0;
      ty.current = 0;
      scaleAnim.setValue(1);
      txAnim.setValue(0);
      tyAnim.setValue(0);
    }
  }, [visible, scaleAnim, txAnim, tyAnim]);

  // Web: capture wheel to zoom toward cursor, preventing browser page zoom
  useEffect(() => {
    if (Platform.OS !== "web" || !visible) return;

    let removeListener: (() => void) | undefined;

    // Defer to ensure Modal DOM is fully mounted before attaching listener
    const t = setTimeout(() => {
      const el = rowRef.current as unknown as HTMLElement | null;
      if (!el) return;

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const rect = el.getBoundingClientRect();

        // Derive panel dimensions from the actual rendered DOM rect.
        // This is the ground truth — avoids any mismatch between the
        // Math.floor(useWindowDimensions) estimate and the real layout
        // (border widths, rounding, footer height differences, etc.).
        const pw = (rect.width - DIVIDER_WIDTH) / 2;
        const ih = rect.height;

        // Keep dims in sync so PanResponder uses the same values
        dims.current.panelW = pw;
        dims.current.imageH = ih;

        const containerX = e.clientX - rect.left;
        const isRightPanel = containerX > pw + DIVIDER_WIDTH;
        const panelLocalX = isRightPanel
          ? containerX - pw - DIVIDER_WIDTH
          : containerX;
        // Cursor offset from the hovered panel's center (screen space)
        const cx = panelLocalX - pw / 2;
        const cy = e.clientY - rect.top - ih / 2;

        // ctrlKey is set by the OS for trackpad pinch-to-zoom events
        const factor = e.ctrlKey ? 0.008 : 0.003;
        const newScale = clamp(scale.current * (1 - e.deltaY * factor), 1, 5);
        if (newScale === scale.current) return;

        const r = newScale / scale.current;
        // Both maxX and maxY use the same pw/ih as cx/cy — no mismatch
        const maxX = (pw * (newScale - 1)) / 2;
        const maxY = (ih * (newScale - 1)) / 2;

        scale.current = newScale;
        tx.current = clamp(cx + (tx.current - cx) * r, -maxX, maxX);
        ty.current = clamp(cy + (ty.current - cy) * r, -maxY, maxY);
        scaleAnim.setValue(newScale);
        txAnim.setValue(tx.current);
        tyAnim.setValue(ty.current);
      };

      el.addEventListener("wheel", onWheel, { passive: false });
      removeListener = () => el.removeEventListener("wheel", onWheel);
    }, 50);

    return () => {
      clearTimeout(t);
      removeListener?.();
    };
  }, [visible, scaleAnim, txAnim, tyAnim]);

  // Web: portrait-mode rotate overlay
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const check = () =>
      setIsPortrait(
        window.innerWidth < 768 && window.innerHeight > window.innerWidth
      );
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Image Comparison</Text>
          <View style={styles.headerActions}>
            <Pressable
              style={styles.iconBtn}
              onPress={resetTransform}
              hitSlop={12}
            >
              <MaterialCommunityIcons name="refresh" size={20} color={D.text} />
            </Pressable>
            <Pressable style={styles.iconBtn} onPress={onClose} hitSlop={12}>
              <MaterialCommunityIcons name="close" size={22} color={D.text} />
            </Pressable>
          </View>
        </View>

        {/* Panel labels — static row above the gesture area */}
        <View style={[styles.labelRow, { paddingHorizontal: H_PAD }]}>
          <View style={styles.panelLabelWrap}>
            <Text style={styles.panelLabel}>Your Image</Text>
            {uploadedSublabel ? (
              <Text style={styles.panelSublabel} numberOfLines={1}>
                {uploadedSublabel}
              </Text>
            ) : null}
          </View>
          {/* Spacer aligns label columns with panels below */}
          <View style={styles.labelDividerSpacer} />
          <View style={styles.panelLabelWrap}>
            <Text style={styles.panelLabel}>Case Match</Text>
            {referenceSublabel ? (
              <Text style={styles.panelSublabel} numberOfLines={1}>
                {referenceSublabel}
              </Text>
            ) : null}
          </View>
        </View>

        {/*
         * Gesture row — two independent overflow-hidden panels sharing the same
         * Animated.Values. Divider is a fixed View between them; it never moves.
         *
         * Architecture:
         *   [Left panel (overflow:hidden)] | [Fixed divider] | [Right panel (overflow:hidden)]
         *      Animated.View (shared transform)                   Animated.View (shared transform)
         *        Image: uploadedSource                              Image: referenceSource
         *
         * Because scaleAnim/txAnim/tyAnim are the SAME object instances, React Native
         * applies identical transforms to both Animated.Views simultaneously.
         * The overflow:hidden on each panel clips each image to its half of the screen.
         */}
        <View
          ref={rowRef}
          style={[
            styles.panelRow,
            { height: imageH, marginHorizontal: H_PAD },
          ]}
          {...panResponder.panHandlers}
        >
          {/* Left panel */}
          <View
            style={styles.panel}
            onLayout={(e) => {
              dims.current.panelW = e.nativeEvent.layout.width;
              dims.current.imageH = e.nativeEvent.layout.height;
            }}
          >
            <Animated.View
              style={{
                width: panelW,
                height: imageH,
                transform: [
                  { scale: scaleAnim },
                  { translateX: txAnim },
                  { translateY: tyAnim },
                ],
              }}
            >
              <Image
                source={uploadedSource ?? undefined}
                style={{ width: panelW, height: imageH }}
                contentFit="cover"
              />
            </Animated.View>
          </View>

          {/* Fixed divider — always at center, never animated */}
          <View style={[styles.divider, { height: imageH }]} />

          {/* Right panel */}
          <View style={styles.panel}>
            <Animated.View
              style={{
                width: panelW,
                height: imageH,
                transform: [
                  { scale: scaleAnim },
                  { translateX: txAnim },
                  { translateY: tyAnim },
                ],
              }}
            >
              <Image
                source={referenceSource ?? undefined}
                style={{ width: panelW, height: imageH }}
                contentFit="cover"
              />
            </Animated.View>
          </View>

          {/* Portrait rotate prompt (mobile web only) */}
          {isPortrait ? (
            <View
              style={[StyleSheet.absoluteFillObject, styles.rotateOverlay]}
            >
              <MaterialCommunityIcons
                name="phone-rotate-landscape"
                size={48}
                color={D.onPrimary}
              />
              <Text style={styles.rotateText}>Please rotate your device</Text>
            </View>
          ) : null}
        </View>

        {/* Footer hint */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 4 }]}>
          <MaterialCommunityIcons
            name="gesture-pinch"
            size={14}
            color={D.muted}
          />
          <Text style={styles.hintText}>
            {Platform.OS === "web"
              ? "Scroll or trackpad pinch to zoom · Drag to pan · Double-click to reset"
              : "Pinch to zoom · Drag to pan · Double-tap to reset"}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const DIVIDER_WIDTH = 1;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: D.bg,
  },

  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: D.border,
    backgroundColor: D.surface,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: D.text,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: D.bg,
    borderWidth: 1,
    borderColor: D.border,
    alignItems: "center",
    justifyContent: "center",
  },

  labelRow: {
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 8,
  },
  labelDividerSpacer: {
    width: DIVIDER_WIDTH,
  },
  panelLabelWrap: {
    flex: 1,
  },
  panelLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: D.text,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  panelSublabel: {
    fontSize: 10,
    color: D.muted,
    fontWeight: "500",
  },

  panelRow: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: D.border,
    overflow: "hidden",
    backgroundColor: D.bg,
  },
  panel: {
    flex: 1,
    overflow: "hidden",
  },
  divider: {
    width: DIVIDER_WIDTH,
    backgroundColor: D.border,
  },

  rotateOverlay: {
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    borderRadius: 10,
  },
  rotateText: {
    color: D.onPrimary,
    fontSize: 16,
    fontWeight: "600",
  },

  footer: {

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: D.border,
    backgroundColor: D.surface,
  },
  hintText: {
    fontSize: 11,
    color: D.muted,
    fontWeight: "500",
  },
});
