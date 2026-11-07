import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  calculateSplitCrops,
  SPLIT_GRIDS,
  SPLIT_TILE_HEIGHT,
  SPLIT_TILE_WIDTH,
  type SplitGrid,
} from "@/lib/mosaika/image-split";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

type SplitColors = {
  bg: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  soft: string;
};
type SourceImage = { uri: string; width: number; height: number };
type Props = {
  visible: boolean;
  colors: SplitColors;
  onClose: () => void;
  onSaved: (message: string) => void;
};

const clamp = (value: number) => Math.max(-1, Math.min(1, value));

function cropInBrowser(
  uri: string,
  crop: { originX: number; originY: number; width: number; height: number },
) {
  return new Promise<string>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = SPLIT_TILE_WIDTH;
      canvas.height = SPLIT_TILE_HEIGHT;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("O navegador não conseguiu processar a imagem."));
        return;
      }
      context.drawImage(
        image,
        crop.originX,
        crop.originY,
        crop.width,
        crop.height,
        0,
        0,
        SPLIT_TILE_WIDTH,
        SPLIT_TILE_HEIGHT,
      );
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Não foi possível exportar um corte."));
            return;
          }
          resolve(URL.createObjectURL(blob));
        },
        "image/jpeg",
        0.94,
      );
    };
    image.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    image.src = uri;
  });
}

export function MosaikaSplitter({ visible, colors, onClose, onSaved }: Props) {
  const [source, setSource] = useState<SourceImage | null>(null);
  const [grid, setGrid] = useState<SplitGrid>(SPLIT_GRIDS[5]!);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{
    x: number;
    y: number;
    pan: { x: number; y: number };
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const screen = Dimensions.get("window");
  const canvasRatio =
    (grid.cols * SPLIT_TILE_WIDTH) / (grid.rows * SPLIT_TILE_HEIGHT);
  const maxPreviewWidth = Math.min(screen.width - 54, 340);
  const maxPreviewHeight = Math.min(screen.height * 0.46, 410);
  const previewWidth = Math.max(
    110,
    Math.min(maxPreviewWidth, maxPreviewHeight * canvasRatio),
  );
  const previewHeight = previewWidth / canvasRatio;
  const sourceScale = source
    ? Math.max(previewWidth / source.width, previewHeight / source.height)
    : 1;
  const renderedWidth = source ? source.width * sourceScale : previewWidth;
  const renderedHeight = source ? source.height * sourceScale : previewHeight;
  const overflowX = Math.max(0, renderedWidth - previewWidth);
  const overflowY = Math.max(0, renderedHeight - previewHeight);
  const imageLeft = -overflowX * (0.5 + pan.x / 2);
  const imageTop = -overflowY * (0.5 + pan.y / 2);

  const chooseImage = async () => {
    setError("");
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("Permita acesso às fotos para escolher uma imagem.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 1,
        exif: false,
      });
      const asset = result.assets?.[0];
      if (result.canceled || !asset) return;
      if (!asset.width || !asset.height) {
        setError("Não consegui ler as dimensões dessa imagem.");
        return;
      }
      setSource({
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
      });
      setPan({ x: 0, y: 0 });
    } catch {
      setError("Não foi possível abrir a galeria.");
    }
  };

  const saveTiles = async () => {
    if (!source || busy) return;
    setBusy(true);
    setError("");
    const total = grid.cols * grid.rows;
    let saved = 0;
    try {
      if (Platform.OS !== "web") {
        const gallery = await import("expo-media-library");
        const permission = await gallery.requestPermissionsAsync(true, [
          "photo",
        ]);
        if (!permission.granted) {
          setError("A permissão para salvar fotos na galeria foi negada.");
          return;
        }
        if (!FileSystem.cacheDirectory)
          throw new Error(
            "A pasta temporária do aparelho não está disponível.",
          );
      }
      const [imageLibrary, legacyGallery] =
        Platform.OS === "web"
          ? [null, null]
          : await Promise.all([
              import("expo-image-manipulator"),
              import("expo-media-library/legacy"),
            ]);

      const crops = calculateSplitCrops(
        source.width,
        source.height,
        grid,
        pan.x,
        pan.y,
      );
      const runId = Date.now().toString(36);

      for (let row = 0; row < grid.rows; row += 1) {
        for (let col = 0; col < grid.cols; col += 1) {
          const number = row * grid.cols + col + 1;
          setProgress(`Cortando e salvando ${number} de ${total}…`);
          const crop = crops[number - 1]!;
          let outputUri: string;
          if (Platform.OS === "web") {
            outputUri = await cropInBrowser(source.uri, crop);
          } else {
            const context = imageLibrary!.ImageManipulator.manipulate(
              source.uri,
            )
              .crop(crop)
              .resize({ width: SPLIT_TILE_WIDTH, height: SPLIT_TILE_HEIGHT });
            const rendered = await context.renderAsync();
            const output = await rendered.saveAsync({
              format: imageLibrary!.SaveFormat.JPEG,
              compress: 0.94,
            });
            outputUri = output.uri;
          }
          const filename = `Mosaika_foto_${number}_${runId}.jpg`;

          if (Platform.OS === "web") {
            if (typeof document === "undefined")
              throw new Error("O navegador não permite baixar esta imagem.");
            const link = document.createElement("a");
            link.href = outputUri;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(outputUri), 15_000);
          } else {
            const namedUri = `${FileSystem.cacheDirectory}${filename}`;
            try {
              await FileSystem.copyAsync({ from: outputUri, to: namedUri });
              await legacyGallery!.saveToLibraryAsync(namedUri);
            } finally {
              await FileSystem.deleteAsync(namedUri, {
                idempotent: true,
              }).catch(() => undefined);
            }
          }
          saved += 1;
        }
      }
      const message =
        `${saved} imagens salvas como Mosaika_foto_1…${saved}. ` +
        "A numeração segue da esquerda para a direita e de cima para baixo. Para montar o mosaico no perfil, publique os arquivos de baixo para cima e da direita para a esquerda.";
      onSaved(message);
      setSource(null);
      onClose();
    } catch (cause) {
      setError(
        `${saved} de ${total} imagens foram salvas. ${cause instanceof Error ? cause.message : "Não foi possível concluir o lote."}`,
      );
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const close = () => {
    if (busy) return;
    setError("");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
    >
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
        <View style={[styles.header, { borderColor: colors.border }]}>
          <Pressable onPress={close} disabled={busy} hitSlop={10}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>
            Dividir a Imagem
          </Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Proporção da grade
          </Text>
          <View style={styles.gridOptions}>
            {SPLIT_GRIDS.map((item) => {
              const selected =
                item.cols === grid.cols && item.rows === grid.rows;
              return (
                <Pressable
                  key={`${item.cols}x${item.rows}`}
                  onPress={() => setGrid(item)}
                  style={[
                    styles.gridOption,
                    {
                      borderColor: selected ? colors.accent : colors.border,
                      backgroundColor: selected ? colors.soft : colors.card,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.gridOptionText,
                      { color: selected ? colors.accent : colors.text },
                    ]}
                  >
                    {item.cols}×{item.rows}
                  </Text>
                  <Text style={[styles.gridOptionSub, { color: colors.muted }]}>
                    {item.cols * item.rows}{" "}
                    {item.cols * item.rows === 1 ? "bloco" : "blocos"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.previewHeading}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Enquadramento
            </Text>
            {source ? (
              <Text style={[styles.dimensions, { color: colors.muted }]}>
                1080 × 1350 px por bloco
              </Text>
            ) : null}
          </View>
          {source ? (
            <View
              style={[
                styles.previewFrame,
                {
                  width: previewWidth,
                  height: previewHeight,
                  alignSelf: "center",
                  backgroundColor: colors.border,
                },
              ]}
              onStartShouldSetResponder={() => Boolean(source)}
              onResponderGrant={(event) =>
                setDragStart({
                  x: event.nativeEvent.pageX,
                  y: event.nativeEvent.pageY,
                  pan,
                })
              }
              onResponderMove={(event) => {
                if (!dragStart) return;
                const dx = event.nativeEvent.pageX - dragStart.x;
                const dy = event.nativeEvent.pageY - dragStart.y;
                setPan({
                  x:
                    overflowX > 1
                      ? clamp(dragStart.pan.x - dx / (overflowX / 2))
                      : 0,
                  y:
                    overflowY > 1
                      ? clamp(dragStart.pan.y - dy / (overflowY / 2))
                      : 0,
                });
              }}
              onResponderRelease={() => setDragStart(null)}
              onResponderTerminate={() => setDragStart(null)}
            >
              <Image
                source={{ uri: source.uri }}
                resizeMode="stretch"
                style={{
                  position: "absolute",
                  width: renderedWidth,
                  height: renderedHeight,
                  left: imageLeft,
                  top: imageTop,
                }}
              />
              {Array.from({ length: grid.cols - 1 }, (_, index) => (
                <View
                  key={`v${index}`}
                  pointerEvents="none"
                  style={[
                    styles.guideVertical,
                    { left: `${((index + 1) / grid.cols) * 100}%` },
                  ]}
                />
              ))}
              {Array.from({ length: grid.rows - 1 }, (_, index) => (
                <View
                  key={`h${index}`}
                  pointerEvents="none"
                  style={[
                    styles.guideHorizontal,
                    { top: `${((index + 1) / grid.rows) * 100}%` },
                  ]}
                />
              ))}
              {Array.from({ length: grid.cols * grid.rows }, (_, index) => {
                const row = Math.floor(index / grid.cols);
                const col = index % grid.cols;
                return (
                  <View
                    key={`label${index}`}
                    pointerEvents="none"
                    style={[
                      styles.tileNumber,
                      {
                        left: `${(col / grid.cols) * 100 + 2}%`,
                        top: `${(row / grid.rows) * 100 + 2}%`,
                      },
                    ]}
                  >
                    <Text style={styles.tileNumberText}>{index + 1}</Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <Pressable
              onPress={chooseImage}
              style={[
                styles.pickBox,
                { borderColor: colors.border, backgroundColor: colors.card },
              ]}
            >
              <Ionicons name="image-outline" size={28} color={colors.accent} />
              <Text style={[styles.pickText, { color: colors.text }]}>
                Escolher uma foto
              </Text>
              <Text style={[styles.helpText, { color: colors.muted }]}>
                JPG ou PNG da galeria
              </Text>
            </Pressable>
          )}

          {source ? (
            <>
              <Text
                style={[
                  styles.helpText,
                  { color: colors.muted, textAlign: "center" },
                ]}
              >
                Arraste a imagem para ajustar. Mantemos a proporção; partes fora
                da grade serão cortadas.
              </Text>
              <Pressable
                onPress={chooseImage}
                disabled={busy}
                style={[styles.changeButton, { borderColor: colors.border }]}
              >
                <Ionicons
                  name="images-outline"
                  size={17}
                  color={colors.accent}
                />
                <Text style={[styles.changeText, { color: colors.text }]}>
                  Trocar imagem
                </Text>
              </Pressable>
            </>
          ) : null}

          <Text
            style={[
              styles.note,
              {
                color: colors.muted,
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            {grid.cols * grid.rows} cortes em sequência. Guias pontilhadas
            marcam os limites exatos. A numeração é da esquerda para a direita,
            de cima para baixo; ao montar o mosaico no Instagram, publique na
            ordem inversa. Não há detecção automática de rostos/texto nesta
            versão — confira o enquadramento antes de salvar.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {busy ? (
            <View style={styles.progress}>
              <ActivityIndicator color={colors.accent} />
              <Text style={[styles.helpText, { color: colors.muted }]}>
                {progress}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        <View
          style={[
            styles.footer,
            { borderColor: colors.border, backgroundColor: colors.bg },
          ]}
        >
          <Pressable
            onPress={close}
            disabled={busy}
            style={[styles.cancelButton, { borderColor: colors.border }]}
          >
            <Text style={[styles.cancelText, { color: colors.text }]}>
              Cancelar
            </Text>
          </Pressable>
          <Pressable
            onPress={saveTiles}
            disabled={!source || busy}
            style={[
              styles.saveButton,
              {
                backgroundColor:
                  source && !busy ? colors.accent : colors.border,
              },
            ]}
          >
            <Ionicons name="download-outline" size={17} color="#fff" />
            <Text style={styles.saveText}>
              Salvar {grid.cols * grid.rows} cortes
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    minHeight: 54,
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 16, fontWeight: "800" },
  body: { padding: 18, paddingBottom: 24, gap: 14 },
  sectionTitle: { fontSize: 13, fontWeight: "800" },
  gridOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gridOption: {
    width: "31.5%",
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 5,
  },
  gridOptionText: { fontSize: 13, fontWeight: "800" },
  gridOptionSub: { fontSize: 9, marginTop: 2 },
  previewHeading: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  dimensions: { fontSize: 10 },
  previewFrame: { overflow: "hidden", position: "relative", borderRadius: 3 },
  guideVertical: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderLeftWidth: 1,
    borderStyle: "dashed",
    borderColor: "#FFFFFF",
    opacity: 0.95,
  },
  guideHorizontal: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: "#FFFFFF",
    opacity: 0.95,
  },
  tileNumber: {
    position: "absolute",
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: "#0009",
    alignItems: "center",
    justifyContent: "center",
  },
  tileNumberText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  pickBox: {
    minHeight: 160,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  pickText: { fontSize: 14, fontWeight: "800" },
  helpText: { fontSize: 10, lineHeight: 15 },
  changeButton: {
    alignSelf: "center",
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  changeText: { fontSize: 11, fontWeight: "700" },
  note: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 11,
    fontSize: 10,
    lineHeight: 15,
  },
  error: { color: "#C43D59", fontSize: 11, fontWeight: "600" },
  progress: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingVertical: 6,
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 12 : 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
  },
  cancelButton: {
    minHeight: 44,
    minWidth: 94,
    borderWidth: 1,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { fontSize: 12, fontWeight: "700" },
  saveButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },
  saveText: { color: "#fff", fontSize: 12, fontWeight: "800" },
});
