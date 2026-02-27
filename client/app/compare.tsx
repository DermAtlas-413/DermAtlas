import { SafeAreaView, View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";

export default function Compare() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.card}>
        <Text style={styles.title}>Compare</Text>

        <Pressable style={styles.btn} onPress={() => router.back()}>
          <Text style={styles.btnText}>Back</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFFFF", justifyContent: "center", padding: 24 },
  card: { borderWidth: 2, borderColor: "#69B5D3", borderRadius: 28, padding: 22 },
  title: { fontSize: 28, fontWeight: "800", color: "#118AB2", marginBottom: 16 },
  btn: { backgroundColor: "#118AB2", paddingVertical: 14, borderRadius: 16, alignItems: "center" },
  btnText: { color: "white", fontSize: 16, fontWeight: "800" },
});