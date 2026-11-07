import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { createAudioPlayer } from "expo-audio";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MosaikaMark, MosaikaWordmark } from "@/components/mosaika-brand";
import { MosaikaPostTile } from "@/components/mosaika-post-tile";
import { MosaikaSplitter } from "@/components/mosaika-splitter";
import { MosaikaStoryViewer } from "@/components/mosaika-story-viewer";
import {
  DEFAULT_HIGHLIGHTS,
  DEFAULT_STATE,
  EMPTY_PROFILE,
  STORE_KEY,
  type MosaikaHighlight,
  type MosaikaMedia,
  type MosaikaPost,
  type PostAspect,
  type GridAspect,
  type PersistedMosaika,
  type PostKind,
  type ThemeKey,
} from "@/lib/mosaika/model";

const API = String(
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)
    ?.apiBaseUrl ??
    process.env.EXPO_PUBLIC_API_BASE_URL ??
    "",
).replace(/\/$/, "");
const SESSION = "mosaika:session";
const TABS = [
  { id: "all", icon: "grid-outline", label: "Grade de publicações" },
  { id: "reel", icon: "film-outline", label: "Reels" },
  { id: "shared", icon: "repeat-outline", label: "Republicações" },
  { id: "tagged", icon: "id-card-outline", label: "Imagens marcadas" },
] as const;
const POST_FORMATS: {
  aspect: PostAspect;
  label: string;
  resolution: string;
  width: number;
  height: number;
  icon: string;
}[] = [
  {
    aspect: "portrait",
    label: "4:5 · Recomendado",
    resolution: "1080×1350 px",
    width: 1080,
    height: 1350,
    icon: "phone-portrait-outline",
  },
  {
    aspect: "square",
    label: "1:1",
    resolution: "1080×1080 px",
    width: 1080,
    height: 1080,
    icon: "square-outline",
  },
];
const makeId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
function centeredCropRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
) {
  const targetRatio = targetWidth / targetHeight;
  const sourceRatio = sourceWidth / sourceHeight;
  const cropWidth =
    sourceRatio > targetRatio
      ? Math.max(
          1,
          Math.min(
            sourceWidth,
            Math.round(sourceHeight * targetRatio),
          ),
        )
      : sourceWidth;
  const cropHeight =
    sourceRatio > targetRatio
      ? sourceHeight
      : Math.max(
          1,
          Math.min(
            sourceHeight,
            Math.round(sourceWidth / targetRatio),
          ),
        );
  return {
    originX: Math.floor((sourceWidth - cropWidth) / 2),
    originY: Math.floor((sourceHeight - cropHeight) / 2),
    width: cropWidth,
    height: cropHeight,
  };
}
const isScheduleValid = (date: Date) =>
  Number.isFinite(date.getTime()) && date.getTime() >= Date.now() + 120_000;
const sorted = (posts: MosaikaPost[]) =>
  [...posts].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.pinned)
      return (b.pinnedAt ?? b.createdAt).localeCompare(
        a.pinnedAt ?? a.createdAt,
      );
    if (a.order !== undefined && b.order !== undefined && a.order !== b.order)
      return a.order - b.order;
    return b.createdAt.localeCompare(a.createdAt);
  });
function palette(theme: ThemeKey) {
  if (theme === "dark")
    return {
      bg: "#151219",
      card: "#211D24",
      text: "#F8F3F7",
      muted: "#ACA3AF",
      border: "#37313A",
      accent: "#E978A8",
      soft: "#392533",
    };
  if (theme === "blue")
    return {
      bg: "#F2F7FB",
      card: "#FFF",
      text: "#202934",
      muted: "#78899A",
      border: "#DAE6F0",
      accent: "#789FC5",
      soft: "#E7F0F8",
    };
  if (theme === "green")
    return {
      bg: "#F2F8F4",
      card: "#FFF",
      text: "#202A24",
      muted: "#78877C",
      border: "#DCE9DF",
      accent: "#79A88A",
      soft: "#E7F2E9",
    };
  if (theme === "pink")
    return {
      bg: "#FFF5F8",
      card: "#FFFFFF",
      text: "#4A2535",
      muted: "#9B7584",
      border: "#F0D9E2",
      accent: "#C96A91",
      soft: "#FBE7EF",
    };
  if (theme === "cream")
    return {
      bg: "#FFF9ED",
      card: "#FFFDF7",
      text: "#4B3928",
      muted: "#9B8871",
      border: "#EDE0C8",
      accent: "#B88752",
      soft: "#F7EEDB",
    };
  if (theme === "brown")
    return {
      bg: "#F5EEE8",
      card: "#FFFDFC",
      text: "#3F2A20",
      muted: "#8B6D5B",
      border: "#E3D1C4",
      accent: "#8B5E3C",
      soft: "#EEDDD0",
    };
  return {
    bg: "#FFF",
    card: "#FFF",
    text: "#221D24",
    muted: "#8D858E",
    border: "#EEE9EF",
    accent: "#CB4C87",
    soft: "#FBF1F6",
  };
}
type Panel =
  | "menu"
  | "create"
  | "detail"
  | "highlight"
  | "edit"
  | "stats"
  | "insights"
  | "story"
  | "";

export default function HomeScreen() {
  const [state, setState] = useState<PersistedMosaika>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);
  const [panel, setPanel] = useState<Panel>("");
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");
  const [chosen, setChosen] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [organizeMode, setOrganizeMode] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [postId, setPostId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [caption, setCaption] = useState("");
  const [captionEdit, setCaptionEdit] = useState("");
  const [bioText, setBioText] = useState("");
  const [bioLinksDraft, setBioLinksDraft] = useState<string[]>(["", "", "", "", ""]);
  const [editingCaption, setEditingCaption] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [storyIndex, setStoryIndex] = useState(0);
  const [placingStoryLink, setPlacingStoryLink] = useState(false);
  const [followersDraft, setFollowersDraft] = useState("");
  const [followingDraft, setFollowingDraft] = useState("");
  const [playingMusicPostId, setPlayingMusicPostId] = useState<string | null>(
    null,
  );
  const audioPlayerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(
    null,
  );
  const [dateTime, setDateTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [splitterVisible, setSplitterVisible] = useState(false);
  const [notice, setNotice] = useState("");
  const [username, setUsername] = useState("");
  const [followers, setFollowers] = useState("—");
  const [mediaCount, setMediaCount] = useState<number | null>(null);
  const [metaConfigured, setMetaConfigured] = useState(false);
  const colors = palette(state.theme);
  const width = Dimensions.get("window").width;
  const avatarSize = 82;
  const gridGap = 2;
  const gridWidth = width;
  const tileWidth = Math.max(0, (gridWidth - gridGap * 2) / 3);
  const post = state.posts.find((item) => item.id === postId) ?? null;
  const highlight =
    state.highlights.find((item) => item.id === highlightId) ?? null;
  const selectedFormat =
    POST_FORMATS.find((item) => item.aspect === state.aspect) ?? POST_FORMATS[0]!;
  const postAspect =
    post?.media[0]?.width && post.media[0].height
      ? post.media[0].width / post.media[0].height
      : selectedFormat.width / selectedFormat.height;
  const displayedFollowers =
    state.profile.followersCount !== undefined
      ? state.profile.followersCount.toLocaleString("pt-BR")
      : followers;
  const displayedFollowing =
    state.profile.followingCount !== undefined
      ? state.profile.followingCount.toLocaleString("pt-BR")
      : "—";
  const posts = useMemo(
    () =>
      sorted(
        state.posts.filter(
          (item) =>
            (showHidden ? item.hidden : !item.hidden) &&
            (tab === "all" || (tab === "reel" && item.kind === "reel")),
        ),
      ),
    [state.posts, tab, showHidden],
  );
  const gridPosts = useMemo(
    () => posts.filter((item) => item.media?.some((media) => Boolean(media.uri))),
    [posts],
  );
  const update = useCallback(
    (fn: (current: PersistedMosaika) => PersistedMosaika) =>
      setState((current) => fn(current)),
    [],
  );
  const openStatsEditor = () => {
    setFollowersDraft(
      state.profile.followersCount?.toString() ??
        (followers === "—" ? "" : followers.replace(/\D/g, "")),
    );
    setFollowingDraft(state.profile.followingCount?.toString() ?? "");
    setPanel("stats");
  };
  const saveStats = () => {
    const readCount = (value: string) => {
      const digits = value.replace(/\D/g, "");
      return digits ? Number(digits) : undefined;
    };
    update((current) => ({
      ...current,
      profile: {
        ...current.profile,
        followersCount: readCount(followersDraft),
        followingCount: readCount(followingDraft),
      },
    }));
    setPanel("");
    setNotice("Números salvos para exibição local.");
  };

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORE_KEY)
      .then((raw) => {
        if (!alive) return;
        if (raw) {
          try {
            const saved = JSON.parse(raw) as Partial<PersistedMosaika>;
            const savedPosts = Array.isArray(saved.posts)
              ? saved.posts.filter(
                  (item) =>
                    !item.id?.startsWith("grid-test-") &&
                    !item.media?.some((media) =>
                      media.uri?.startsWith("mosaika-test://"),
                    ),
                )
              : [];
            setState({
              ...DEFAULT_STATE,
              ...saved,
              aspect: saved.aspect === "square" ? "square" : "portrait",
              gridAspect: "portrait45",
              aspectVersion: 4,
              profile: { ...EMPTY_PROFILE, ...saved.profile },
              posts: savedPosts,
              highlights: saved.highlights?.length
                ? saved.highlights.slice(0, 10)
                : DEFAULT_HIGHLIGHTS,
              musicByPost: saved.musicByPost ?? {},
            });
          } catch {
            setState(DEFAULT_STATE);
          }
        }
        setReady(true);
      })
      .catch(() => setReady(true));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (ready)
      AsyncStorage.setItem(STORE_KEY, JSON.stringify(state)).catch(() =>
        setNotice("Não foi possível salvar no aparelho."),
      );
  }, [ready, state]);
  useEffect(
    () => () => {
      audioPlayerRef.current?.remove();
      audioPlayerRef.current = null;
    },
    [],
  );
  useEffect(() => {
    if (panel === "detail" && postId) return;
    audioPlayerRef.current?.pause();
    audioPlayerRef.current?.remove();
    audioPlayerRef.current = null;
    setPlayingMusicPostId(null);
  }, [panel, postId]);
  const getSession = useCallback(
    () =>
      Platform.OS === "web"
        ? Promise.resolve(null)
        : SecureStore.getItemAsync(SESSION),
    [],
  );
  const saveSession = useCallback(
    (token: string) => SecureStore.setItemAsync(SESSION, token),
    [],
  );
  const refreshMeta = useCallback(
    async (token?: string) => {
      const auth = token ?? (await getSession());
      if (!API || !auth) return;
      const headers = { Authorization: `Bearer ${auth}` };
      const response = await fetch(`${API}/api/mosaika/me`, { headers });
      if (!response.ok)
        throw new Error("Não foi possível carregar a conta conectada.");
      const profile = (await response.json()) as {
        username: string;
        profilePictureUrl?: string;
        followersCount?: number;
        followingCount?: number;
        mediaCount?: number;
      };
      setUsername(profile.username ?? "");
      if (profile.followersCount != null)
        setFollowers(profile.followersCount.toLocaleString("pt-BR"));
      if (profile.mediaCount != null) setMediaCount(profile.mediaCount);
      update((current) => ({
        ...current,
        profile: {
          ...current.profile,
          connected: true,
          username: profile.username,
          avatarUrl: profile.profilePictureUrl,
          followingCount: profile.followingCount,
        },
      }));
      try {
        const statusResponse = await fetch(`${API}/api/mosaika/posts/status`, {
          headers,
        });
        if (statusResponse.ok) {
          const statusBody = (await statusResponse.json()) as {
            posts?: {
              id: string;
              status: string;
              remoteId?: string | null;
              scheduledAt?: string | null;
              publishedAt?: string | null;
            }[];
          };
          const statuses = new Map(
            (statusBody.posts ?? []).map((item) => [item.id, item]),
          );
          update((current) => ({
            ...current,
            posts: current.posts.map((post) => {
              const remote = statuses.get(post.id);
              if (!remote) return post;
              return {
                ...post,
                publishStatus: remote.status as MosaikaPost["publishStatus"],
                remoteId: remote.remoteId ?? post.remoteId,
                scheduledAt:
                  remote.status === "scheduled"
                    ? (remote.scheduledAt ?? post.scheduledAt)
                    : undefined,
                publishedAt: remote.publishedAt ?? post.publishedAt,
              };
            }),
          }));
          if (
            statusBody.posts?.some((item) => item.status === "review_required")
          )
            setNotice(
              "Uma publicação teve resposta incerta da Meta. Confira o Instagram antes de tentar novamente.",
            );
          else if (statusBody.posts?.some((item) => item.status === "failed"))
            setNotice(
              "Um agendamento falhou antes da publicação. Corrija o problema e agende novamente.",
            );
        }
      } catch {
        /* Cached publication statuses remain available offline. */
      }
      try {
        const feedResponse = await fetch(`${API}/api/mosaika/feed`, {
          headers,
        });
        if (feedResponse.ok) {
          const feed = (await feedResponse.json()) as {
            id: string;
            kind: PostKind;
            caption?: string;
            createdAt: string;
            permalink?: string;
            media: { id: string; uri: string; kind: "image" | "video" }[];
          }[];
          const remotePosts: MosaikaPost[] = feed.map((item) => ({
            id: `ig-${item.id}`,
            remoteId: item.id,
            remotePermalink: item.permalink,
            kind: item.kind,
            caption: item.caption ?? "",
            media: item.media,
            createdAt: item.createdAt,
            pinned: false,
            hidden: false,
            saved: false,
          }));
          update((current) => ({
            ...current,
            posts: sorted([
              ...remotePosts,
              ...current.posts.filter((local) => !local.remoteId),
            ]),
          }));
        }
      } catch {
        /* Cached profile remains available when the feed endpoint is unavailable. */
      }
    },
    [getSession, update],
  );
  useEffect(() => {
    if (API)
      fetch(`${API}/api/mosaika/meta/status`)
        .then(async (response) => {
          if (response.ok)
            setMetaConfigured(
              Boolean(
                ((await response.json()) as { configured?: boolean })
                  .configured,
              ),
            );
        })
        .catch(() => undefined);
    if (ready)
      getSession().then((token) =>
        token ? refreshMeta(token).catch(() => undefined) : undefined,
      );
  }, [getSession, ready, refreshMeta]);

  const connect = async () => {
    if (!metaConfigured) {
      setNotice(
        "A integração Meta aguarda a configuração do app. Você pode seguir organizando rascunhos locais.",
      );
      return;
    }
    if (Platform.OS === "web") {
      setNotice(
        "Para proteger sua sessão, conecte a Meta pelo aplicativo instalado. O Preview web permanece em modo local.",
      );
      return;
    }
    if (!API) {
      setNotice("Backend Meta ainda não está ativo.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const returnUri = Linking.createURL("instagram-auth");
      const verifier = Array.from(
        await Crypto.getRandomBytesAsync(32),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");
      const digest = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        verifier,
        { encoding: Crypto.CryptoEncoding.BASE64 },
      );
      const codeChallenge = digest
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
      const response = await fetch(`${API}/api/mosaika/meta/connect-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnUri, codeChallenge }),
      });
      const body = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !body.url)
        throw new Error(body.error ?? "Configure o app Meta para conectar.");
      const result = await WebBrowser.openAuthSessionAsync(body.url, returnUri);
      if (result.type === "success" && result.url) {
        const query = new URL(result.url).searchParams;
        if (query.get("error")) throw new Error("Autorização Meta cancelada.");
        const ticket = query.get("ticket");
        if (!ticket) throw new Error("Retorno OAuth incompleto.");
        const sessionResponse = await fetch(`${API}/api/mosaika/meta/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticket, verifier }),
        });
        const sessionBody = (await sessionResponse.json()) as {
          session?: string;
          error?: string;
        };
        if (!sessionResponse.ok || !sessionBody.session)
          throw new Error(
            sessionBody.error ?? "Não foi possível proteger a sessão.",
          );
        const token = sessionBody.session;
        await saveSession(token);
        await refreshMeta(token);
        setNotice("Conta profissional conectada pela Meta.");
      }
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Falha na conexão Meta.",
      );
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async () => {
    const token = await getSession();
    if (token && API) {
      try {
        const response = await fetch(`${API}/api/mosaika/disconnect`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok)
          throw new Error("Não foi possível cancelar os agendamentos remotos.");
      } catch (error) {
        setNotice(
          error instanceof Error ? error.message : "Falha ao desconectar.",
        );
        return;
      }
    }
    if (Platform.OS !== "web") await SecureStore.deleteItemAsync(SESSION);
    setUsername("");
    update((s) => ({
      ...s,
      profile: {
        ...s.profile,
        connected: false,
        username: undefined,
        avatarUrl: undefined,
      },
      posts: s.posts.map((post) => ({
        ...post,
        scheduledAt: undefined,
        ...(post.publishStatus === "scheduled" ||
        post.publishStatus === "scheduling"
          ? { publishStatus: "cancelled" as const }
          : {}),
      })),
    }));
    setNotice("Conta desconectada neste app.");
  };

  const chooseMedia = async (postKind: PostKind) => {
    setBusy(true);
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setNotice("Permita acesso à biblioteca para escolher mídia.");
        return;
      }
      const isVideo = postKind === "reel";
      const isPanorama = postKind === "panorama";
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: isVideo ? ["videos"] : ["images"],
        allowsMultipleSelection:
          postKind === "post" || postKind === "carousel",
        selectionLimit:
          postKind === "post" || postKind === "carousel" ? 10 : 1,
        allowsEditing: false,
        aspect:
          isPanorama
            ? [9, 16]
            : state.aspect === "landscape"
            ? [1080, 566]
            : state.aspect === "portrait34"
              ? [3, 4]
              : state.aspect === "portrait"
                ? [4, 5]
                : [1, 1],
        quality: 0.92,
        exif: false,
      });
      if (result.canceled || !result.assets.length) return;
      const media: MosaikaMedia[] = [];
      for (const asset of result.assets) {
        let uri = asset.uri;
        let mediaWidth = asset.width;
        let mediaHeight = asset.height;
        media.push({
          id: makeId(),
          uri,
          kind: asset.type === "video" ? "video" : "image",
          width: mediaWidth,
          height: mediaHeight,
          name: asset.fileName ?? undefined,
        });
      }
      const newPost: MosaikaPost = {
        id: makeId(),
        kind: isVideo
          ? "reel"
          : result.assets.length > 1
            ? "carousel"
            : postKind,
        media,
        caption,
        createdAt: new Date().toISOString(),
        pinned: false,
        hidden: false,
        saved: false,
      };
      update((s) => ({
        ...s,
        posts: sorted([
          ...(postKind === "post" && media.length > 1
            ? media.map((singleMedia) => ({
                ...newPost,
                id: makeId(),
                kind: "post" as const,
                media: [singleMedia],
              }))
            : [newPost]),
          ...s.posts,
        ]).map((item, index) => ({ ...item, order: index })),
      }));
      setPanel("");
      setNotice("");
    } catch {
      setNotice("Não foi possível abrir a biblioteca.");
    } finally {
      setBusy(false);
    }
  };
  const replacePostMedia = async (item: MosaikaPost, mediaIndex: number) => {
    setBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setNotice("Permita acesso à biblioteca para trocar a imagem.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: false,
        allowsEditing: false,
        quality: 0.92,
        exif: false,
      });
      const asset = result.canceled ? undefined : result.assets[0];
      if (!asset) return;
      update((current) => ({
        ...current,
        posts: current.posts.map((postItem) =>
          postItem.id !== item.id
            ? postItem
            : {
                ...postItem,
                media: postItem.media.map((media, index) =>
                  index === mediaIndex
                    ? {
                        ...media,
                        id: makeId(),
                        uri: asset.uri,
                        kind: "image" as const,
                        width: asset.width,
                        height: asset.height,
                        name: asset.fileName ?? media.name,
                      }
                    : media,
                ),
              },
        ),
      }));
      setNotice("Imagem substituída.");
    } catch {
      setNotice("Não foi possível trocar a imagem.");
    } finally {
      setBusy(false);
    }
  };
  const chooseMusic = async (item: MosaikaPost) => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: true,
      });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if (!asset) return;
      if (Platform.OS === "web") {
        setNotice(
          "Selecione a faixa no app instalado para salvá-la neste post.",
        );
        return;
      }
      const extension =
        asset.name
          .split(".")
          .pop()
          ?.replace(/[^a-z0-9]/gi, "") || "audio";
      const directory = FileSystem.documentDirectory;
      if (!directory) throw new Error("Armazenamento local indisponível.");
      const uri = `${directory}mosaika-${item.id}-${Date.now()}.${extension}`;
      await FileSystem.copyAsync({ from: asset.uri, to: uri });
      update((current) => ({
        ...current,
        posts: current.posts.map((post) =>
          post.id === item.id
            ? { ...post, musicName: asset.name, musicUri: uri }
            : post,
        ),
        musicByPost: { ...current.musicByPost, [item.id]: asset.name },
      }));
      setNotice(
        "Faixa vinculada somente a esta publicação e salva no aparelho.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Não foi possível selecionar a música.",
      );
    }
  };
  const togglePostMusic = (item: MosaikaPost) => {
    if (!item.musicUri) return;
    if (playingMusicPostId === item.id) {
      audioPlayerRef.current?.pause();
      audioPlayerRef.current?.remove();
      audioPlayerRef.current = null;
      setPlayingMusicPostId(null);
      return;
    }
    audioPlayerRef.current?.remove();
    const player = createAudioPlayer(item.musicUri);
    audioPlayerRef.current = player;
    player.play();
    setPlayingMusicPostId(item.id);
  };
  const saveCaptionEdit = () => {
    if (!post) return;
    update((current) => ({
      ...current,
      posts: current.posts.map((item) =>
        item.id === post.id ? { ...item, caption: captionEdit } : item,
      ),
    }));
    setEditingCaption(false);
    setNotice(
      post.remoteId
        ? "Legenda atualizada apenas no Mosaika; a API não sincroniza esta edição no Instagram."
        : "Legenda salva no rascunho local.",
    );
  };
  const togglePin = (item: MosaikaPost) => {
    const pins = state.posts.filter((p) => p.pinned);
    const savePin = (replaceId?: string) =>
      update((s) => ({
        ...s,
        posts: sorted(
          s.posts.map((p) =>
            p.id === replaceId
              ? { ...p, pinned: false, pinnedAt: undefined }
              : p.id === item.id
                ? { ...p, pinned: true, pinnedAt: new Date().toISOString() }
                : p,
          ),
        ),
      }));
    if (item.pinned)
      update((s) => ({
        ...s,
        posts: sorted(
          s.posts.map((p) =>
            p.id === item.id ? { ...p, pinned: false, pinnedAt: undefined } : p,
          ),
        ),
      }));
    else if (pins.length < 3) savePin();
    else {
      const oldest = [...pins].sort((a, b) =>
        (a.pinnedAt ?? a.createdAt).localeCompare(b.pinnedAt ?? b.createdAt),
      )[0];
      if (Platform.OS === "web") {
        if (
          typeof window !== "undefined" &&
          window.confirm("Há 3 fixados. Substituir o mais antigo?")
        )
          savePin(oldest.id);
      } else
        Alert.alert("Limite de 3 fixados", "Substituir o mais antigo?", [
          { text: "Cancelar", style: "cancel" },
          { text: "Substituir", onPress: () => savePin(oldest.id) },
        ]);
    }
    setPanel("");
  };
  const movePost = useCallback(
    (id: string, delta: number) =>
      update((s) => {
        const items = sorted(s.posts);
        const from = items.findIndex((p) => p.id === id),
          to = Math.max(0, Math.min(items.length - 1, from + delta));
        if (from < 0 || from === to || items[from].pinned !== items[to].pinned)
          return s;
        const [moving] = items.splice(from, 1);
        items.splice(to, 0, moving);
        return {
          ...s,
          posts: items.map((p, index) => ({ ...p, order: index })),
        };
      }),
    [update],
  );
  const setReminder = async (item: MosaikaPost) => {
    const date = new Date(dateTime.replace(" ", "T"));
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
      setNotice("Use uma data futura: AAAA-MM-DD HH:MM.");
      return;
    }
    try {
      if (Platform.OS !== "web") {
        const permission = await Notifications.requestPermissionsAsync();
        if (!permission.granted) {
          setNotice(
            "Ative notificações do Mosaika nas configurações do aparelho.",
          );
          return;
        }
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Hora de postar",
            body: item.caption || "Seu lembrete Mosaika chegou.",
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date,
          },
        });
      }
      update((s) => ({
        ...s,
        posts: s.posts.map((p) =>
          p.id === item.id ? { ...p, reminderAt: date.toISOString() } : p,
        ),
      }));
      setPanel("");
      setNotice("Lembrete salvo.");
    } catch {
      setNotice("Falha ao criar notificação.");
    }
  };
  const updateHighlightMedia = async (item: MosaikaHighlight) => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setNotice("Permita acesso à biblioteca para adicionar Stories.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsMultipleSelection: true,
        selectionLimit: 20,
      });
      if (result.canceled) return;
      setBusy(true);
      const addedAt = Date.now();
      const media: MosaikaMedia[] = [];
      for (const [index, asset] of result.assets.entries()) {
        let uri = asset.uri;
        let mediaWidth = asset.width;
        let mediaHeight = asset.height;
        if (asset.type !== "video") {
          if (!asset.width || !asset.height)
            throw new Error("Não foi possível ler as dimensões de uma imagem.");
          const crop = centeredCropRect(asset.width, asset.height, 1080, 1920);
          const rendered = await ImageManipulator.ImageManipulator.manipulate(
            asset.uri,
          )
            .crop(crop)
            .resize({ width: 1080, height: 1920 })
            .renderAsync();
          const prepared = await rendered.saveAsync({
            format: ImageManipulator.SaveFormat.JPEG,
            compress: 0.92,
          });
          uri = prepared.uri;
          mediaWidth = 1080;
          mediaHeight = 1920;
        }
        media.push({
          id: makeId(),
          uri,
          kind: asset.type === "video" ? "video" : "image",
          width: mediaWidth,
          height: mediaHeight,
          name: asset.fileName ?? undefined,
          createdAt: new Date(addedAt + index).toISOString(),
          linkX: 0.5,
          linkY: 0.75,
        });
      }
      update((s) => ({
        ...s,
        highlights: s.highlights.map((h) =>
          h.id === item.id ? { ...h, media: [...h.media, ...media] } : h,
        ),
      }));
      setNotice(
        "Stories adicionados; cópias das imagens preparadas em 1080×1920 px (9:16). Os originais e vídeos permanecem intactos.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Não foi possível preparar as imagens do destaque.",
      );
    } finally {
      setBusy(false);
    }
  };
  const openHighlight = (item: MosaikaHighlight) => {
    setHighlightId(item.id);
    setStoryIndex(0);
    setPlacingStoryLink(false);
    setPanel("story");
  };
  const openHighlightSettings = (item: MosaikaHighlight) => {
    setHighlightId(item.id);
    setText(item.title);
    setLinkText(item.linkText ?? "");
    setLinkUrl(item.linkUrl ?? "");
    setPanel("highlight");
  };
  const chooseHighlightCover = async (item: MosaikaHighlight) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.92,
    });
    if (result.canceled || !result.assets[0]) return;
    update((current) => ({
      ...current,
      highlights: current.highlights.map((highlight) =>
        highlight.id === item.id
          ? { ...highlight, coverUri: result.assets[0].uri }
          : highlight,
      ),
    }));
  };
  const placeStoryLink = (mediaId: string, x: number, y: number) => {
    if (!highlight) return;
    update((current) => ({
      ...current,
      highlights: current.highlights.map((item) =>
        item.id === highlight.id
          ? {
              ...item,
              media: item.media.map((media) =>
                media.id === mediaId ? { ...media, linkX: x, linkY: y } : media,
              ),
            }
          : item,
      ),
    }));
  };
  const openPost = (item: MosaikaPost, actions = false) => {
    setPostId(item.id);
    setDateTime("");
    setCarouselIndex(0);
    setCaptionEdit(item.caption ?? "");
    setEditingCaption(false);
    audioPlayerRef.current?.remove();
    audioPlayerRef.current = null;
    setPlayingMusicPostId(null);
    if (item.musicUri) {
      const player = createAudioPlayer(item.musicUri);
      audioPlayerRef.current = player;
      player.play();
      setPlayingMusicPostId(item.id);
    }
    setPanel(actions ? "detail" : "detail");
  };
  const navigatePreviewPost = useCallback(
    (direction: -1 | 1) => {
      const ordered = sorted(state.posts.filter((item) => !item.hidden));
      const currentIndex = ordered.findIndex((item) => item.id === postId);
      const next = ordered[currentIndex + direction];
      if (!next) return;
      setPostId(next.id);
      setCarouselIndex(0);
    },
    [postId, state.posts],
  );
  const saveHighlight = () => {
    if (!highlight) return;
    update((s) => ({
      ...s,
      highlights: s.highlights.map((h) =>
        h.id === highlight.id
          ? {
              ...h,
              title: text.trim() || "Destaque",
              linkText: linkText.trim() || undefined,
              linkUrl: linkUrl.trim() || undefined,
            }
          : h,
      ),
    }));
    setPanel("");
  };
  const deleteSelected = async () => {
    const deleting = state.posts.filter((item) => chosen.includes(item.id));
    const scheduled = deleting.filter(
      (item) => item.scheduledAt && !item.remoteId,
    );
    if (scheduled.length) {
      const token = await getSession();
      if (!token || !API) {
        setNotice(
          "Não consegui cancelar um agendamento remoto; os itens foram mantidos.",
        );
        return;
      }
      setBusy(true);
      try {
        for (const item of scheduled) {
          const response = await fetch(`${API}/api/mosaika/cancel`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ id: item.id }),
          });
          if (!response.ok)
            throw new Error(
              "Não foi possível cancelar o agendamento; os itens foram mantidos.",
            );
        }
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "Falha ao cancelar o agendamento.",
        );
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    update((s) => ({
      ...s,
      posts: s.posts.filter((p) => !chosen.includes(p.id)),
    }));
    setChosen([]);
    setSelectMode(false);
    setPanel("");
  };
  const saveNickname = () => {
    update((s) => ({
      ...s,
      profile: {
        ...s.profile,
        nickname: text.trim() || "Minha conta",
        bio: bioText.trim().slice(0, 150) || undefined,
        bioLinks: bioLinksDraft
          .map((url) => url.trim())
          .filter(Boolean)
          .slice(0, 5)
          .map((url) => ({ url })),
      },
    }));
    setPanel("");
  };
  const publish = async (schedule = false) => {
    if (!post) {
      if (chosen.length) {
        setNotice("Confirme a exclusão no aviso exibido.");
        return;
      }
      setNotice("Abra uma publicação primeiro.");
      return;
    }
    if (post.remoteId) {
      setNotice(
        "Esta publicação já está no Instagram. As ações de curtir/comentar não são enviadas pelo Mosaika.",
      );
      return;
    }
    const token = await getSession();
    if (!token || !API || !state.profile.connected) {
      setNotice(
        "A conexão Meta ainda está pendente. Você pode continuar organizando rascunhos sem ela.",
      );
      return;
    }
    let scheduledAt: string | undefined;
    if (schedule) {
      const parsed = new Date(dateTime.replace(" ", "T"));
      if (!isScheduleValid(parsed)) {
        setNotice(
          "Escolha uma data pelo menos 2 minutos no futuro (AAAA-MM-DD HH:MM).",
        );
        return;
      }
      scheduledAt = parsed.toISOString();
    }
    setBusy(true);
    try {
      const uploaded: MosaikaMedia[] = [];
      for (const media of post.media) {
        if (media.storageKey) {
          uploaded.push(media);
          continue;
        }
        const info = await FileSystem.getInfoAsync(media.uri);
        const maxBytes = (media.kind === "video" ? 16 : 8) * 1024 * 1024;
        if (!info.exists || !info.size || info.size > maxBytes)
          throw new Error(
            media.kind === "video"
              ? "Cada vídeo precisa ter até 16 MB."
              : "Cada JPEG precisa ter até 8 MB.",
          );
        const mime =
          media.kind === "video"
            ? "video/mp4"
            : /\.jpe?g($|[?#])/i.test(`${media.name ?? ""} ${media.uri}`)
              ? "image/jpeg"
              : "";
        if (!mime)
          throw new Error(
            "A API Meta aceita JPEG para imagens e MP4 para Reels. Este formato continua salvo como rascunho local.",
          );
        const base64 = await FileSystem.readAsStringAsync(media.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const uploadResponse = await fetch(`${API}/api/mosaika/media`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            base64,
            contentType: mime,
            filename: media.name ?? "media",
          }),
        });
        const uploadResult = (await uploadResponse.json()) as {
          key?: string;
          error?: string;
        };
        if (!uploadResponse.ok || !uploadResult.key)
          throw new Error(uploadResult.error ?? "Falha ao enviar mídia.");
        uploaded.push({ ...media, storageKey: uploadResult.key });
      }
      update((s) => ({
        ...s,
        posts: s.posts.map((p) =>
          p.id === post.id ? { ...p, media: uploaded } : p,
        ),
      }));
      const response = await fetch(`${API}/api/mosaika/publish`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: post.id,
          kind: post.kind,
          caption: post.caption,
          mediaKeys: uploaded.map((media) => media.storageKey),
          ...(scheduledAt ? { scheduledAt } : {}),
        }),
      });
      const result = (await response.json()) as {
        status?: string;
        error?: string;
        remoteId?: string;
        scheduledAt?: string;
      };
      if (!response.ok) {
        if (result.status)
          update((s) => ({
            ...s,
            posts: s.posts.map((p) =>
              p.id === post.id
                ? {
                    ...p,
                    publishStatus:
                      result.status as MosaikaPost["publishStatus"],
                  }
                : p,
            ),
          }));
        throw new Error(
          result.error ?? "A Meta não conseguiu publicar este conteúdo.",
        );
      }
      update((s) => ({
        ...s,
        posts: s.posts.map((p) =>
          p.id === post.id
            ? {
                ...p,
                publishStatus:
                  result.status === "scheduled" ? "scheduled" : "published",
                ...(result.status === "scheduled"
                  ? { scheduledAt: result.scheduledAt ?? scheduledAt }
                  : {
                      scheduledAt: undefined,
                      publishedAt: new Date().toISOString(),
                      remoteId: result.remoteId,
                    }),
              }
            : p,
        ),
      }));
      setNotice(
        result.status === "scheduled"
          ? `Agendado para ${new Date(result.scheduledAt ?? scheduledAt!).toLocaleString("pt-BR")}.`
          : "Publicação confirmada pela API Meta.",
      );
      setPanel("");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Falha ao enviar para a Meta.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!ready)
    return (
      <SafeAreaView style={[styles.loading, { backgroundColor: colors.bg }]}>
        <MosaikaMark size={48} />
        <ActivityIndicator color={colors.accent} style={{ marginTop: 15 }} />
      </SafeAreaView>
    );
  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.bg }]}
      edges={["top", "left", "right"]}
    >
      <View style={[styles.topbar, { borderColor: colors.border }]}>
        <Pressable onPress={() => setPanel("menu")}>
          <Ionicons name="menu-outline" size={26} color={colors.text} />
        </Pressable>
        <MosaikaWordmark light={state.theme === "dark"} />
        <View style={styles.topActions}>
          <Pressable
            onPress={() => {
              setCaption("");
              setPanel("create");
            }}
          >
            <Ionicons
              name="add"
              size={26}
              color={state.theme === "dark" ? "#8B2F5C" : colors.text}
            />
          </Pressable>
          <Pressable
            accessibilityLabel="Ativar organização da grade"
            onPress={() => setOrganizeMode((value) => !value)}
            style={styles.organizeButton}
          >
            <View
              style={[
                styles.organizeGlyph,
                { borderColor: organizeMode ? colors.accent : colors.text },
              ]}
            >
              {Array.from({ length: 4 }, (_, index) => (
                <View
                  key={index}
                  style={[
                    styles.organizeCell,
                    {
                      backgroundColor:
                        organizeMode && index === 0 ? colors.accent : colors.text,
                      opacity: organizeMode && index !== 0 ? 0.55 : 1,
                    },
                  ]}
                />
              ))}
            </View>
          </Pressable>
          <Pressable
            onPress={() => {
              setSelectMode(!selectMode);
              setChosen([]);
            }}
          >
            <Ionicons
              name={selectMode ? "checkmark-circle" : "checkbox-outline"}
              size={22}
              color={colors.text}
            />
          </Pressable>
        </View>
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 30 }}
      >
        <View style={styles.profileLine}>
          <View
            style={[
              styles.avatarRing,
              {
                width: avatarSize + 8,
                height: avatarSize + 8,
                borderRadius: (avatarSize + 8) / 2,
              },
            ]}
          >
            {state.profile.avatarUrl ? (
              <Image
                source={{ uri: state.profile.avatarUrl }}
                style={{
                  width: avatarSize,
                  height: avatarSize,
                  borderRadius: avatarSize / 2,
                }}
              />
            ) : (
              <View
                style={[
                  styles.avatarEmpty,
                  {
                    width: avatarSize,
                    height: avatarSize,
                    borderRadius: avatarSize / 2,
                    backgroundColor: colors.soft,
                  },
                ]}
              >
                <MosaikaMark size={Math.min(64, avatarSize * 0.25)} />
              </View>
            )}
          </View>
          <View style={styles.profileStats}>
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={[styles.statNum, { color: colors.text }]}>
                  {state.posts.length}
                </Text>
                <Text style={[styles.statLabel, { color: colors.muted }]}>
                  posts
                </Text>
              </View>
              <View style={styles.stat}>
                <Text style={[styles.statNum, { color: colors.text }]}>
                  {displayedFollowers}
                </Text>
                <Text style={[styles.statLabel, { color: colors.muted }]}>
                  seguidores
                </Text>
              </View>
              <View style={styles.stat}>
                <Text style={[styles.statNum, { color: colors.text }]}>
                  {displayedFollowing}
                </Text>
                <Text style={[styles.statLabel, { color: colors.muted }]}>
                  seguindo
                </Text>
              </View>
            </View>
            <Pressable onPress={openStatsEditor} style={styles.editStatsButton}>
              <Ionicons name="pencil-outline" size={12} color={colors.accent} />
              <Text style={[styles.editStatsText, { color: colors.accent }]}>
                Editar números
              </Text>
            </Pressable>
            {state.profile.followersCount !== undefined ||
            state.profile.followingCount !== undefined ? (
              <Text style={[styles.mutedSmall, { color: colors.muted }]}>
                Valores editados são locais; não sincronizam com o Instagram
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.nameLine}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.nickname, { color: colors.text }]}>
              {state.profile.nickname}
              {state.profile.verified ? "  ✓" : ""}
            </Text>
            <Text style={[styles.username, { color: colors.muted }]}>
              {state.profile.connected
                ? `@${username || state.profile.username || "instagram"}`
                : "Seu perfil, em mosaico."}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              setText(state.profile.nickname);
              setBioText(state.profile.bio ?? "");
              setBioLinksDraft(
                Array.from({ length: 5 }, (_, index) =>
                  state.profile.bioLinks?.[index]?.url ?? "",
                ),
              );
              setPanel(state.profile.connected ? "edit" : "menu");
            }}
            style={[
              styles.nameButton,
              {
                borderColor: colors.border,
                  backgroundColor: state.profile.connected
                    ? colors.card
                    : state.theme === "dark"
                      ? "#8B2F5C"
                      : colors.text,
              },
            ]}
          >
            <Text
              style={[
                styles.nameButtonText,
                { color: state.profile.connected ? colors.text : "#fff" },
              ]}
            >
              {state.profile.connected ? "Editar nome" : "Adicionar conta"}
            </Text>
          </Pressable>
        </View>
        {state.profile.bio ? (
          <View style={styles.bioBlock}>
            <Text style={[styles.bio, { color: colors.text }]}>
              {state.profile.bio}
            </Text>
            <View style={styles.bioLinks}>
              {(state.profile.bioLinks ?? []).map((link) => (
                <Pressable key={link.url} onPress={() => Linking.openURL(link.url)}>
                  <Text style={[styles.bioLink, { color: colors.accent }]}> 
                    {link.label || link.url}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.highlights}
        >
          {state.highlights.slice(0, 10).map((h, i) => (
            <Pressable
              key={h.id}
              onPress={() => openHighlight(h)}
              onLongPress={() => openHighlightSettings(h)}
              delayLongPress={350}
              style={styles.highlightItem}
            >
              <View style={[styles.ring, { borderColor: colors.border }]}>
                <View style={[styles.circle, { backgroundColor: h.color }]}>
                  {h.coverUri || h.media[0]?.uri ? (
                    <Image
                      source={{ uri: h.coverUri || h.media[0].uri }}
                      style={styles.highlightImage}
                    />
                  ) : (
                    <Ionicons
                      name={i === 0 ? "add" : "sparkles-outline"}
                      size={i === 0 ? 25 : 19}
                      color={colors.accent}
                    />
                  )}
                </View>
              </View>
              <Text
                numberOfLines={1}
                style={[styles.highlightTitle, { color: colors.text }]}
              >
                {h.title || "Novo"}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={[styles.tabs, { borderColor: colors.border }]}>
          {TABS.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              accessibilityRole="tab"
              accessibilityLabel={t.label}
              style={styles.tabButton}
            >
              <View style={styles.tabIconTarget}>
                {t.id === "all" ? (
                  <View style={styles.gridGlyph}>
                    {Array.from({ length: 9 }, (_, index) => (
                      <View
                        key={index}
                        style={[
                          styles.gridGlyphCell,
                          { backgroundColor: tab === t.id ? colors.text : colors.muted },
                        ]}
                      />
                    ))}
                  </View>
                ) : t.id === "reel" ? (
                  <View
                    style={[
                      styles.reelGlyph,
                      { borderColor: tab === t.id ? colors.text : colors.muted },
                    ]}
                  >
                    <Ionicons
                      name="play"
                      size={14}
                      color={tab === t.id ? colors.text : colors.muted}
                    />
                  </View>
                ) : t.id === "shared" ? (
                  <Ionicons
                    name="repeat-outline"
                    size={28}
                    color={tab === t.id ? colors.text : colors.muted}
                  />
                ) : (
                  <View
                    style={[
                      styles.taggedGlyph,
                      { borderColor: tab === t.id ? colors.text : colors.muted },
                    ]}
                  >
                    <Ionicons
                      name="person-outline"
                      size={17}
                      color={tab === t.id ? colors.text : colors.muted}
                    />
                  </View>
                )}
              </View>
              <View
                style={[
                  styles.underline,
                  {
                    backgroundColor: tab === t.id ? colors.text : "transparent",
                  },
                ]}
              />
            </Pressable>
          ))}
        </View>
        {selectMode && (
          <View style={[styles.selectBar, { backgroundColor: colors.soft }]}>
            <Text style={[styles.mutedSmall, { color: colors.text, flex: 1 }]}>
              {chosen.length} selecionado(s)
            </Text>
            <Pressable
              onPress={() => {
                setPostId(null);
                setPanel("detail");
              }}
            >
              <Text style={{ color: colors.accent, fontWeight: "800" }}>
                Apagar
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setSelectMode(false);
                setChosen([]);
              }}
            >
              <Ionicons name="close" size={19} color={colors.text} />
            </Pressable>
          </View>
        )}
        {notice ? (
          <Pressable
            onPress={() => setNotice("")}
            style={[styles.notice, { backgroundColor: colors.soft }]}
          >
            <Text style={[styles.noticeText, { color: colors.text }]}>
              {notice}
            </Text>
            <Ionicons name="close" size={15} color={colors.muted} />
          </Pressable>
        ) : null}
        {gridPosts.length ? (
          <FlatList
            data={gridPosts}
            numColumns={3}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            initialNumToRender={12}
            maxToRenderPerBatch={12}
            updateCellsBatchingPeriod={40}
            removeClippedSubviews={Platform.OS === "android"}
            style={{ width: gridWidth, backgroundColor: colors.bg }}
            columnWrapperStyle={{ gap: gridGap }}
            contentContainerStyle={{ gap: gridGap }}
            renderItem={({ item }) => (
              <MosaikaPostTile
                post={item}
                width={tileWidth}
                aspect="portrait45"
                selected={chosen.includes(item.id)}
                selectionMode={selectMode}
                organizeMode={organizeMode}
                columns={3}
                onPress={() =>
                  selectMode
                    ? setChosen((prev) =>
                        prev.includes(item.id)
                          ? prev.filter((id) => id !== item.id)
                          : [...prev, item.id],
                      )
                    : openPost(item)
                }
                onLongPress={() => {
                  setPostId(item.id);
                  setPanel("detail");
                }}
                onMove={movePost}
              />
            )}
          />
        ) : (
          <View style={[styles.empty, { borderColor: colors.border }]}>
            <Ionicons
              name={tab === "reel" ? "play-circle-outline" : "grid-outline"}
              size={36}
              color={colors.muted}
            />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {showHidden
                ? "Nenhuma mídia oculta"
                : tab === "reel"
                  ? "Nenhum Reel ainda"
                  : tab === "shared"
                    ? "Compartilhados não sincronizados"
                    : tab === "tagged"
                      ? "Fotos marcadas não sincronizadas"
                      : "Sua grade começa aqui"}
            </Text>
            <Text
              style={[
                styles.mutedSmall,
                { color: colors.muted, textAlign: "center" },
              ]}
            >
              {tab === "shared" || tab === "tagged"
                ? "Esta seção não é sincronizada pela integração disponível. Abra o Instagram para conferir."
                : "Adicione uma mídia do aparelho para montar seu mosaico."}
            </Text>
            <Pressable
              onPress={() =>
                tab === "shared" || tab === "tagged"
                  ? Linking.openURL("https://www.instagram.com/")
                  : setPanel("create")
              }
              style={[styles.darkButton, { backgroundColor: colors.text }]}
            >
              <Text style={styles.darkButtonText}>
                {tab === "shared" || tab === "tagged"
                  ? "Abrir Instagram"
                  : "Adicionar mídia"}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={Boolean(panel && panel !== "story")}
        transparent
        animationType="slide"
        onRequestClose={() => setPanel("")}
      >
        <View style={[styles.shade, panel === "menu" && styles.menuShade]}>
          <Pressable
            style={[styles.outside, panel === "menu" && styles.outsideDrawer]}
            onPress={() => setPanel("")}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={[
              styles.sheet,
              { backgroundColor: colors.card },
              panel === "menu" && styles.drawer,
            ]}
          >
            <View style={styles.handle} />
            <View
              style={[styles.sheetTitleRow, { borderColor: colors.border }]}
            >
              <Text style={[styles.sheetTitle, { color: colors.text }]}>
                {panel === "create"
                  ? "Nova publicação"
                  : panel === "menu"
                    ? "Mosaika"
                    : panel === "highlight"
                      ? highlight?.title || "Destaque"
                      : panel === "edit"
                        ? "Editar nome"
                        : panel === "detail"
                          ? post
                            ? "Publicação"
                            : "Apagar selecionados"
                          : panel === "stats"
                            ? "Editar contagens"
                            : panel === "insights"
                              ? "Insights"
                              : ""}
              </Text>
              <Pressable
                onPress={() => {
                  audioPlayerRef.current?.pause();
                  audioPlayerRef.current?.remove();
                  audioPlayerRef.current = null;
                  setPlayingMusicPostId(null);
                  setPanel("");
                }}
              >
                <Ionicons name="close" size={21} color={colors.muted} />
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.sheetBody}
            >
              {panel === "create" && (
                <>
                  <Text style={[styles.mutedSmall, { color: colors.muted }]}>
                    Escolha o formato da mídia.
                  </Text>
                  {(
                    [
                      ["post", "Adicionar Post", "image-outline"],
                      ["carousel", "Adicionar Carrossel", "copy-outline"],
                      ["split", "Dividir a Imagem", "grid-outline"],
                      ["reel", "Adicionar Reel", "play-outline"],
                      ["panorama", "Imagem Panorâmica", "scan-outline"],
                    ] as const
                  ).map(([value, label, icon]) => (
                    <Pressable
                      key={value}
                      style={[styles.menuRow, { borderColor: colors.border }]}
                      onPress={() => {
                        if (value === "split") {
                          setPanel("");
                          setSplitterVisible(true);
                        } else {
                          void chooseMedia(value);
                        }
                      }}
                    >
                      <Ionicons
                        name={icon as never}
                        size={19}
                        color={colors.accent}
                      />
                      <Text
                        style={[
                          styles.menuText,
                          { color: colors.text, flex: 1 },
                        ]}
                      >
                        {label}
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={colors.muted}
                      />
                    </Pressable>
                  ))}
                  <TextInput
                    value={caption}
                    onChangeText={setCaption}
                    placeholder="Legenda opcional"
                    placeholderTextColor={colors.muted}
                    multiline
                    style={[
                      styles.input,
                      {
                        borderColor: colors.border,
                        color: colors.text,
                        minHeight: 65,
                      },
                    ]}
                  />
                  {busy && <ActivityIndicator color={colors.accent} />}
                </>
              )}
              {panel === "menu" && (
                <>
                  <View
                    style={[
                      styles.sideNotice,
                      { backgroundColor: colors.soft },
                    ]}
                  >
                    <Ionicons
                      name="logo-instagram"
                      size={18}
                      color={colors.accent}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.menuText, { color: colors.text }]}>
                        {state.profile.connected
                          ? "Instagram conectado"
                          : "Integração Meta"}
                      </Text>
                      <Text
                        style={[styles.mutedSmall, { color: colors.muted }]}
                      >
                        {state.profile.connected
                          ? `@${username || state.profile.username || "conta"}`
                          : metaConfigured
                            ? "Conexão oficial disponível para conta profissional."
                            : "Configuração Meta pendente; o perfil continua local."}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => setPanel("insights")}
                    style={[styles.menuRow, { borderColor: colors.border }]}
                  >
                    <Ionicons
                      name="stats-chart-outline"
                      size={19}
                      color={colors.accent}
                    />
                    <Text
                      style={[styles.menuText, { color: colors.text, flex: 1 }]}
                    >
                      Insights
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={colors.muted}
                    />
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setText(state.profile.nickname);
                      setBioText(state.profile.bio ?? "");
                      setBioLinksDraft(
                        Array.from({ length: 5 }, (_, index) =>
                          state.profile.bioLinks?.[index]?.url ?? "",
                        ),
                      );
                      setPanel("edit");
                    }}
                    style={[styles.menuRow, { borderColor: colors.border }]}
                  >
                    <Ionicons
                      name="create-outline"
                      size={19}
                      color={colors.accent}
                    />
                    <Text
                      style={[styles.menuText, { color: colors.text, flex: 1 }]}
                    >
                      Editar bio e links
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={colors.muted}
                    />
                  </Pressable>
                  <Text style={[styles.mutedSmall, { color: colors.muted }]}> 
                    Aparência
                  </Text>
                  {(
                    [
                      ["blue", "Azul pastel", "#A8C7E5"],
                      ["green", "Verde pastel", "#A8D0B4"],
                      ["pink", "Rosa pastel", "#E9A7BE"],
                      ["cream", "Creme", "#F1D9A8"],
                      ["brown", "Marrom", "#A97A5A"],
                      ["light", "Branco", "#FFFFFF"],
                      ["dark", "Modo noturno", "#201B24"],
                    ] as const
                  ).map(([id, label, color]) => (
                    <Pressable
                      key={id}
                      onPress={() => update((s) => ({ ...s, theme: id }))}
                      style={[styles.themeRow, { borderColor: colors.border }]}
                    >
                      <View
                        style={[
                          styles.swatch,
                          {
                            backgroundColor: color,
                            borderColor: colors.border,
                          },
                        ]}
                      />
                      <Text
                        style={[
                          styles.menuText,
                          { color: colors.text, flex: 1 },
                        ]}
                      >
                        {label}
                      </Text>
                      <Ionicons
                        name={
                          state.theme === id
                            ? "checkmark-circle"
                            : "ellipse-outline"
                        }
                        size={19}
                        color={colors.accent}
                      />
                    </Pressable>
                  ))}
                  <Text style={[styles.mutedSmall, { color: colors.muted }]}>
                    Formato das novas publicações
                  </Text>
                  <View style={styles.aspectChoices}>
                    {POST_FORMATS.map((format) => {
                      const active = state.aspect === format.aspect;
                      return (
                        <Pressable
                          key={format.aspect}
                          onPress={() =>
                            update((s) => ({ ...s, aspect: format.aspect }))
                          }
                          style={[
                            styles.aspectChoice,
                            {
                              borderColor: active ? colors.accent : colors.border,
                              backgroundColor: active ? colors.soft : colors.card,
                            },
                          ]}
                        >
                          <Ionicons
                            name={format.icon as never}
                            size={21}
                            color={active ? colors.accent : colors.muted}
                          />
                          <View style={styles.aspectChoiceCopy}>
                            <Text
                              style={[
                                styles.menuText,
                                { color: colors.text },
                              ]}
                            >
                              {format.label}
                            </Text>
                            <Text
                              style={[
                                styles.aspectResolution,
                                { color: colors.muted },
                              ]}
                            >
                              {format.resolution}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Pressable
                    onPress={() => {
                      setShowHidden((value) => !value);
                      setTab("all");
                      setPanel("");
                    }}
                    style={styles.menuRow}
                  >
                    <Ionicons
                      name={showHidden ? "eye-outline" : "eye-off-outline"}
                      size={19}
                      color={colors.accent}
                    />
                    <Text
                      style={[
                        styles.menuText,
                        { color: colors.text, marginLeft: 11 },
                      ]}
                    >
                      {showHidden
                        ? "Voltar às mídias visíveis"
                        : "Ver mídias ocultas"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setSelectMode(true);
                      setPanel("");
                    }}
                    style={styles.menuRow}
                  >
                    <Ionicons
                      name="checkbox-outline"
                      size={19}
                      color={colors.accent}
                    />
                    <Text
                      style={[
                        styles.menuText,
                        { color: colors.text, marginLeft: 11 },
                      ]}
                    >
                      Selecionar várias para apagar
                    </Text>
                  </Pressable>
                  {state.profile.connected ? (
                    <Pressable onPress={disconnect} style={styles.menuRow}>
                      <Ionicons
                        name="log-out-outline"
                        size={19}
                        color="#C94D69"
                      />
                      <Text
                        style={[
                          styles.menuText,
                          { color: "#C94D69", marginLeft: 11 },
                        ]}
                      >
                        Desconectar Instagram
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => {
                        setPanel("");
                        connect();
                      }}
                      style={styles.menuRow}
                    >
                      <Ionicons
                        name="logo-instagram"
                        size={19}
                        color={colors.accent}
                      />
                      <Text
                        style={[
                          styles.menuText,
                          { color: colors.text, marginLeft: 11 },
                        ]}
                      >
                        Entrar na conta real do Instagram
                      </Text>
                    </Pressable>
                  )}
                  <Text style={[styles.mutedSmall, { color: colors.muted }]}>
                    O Mosaika nunca solicita sua senha do Instagram.
                  </Text>
                </>
              )}
              {panel === "edit" && (
                <>
                  <Text style={[styles.mutedSmall, { color: colors.muted }]}>
                    Nome local, não altera o @ do Instagram.
                  </Text>
                  <TextInput
                    value={text}
                    onChangeText={setText}
                    placeholder="Nome de exibição"
                    placeholderTextColor={colors.muted}
                    style={[
                      styles.input,
                      { borderColor: colors.border, color: colors.text },
                    ]}
                  />
                  <TextInput
                    value={bioText}
                    onChangeText={(value) => setBioText(value.slice(0, 150))}
                    placeholder="Bio (até 150 caracteres)"
                    placeholderTextColor={colors.muted}
                    multiline
                    maxLength={150}
                    style={[
                      styles.input,
                      styles.bioInput,
                      { borderColor: colors.border, color: colors.text },
                    ]}
                  />
                  {bioLinksDraft.map((value, index) => (
                    <TextInput
                      key={`bio-link-${index}`}
                      value={value}
                      onChangeText={(next) =>
                        setBioLinksDraft((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? next : item,
                          ),
                        )
                      }
                      placeholder={`Link ${index + 1} (opcional)`}
                      placeholderTextColor={colors.muted}
                      autoCapitalize="none"
                      keyboardType="url"
                      style={[
                        styles.input,
                        { borderColor: colors.border, color: colors.text },
                      ]}
                    />
                  ))}
                  <Pressable
                    onPress={saveNickname}
                    style={[
                      styles.darkButton,
                      { backgroundColor: colors.text },
                    ]}
                  >
                    <Text style={styles.darkButtonText}>Salvar</Text>
                  </Pressable>
                </>
              )}
              {panel === "stats" && (
                <>
                  <Text style={[styles.mutedSmall, { color: colors.muted }]}>
                    Valores editados são apenas para exibição local; não alteram
                    sua conta do Instagram.
                  </Text>
                  <TextInput
                    value={followersDraft}
                    onChangeText={setFollowersDraft}
                    placeholder="Seguidores"
                    keyboardType="number-pad"
                    placeholderTextColor={colors.muted}
                    style={[
                      styles.input,
                      { borderColor: colors.border, color: colors.text },
                    ]}
                  />
                  <TextInput
                    value={followingDraft}
                    onChangeText={setFollowingDraft}
                    placeholder="Seguindo"
                    keyboardType="number-pad"
                    placeholderTextColor={colors.muted}
                    style={[
                      styles.input,
                      { borderColor: colors.border, color: colors.text },
                    ]}
                  />
                  <Pressable
                    onPress={saveStats}
                    style={[
                      styles.darkButton,
                      { backgroundColor: colors.text },
                    ]}
                  >
                    <Text style={styles.darkButtonText}>Salvar números</Text>
                  </Pressable>
                </>
              )}
              {panel === "insights" && (
                <>
                  <View
                    style={[styles.metricRow, { borderColor: colors.border }]}
                  >
                    <Text style={[styles.menuText, { color: colors.text }]}>
                      Publicações no Instagram
                    </Text>
                    <Text style={[styles.statNum, { color: colors.accent }]}>
                      {mediaCount != null
                        ? mediaCount.toLocaleString("pt-BR")
                        : state.profile.connected
                          ? "—"
                          : "Conecte a conta"}
                    </Text>
                  </View>
                  <View
                    style={[styles.metricRow, { borderColor: colors.border }]}
                  >
                    <Text style={[styles.menuText, { color: colors.text }]}>
                      Seguidores reais
                    </Text>
                    <Text style={[styles.statNum, { color: colors.accent }]}>
                      {state.profile.connected ? displayedFollowers : "Conecte a conta"}
                    </Text>
                  </View>
                  <View
                    style={[styles.metricRow, { borderColor: colors.border }]}
                  >
                    <Text style={[styles.menuText, { color: colors.text }]}>
                      Seguindo real
                    </Text>
                    <Text style={[styles.statNum, { color: colors.accent }]}>
                      {state.profile.connected ? displayedFollowing : "Conecte a conta"}
                    </Text>
                  </View>
                  <Text style={[styles.mutedSmall, { color: colors.muted }]}>
                    As métricas acima são carregadas da conta Meta conectada.
                  </Text>
                </>
              )}
              {panel === "highlight" && highlight && (
                <>
                  <View style={styles.highlightPreview}>
                    <View
                      style={[
                        styles.circle,
                        styles.bigCircle,
                        { backgroundColor: highlight.color },
                      ]}
                    >
                      {highlight.coverUri || highlight.media[0]?.uri ? (
                        <Image
                          source={{
                            uri: highlight.coverUri || highlight.media[0].uri,
                          }}
                          style={styles.highlightImage}
                        />
                      ) : (
                        <Ionicons
                          name="sparkles-outline"
                          size={27}
                          color={colors.accent}
                        />
                      )}
                    </View>
                    <Text style={[styles.mutedSmall, { color: colors.muted }]}>
                      {highlight.media.length} mídia(s) no mosaico local
                    </Text>
                  </View>
                  <TextInput
                    value={text}
                    onChangeText={setText}
                    placeholder="Título do destaque"
                    placeholderTextColor={colors.muted}
                    style={[
                      styles.input,
                      { borderColor: colors.border, color: colors.text },
                    ]}
                  />
                  <TextInput
                    value={linkText}
                    onChangeText={setLinkText}
                    placeholder="Texto do link"
                    placeholderTextColor={colors.muted}
                    style={[
                      styles.input,
                      { borderColor: colors.border, color: colors.text },
                    ]}
                  />
                  <TextInput
                    value={linkUrl}
                    onChangeText={setLinkUrl}
                    placeholder="https://seulink.com"
                    autoCapitalize="none"
                    keyboardType="url"
                    placeholderTextColor={colors.muted}
                    style={[
                      styles.input,
                      { borderColor: colors.border, color: colors.text },
                    ]}
                  />
                  <Pressable
                    onPress={() => updateHighlightMedia(highlight)}
                    style={[
                      styles.outlineButton,
                      { borderColor: colors.border },
                    ]}
                  >
                    <Ionicons
                      name="images-outline"
                      size={18}
                      color={colors.accent}
                    />
                    <Text style={[styles.menuText, { color: colors.text }]}>
                      Adicionar stories ao mosaico
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => chooseHighlightCover(highlight)}
                    style={[
                      styles.outlineButton,
                      { borderColor: colors.border },
                    ]}
                  >
                    <Ionicons
                      name="square-outline"
                      size={18}
                      color={colors.accent}
                    />
                    <Text style={[styles.menuText, { color: colors.text }]}
                    >
                      Escolher capa 1:1 do destaque
                    </Text>
                  </Pressable>
                  {highlight.linkUrl ? (
                    <Pressable
                      onPress={() => Linking.openURL(highlight.linkUrl!)}
                      style={styles.linkPill}
                    >
                      <Ionicons name="link-outline" size={14} color="#5598D0" />
                      <Text style={styles.linkText}>
                        {highlight.linkText || highlight.linkUrl}
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={saveHighlight}
                    style={[
                      styles.darkButton,
                      { backgroundColor: colors.text },
                    ]}
                  >
                    <Text style={styles.darkButtonText}>Salvar destaque</Text>
                  </Pressable>
                  <Text style={[styles.mutedSmall, { color: colors.muted }]}>
                    Destaques existentes não são sincronizados automaticamente
                    pela API Meta.
                  </Text>
                </>
              )}
              {panel === "detail" && post && (
                <>
                  <View style={styles.authorRow}>
                    <View
                      style={[
                        styles.miniAvatar,
                        { backgroundColor: colors.soft },
                      ]}
                    >
                      <MosaikaMark size={18} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.menuText, { color: colors.text }]}>
                        {username ? `@${username}` : state.profile.nickname}
                      </Text>
                      <Text
                        style={[styles.mutedSmall, { color: colors.muted }]}
                      >
                        {new Date(post.createdAt).toLocaleDateString("pt-BR")}
                      </Text>
                      {post.publishStatus ? (
                        <Text
                          style={[styles.mutedSmall, { color: colors.muted }]}
                        >
                          {post.publishStatus === "scheduled"
                            ? `Agendado${post.scheduledAt ? ` para ${new Date(post.scheduledAt).toLocaleString("pt-BR")}` : ""}`
                            : post.publishStatus === "published"
                              ? "Publicado pela Meta"
                              : post.publishStatus === "review_required"
                                ? "Confira o Instagram antes de tentar novamente"
                                : post.publishStatus === "failed"
                                  ? "Falhou antes da publicação; pode agendar novamente"
                                  : post.publishStatus === "cancelled"
                                    ? "Agendamento cancelado"
                                    : post.publishStatus === "publishing"
                                      ? "Publicando"
                                      : post.publishStatus === "scheduling"
                                        ? "Criando agendamento"
                                        : "Rascunho"}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable
                      onPress={() =>
                        setNotice("Para seguir, abra o perfil no Instagram.")
                      }
                    >
                      <Text style={{ color: colors.accent, fontWeight: "800" }}>
                        Seguir
                      </Text>
                    </Pressable>
                  </View>
                  {post.media[0]?.kind === "image" ? (
                    <ScrollView
                      horizontal
                      pagingEnabled
                      showsHorizontalScrollIndicator={false}
                      onMomentumScrollEnd={(event) =>
                        setCarouselIndex(
                          Math.round(
                            event.nativeEvent.contentOffset.x /
                              Math.max(width - 36, 1),
                          ),
                        )
                      }
                      style={[styles.detailImage, { aspectRatio: postAspect }]}
                    >
                      {post.media.map((m) => (
                        <Image
                          key={m.id}
                          source={{ uri: m.uri }}
                          resizeMode="cover"
                          style={{
                            width: width - 36,
                            height: "100%",
                            backgroundColor: "transparent",
                          }}
                        />
                      ))}
                    </ScrollView>
                  ) : (
                    <View style={[styles.video, { aspectRatio: postAspect }]}>
                      <Ionicons name="play-circle" size={54} color="#fff" />
                    </View>
                  )}
                  {post.media.length > 1 && (
                    <Text
                      style={[
                        styles.mutedSmall,
                        {
                          color: colors.muted,
                          textAlign: "center",
                          paddingTop: 5,
                        },
                      ]}
                    >
                      {post.media.length} itens · deslize · {carouselIndex + 1}/
                      {post.media.length}
                    </Text>
                  )}
                  {post.media.length > 1 ? (
                    <View style={styles.pagination}>
                      {post.media.map((media, index) => (
                        <View
                          key={media.id}
                          style={[
                            styles.pageDot,
                            {
                              backgroundColor:
                                index === carouselIndex ? "#3897F0" : "#C9C9CE",
                            },
                          ]}
                        />
                      ))}
                    </View>
                  ) : null}
                  <View style={styles.social}>
                    <Pressable
                      onPress={() =>
                        update((s) => ({
                          ...s,
                          posts: s.posts.map((p) =>
                            p.id === post.id
                              ? { ...p, localLike: !p.localLike }
                              : p,
                          ),
                        }))
                      }
                    >
                      <Ionicons
                        name={post.localLike ? "heart" : "heart-outline"}
                        size={24}
                        color={post.localLike ? "#DF4D77" : colors.text}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        setNotice(
                          "Comentários reais dependem de permissões/endpoints Meta específicos.",
                        )
                      }
                    >
                      <Ionicons
                        name="chatbubble-outline"
                        size={22}
                        color={colors.text}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        Share.share({
                          message: post.remotePermalink || "Rascunho Mosaika",
                        })
                      }
                    >
                      <Ionicons
                        name="repeat-outline"
                        size={23}
                        color={colors.text}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        Share.share({
                          message: post.remotePermalink || "Rascunho Mosaika",
                        })
                      }
                    >
                      <Ionicons
                        name="paper-plane-outline"
                        size={22}
                        color={colors.text}
                      />
                    </Pressable>
                    <View style={{ flex: 1 }} />
                    <Pressable
                      onPress={() =>
                        update((s) => ({
                          ...s,
                          posts: s.posts.map((p) =>
                            p.id === post.id ? { ...p, saved: !p.saved } : p,
                          ),
                        }))
                      }
                    >
                      <Ionicons
                        name={post.saved ? "bookmark" : "bookmark-outline"}
                        size={22}
                        color={colors.text}
                      />
                    </Pressable>
                  </View>
                  {editingCaption ? (
                    <TextInput
                      value={captionEdit}
                      onChangeText={setCaptionEdit}
                      placeholder="Legenda"
                      multiline
                      placeholderTextColor={colors.muted}
                      style={[
                        styles.input,
                        styles.captionEditor,
                        { borderColor: colors.border, color: colors.text },
                      ]}
                    />
                  ) : (
                    <View style={styles.captionRow}>
                      <Text
                        style={[
                          styles.captionText,
                          { color: colors.text, flex: 1 },
                        ]}
                      >
                        <Text style={{ fontWeight: "800" }}>
                          {username || state.profile.nickname}{" "}
                        </Text>
                        {post.caption || "Adicione uma legenda."}
                      </Text>
                      <Pressable
                        onPress={() => {
                          setCaptionEdit(post.caption ?? "");
                          setEditingCaption(true);
                        }}
                        hitSlop={8}
                        accessibilityLabel="Editar legenda"
                      >
                        <Ionicons
                          name="pencil-outline"
                          size={17}
                          color={colors.accent}
                        />
                      </Pressable>
                    </View>
                  )}
                  {editingCaption ? (
                    <View style={styles.buttonRow}>
                      <Pressable
                        onPress={() => setEditingCaption(false)}
                        style={[
                          styles.outlineButton,
                          { borderColor: colors.border, flex: 1 },
                        ]}
                      >
                        <Text style={[styles.menuText, { color: colors.text }]}>
                          Cancelar
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={saveCaptionEdit}
                        style={[
                          styles.darkButton,
                          { backgroundColor: colors.text, flex: 1 },
                        ]}
                      >
                        <Text style={styles.darkButtonText}>
                          Salvar legenda
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                  <View
                    style={[styles.musicRow, { borderColor: colors.border }]}
                  >
                    <Ionicons
                      name="musical-notes-outline"
                      size={19}
                      color={colors.accent}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.menuText, { color: colors.text }]}>
                        Música deste post
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[styles.mutedSmall, { color: colors.muted }]}
                      >
                        {post.musicName || "Nenhuma faixa selecionada"}
                      </Text>
                    </View>
                    {post.musicUri ? (
                      <Pressable
                        onPress={() => togglePostMusic(post)}
                        hitSlop={8}
                      >
                        <Ionicons
                          name={
                            playingMusicPostId === post.id
                              ? "pause-circle"
                              : "play-circle"
                          }
                          size={25}
                          color={colors.accent}
                        />
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => void chooseMusic(post)}
                      hitSlop={8}
                    >
                      <Ionicons
                        name="add-circle-outline"
                        size={23}
                        color={colors.accent}
                      />
                    </Pressable>
                  </View>
                  <Text style={[styles.mutedSmall, { color: colors.muted }]}>
                    A faixa fica só neste aparelho; não é enviada pela API Meta.
                  </Text>
                  <Pressable
                    onPress={() => void replacePostMedia(post, carouselIndex)}
                    style={[styles.menuRow, { borderColor: colors.border }]}
                  >
                    <Ionicons
                      name="swap-horizontal-outline"
                      size={19}
                      color={colors.accent}
                    />
                    <Text style={[styles.menuText, { color: colors.text, flex: 1 }]}>
                      Trocar imagem pela galeria
                    </Text>
                    <Ionicons
                      name="images-outline"
                      size={18}
                      color={colors.muted}
                    />
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setCarouselIndex(0);
                      setPreviewVisible(true);
                    }}
                    style={[
                      styles.outlineButton,
                      { borderColor: colors.border },
                    ]}
                  >
                    <Ionicons
                      name="eye-outline"
                      size={17}
                      color={colors.accent}
                    />
                    <Text style={[styles.menuText, { color: colors.text }]}>
                      Prévia limpa
                    </Text>
                  </Pressable>
                  <TextInput
                    value={dateTime}
                    onChangeText={setDateTime}
                    placeholder="Lembrete: AAAA-MM-DD HH:MM"
                    placeholderTextColor={colors.muted}
                    style={[
                      styles.input,
                      {
                        borderColor: colors.border,
                        color: colors.text,
                        marginTop: 10,
                      },
                    ]}
                  />
                  <View style={styles.buttonRow}>
                    <Pressable
                      onPress={() => setReminder(post)}
                      style={[
                        styles.outlineButton,
                        { borderColor: colors.border, flex: 1 },
                      ]}
                    >
                      <Ionicons
                        name="notifications-outline"
                        size={16}
                        color={colors.accent}
                      />
                      <Text style={[styles.menuText, { color: colors.text }]}>
                        Lembrete
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => publish(true)}
                      style={[
                        styles.outlineButton,
                        { borderColor: colors.border, flex: 1 },
                      ]}
                    >
                      <Ionicons
                        name="calendar-outline"
                        size={16}
                        color={colors.accent}
                      />
                      <Text style={[styles.menuText, { color: colors.text }]}>
                        Agendar
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={busy}
                      onPress={() => publish(false)}
                      style={[
                        styles.darkButton,
                        { backgroundColor: colors.text, flex: 1 },
                      ]}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.darkButtonText}>Publicar</Text>
                      )}
                    </Pressable>
                  </View>
                  <Pressable
                    onPress={() => togglePin(post)}
                    style={[styles.menuRow, { borderColor: colors.border }]}
                  >
                    <Ionicons
                      name="pin-outline"
                      size={18}
                      color={colors.accent}
                    />
                    <Text
                      style={[styles.menuText, { color: colors.text, flex: 1 }]}
                    >
                      {post.pinned ? "Desafixar" : "Fixar (máximo 3)"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      update((s) => ({
                        ...s,
                        posts: s.posts.map((p) =>
                          p.id === post.id ? { ...p, hidden: !p.hidden } : p,
                        ),
                      }));
                      setPanel("");
                    }}
                    style={[styles.menuRow, { borderColor: colors.border }]}
                  >
                    <Ionicons
                      name="eye-off-outline"
                      size={18}
                      color={colors.accent}
                    />
                    <Text
                      style={[styles.menuText, { color: colors.text, flex: 1 }]}
                    >
                      {post.hidden ? "Mostrar" : "Ocultar mídia"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      movePost(post.id, -1);
                      setPanel("");
                    }}
                    style={[styles.menuRow, { borderColor: colors.border }]}
                  >
                    <Ionicons
                      name="arrow-up-outline"
                      size={18}
                      color={colors.accent}
                    />
                    <Text
                      style={[styles.menuText, { color: colors.text, flex: 1 }]}
                    >
                      Mover uma posição para cima
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      update((s) => ({
                        ...s,
                        posts: s.posts.filter((p) => p.id !== post.id),
                      }));
                      setPanel("");
                    }}
                    style={[styles.menuRow, { borderColor: colors.border }]}
                  >
                    <Ionicons name="trash-outline" size={18} color="#C94D69" />
                    <Text
                      style={[styles.menuText, { color: "#C94D69", flex: 1 }]}
                    >
                      Apagar mídia
                    </Text>
                  </Pressable>
                  <Text style={[styles.mutedSmall, { color: colors.muted }]}>
                    Curtidas/comentários/reposts são locais até serem suportados
                    e autorizados pela API. Nada é publicado sem confirmação.
                  </Text>
                </>
              )}
              {panel === "detail" && !post && (
                <>
                  <Text style={[styles.mutedSmall, { color: colors.muted }]}>
                    Apagar {chosen.length} mídia(s) selecionada(s)?
                  </Text>
                  <View style={styles.buttonRow}>
                    <Pressable
                      onPress={() => setPanel("")}
                      style={[
                        styles.outlineButton,
                        { flex: 1, borderColor: colors.border },
                      ]}
                    >
                      <Text style={[styles.menuText, { color: colors.text }]}>
                        Cancelar
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={deleteSelected}
                      style={[
                        styles.darkButton,
                        { flex: 1, backgroundColor: "#C94D69" },
                      ]}
                    >
                      <Text style={styles.darkButtonText}>Apagar</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      <Modal
        visible={previewVisible && Boolean(post)}
        animationType="fade"
        onRequestClose={() => setPreviewVisible(false)}
      >
        <SafeAreaView
          style={[styles.previewScreen, { backgroundColor: colors.bg }]}
        >
          <View style={[styles.previewHeader, { borderColor: colors.border }]}>
            <Text style={[styles.menuText, { color: colors.text }]}>
              Prévia da publicação
            </Text>
            <Pressable onPress={() => setPreviewVisible(false)} hitSlop={10}>
              <Ionicons name="close" size={23} color={colors.text} />
            </Pressable>
          </View>
          {post ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              scrollEventThrottle={16}
              contentContainerStyle={{ paddingBottom: 150 }}
              onScrollEndDrag={(event) => {
                const velocity = event.nativeEvent.velocity?.y ?? 0;
                if (velocity < -0.35) navigatePreviewPost(1);
                else if (velocity > 0.35) navigatePreviewPost(-1);
              }}
            >
            <>
              <View style={[styles.previewAuthor, { paddingHorizontal: 14 }]}>
                <View
                  style={[styles.miniAvatar, { backgroundColor: colors.soft }]}
                >
                  <MosaikaMark size={18} />
                </View>
                <Text
                  style={[styles.menuText, { color: colors.text, flex: 1 }]}
                >
                  {username ? `@${username}` : state.profile.nickname}
                </Text>
                <Ionicons
                  name="ellipsis-horizontal"
                  size={20}
                  color={colors.text}
                />
              </View>
              {post.media[0]?.kind === "image" ? (
                <View
                  style={{ width, alignItems: "center", justifyContent: "center" }}
                >
                  <Image
                    source={{ uri: post.media[0].uri }}
                    resizeMode="cover"
                    style={{ width, aspectRatio: postAspect, backgroundColor: "transparent" }}
                  />
                </View>
              ) : (
                <View
                  style={[styles.video, { width, aspectRatio: postAspect }]}
                >
                  <Ionicons name="play-circle" size={56} color="#fff" />
                </View>
              )}
              {post.media.length > 1 ? (
                <Text style={[styles.mutedSmall, { color: colors.muted, textAlign: "center" }]}>Carrossel · deslize na prévia para outro post</Text>
              ) : null}
              <View
                style={[
                  styles.previewCaption,
                  { paddingHorizontal: 15, paddingTop: 10 },
                ]}
              >
                <Text style={[styles.captionText, { color: colors.text }]}>
                  <Text style={{ fontWeight: "800" }}>
                    {username || state.profile.nickname}{" "}
                  </Text>
                  {post.caption}
                </Text>
              </View>
              <View style={[styles.social, { paddingHorizontal: 15 }]}>
                <Ionicons name="heart-outline" size={23} color={colors.text} />
                <Ionicons
                  name="chatbubble-outline"
                  size={21}
                  color={colors.text}
                />
                <Ionicons
                  name="paper-plane-outline"
                  size={21}
                  color={colors.text}
                />
                <View style={{ flex: 1 }} />
                <Ionicons
                  name="bookmark-outline"
                  size={21}
                  color={colors.text}
                />
              </View>
            </>
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>
      <MosaikaStoryViewer
        visible={panel === "story"}
        highlight={highlight}
        displayName={username ? `@${username}` : state.profile.nickname}
        avatarUri={state.profile.avatarUrl}
        colors={{ muted: colors.muted, accent: colors.accent }}
        index={storyIndex}
        placingLink={placingStoryLink}
        onIndexChange={setStoryIndex}
        onPlaceLink={placeStoryLink}
        onTogglePlace={() => setPlacingStoryLink((value) => !value)}
        onClose={() => setPanel("")}
        onFollow={() => {
          if (!username) {
            setNotice(
              "Conecte a conta ou abra o Instagram para seguir este perfil.",
            );
            return;
          }
          void Linking.openURL(
            `https://www.instagram.com/${encodeURIComponent(username)}/`,
          );
        }}
        onEdit={() => {
          if (highlight) openHighlightSettings(highlight);
        }}
      />
      <MosaikaSplitter
        visible={splitterVisible}
        colors={colors}
        onClose={() => setSplitterVisible(false)}
        onSaved={setNotice}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  topbar: {
    height: 55,
    paddingHorizontal: 17,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topActions: { flexDirection: "row", gap: 15, alignItems: "center" },
  profileLine: {
    paddingHorizontal: 18,
    paddingTop: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  profileStats: { flex: 1, gap: 5 },
  editStatsButton: {
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingRight: 4,
  },
  editStatsText: { fontSize: 9, fontWeight: "700" },
  avatarRing: {
    borderWidth: 1.5,
    borderColor: "#D9769F",
    padding: 2.5,
  },
  avatarEmpty: { alignItems: "center", justifyContent: "center" },
  stats: { flex: 1, flexDirection: "row", justifyContent: "space-around" },
  stat: { alignItems: "center", gap: 3 },
  statNum: { fontSize: 17, fontWeight: "800" },
  statLabel: { fontSize: 10 },
  nameLine: {
    paddingHorizontal: 18,
    paddingTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  nickname: { fontWeight: "800", fontSize: 16 },
  username: { fontSize: 11, marginTop: 3 },
  nameButton: {
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  nameButtonText: { fontSize: 11, fontWeight: "700" },
  connectHint: {
    marginHorizontal: 18,
    marginTop: 11,
    padding: 10,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  connectHintText: { flex: 1, fontSize: 11, lineHeight: 16 },
  bioLine: {
    marginHorizontal: 18,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  bio: { flex: 1, fontSize: 14, lineHeight: 18 },
  bioBlock: { marginHorizontal: 18, marginTop: 10, gap: 5 },
  bioLinks: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bioLink: { fontSize: 14, fontWeight: "700", letterSpacing: 0.2 },
  bioInput: { minHeight: 72, textAlignVertical: "top", fontSize: 14, lineHeight: 18 },
  insight: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 15,
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
  },
  sectionLine: {
    marginHorizontal: 18,
    marginTop: 21,
    marginBottom: 9,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  section: { fontSize: 14, fontWeight: "800" },
  mutedSmall: { fontSize: 10, lineHeight: 15 },
  highlights: {
    paddingHorizontal: 15,
    gap: 12,
    paddingTop: 12,
    paddingBottom: 14,
  },
  highlightItem: {
    width: 82,
    alignItems: "center",
    gap: 4,
    overflow: "visible",
  },
  ring: {
    width: 70,
    height: 70,
    borderRadius: 36,
    borderWidth: 1,
    padding: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  circle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  highlightImage: { width: "100%", height: "100%" },
  highlightTitle: {
    width: 82,
    height: 30,
    fontSize: 13,
    letterSpacing: 0.35,
    textAlign: "center",
    textAlignVertical: "center",
  },
  tabs: {
    height: 58,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
  },
  tabButton: {
    flex: 1,
    minWidth: 48,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  tabIconTarget: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  gridGlyph: {
    width: 25,
    height: 25,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 3,
  },
  gridGlyphCell: { width: 6, height: 6, borderRadius: 1 },
  organizeButton: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  organizeGlyph: { width: 22, height: 22, borderWidth: 1.5, borderRadius: 3, padding: 3, flexDirection: "row", flexWrap: "wrap", gap: 3 },
  organizeCell: { width: 6, height: 6, borderRadius: 0.8 },
  reelGlyph: {
    width: 27,
    height: 25,
    borderWidth: 2,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  taggedGlyph: {
    width: 27,
    height: 25,
    borderWidth: 2,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  underline: {
    position: "absolute",
    bottom: 0,
    height: 4,
    width: "100%",
  },
  selectBar: {
    marginHorizontal: 18,
    marginTop: 8,
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  notice: {
    marginHorizontal: 18,
    marginTop: 9,
    borderRadius: 9,
    padding: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  noticeText: { flex: 1, fontSize: 11, lineHeight: 16 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignSelf: "center",
    marginTop: 1,
  },
  empty: {
    margin: 18,
    minHeight: 230,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
    gap: 9,
  },
  emptyTitle: { fontSize: 15, fontWeight: "800" },
  darkButton: {
    minHeight: 40,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  darkButtonText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  footer: {
    marginHorizontal: 18,
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  shade: { flex: 1, backgroundColor: "#0007", justifyContent: "flex-end" },
  menuShade: { justifyContent: "flex-start", flexDirection: "row-reverse" },
  outside: { flex: 1 },
  outsideDrawer: { flex: 1 },
  drawer: {
    width: "82%",
    maxWidth: 340,
    height: "100%",
    maxHeight: "100%",
    alignSelf: "flex-start",
    borderTopLeftRadius: 0,
    borderTopRightRadius: 22,
    paddingTop: Platform.OS === "ios" ? 26 : 12,
    paddingBottom: 18,
  },
  sheet: {
    maxHeight: "90%",
    borderTopLeftRadius: 23,
    borderTopRightRadius: 23,
    paddingBottom: Platform.OS === "ios" ? 20 : 10,
  },
  handle: {
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 8,
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#BDB7C0",
  },
  sheetTitleRow: {
    minHeight: 46,
    paddingHorizontal: 19,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitle: { fontSize: 16, fontWeight: "800" },
  sheetBody: { padding: 18, gap: 10 },
  menuRow: {
    minHeight: 45,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  menuText: { fontSize: 12, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
    fontSize: 12,
  },
  themeRow: {
    minHeight: 45,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  swatch: { width: 20, height: 20, borderRadius: 11, borderWidth: 1 },
  outlineButton: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    justifyContent: "center",
  },
  highlightPreview: { alignItems: "center", gap: 7 },
  bigCircle: { width: 74, height: 74, borderRadius: 39 },
  linkPill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#75B9F0",
    backgroundColor: "#F8FCFF",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  linkText: { color: "#5598D0", fontSize: 10, fontWeight: "700" },
  authorRow: {
    paddingHorizontal: 2,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  miniAvatar: {
    width: 32,
    height: 32,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  detailImage: { width: "100%", backgroundColor: "#1C1920" },
  video: {
    backgroundColor: "#28232C",
    alignItems: "center",
    justifyContent: "center",
  },
  social: {
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
  },
  sideNotice: {
    minHeight: 58,
    borderRadius: 11,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  aspectChoices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  aspectChoice: {
    width: "48%",
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 10,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  aspectChoiceCopy: { flex: 1 },
  aspectResolution: { fontSize: 8, lineHeight: 12 },
  metricRow: {
    minHeight: 46,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
  },
  pageDot: { width: 6, height: 6, borderRadius: 3 },
  captionRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  captionEditor: { minHeight: 76, textAlignVertical: "top" },
  musicRow: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  previewScreen: { flex: 1 },
  previewHeader: {
    minHeight: 50,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  previewAuthor: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  previewCaption: { minHeight: 48 },
  captionText: { fontSize: 11, lineHeight: 17 },
  buttonRow: { flexDirection: "row", gap: 9, marginVertical: 5 },
});
