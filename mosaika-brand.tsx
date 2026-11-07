import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { View, Text, StyleSheet } from "react-native";

export function MosaikaMark({
  size = 34,
  white = false,
}: {
  size?: number;
  white?: boolean;
}) {
  const stroke = 5.5;
  const box = 58;
  const inset = 12;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      accessibilityLabel="Logo Mosaika"
    >
      <Defs>
        <LinearGradient id="mosaikaGradient" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FF9B45" />
          <Stop offset="0.52" stopColor="#F04F93" />
          <Stop offset="1" stopColor="#7954CF" />
        </LinearGradient>
      </Defs>
      <Rect
        x={inset}
        y={inset}
        width={box}
        height={box}
        rx="16"
        fill="none"
        stroke={white ? "#fff" : "url(#mosaikaGradient)"}
        strokeWidth={stroke}
      />
      <Rect
        x={30}
        y={30}
        width={box}
        height={box}
        rx="16"
        fill="none"
        stroke={white ? "#fff" : "url(#mosaikaGradient)"}
        strokeWidth={stroke}
      />
    </Svg>
  );
}

export function MosaikaWordmark({ light = false }: { light?: boolean }) {
  return (
    <View style={styles.row}>
      <MosaikaMark size={31} />
      <Text style={[styles.word, light && styles.light]}>mosaika</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  word: {
    color: "#211B24",
    fontSize: 23,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  light: { color: "#FFFFFF" },
});
