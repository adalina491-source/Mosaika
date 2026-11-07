import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import type { Express, Request, Response } from "express";
import { and, eq, inArray, lt } from "drizzle-orm";
import { jwtVerify } from "jose";
import { createHeartbeatJob, deleteHeartbeatJob } from "./_core/heartbeat";
import { getDb } from "./db";
import { storageGetSignedUrl, storagePut } from "./storage";
import {
  mosaikaInstagramConnection,
  mosaikaOAuthStates,
  mosaikaOAuthTickets,
  mosaikaPosts,
  mosaikaSessions,
} from "../drizzle/schema";

const GRAPH_VERSION = "v26.0";
// Keep aligned with the Expo scheme derived from the bundle ID in app.config.ts.
const APP_RETURN_SCHEME = "manus174398246865064:";
const graphUrl = (path: string) =>
  `https://graph.facebook.com/${GRAPH_VERSION}/${path.replace(/^\/+/, "")}`;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
type Connection = typeof mosaikaInstagramConnection.$inferSelect;

class PublishOutcomeUnknownError extends Error {}

function tokenEncryptionKey() {
  const secret = process.env.MANUS_JWT_SECRET;
  if (!secret)
    throw new Error("Chave de criptografia do servidor indisponível.");
  return createHash("sha256")
    .update(`${secret}:mosaika:meta-token:v1`)
    .digest();
}

function encryptMetaToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}

function decryptMetaToken(value: string) {
  const [version, ivValue, tagValue, encryptedValue] = value.split(":");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue)
    throw new Error(
      "Token Meta armazenado em formato inválido; conecte novamente.",
    );
  const decipher = createDecipheriv(
    "aes-256-gcm",
    tokenEncryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function decryptedConnection(account: Connection): Connection {
  return { ...account, accessToken: decryptMetaToken(account.accessToken) };
}

function metaConfig() {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const configId = process.env.META_CONFIG_ID;
  const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL;
  const redirectUri =
    process.env.META_REDIRECT_URI ||
    (apiBase ? `${apiBase.replace(/\/$/, "")}/api/mosaika/meta/callback` : "");
  if (
    !appId ||
    !appSecret ||
    !configId ||
    !redirectUri ||
    !redirectUri.startsWith("https://")
  )
    return null;
  return { appId, appSecret, configId, redirectUri };
}

async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new Error("Banco do Mosaika indisponível.");
  return db;
}

async function getConnection(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
) {
  const rows = await db.select().from(mosaikaInstagramConnection).limit(1);
  return rows[0] as Connection | undefined;
}

async function authenticatedConnection(req: Request, res: Response) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token || token.length < 32) {
    res.status(401).json({ error: "Sessão Mosaika inválida." });
    return null;
  }
  const db = await dbOrThrow();
  const sessions = await db
    .select()
    .from(mosaikaSessions)
    .where(eq(mosaikaSessions.tokenHash, hash(token)))
    .limit(1);
  if (!sessions[0] || sessions[0].expiresAt.getTime() <= Date.now()) {
    res
      .status(401)
      .json({ error: "Sessão Mosaika expirada. Conecte novamente." });
    return null;
  }
  const account = await getConnection(db);
  if (!account) {
    res.status(404).json({ error: "Nenhuma conta Meta conectada." });
    return null;
  }
  return { db, account: decryptedConnection(account) };
}

async function graphRequest(
  path: string,
  token: string,
  params: Record<string, string> = {},
  method: "GET" | "POST" = "GET",
) {
  const url = new URL(graphUrl(path));
  let init: RequestInit;
  if (method === "GET") {
    Object.entries({ ...params, access_token: token }).forEach(([key, value]) =>
      url.searchParams.set(key, value),
    );
    init = { method };
  } else {
    const body = new URLSearchParams({ ...params, access_token: token });
    init = {
      method,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    };
  }
  const response = await fetch(url, init);
  const json = (await response.json().catch(() => ({}))) as Record<string, any>;
  if (!response.ok || json.error)
    throw new Error(
      String(json.error?.message || `Meta Graph API (${response.status})`),
    );
  return json;
}

function safeReturnUri(input: unknown) {
  if (typeof input !== "string" || input.length > 1000) return null;
  try {
    const parsed = new URL(input);
    const expectedProtocol = parsed.protocol === APP_RETURN_SCHEME;
    const expectedTarget =
      (parsed.hostname === "instagram-auth" &&
        ["", "/"].includes(parsed.pathname)) ||
      (parsed.hostname === "" && parsed.pathname === "/instagram-auth");
    if (
      !expectedProtocol ||
      !expectedTarget ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function redirectWith(uri: string, values: Record<string, string>) {
  const target = new URL(uri);
  Object.entries(values).forEach(([key, value]) =>
    target.searchParams.set(key, value),
  );
  return target.toString();
}

async function saveUploadedMedia(req: Request, res: Response) {
  const auth = await authenticatedConnection(req, res);
  if (!auth) return;
  const { base64, contentType, filename } = req.body as {
    base64?: string;
    contentType?: string;
    filename?: string;
  };
  if (!base64 || typeof base64 !== "string" || base64.length > 22_000_000) {
    res.status(413).json({ error: "Arquivo ausente ou acima de 16 MB." });
    return;
  }
  const match = /^(image\/jpeg|video\/mp4)$/.exec(contentType ?? "");
  if (!match) {
    res
      .status(415)
      .json({ error: "A publicação Meta aceita imagens JPEG e vídeos MP4." });
    return;
  }
  try {
    const data = Buffer.from(base64.replace(/^data:[^,]+,/, ""), "base64");
    const maxBytes =
      match[1] === "image/jpeg" ? 8 * 1024 * 1024 : 16 * 1024 * 1024;
    if (!data.length || data.length > maxBytes) {
      res.status(413).json({
        error:
          match[1] === "image/jpeg"
            ? "JPEG acima de 8 MB."
            : "Vídeo acima de 16 MB.",
      });
      return;
    }
    const validJpeg =
      match[1] === "image/jpeg" && data[0] === 0xff && data[1] === 0xd8;
    const validMp4 =
      match[1] === "video/mp4" &&
      data.subarray(4, 8).toString("ascii") === "ftyp";
    if (!validJpeg && !validMp4) {
      res
        .status(415)
        .json({ error: "O conteúdo não corresponde ao JPEG/MP4 declarado." });
      return;
    }
    const extension = match[1] === "image/jpeg" ? "jpg" : "mp4";
    const uploaded = await storagePut(
      `mosaika/${randomBytes(16).toString("hex")}.${extension}`,
      data,
      match[1],
    );
    res.json({
      key: uploaded.key,
      url: uploaded.url,
      filename: String(filename ?? "").slice(0, 100),
    });
  } catch {
    res
      .status(502)
      .json({ error: "Falha ao enviar mídia para o armazenamento." });
  }
}

async function waitForContainer(id: string, token: string) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const state = await graphRequest(id, token, { fields: "status_code" });
    if (state.status_code === "FINISHED") return;
    if (state.status_code === "ERROR" || state.status_code === "EXPIRED")
      throw new Error("A Meta não conseguiu processar esta mídia.");
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(
    "A Meta ainda está processando a mídia. Tente novamente em alguns minutos.",
  );
}

async function publishToMeta(
  account: Connection,
  mediaKeys: string[],
  kind: string,
  caption: string,
) {
  if (!mediaKeys.length || mediaKeys.length > 10)
    throw new Error("Selecione de 1 a 10 mídias.");
  if (caption.length > 2200)
    throw new Error("A legenda excede 2.200 caracteres.");
  const urls = await Promise.all(
    mediaKeys.map((key) => storageGetSignedUrl(key)),
  );
  let creation: Record<string, any>;
  if (kind === "reel") {
    if (urls.length !== 1) throw new Error("Um Reel deve conter um vídeo.");
    creation = await graphRequest(
      `${account.instagramId}/media`,
      account.accessToken,
      {
        media_type: "REELS",
        video_url: urls[0],
        caption,
        share_to_feed: "true",
      },
      "POST",
    );
    await waitForContainer(String(creation.id), account.accessToken);
  } else if (kind === "carousel") {
    if (urls.length < 2)
      throw new Error("Um carrossel precisa de ao menos 2 imagens.");
    const children: string[] = [];
    for (const imageUrl of urls) {
      const child = await graphRequest(
        `${account.instagramId}/media`,
        account.accessToken,
        { image_url: imageUrl, is_carousel_item: "true" },
        "POST",
      );
      children.push(String(child.id));
    }
    await Promise.all(
      children.map((id) => waitForContainer(id, account.accessToken)),
    );
    creation = await graphRequest(
      `${account.instagramId}/media`,
      account.accessToken,
      { media_type: "CAROUSEL", children: children.join(","), caption },
      "POST",
    );
    await waitForContainer(String(creation.id), account.accessToken);
  } else {
    if (urls.length !== 1)
      throw new Error("Este formato publica uma imagem por vez.");
    creation = await graphRequest(
      `${account.instagramId}/media`,
      account.accessToken,
      { image_url: urls[0], caption },
      "POST",
    );
  }
  let published: Record<string, any>;
  try {
    published = await graphRequest(
      `${account.instagramId}/media_publish`,
      account.accessToken,
      { creation_id: String(creation.id) },
      "POST",
    );
  } catch (error) {
    if (error instanceof TypeError)
      throw new PublishOutcomeUnknownError(
        "A conexão caiu durante a confirmação da Meta.",
      );
    throw error;
  }
  if (!published.id)
    throw new PublishOutcomeUnknownError(
      "A Meta não confirmou o ID da publicação.",
    );
  return String(published.id);
}

async function callbackIdentity(req: Request) {
  const cookie = String(req.headers.cookie ?? "")
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("app_session_id="))
    ?.slice("app_session_id=".length);
  const secret = process.env.MANUS_JWT_SECRET;
  const projectId = process.env.MANUS_PROJECT_ID;
  const oauthUrl = process.env.MANUS_OAUTH_API_URL;
  if (!cookie || !secret || !projectId || !oauthUrl)
    throw new Error("Credencial de callback ausente.");
  const { payload } = await jwtVerify(
    cookie,
    new TextEncoder().encode(secret),
    { algorithms: ["HS256"] },
  );
  if (
    payload.appId !== projectId ||
    typeof payload.exp !== "number" ||
    payload.exp <= Math.floor(Date.now() / 1000) ||
    !String(payload.openId ?? "").startsWith("cron_")
  )
    throw new Error("Callback não autorizado.");
  const response = await fetch(
    `${oauthUrl.replace(/\/$/, "")}/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jwt_token: cookie, project_id: projectId }),
    },
  );
  const identity = (await response.json()) as {
    taskUid?: string;
    projectId?: string;
    openId?: string;
  };
  if (
    !response.ok ||
    identity.projectId !== projectId ||
    !identity.taskUid ||
    !String(identity.openId ?? "").startsWith("cron_")
  )
    throw new Error("Identidade do agendamento inválida.");
  return identity.taskUid;
}

export function registerMosaikaRoutes(app: Express) {
  app.get("/api/mosaika/meta/status", (_req, res) => {
    res.json({ configured: Boolean(metaConfig()) });
  });

  app.post("/api/mosaika/meta/connect-url", async (req, res) => {
    const config = metaConfig();
    const returnUri = safeReturnUri(req.body?.returnUri);
    const codeChallenge = String(req.body?.codeChallenge ?? "");
    if (!config) {
      res.status(503).json({
        error:
          "Integração Meta pendente: configure App ID, App Secret e Configuration ID.",
      });
      return;
    }
    if (!returnUri) {
      res.status(400).json({ error: "Retorno do app inválido." });
      return;
    }
    if (!/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) {
      res.status(400).json({ error: "Desafio PKCE inválido." });
      return;
    }
    try {
      const db = await dbOrThrow();
      await db
        .delete(mosaikaOAuthStates)
        .where(
          lt(mosaikaOAuthStates.createdAt, new Date(Date.now() - 15 * 60_000)),
        );
      await db
        .delete(mosaikaOAuthTickets)
        .where(lt(mosaikaOAuthTickets.expiresAt, new Date()));
      const state = randomBytes(32).toString("hex");
      await db
        .insert(mosaikaOAuthStates)
        .values({ stateHash: hash(state), returnUri, codeChallenge });
      const auth = new URL("https://www.facebook.com/dialog/oauth");
      auth.searchParams.set("client_id", config.appId);
      auth.searchParams.set("config_id", config.configId);
      auth.searchParams.set("redirect_uri", config.redirectUri);
      auth.searchParams.set("response_type", "code");
      auth.searchParams.set("state", state);
      auth.searchParams.set("display", "popup");
      auth.searchParams.set("prompt", "login");
      res.json({ url: auth.toString() });
    } catch {
      res
        .status(503)
        .json({ error: "Banco do app indisponível para iniciar OAuth." });
    }
  });

  app.get("/api/mosaika/meta/callback", async (req, res) => {
    const config = metaConfig();
    const state = String(req.query.state ?? "");
    let returnUri: string | undefined;
    if (!config || !state) {
      res
        .status(400)
        .send("OAuth inválido ou integração Meta não configurada.");
      return;
    }
    try {
      const db = await dbOrThrow();
      const states = await db
        .select()
        .from(mosaikaOAuthStates)
        .where(eq(mosaikaOAuthStates.stateHash, hash(state)))
        .limit(1);
      const saved = states[0];
      returnUri = saved?.returnUri;
      if (!saved || Date.now() - saved.createdAt.getTime() > 15 * 60_000) {
        res
          .status(400)
          .send("Estado OAuth expirado. Volte ao app e tente novamente.");
        return;
      }
      const [consumedState] = await db
        .delete(mosaikaOAuthStates)
        .where(eq(mosaikaOAuthStates.stateHash, hash(state)));
      if (consumedState.affectedRows !== 1) {
        res
          .status(400)
          .send("Estado OAuth já utilizado. Volte ao app e tente novamente.");
        return;
      }
      if (req.query.error || !req.query.code) {
        res.redirect(
          302,
          redirectWith(saved.returnUri, { error: "authorization_cancelled" }),
        );
        return;
      }
      const tokenUrl = new URL(graphUrl("oauth/access_token"));
      tokenUrl.searchParams.set("client_id", config.appId);
      tokenUrl.searchParams.set("client_secret", config.appSecret);
      tokenUrl.searchParams.set("code", String(req.query.code));
      const tokenResponse = await fetch(tokenUrl);
      const tokenBody = (await tokenResponse.json()) as {
        access_token?: string;
        expires_in?: number;
        error?: { message?: string };
      };
      if (!tokenResponse.ok || !tokenBody.access_token)
        throw new Error(
          tokenBody.error?.message ?? "Meta não aceitou o código OAuth.",
        );
      const assigned = await graphRequest(
        "me/assigned_instagram_accounts",
        tokenBody.access_token,
        { fields: "id,username", limit: "100" },
      );
      const accounts = Array.isArray(assigned.data) ? assigned.data : [];
      if (accounts.length !== 1)
        throw new Error(
          "Autorize exatamente uma conta profissional para este app.",
        );
      const candidate = accounts[0] as { id?: string; username?: string };
      if (!candidate?.id)
        throw new Error(
          "Nenhuma conta profissional Instagram foi encontrada para esta autorização.",
        );
      let profile: Record<string, any> = {};
      let business: Record<string, any> = {};
      try {
        profile = await graphRequest(candidate.id, tokenBody.access_token, {
          fields:
            "id,username,account_type,profile_picture_url,followers_count",
        });
      } catch {
        /* Assigned account name remains usable. */
      }
      try {
        business = await graphRequest("me", tokenBody.access_token, {
          fields: "client_business_id",
        });
      } catch {
        /* Account connection still works if the optional business identifier is unavailable. */
      }
      const connectionKey = randomBytes(32).toString("hex");
      await db
        .insert(mosaikaInstagramConnection)
        .values({
          id: 1,
          instagramId: candidate.id,
          clientBusinessId: business.client_business_id ?? null,
          configId: config.configId,
          username: String(
            profile.username ?? candidate.username ?? "instagram",
          ),
          profilePictureUrl: profile.profile_picture_url ?? null,
          followersCount:
            typeof profile.followers_count === "number"
              ? profile.followers_count
              : null,
          accessToken: encryptMetaToken(tokenBody.access_token),
          connectionKey,
        })
        .onDuplicateKeyUpdate({
          set: {
            clientBusinessId: business.client_business_id ?? null,
            configId: config.configId,
            username: String(
              profile.username ?? candidate.username ?? "instagram",
            ),
            profilePictureUrl: profile.profile_picture_url ?? null,
            followersCount:
              typeof profile.followers_count === "number"
                ? profile.followers_count
                : null,
            accessToken: encryptMetaToken(tokenBody.access_token),
            connectionKey,
            updatedAt: new Date(),
          },
        });
      const ticket = randomBytes(32).toString("base64url");
      await db.delete(mosaikaSessions);
      await db.insert(mosaikaOAuthTickets).values({
        ticketHash: hash(ticket),
        codeChallenge: saved.codeChallenge,
        expiresAt: new Date(Date.now() + 5 * 60_000),
      });
      res.redirect(302, redirectWith(saved.returnUri, { ticket }));
    } catch (error) {
      console.error(
        "[Mosaika] Meta OAuth callback failed:",
        error instanceof Error ? error.message : "unknown",
      );
      if (returnUri)
        res.redirect(
          302,
          redirectWith(returnUri, { error: "meta_authorization_failed" }),
        );
      else
        res
          .status(502)
          .send("Falha na autorização Meta. Volte ao app e tente novamente.");
    }
  });

  app.post("/api/mosaika/meta/session", async (req, res) => {
    const ticket = String(req.body?.ticket ?? "");
    const verifier = String(req.body?.verifier ?? "");
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(ticket) ||
      !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)
    ) {
      res.status(400).json({ error: "Ticket ou verifier PKCE inválido." });
      return;
    }
    try {
      const db = await dbOrThrow();
      const rows = await db
        .select()
        .from(mosaikaOAuthTickets)
        .where(eq(mosaikaOAuthTickets.ticketHash, hash(ticket)))
        .limit(1);
      const saved = rows[0];
      const challenge = createHash("sha256")
        .update(verifier)
        .digest("base64url");
      if (
        !saved ||
        saved.expiresAt.getTime() <= Date.now() ||
        saved.codeChallenge !== challenge
      ) {
        res
          .status(401)
          .json({ error: "Ticket expirado ou verifier PKCE não corresponde." });
        return;
      }
      const [consumedTicket] = await db
        .delete(mosaikaOAuthTickets)
        .where(eq(mosaikaOAuthTickets.ticketHash, hash(ticket)));
      if (consumedTicket.affectedRows !== 1) {
        res.status(401).json({ error: "Ticket PKCE já utilizado." });
        return;
      }
      const session = randomBytes(32).toString("base64url");
      await db.insert(mosaikaSessions).values({
        tokenHash: hash(session),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      res.json({ session });
    } catch {
      res
        .status(503)
        .json({ error: "Não foi possível concluir a sessão segura do app." });
    }
  });

  app.get("/api/mosaika/me", async (req, res) => {
    const auth = await authenticatedConnection(req, res);
    if (!auth) return;
    const account = auth.account;
    let profile: Record<string, any> = {};
    try {
      profile = await graphRequest(account.instagramId, account.accessToken, {
        fields:
          "id,username,profile_picture_url,followers_count,follows_count,media_count",
      });
    } catch {
      /* cached profile below */
    }
    res.json({
      username: String(profile.username ?? account.username),
      profilePictureUrl:
        profile.profile_picture_url ?? account.profilePictureUrl ?? undefined,
      followersCount:
        profile.followers_count ?? account.followersCount ?? undefined,
      followingCount: profile.follows_count ?? undefined,
      mediaCount: profile.media_count ?? undefined,
    });
  });

  app.get("/api/mosaika/feed", async (req, res) => {
    const auth = await authenticatedConnection(req, res);
    if (!auth) return;
    try {
      const response = await graphRequest(
        `${auth.account.instagramId}/media`,
        auth.account.accessToken,
        {
          fields:
            "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{id,media_type,media_url,thumbnail_url}",
          limit: "50",
        },
      );
      const feed = (Array.isArray(response.data) ? response.data : []).map(
        (item: Record<string, any>) => {
          const children = Array.isArray(item.children?.data)
            ? item.children.data
            : [];
          const source = children.length ? children : [item];
          return {
            id: String(item.id),
            kind:
              item.media_type === "CAROUSEL_ALBUM"
                ? "carousel"
                : item.media_type === "VIDEO"
                  ? "reel"
                  : "post",
            caption: String(item.caption ?? ""),
            createdAt: item.timestamp
              ? new Date(item.timestamp).toISOString()
              : new Date().toISOString(),
            permalink:
              typeof item.permalink === "string" ? item.permalink : undefined,
            media: source
              .filter(
                (child: Record<string, any>) =>
                  child.media_url || child.thumbnail_url,
              )
              .map((child: Record<string, any>) => ({
                id: String(child.id ?? item.id),
                uri: String(child.media_url ?? child.thumbnail_url),
                kind: child.media_type === "VIDEO" ? "video" : "image",
              })),
          };
        },
      );
      res.json(feed);
    } catch (error) {
      res.status(502).json({
        error:
          error instanceof Error ? error.message : "Falha ao ler a grade Meta.",
      });
    }
  });

  app.post("/api/mosaika/disconnect", async (req, res) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) {
      res.status(401).json({ error: "Sessão inválida." });
      return;
    }
    const db = await dbOrThrow();
    const rows = await db
      .select()
      .from(mosaikaSessions)
      .where(eq(mosaikaSessions.tokenHash, hash(token)))
      .limit(1);
    if (!rows[0] || rows[0].expiresAt.getTime() <= Date.now()) {
      res.status(401).json({ error: "Sessão expirada." });
      return;
    }
    const cancelPending = async () => {
      const pending = await db
        .select()
        .from(mosaikaPosts)
        .where(inArray(mosaikaPosts.status, ["scheduled", "scheduling"]));
      for (const post of pending) {
        const [cancelled] = await db
          .update(mosaikaPosts)
          .set({ status: "cancelled" })
          .where(
            and(
              eq(mosaikaPosts.id, post.id),
              inArray(mosaikaPosts.status, ["scheduled", "scheduling"]),
            ),
          );
        if (cancelled.affectedRows === 1 && post.heartbeatUid)
          await deleteHeartbeatJob(post.heartbeatUid, "").catch(
            () => undefined,
          );
      }
    };
    await cancelPending();
    const inFlight = await db
      .select({ id: mosaikaPosts.id })
      .from(mosaikaPosts)
      .where(eq(mosaikaPosts.status, "publishing"));
    if (inFlight.length) {
      res.status(409).json({
        error:
          "Há uma publicação em processamento. Tente desconectar novamente em instantes.",
      });
      return;
    }
    await db.delete(mosaikaSessions);
    await db.delete(mosaikaInstagramConnection);
    await cancelPending();
    res.json({ ok: true });
  });

  app.post("/api/mosaika/cancel", async (req, res) => {
    const auth = await authenticatedConnection(req, res);
    if (!auth) return;
    const id = String(req.body?.id ?? "");
    if (!id || id.length > 64) {
      res.status(400).json({ error: "Publicação inválida." });
      return;
    }
    const rows = await auth.db
      .select()
      .from(mosaikaPosts)
      .where(eq(mosaikaPosts.id, id))
      .limit(1);
    const post = rows[0];
    if (!post) {
      res.status(404).json({ error: "Agendamento não encontrado." });
      return;
    }
    if (post.status === "scheduled" || post.status === "scheduling") {
      const [cancelled] = await auth.db
        .update(mosaikaPosts)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(mosaikaPosts.id, id),
            inArray(mosaikaPosts.status, ["scheduled", "scheduling"]),
          ),
        );
      if (cancelled.affectedRows !== 1) {
        res.status(409).json({
          error:
            "A publicação já está em processamento e não pôde ser cancelada.",
        });
        return;
      }
      if (post.heartbeatUid)
        await deleteHeartbeatJob(post.heartbeatUid, "").catch(() => undefined);
      res.json({ status: "cancelled" });
      return;
    }
    if (post.status === "cancelled") {
      res.json({ status: "cancelled" });
      return;
    }
    res
      .status(409)
      .json({ error: "Este agendamento não pode mais ser cancelado." });
  });

  app.get("/api/mosaika/posts/status", async (req, res) => {
    const auth = await authenticatedConnection(req, res);
    if (!auth) return;
    const rows = await auth.db
      .select({
        id: mosaikaPosts.id,
        status: mosaikaPosts.status,
        remoteId: mosaikaPosts.remoteId,
        scheduledAt: mosaikaPosts.scheduledAt,
        publishedAt: mosaikaPosts.publishedAt,
      })
      .from(mosaikaPosts);
    res.json({ posts: rows });
  });

  app.post("/api/mosaika/media", saveUploadedMedia);

  app.post("/api/mosaika/publish", async (req, res) => {
    const auth = await authenticatedConnection(req, res);
    if (!auth) return;
    const {
      id,
      kind,
      caption = "",
      mediaKeys,
      scheduledAt,
    } = req.body as {
      id?: string;
      kind?: string;
      caption?: string;
      mediaKeys?: string[];
      scheduledAt?: string;
    };
    if (
      !id ||
      id.length > 64 ||
      !Array.isArray(mediaKeys) ||
      mediaKeys.some(
        (key) =>
          typeof key !== "string" ||
          !/^[A-Za-z0-9_./-]+$/.test(key) ||
          key.includes(".."),
      )
    ) {
      res.status(400).json({ error: "Publicação inválida." });
      return;
    }
    const record = {
      id,
      kind: String(kind ?? "post"),
      caption: String(caption).slice(0, 2200),
      mediaKeys: JSON.stringify(mediaKeys),
      status: "draft",
    };
    const current = await auth.db
      .select()
      .from(mosaikaPosts)
      .where(eq(mosaikaPosts.id, id))
      .limit(1);
    const existing = current[0];
    if (existing?.status === "published") {
      res.json({ status: "published", remoteId: existing.remoteId });
      return;
    }
    if (
      existing &&
      ["publishing", "scheduling", "review_required", "cancelled"].includes(
        existing.status,
      )
    ) {
      res.status(409).json({
        error:
          existing.status === "review_required"
            ? "Resultado anterior incerto. Confira o Instagram antes de criar outro envio."
            : "Esta publicação já está em processamento ou foi cancelada.",
      });
      return;
    }
    if (
      record.kind !== "post" &&
      record.kind !== "carousel" &&
      record.kind !== "reel" &&
      record.kind !== "panorama" &&
      record.kind !== "split"
    ) {
      res.status(400).json({ error: "Formato de publicação inválido." });
      return;
    }
    if (
      mediaKeys.length < 1 ||
      mediaKeys.length > 10 ||
      (record.kind === "carousel"
        ? mediaKeys.length < 2
        : mediaKeys.length !== 1)
    ) {
      res
        .status(400)
        .json({ error: "Este formato precisa de 1 a 10 mídias válidas." });
      return;
    }
    await auth.db
      .insert(mosaikaPosts)
      .values({ ...record, status: "draft" })
      .onDuplicateKeyUpdate({
        set: {
          kind: record.kind,
          caption: record.caption,
          mediaKeys: record.mediaKeys,
        },
      });

    if (scheduledAt) {
      if (!auth.account.connectionKey) {
        res.status(409).json({
          error: "Reconecte a conta Meta para ativar agendamentos seguros.",
        });
        return;
      }
      const date = new Date(scheduledAt);
      if (
        !Number.isFinite(date.getTime()) ||
        date.getTime() < Date.now() + 120_000
      ) {
        res
          .status(400)
          .json({ error: "Agende para pelo menos 2 minutos no futuro." });
        return;
      }
      const [claim] = await auth.db
        .update(mosaikaPosts)
        .set({
          kind: record.kind,
          caption: record.caption,
          mediaKeys: record.mediaKeys,
          connectionKey: auth.account.connectionKey,
          status: "scheduling",
          scheduledAt: date,
        })
        .where(
          and(
            eq(mosaikaPosts.id, id),
            inArray(mosaikaPosts.status, ["draft", "failed", "scheduled"]),
          ),
        );
      if (claim.affectedRows !== 1) {
        res
          .status(409)
          .json({ error: "Outro pedido já está processando este post." });
        return;
      }
      if (existing?.heartbeatUid)
        await deleteHeartbeatJob(existing.heartbeatUid, "").catch(
          () => undefined,
        );
      const cron = `0 ${date.getUTCMinutes()} ${date.getUTCHours()} ${date.getUTCDate()} ${date.getUTCMonth() + 1} *`;
      let createdJobUid: string | undefined;
      try {
        await auth.db
          .update(mosaikaPosts)
          .set({ heartbeatUid: null })
          .where(eq(mosaikaPosts.id, id));
        const job = await createHeartbeatJob(
          {
            name: `mosaika_${id.replace(/[^A-Za-z0-9_-]/g, "_")}`,
            cron,
            path: "/api/scheduled/mosaika-post",
            method: "POST",
            payload: { postId: id },
            description: "Publicação Instagram programada no Mosaika",
          },
          "",
        );
        createdJobUid = job.taskUid;
        const liveConnection = await getConnection(auth.db);
        if (
          !liveConnection ||
          liveConnection.connectionKey !== auth.account.connectionKey
        ) {
          await deleteHeartbeatJob(job.taskUid, "").catch(() => undefined);
          await auth.db
            .update(mosaikaPosts)
            .set({ status: "cancelled" })
            .where(
              and(
                eq(mosaikaPosts.id, id),
                eq(mosaikaPosts.status, "scheduling"),
              ),
            );
          res.status(409).json({
            error: "A conta foi desconectada; o agendamento foi cancelado.",
          });
          return;
        }
        const [finalized] = await auth.db
          .update(mosaikaPosts)
          .set({ status: "scheduled", heartbeatUid: job.taskUid })
          .where(
            and(
              eq(mosaikaPosts.id, id),
              eq(mosaikaPosts.status, "scheduling"),
              eq(mosaikaPosts.connectionKey, auth.account.connectionKey),
            ),
          );
        if (finalized.affectedRows !== 1) {
          await deleteHeartbeatJob(job.taskUid, "").catch(() => undefined);
          res.status(409).json({
            error: "O agendamento foi cancelado enquanto era criado.",
          });
          return;
        }
        res.json({
          status: "scheduled",
          scheduledAt: date.toISOString(),
          nextExecutionAt: job.nextExecutionAt,
        });
      } catch (error) {
        if (createdJobUid)
          await deleteHeartbeatJob(createdJobUid, "").catch(() => undefined);
        await auth.db
          .update(mosaikaPosts)
          .set({ status: "failed", heartbeatUid: null })
          .where(
            and(eq(mosaikaPosts.id, id), eq(mosaikaPosts.status, "scheduling")),
          );
        res.status(503).json({
          status: "failed",
          error:
            error instanceof Error
              ? error.message
              : "Não foi possível criar o agendamento.",
        });
      }
      return;
    }

    const [claim] = await auth.db
      .update(mosaikaPosts)
      .set({
        kind: record.kind,
        caption: record.caption,
        mediaKeys: record.mediaKeys,
        status: "publishing",
        scheduledAt: null,
        connectionKey: auth.account.connectionKey ?? null,
      })
      .where(
        and(
          eq(mosaikaPosts.id, id),
          inArray(mosaikaPosts.status, ["draft", "failed", "scheduled"]),
        ),
      );
    if (claim.affectedRows !== 1) {
      res
        .status(409)
        .json({ error: "Outro pedido já está processando este post." });
      return;
    }
    if (existing?.heartbeatUid)
      await deleteHeartbeatJob(existing.heartbeatUid, "").catch(
        () => undefined,
      );
    await auth.db
      .update(mosaikaPosts)
      .set({ heartbeatUid: null })
      .where(eq(mosaikaPosts.id, id));
    let remotePublished = false;
    try {
      const liveConnection = await getConnection(auth.db);
      if (
        !liveConnection ||
        liveConnection.connectionKey !== auth.account.connectionKey
      ) {
        await auth.db
          .update(mosaikaPosts)
          .set({ status: "cancelled" })
          .where(
            and(eq(mosaikaPosts.id, id), eq(mosaikaPosts.status, "publishing")),
          );
        res.status(409).json({
          status: "cancelled",
          error: "A conta foi desconectada antes da publicação.",
        });
        return;
      }
      const remoteId = await publishToMeta(
        decryptedConnection(liveConnection),
        mediaKeys,
        record.kind,
        record.caption,
      );
      remotePublished = true;
      await auth.db
        .update(mosaikaPosts)
        .set({ status: "published", remoteId, publishedAt: new Date() })
        .where(eq(mosaikaPosts.id, id));
      res.json({ status: "published", remoteId });
    } catch (error) {
      const uncertain =
        error instanceof PublishOutcomeUnknownError || remotePublished;
      const status = uncertain ? "review_required" : "failed";
      await auth.db
        .update(mosaikaPosts)
        .set({ status })
        .where(eq(mosaikaPosts.id, id))
        .catch(() => undefined);
      res.status(502).json({
        status,
        error: uncertain
          ? `${remotePublished ? "A Meta confirmou o envio, mas o status local pode não ter sido salvo." : error instanceof Error ? error.message : "A confirmação da Meta ficou incerta."} Confira o Instagram antes de tentar de novo.`
          : `${error instanceof Error ? error.message : "Falha antes da confirmação Meta."} Corrija o problema e tente novamente.`,
      });
    }
  });

  app.post("/api/scheduled/mosaika-post", async (req, res) => {
    let taskUid: string;
    try {
      taskUid = await callbackIdentity(req);
    } catch {
      res.status(401).json({ error: "Callback agendado não autenticado." });
      return;
    }
    let remotePublished = false;
    try {
      const db = await dbOrThrow();
      const rows = await db
        .select()
        .from(mosaikaPosts)
        .where(eq(mosaikaPosts.heartbeatUid, taskUid))
        .limit(1);
      const post = rows[0];
      if (!post) {
        res.status(404).json({ error: "Agendamento não encontrado." });
        return;
      }
      if (
        ["published", "failed", "review_required", "cancelled"].includes(
          post.status,
        )
      ) {
        await deleteHeartbeatJob(taskUid, "").catch(() => undefined);
        res.json({ ok: true, duplicate: true, status: post.status });
        return;
      }
      if (post.status !== "scheduled") {
        res
          .status(503)
          .json({ error: "Agendamento em transição; tente novamente." });
        return;
      }
      if (
        post.scheduledAt &&
        post.scheduledAt.getTime() > Date.now() + 30_000
      ) {
        res
          .status(503)
          .json({ error: "Agendamento disparado antes do horário." });
        return;
      }
      const account = await getConnection(db);
      if (
        !account ||
        !post.connectionKey ||
        account.connectionKey !== post.connectionKey
      ) {
        await db
          .update(mosaikaPosts)
          .set({ status: "cancelled" })
          .where(eq(mosaikaPosts.id, post.id));
        await deleteHeartbeatJob(taskUid, "").catch(() => undefined);
        res
          .status(409)
          .json({ error: "Conta Meta desconectada; agendamento cancelado." });
        return;
      }
      const [claim] = await db
        .update(mosaikaPosts)
        .set({ status: "publishing" })
        .where(
          and(
            eq(mosaikaPosts.id, post.id),
            eq(mosaikaPosts.status, "scheduled"),
          ),
        );
      if (claim.affectedRows !== 1) {
        res
          .status(503)
          .json({ error: "Agendamento já está em processamento." });
        return;
      }
      const liveAccount = await getConnection(db);
      if (!liveAccount || liveAccount.connectionKey !== post.connectionKey) {
        await db
          .update(mosaikaPosts)
          .set({ status: "cancelled" })
          .where(
            and(
              eq(mosaikaPosts.id, post.id),
              eq(mosaikaPosts.status, "publishing"),
            ),
          );
        await deleteHeartbeatJob(taskUid, "").catch(() => undefined);
        res
          .status(409)
          .json({ error: "A conexão Meta mudou; agendamento cancelado." });
        return;
      }
      const remoteId = await publishToMeta(
        decryptedConnection(liveAccount),
        JSON.parse(post.mediaKeys) as string[],
        post.kind,
        post.caption ?? "",
      );
      remotePublished = true;
      await db
        .update(mosaikaPosts)
        .set({ status: "published", remoteId, publishedAt: new Date() })
        .where(eq(mosaikaPosts.id, post.id));
      await deleteHeartbeatJob(taskUid, "").catch(() => undefined);
      res.json({ ok: true, remoteId });
    } catch (error) {
      const uncertain =
        error instanceof PublishOutcomeUnknownError || remotePublished;
      const status = uncertain ? "review_required" : "failed";
      await dbOrThrow()
        .then((db) =>
          db
            .update(mosaikaPosts)
            .set({ status })
            .where(eq(mosaikaPosts.heartbeatUid, taskUid)),
        )
        .catch(() => undefined);
      await deleteHeartbeatJob(taskUid, "").catch(() => undefined);
      res.json({
        ok: false,
        status,
        error: uncertain
          ? `${remotePublished ? "A Meta confirmou o envio, mas o status local pode não ter sido salvo." : error instanceof Error ? error.message : "A confirmação da Meta ficou incerta."} Confira o Instagram antes de tentar de novo.`
          : `${error instanceof Error ? error.message : "Falha antes da confirmação Meta."} O envio não foi confirmado; revise o problema e agende novamente.`,
      });
    }
  });
}
