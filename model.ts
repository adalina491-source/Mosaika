export type ThemeKey =
  | "light"
  | "dark"
  | "blue"
  | "green"
  | "pink"
  | "cream"
  | "brown";
export type MediaKind = "image" | "video";
export type PostKind = "post" | "carousel" | "reel" | "panorama" | "split";
export type PostAspect = "portrait" | "portrait34" | "square" | "landscape";
export type GridAspect = "portrait45" | "portrait34" | "square";

export type MosaikaMedia = {
  id: string;
  uri: string;
  kind: MediaKind;
  createdAt?: string;
  linkX?: number;
  linkY?: number;
  storageKey?: string;
  width?: number;
  height?: number;
  name?: string;
};

export type MosaikaPost = {
  id: string;
  kind: PostKind;
  media: MosaikaMedia[];
  caption: string;
  createdAt: string;
  pinned: boolean;
  pinnedAt?: string;
  order?: number;
  hidden: boolean;
  saved: boolean;
  musicName?: string;
  musicUri?: string;
  scheduledAt?: string;
  publishedAt?: string;
  remotePermalink?: string;
  remoteId?: string;
  publishStatus?:
    | "draft"
    | "scheduling"
    | "scheduled"
    | "publishing"
    | "published"
    | "failed"
    | "review_required"
    | "cancelled";
  localLike?: boolean;
};

export type MosaikaHighlight = {
  id: string;
  title: string;
  media: MosaikaMedia[];
  coverUri?: string;
  linkText?: string;
  linkUrl?: string;
  color: string;
};

export type MosaikaProfile = {
  nickname: string;
  bio?: string;
  bioLinks?: { url: string; label?: string }[];
  username?: string;
  avatarUrl?: string;
  connected: boolean;
  verified: boolean;
  followersCount?: number;
  followingCount?: number;
};

export type PersistedMosaika = {
  theme: ThemeKey;
  aspect: PostAspect;
  gridAspect: GridAspect;
  aspectVersion: number;
  profile: MosaikaProfile;
  posts: MosaikaPost[];
  highlights: MosaikaHighlight[];
  musicByPost: Record<string, string>;
};

export const STORE_KEY = "mosaika:v1";
export const EMPTY_PROFILE: MosaikaProfile = {
  nickname: "Minha conta",
  connected: false,
  verified: false,
};

export const DEFAULT_HIGHLIGHTS: MosaikaHighlight[] = Array.from(
  { length: 10 },
  (_, index) => ({
    id: `highlight-${index + 1}`,
    title: index === 0 ? "Novo" : "",
    media: [],
    color: ["#FCE7DB", "#F6DDE9", "#E8DFF5", "#DDE9F7", "#DDEFE8"][index % 5],
  }),
);

export const DEFAULT_STATE: PersistedMosaika = {
  theme: "light",
  aspect: "portrait",
  gridAspect: "portrait45",
  aspectVersion: 3,
  profile: EMPTY_PROFILE,
  posts: [],
  highlights: DEFAULT_HIGHLIGHTS,
  musicByPost: {},
};
