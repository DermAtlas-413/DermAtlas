import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { DermAtlasColors as D } from "@/constants/theme";

type Props = {
  visible: boolean;
  title: string;
  message: string;
  finalWarning: string;
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
};

export function ConfirmDestructiveModal({
  visible,
  title,
  message,
  finalWarning,
  confirmLabel,
  onConfirm,
  onClose,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setStep(1);
      setSubmitting(false);
    }
  }, [visible]);

  async function handleFinalConfirm() {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={submitting ? undefined : onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons
              name={step === 1 ? "alert-outline" : "alert-octagon"}
              size={28}
              color={D.danger}
            />
          </View>

          <Text style={styles.title}>{title}</Text>

          {step === 1 ? (
            <Text style={styles.message}>{message}</Text>
          ) : (
            <>
              <Text style={styles.message}>{message}</Text>
              <View style={styles.finalWarningBox}>
                <MaterialCommunityIcons
                  name="shield-alert-outline"
                  size={16}
                  color={D.danger}
                />
                <Text style={styles.finalWarningText}>{finalWarning}</Text>
              </View>
            </>
          )}

          <View style={styles.actionRow}>
            <Pressable
              style={({ pressed }) => [
                styles.btn,
                styles.btnGhost,
                pressed && styles.btnPressed,
                submitting && styles.btnDisabled,
              ]}
              onPress={step === 1 ? onClose : () => setStep(1)}
              disabled={submitting}
            >
              <Text style={styles.btnGhostText}>
                {step === 1 ? "Cancel" : "Back"}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.btn,
                styles.btnDanger,
                pressed && styles.btnPressed,
                submitting && styles.btnDisabled,
              ]}
              onPress={
                step === 1 ? () => setStep(2) : handleFinalConfirm
              }
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={D.onPrimary} />
              ) : (
                <Text style={styles.btnDangerText}>
                  {step === 1 ? "Continue" : confirmLabel}
                </Text>
              )}
            </Pressable>
          </View>

          <View style={styles.stepIndicator}>
            <View
              style={[
                styles.stepDot,
                step === 1 && styles.stepDotActive,
              ]}
            />
            <View
              style={[
                styles.stepDot,
                step === 2 && styles.stepDotActive,
              ]}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: D.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: D.dangerBg,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: D.text,
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    color: D.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  finalWarningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: D.dangerBg,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: D.danger,
    marginTop: 4,
  },
  finalWarningText: {
    flex: 1,
    fontSize: 13,
    color: D.danger,
    fontWeight: "600",
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
    width: "100%",
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  btnPressed: { opacity: 0.7 },
  btnDisabled: { opacity: 0.5 },
  btnGhost: {
    backgroundColor: D.bg,
    borderWidth: 1.5,
    borderColor: D.border,
  },
  btnGhostText: { color: D.text, fontWeight: "600", fontSize: 14 },
  btnDanger: { backgroundColor: D.danger },
  btnDangerText: { color: D.onPrimary, fontWeight: "700", fontSize: 14 },

  stepIndicator: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
  },
  stepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: D.border,
  },
  stepDotActive: { backgroundColor: D.danger },
});
