import { memo, useEffect, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import type { GridAspect, MosaikaPost } from "@/lib/mosaika/model";

type Props = {
  post: MosaikaPost;
  width: number;
  aspect: GridAspect;
  selected: boolean;
  selectionMode: boolean;
  organizeMode: boolean;
  columns: number;
  onPress: () => void;
  onLongPress: () => void;
  onMove: (fromId: string, delta: number) => void;
};

export const MosaikaPostTile = memo(function MosaikaPostTile({
  post,
  width,
  aspect,
  selected,
  selectionMode,
  organizeMode,
  columns,
  onPress,
  onLongPress,
  onMove,
}: Props) {
  const mediaHeight =
    aspect === "portrait45"
      ? width * (5 / 4)
      : aspect === "portrait34"
        ? width * (400 / 256)
        : width;
  const height = mediaHeight;
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!selectionMode)
        .activeOffsetX(organizeMode ? [-12, 12] : [-24, 24])
        .activeOffsetY(organizeMode ? [-12, 12] : [-80, 80])
        .failOffsetX(organizeMode ? [-12, 12] : [-80, 80])
        .failOffsetY(organizeMode ? [-80, 80] : [-12, 12])
        .onEnd((event) => {
          const horizontalThreshold = Math.max(width * 0.16, 14);
          const verticalThreshold = Math.max(mediaHeight * 0.12, 14);
          const verticalDominant =
            organizeMode && Math.abs(event.translationY) >= Math.abs(event.translationX);
          const columnShift =
            !verticalDominant && Math.abs(event.translationX) >= horizontalThreshold
              ? Math.sign(event.translationX)
              : 0;
          const rowShift =
            verticalDominant && Math.abs(event.translationY) >= verticalThreshold
              ? Math.sign(event.translationY)
              : 0;
          const delta = rowShift * columns + columnShift;
          if (delta !== 0) runOnJS(onMove)(post.id, delta);
        }),
    [columns, mediaHeight, onMove, organizeMode, post.id, selectionMode, width],
  );
  const media = post.media[0];
  const [imageError, setImageError] = useState(false);
  useEffect(() => setImageError(false), [media?.uri]);
  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width, height }}>
        <Pressable
          onPress={onPress}
          onLongPress={onLongPress}
          delayLongPress={260}
          style={styles.press}
        >
          {media?.kind === "image" && !imageError ? (
            <Image
              source={{ uri: media.uri }}
              style={styles.image}
              resizeMode="cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <View
              style={[
                styles.placeholder,
                {
                  backgroundColor:
                    media?.kind === "video" ? "#28242C" : "#F2EAF1",
                },
              ]}
            >
              <Ionicons
                name={media?.kind === "video" ? "play-circle" : "image-outline"}
                size={27}
                color={media?.kind === "video" ? "#fff" : "#C06C8B"}
              />
              <Text
                style={[
                  styles.placeholderText,
                  media?.kind === "video" && { color: "#fff" },
                ]}
              >
                {post.kind === "reel" ? "REEL" : "Mosaika"}
              </Text>
            </View>
          )}
          {post.pinned && (
            <View style={styles.pin}>
              <Ionicons name="pin" size={13} color="#fff" />
            </View>
          )}
          {post.kind === "carousel" && (
            <View style={styles.mediaFlag}>
              <Ionicons name="copy-outline" size={17} color="#fff" />
            </View>
          )}
          {post.kind === "reel" && (
            <View style={styles.mediaFlag}>
              <Ionicons name="play" size={16} color="#fff" />
            </View>
          )}
          {post.hidden && (
            <View style={styles.hidden}>
              <Ionicons name="eye-off" size={14} color="#fff" />
            </View>
          )}
          {selectionMode && (
            <View style={[styles.check, selected && styles.checked]}>
              {selected && <Ionicons name="checkmark" size={13} color="#fff" />}
            </View>
          )}
        </Pressable>
      </View>
    </GestureDetector>
  );
}, (previous, next) =>
  previous.post === next.post &&
  previous.width === next.width &&
  previous.aspect === next.aspect &&
  previous.selected === next.selected &&
  previous.selectionMode === next.selectionMode &&
  previous.organizeMode === next.organizeMode &&
  previous.columns === next.columns,
);

const styles = StyleSheet.create({
  press: { flex: 1, overflow: "hidden", backgroundColor: "#F2EAF1" },
  image: { width: "100%", height: "100%", backgroundColor: "transparent" },
  placeholder: { flex: 1, justifyContent: "center", alignItems: "center", gap: 4 },
  placeholderText: { color: "#805B70", fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  mediaFlag: { position: "absolute", right: 6, top: 6, padding: 2, backgroundColor: "#0005", borderRadius: 6 },
  pin: { position: "absolute", top: 5, left: 5, backgroundColor: "#0007", borderRadius: 20, padding: 3, transform: [{ rotate: "-35deg" }] },
  hidden: { position: "absolute", left: 5, bottom: 5, backgroundColor: "#0008", borderRadius: 12, padding: 4 },
  check: { position: "absolute", right: 7, bottom: 7, height: 21, width: 21, borderRadius: 11, backgroundColor: "#fffD", borderWidth: 1, borderColor: "#AAA", alignItems: "center", justifyContent: "center" },
  checked: { backgroundColor: "#C94D82", borderColor: "#C94D82" },
});
