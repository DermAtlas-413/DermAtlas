import React, { useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Image,
} from "react-native";
import { useRouter } from "expo-router";

export default function Upload() {
  const router = useRouter();
  const [patientId, setPatientId] = useState("");

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.page}>
        <View style={styles.card}>

          {/* Top Bar */}
          <View style={styles.topBar}>
            <Text style={styles.backArrow}>‹</Text>
            <Text style={styles.doctor}>Dr. Quach (PCP)</Text>
            <Pressable onPress={() => router.replace("/")}>
              <Text style={styles.logout}>Logout</Text>
            </Pressable>
          </View>

          {/* Patient ID */}
          <TextInput
            value={patientId}
            onChangeText={setPatientId}
            placeholder="New Case: Patient ID # ______"
            placeholderTextColor={vars.placeholder}
            style={styles.input}
          />

          {/* Image Panel */}
          <View style={styles.imagePanel}>
            <View style={styles.imagePlaceholder}>
              <Text style={styles.imageIcon}>🖼️</Text>
            </View>

            <Pressable style={styles.smallButton}>
              <Text style={styles.smallButtonText}>
                [ Select an Image Below ]
              </Text>
            </Pressable>
          </View>

          {/* Two Action Cards */}
          <View style={styles.row}>
            <Pressable style={styles.actionCard}>
              <Text style={styles.icon}>📷</Text>
              <Text style={styles.actionText}>Take Photo</Text>
            </Pressable>

            <Pressable style={styles.actionCard}>
              <Text style={styles.icon}>⬆️</Text>
              <Text style={styles.actionText}>Upload Photo</Text>
            </Pressable>
          </View>

          {/* Submit */}
          <Pressable style={styles.submitButton}
            onPress={() => router.push("/compare")}
          >
            <Text style={styles.submitText}>
              Submit for Analysis
            </Text>
          </Pressable>

          <Text style={styles.reminder}>
            Reminder: Ensure full lesion is in frame and well-lit.
          </Text>

        </View>
      </View>
    </SafeAreaView>
  );
}

const vars = {
  primary: "#118AB2",
  border: "#69B5D3",
  lightBlue: "#CFEFFC",
  softBlue: "#D9EEF7",
  bg: "#FFFFFF",
  placeholder: "#67AFCB",
  text: "#0B2B3A",
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: vars.bg,
  },
  page: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  card: {
    borderWidth: 2,
    borderColor: vars.border,
    borderRadius: 32,
    padding: 20,
    backgroundColor: vars.bg,
  },

  /* Top Bar */
  topBar: {
    height: 60,
    backgroundColor: vars.primary,
    borderRadius: 20,
    marginBottom: 20,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backArrow: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
  },
  doctor: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  logout: {
    color: "#FFFFFF",
    fontWeight: "700",
  },

  /* Input */
  input: {
    borderWidth: 2,
    borderColor: vars.border,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    color: vars.text,
    marginBottom: 18,
  },

  /* Image Panel */
  imagePanel: {
    backgroundColor: vars.softBlue,
    borderRadius: 20,
    padding: 16,
    alignItems: "center",
    marginBottom: 20,
  },
  imagePlaceholder: {
    width: "100%",
    height: 160,
    backgroundColor: vars.lightBlue,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  imageIcon: {
    fontSize: 40,
    opacity: 0.6,
  },
  smallButton: {
    backgroundColor: vars.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  smallButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },

  /* Two cards */
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  actionCard: {
    width: "48%",
    backgroundColor: vars.lightBlue,
    borderRadius: 20,
    paddingVertical: 20,
    alignItems: "center",
  },
  icon: {
    fontSize: 28,
    marginBottom: 8,
  },
  actionText: {
    backgroundColor: vars.primary,
    color: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    fontWeight: "700",
  },

  /* Submit */
  submitButton: {
    backgroundColor: vars.primary,
    paddingVertical: 18,
    borderRadius: 22,
    alignItems: "center",
  },
  submitText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
  },

  reminder: {
    marginTop: 12,
    textAlign: "center",
    fontSize: 12,
    color: "#2C6A80",
    fontWeight: "600",
  },
});