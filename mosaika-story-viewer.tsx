import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  Dimensions,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { MosaikaHighlight, MosaikaMedia } from "@/lib/mosaika/model";

type Colors = { muted: string; accent: string };
type Props = {
  visible: boolean;
  highlight: MosaikaHighlight | null;
  displayName: string;
  avatarUri?: string;
  colors: Colors;
  index: number;
  placingLink: boolean;
  onIndexChange: (index: number) => void;
  onPlaceLink: (mediaId: string, x: number, y: number) => void;
  onTogglePlace: () => void;
  onClose: () => void;
  onEdit: () => void;
  onFollow: () => void;
};

const storiesInOrder = (media: MosaikaMedia[]) =>
  media
    .map((item, originalIndex) => ({ item, originalIndex }))
    .sort((a, b) => {
      if (a.item.createdAt && b.item.createdAt)
        return a.item.createdAt.localeCompare(b.item.createdAt);
      if (a.item.createdAt) return 1;
      if (b.item.createdAt) return -1;
      return a.originalIndex - b.originalIndex;
    })
    .map(({ item }) => item);

export function MosaikaStoryViewer({
  visible,
  highlight,
  displayName,
  avatarUri,
  colors,
  index,
  placingLink,
  onIndexChange,
  onPlaceLink,
  onTogglePlace,
  onClose,
  onEdit,
  onFollow,
}: Props) {
  const [frame, setFrame] = useState({ width: 1, height: 1 });
  const [showMosaic, setShowMosaic] = useState(false);
  const [mosaicColumns, setMosaicColumns] = useState<2 | 3>(3);
  const stories = useMemo(
    () => storiesInOrder(highlight?.media ?? []),
    [highlight?.media],
  );
  const storyIndex = Math.max(0, Math.min(index, stories.length - 1));
  const story = stories[storyIndex];
  const screen = Dimensions.get("window");
  const stageWidth = Math.max(
    180,
    Math.min(screen.width - 28, (screen.height - 220) * (9 / 16), 430),
  );
  const stageHeight = stageWidth * (16 / 9);
  const mosaicCellWidth =
    (screen.width - 32 - (mosaicColumns - 1) * 8) / mosaicColumns;

  const handleStagePress = (event: {
    nativeEvent: { locationX: number; locationY: number };
  }) => {
    const { locationX, locationY } = event.nativeEvent;
    if (placingLink) {
      if (story)
        onPlaceLink(
          story.id,
          Math.max(0.04, Math.min(0.96, locationX / frame.width)),
          Math.max(0.06, Math.min(0.94, locationY / frame.height)),
        );
      onTogglePlace();
      return;
    }
    if (locationX >= frame.width / 2)
      onIndexChange(Math.min(stories.length - 1, storyIndex + 1));
    else onIndexChange(Math.max(0, storyIndex - 1));
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityLabel="Fechar Stories"
          >
            <Ionicons name="close" size={25} color="#fff" />
          </Pressable>
          <View style={styles.profileHeader}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.profileAvatar} />
            ) : (
              <View
                style={[styles.profileAvatar, styles.profileAvatarFallback]}
              >
                <Ionicons name="person" size={17} color="#fff" />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={styles.headerTitle}>
                {displayName}
              </Text>
              <Text style={styles.headerSub}>
                {highlight?.title || "Story"} ·{" "}
                {story?.createdAt
                  ? new Date(story.createdAt).toLocaleDateString("pt-BR")
                  : stories.length
                    ? `Story ${storyIndex + 1} de ${stories.length}`
                    : "Nenhuma imagem adicionada"}
              </Text>
            </View>
          </View>
          <Pressable onPress={onFollow} style={styles.followButton}>
            <Text style={styles.followText}>Seguir</Text>
          </Pressable>
          <Pressable
            onPress={onEdit}
            hitSlop={10}
            accessibilityLabel="Configurar destaque"
          >
            <Ionicons name="settings-outline" size={21} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.progress}>
          {stories.map((item, storyPosition) => (
            <View key={item.id} style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  storyPosition <= storyIndex && [
                    styles.progressActive,
                    { backgroundColor: colors.accent },
                  ],
                ]}
              />
            </View>
          ))}
        </View>

        <View style={styles.center}>
          <View
            style={[styles.stage, { width: stageWidth, height: stageHeight }]}
            onLayout={(event) =>
              setFrame({
                width: event.nativeEvent.layout.width,
                height: event.nativeEvent.layout.height,
              })
            }
          >
            {story?.kind === "image" ? (
              <Image
                source={{ uri: story.uri }}
                resizeMode="cover"
                style={StyleSheet.absoluteFill}
              />
            ) : story?.kind === "video" ? (
              <View style={styles.videoPlaceholder}>
                <Ionicons name="play-circle" size={56} color="#fff" />
              </View>
            ) : (
              <View style={styles.empty}>
                <Ionicons name="images-outline" size={40} color="#fff" />
                <Text style={styles.emptyText}>
                  Adicione Stories às configurações
                </Text>
              </View>
            )}
            {story ? (
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={handleStagePress}
                accessibilityLabel={
                  placingLink
                    ? "Toque no local onde deseja posicionar o sticker"
                    : "Toque à direita para avançar ou à esquerda para voltar"
                }
              />
            ) : null}
            {story && highlight?.linkUrl ? (
              <Pressable
                disabled={placingLink}
                onPress={(event) => {
                  event.stopPropagation();
                  if (!placingLink && highlight.linkUrl)
                    void Linking.openURL(highlight.linkUrl);
                }}
                style={[
                  styles.linkSticker,
                  {
                    left: `${(story.linkX ?? 0.5) * 100}%`,
                    top: `${(story.linkY ?? 0.75) * 100}%`,
                    transform: [{ translateX: -50 }, { translateY: -15 }],
                  },
                ]}
              >
                <Ionicons name="link-outline" size={15} color="#438CC5" />
                <Text numberOfLines={1} style={styles.linkText}>
                  {highlight.linkText || "Abrir link"}
                </Text>
              </Pressable>
            ) : null}
            {placingLink ? (
              <View pointerEvents="none" style={styles.placeHint}>
                <Text style={styles.placeHintText}>
                  Toque no local do sticker
                </Text>
              </View>
            ) : null}
            <Pressable
              onPress={() => setShowMosaic(true)}
              style={styles.gridButton}
              accessibilityLabel="Abrir mosaico de Stories"
            >
              <Ionicons name="grid-outline" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>

        <View style={styles.controls}>
          <Pressable
            onPress={() => onIndexChange(Math.max(0, storyIndex - 1))}
            style={styles.control}
          >
            <Ionicons name="chevron-back" size={20} color="#fff" />
            <Text style={styles.controlText}>Anterior</Text>
          </Pressable>
          <Pressable onPress={onTogglePlace} style={styles.control}>
            <Ionicons
              name={placingLink ? "checkmark-circle-outline" : "move-outline"}
              size={19}
              color="#fff"
            />
            <Text style={styles.controlText}>
              {placingLink ? "Cancelar posição" : "Mover CTA"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() =>
              onIndexChange(Math.min(stories.length - 1, storyIndex + 1))
            }
            style={styles.control}
          >
            <Text style={styles.controlText}>Próximo</Text>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </Pressable>
        </View>
        <Text style={[styles.footer, { color: colors.muted }]}>
          {stories.length
            ? `${storyIndex + 1} / ${stories.length} · mais antigo primeiro`
            : "Pressione e segure o círculo para configurar"}
        </Text>
        {showMosaic ? (
          <View style={styles.mosaicOverlay}>
            <View style={styles.mosaicHeader}>
              <Pressable onPress={() => setShowMosaic(false)} hitSlop={8}>
                <Ionicons name="chevron-back" size={23} color="#fff" />
              </Pressable>
              <Text numberOfLines={1} style={styles.mosaicTitle}>
                Mosaico · {highlight?.title || "Stories"}
              </Text>
              <View style={styles.mosaicColumns}>
                {([2, 3] as const).map((columns) => (
                  <Pressable
                    key={columns}
                    onPress={() => setMosaicColumns(columns)}
                    style={[
                      styles.mosaicColumnButton,
                      mosaicColumns === columns && styles.mosaicColumnButtonActive,
                    ]}
                  >
                    <Text style={styles.mosaicColumnText}>{columns}×{columns}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <ScrollView contentContainerStyle={styles.mosaicGrid}>
              {stories.map((item, storyPosition) => (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    onIndexChange(storyPosition);
                    setShowMosaic(false);
                  }}
                  style={[
                    styles.mosaicCell,
                    {
                      width: mosaicCellWidth,
                      aspectRatio: 9 / 16,
                      borderColor: storyPosition === storyIndex ? colors.accent : "#4B4350",
                    },
                  ]}
                >
                  {item.kind === "image" ? (
                    <Image source={{ uri: item.uri }} style={styles.mosaicImage} resizeMode="cover" />
                  ) : (
                    <View style={styles.mosaicVideo}>
                      <Ionicons name="play-circle" size={22} color="#fff" />
                    </View>
                  )}
                  <View style={styles.mosaicNumber}>
                    <Text style={styles.mosaicNumberText}>{storyPosition + 1}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#100E12" },
  header: {
    minHeight: 54,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  headerTitle: { color: "#fff", fontSize: 15, fontWeight: "800" },
  headerSub: { color: "#C5BEC9", fontSize: 10, marginTop: 2 },
  profileHeader: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  profileAvatar: { width: 32, height: 32, borderRadius: 16 },
  profileAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#695E70",
  },
  followButton: {
    minHeight: 34,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  followText: { color: "#75B9F0", fontSize: 12, fontWeight: "800" },
  progress: {
    flexDirection: "row",
    gap: 3,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  progressTrack: {
    flex: 1,
    height: 2,
    backgroundColor: "#FFFFFF55",
    overflow: "hidden",
  },
  progressFill: { width: 0, height: "100%", backgroundColor: "#FFFFFFBB" },
  progressActive: { width: "100%" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  stage: { overflow: "hidden", backgroundColor: "#28242C", borderRadius: 7 },
  videoPlaceholder: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#28242C",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  emptyText: { color: "#fff", textAlign: "center", fontSize: 13 },
  linkSticker: {
    position: "absolute",
    minHeight: 32,
    maxWidth: "86%",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#80BCEC",
    borderRadius: 18,
    backgroundColor: "#F9FCFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  linkText: {
    color: "#438CC5",
    fontSize: 11,
    fontWeight: "700",
    maxWidth: 220,
  },
  placeHint: {
    position: "absolute",
    top: 12,
    alignSelf: "center",
    backgroundColor: "#0009",
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 18,
  },
  placeHintText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  controls: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  control: {
    minHeight: 42,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  controlText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  gridButton: {
    position: "absolute",
    left: 10,
    bottom: 10,
    width: 38,
    height: 38,
    borderRadius: 20,
    backgroundColor: "#0009",
    alignItems: "center",
    justifyContent: "center",
  },
  mosaicOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    backgroundColor: "#100E12",
    paddingTop: 12,
  },
  mosaicHeader: {
    minHeight: 50,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  mosaicTitle: { color: "#fff", flex: 1, fontSize: 14, fontWeight: "800" },
  mosaicColumns: { flexDirection: "row", gap: 5 },
  mosaicColumnButton: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: "#322B37" },
  mosaicColumnButtonActive: { backgroundColor: "#765066" },
  mosaicColumnText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  mosaicGrid: { padding: 16, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  mosaicCell: { borderWidth: 2, borderRadius: 7, overflow: "hidden", backgroundColor: "#28242C" },
  mosaicImage: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  mosaicVideo: { flex: 1, alignItems: "center", justifyContent: "center" },
  mosaicNumber: { position: "absolute", left: 5, bottom: 5, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 7, backgroundColor: "#0009" },
  mosaicNumberText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  footer: {
    textAlign: "center",
    fontSize: 10,
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 2,
  },
});
