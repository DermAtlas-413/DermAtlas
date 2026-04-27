import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { toggleCaseVisibility } from "@/services/patient-service";
import { DermAtlasColors as D } from "@/constants/theme";

type Props = {
  queryId: string;
  initialVisible?: boolean;
};

export function VisibilityToggle({ queryId, initialVisible = false }: Props) {
  const [visible, setVisible] = useState(initialVisible);
  const [toggling, setToggling] = useState(false);

  async function handleToggle() {
    setToggling(true);
    try {
      const res = await toggleCaseVisibility(queryId, !visible);
      setVisible(res.visible_to_patient);
    } catch {
      // Revert on failure — state stays as-is
    } finally {
      setToggling(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.info}>
        <MaterialCommunityIcons
          name={visible ? "eye-outline" : "eye-off-outline"}
          size={18}
          color={visible ? D.success : D.muted}
        />
        <View style={styles.textWrap}>
          <Text style={styles.label}>Patient Visibility</Text>
          <Text style={styles.hint}>
            {visible
              ? "Patient can see this case and your notes"
              : "This case is hidden from the patient"}
          </Text>
        </View>
      </View>
      <Pressable
        style={[
          styles.toggle,
          visible ? styles.toggleOn : styles.toggleOff,
        ]}
        onPress={handleToggle}
        disabled={toggling}
      >
        {toggling ? (
          <ActivityIndicator size="small" color={visible ? D.onPrimary : D.muted} />
        ) : (
          <Text style={[styles.toggleText, visible ? styles.toggleTextOn : styles.toggleTextOff]}>
            {visible ? "Visible" : "Hidden"}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: D.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: D.border,
    gap: 12,
  },
  info: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  textWrap: { flex: 1, gap: 2 },
  label: { color: D.text, fontSize: 13, fontWeight: "700" },
  hint: { color: D.muted, fontSize: 11, fontWeight: "500", lineHeight: 16 },

  toggle: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
  },
  toggleOn: { backgroundColor: D.success },
  toggleOff: { backgroundColor: D.bg, borderWidth: 1, borderColor: D.border },
  toggleText: { fontSize: 12, fontWeight: "700" },
  toggleTextOn: { color: D.onPrimary },
  toggleTextOff: { color: D.muted },
});
