const AVTT_S3 =
  "https://l0cqoq0b4d.execute-api.us-east-1.amazonaws.com/default/uploader";

let S3_Current_Size = 0;
let currentFolder = "";
const userLimit = Object.freeze({
  low: 10 * 1024 * 1024 * 1024,
  mid: 25 * 1024 * 1024 * 1024,
  high: 100 * 1024 * 1024 * 1024,
});
const allowedImageTypes = ["jpeg", "jpg", "png", "gif", "bmp", "webp"];
const allowedVideoTypes = ["mp4", "mov", "avi", "mkv", "wmv", "flv", "webm"];
const allowedAudioTypes = ["mp3", "wav", "aac", "flac", "ogg"];
const allowedJsonTypes = ["json", "uvtt", "dd2vtt", "df2vtt"];
const allowedDocTypes = ["pdf"];
const allowedTextTypes = ["abovevtt", "csv"];

const PATREON_AUTH_STORAGE_KEYS = Object.freeze({
  state: "avtt.patreon.state",
  codeVerifier: "avtt.patreon.codeVerifier",
  tokens: "avtt.patreon.tokens",
  lastCode: "avtt.patreon.lastCode",
});

const avttFilePickerTypes = Object.freeze({
  FOLDER: "FOLDER",
  VIDEO: "VIDEO",
  AUDIO: "AUDIO",
  UVTT: "UVTT",
  PDF: "PDF",
  IMAGE: "IMAGE",
  ABOVEVTT: "ABOVEVTT",
  CSV: "CSV",
});

let activeUserLimit = 0;
let activeUserTier = { level: "free", label: "Free", amountCents: 0 };
const campaignTierCache = new Map();

const PatreonAuth = (() => {
  const defaultConfig = {
    clientId:
      "2Pn4arX8GDny2KAhA5HjETX4Ni4M04SzECfN_GTdUmLKcM3ReJso1YA8wyHG1FBi",
    redirectUri: `https://patreon-html.s3.us-east-1.amazonaws.com/patreon-auth-callback.html`,
    campaignSlug: "azmoria",
    creatorVanity: "azmoria",
    creatorName: "Azmoria",
    creatorIds: ["939792"],
    scope:
      "identity identity[email] identity.memberships campaigns campaigns.members",
    popupWidth: 600,
    popupHeight: 750,
    timeoutMs: 180000,
  };
  const membershipCacheTtlMs = 5 * 60 * 1000;
  const apiBase = "https://www.patreon.com/api/oauth2/v2";

  let cachedMembership = null;
  let cachedMembershipFetchedAt = 0;

  function resolveConfig() {
    const external =
      typeof window.AVTT_PATRON_CONFIG === "object"
        ? window.AVTT_PATRON_CONFIG
        : {};
    const merged = { ...defaultConfig, ...external };
    merged.campaignSlug = (
      merged.campaignSlug || defaultConfig.campaignSlug
    ).toLowerCase();
    return merged;
  }

  function loadStoredTokens() {
    try {
      const raw = localStorage.getItem(PATREON_AUTH_STORAGE_KEYS.tokens);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw);
    } catch (err) {
      console.warn("Failed to parse stored Patreon tokens", err);
      return null;
    }
  }

  function saveTokens(tokens) {
    const payload = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    };
    localStorage.setItem(
      PATREON_AUTH_STORAGE_KEYS.tokens,
      JSON.stringify(payload),
    );
  }

  function clearTokens() {
    localStorage.removeItem(PATREON_AUTH_STORAGE_KEYS.tokens);
  }

  function isCreatorIdentity(identity, config) {
    if (!identity) {
      return false;
    }
    try {
      const creatorVanity = String(
        config.creatorVanity || config.campaignSlug || "",
      ).toLowerCase();
      const creatorName = String(config.creatorName || "").toLowerCase();
      const creatorIds = Array.isArray(config.creatorIds)
        ? config.creatorIds.map((id) => String(id))
        : [];
      const identityId = identity.id ? String(identity.id) : "";
      const identityAttributes = identity.attributes || {};
      const identityVanity = String(
        identityAttributes.vanity || "",
      ).toLowerCase();
      const identityUrl = String(identityAttributes.url || "").toLowerCase();
      const identityFullName = String(
        identityAttributes.full_name || "",
      ).toLowerCase();
      window.PATREON_ID = identityId;
      if (
        creatorVanity &&
        (identityVanity === creatorVanity ||
          identityUrl.includes(creatorVanity))
      ) {
        return true;
      }
      if (creatorName && identityFullName === creatorName) {
        return true;
      }
      if (identityId && creatorIds.includes(identityId)) {
        return true;
      }
    } catch (error) {
      console.warn("Failed to evaluate Patreon creator identity", error);
    }
    return false;
  }

  function tokensValid(tokens) {
    return (
      tokens &&
      tokens.accessToken &&
      typeof tokens.expiresAt === "number" &&
      tokens.expiresAt > Date.now()
    );
  }

  function computeExpiry(expiresIn) {
    const skewMs = 60 * 1000;
    return Date.now() + expiresIn * 1000 - skewMs;
  }

  async function requestPatreonToken(payload, config) {
    const body = { ...payload };
    if (config?.clientId && !body.clientId) {
      body.clientId = config.clientId;
    }
    try {
      const response = await fetch(`${AVTT_S3}?action=patreonToken`, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      let json;
      try {
        json = await response.json();
      } catch (parseError) {
        console.error("Failed to parse Patreon token response", parseError);
        throw new Error("Failed to parse Patreon token response.");
      }
      if (!response.ok) {
        const message =
          json?.error_description ||
          json?.message ||
          json?.error ||
          "Patreon token exchange failed.";
        throw new Error(message);
      }
      if (json?.error) {
        throw new Error(json.error_description || json.error);
      }
      return json;
    } catch (error) {
      console.error("Patreon token request failed", error);
      throw error;
    }
  }

  async function fetchPatreonIdentity(accessToken, query) {
    try {
      const response = await fetch(`${AVTT_S3}?action=patreonIdentity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          query,
        }),
      });
      let json;
      try {
        json = await response.json();
      } catch (parseError) {
        console.error("Failed to parse Patreon identity response", parseError);
        throw new Error("Failed to parse Patreon identity response.");
      }
      if (!response.ok || json?.error) {
        const message =
          json?.error_description ||
          json?.message ||
          json?.error ||
          "Failed to load Patreon profile information.";
        throw new Error(message);
      }
      return json;
    } catch (error) {
      console.error("Patreon identity request failed", error);
      throw error;
    }
  }

  function storeState(state) {
    sessionStorage.setItem(PATREON_AUTH_STORAGE_KEYS.state, state);
  }

  function readState() {
    return sessionStorage.getItem(PATREON_AUTH_STORAGE_KEYS.state);
  }

  function clearState() {
    sessionStorage.removeItem(PATREON_AUTH_STORAGE_KEYS.state);
  }

  function storeCodeVerifier(codeVerifier) {
    sessionStorage.setItem(
      PATREON_AUTH_STORAGE_KEYS.codeVerifier,
      codeVerifier,
    );
  }

  function readCodeVerifier() {
    return sessionStorage.getItem(PATREON_AUTH_STORAGE_KEYS.codeVerifier);
  }

  function clearCodeVerifier() {
    sessionStorage.removeItem(PATREON_AUTH_STORAGE_KEYS.codeVerifier);
  }

  function readLastAuthorizationCode() {
    return sessionStorage.getItem(PATREON_AUTH_STORAGE_KEYS.lastCode);
  }

  function storeLastAuthorizationCode(code) {
    if (code) {
      sessionStorage.setItem(PATREON_AUTH_STORAGE_KEYS.lastCode, code);
    }
  }

  function clearLastAuthorizationCode() {
    sessionStorage.removeItem(PATREON_AUTH_STORAGE_KEYS.lastCode);
  }

  function generateRandomString(length) {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    if (window.crypto?.getRandomValues) {
      const values = new Uint8Array(length);
      window.crypto.getRandomValues(values);
      return Array.from(values, (v) => chars[v % chars.length]).join("");
    }
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  function base64UrlEncode(bytes) {
    let str = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      str += String.fromCharCode.apply(null, chunk);
    }
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  async function createCodeChallenge(codeVerifier) {
    if (window.crypto?.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(codeVerifier);
      const digest = await window.crypto.subtle.digest("SHA-256", data);
      return base64UrlEncode(new Uint8Array(digest));
    }
    return codeVerifier;
  }

  function openLoginPopup(url, config) {
    return new Promise((resolve, reject) => {
      const { popupWidth, popupHeight, timeoutMs } = config;
      const dualScreenLeft =
        window.screenLeft !== undefined ? window.screenLeft : window.screenX;
      const dualScreenTop =
        window.screenTop !== undefined ? window.screenTop : window.screenY;
      const width =
        window.innerWidth ||
        document.documentElement.clientWidth ||
        screen.width;
      const height =
        window.innerHeight ||
        document.documentElement.clientHeight ||
        screen.height;
      const systemZoom = width / window.screen.availWidth;
      const left = (width - popupWidth) / 2 / systemZoom + dualScreenLeft;
      const top = (height - popupHeight) / 2 / systemZoom + dualScreenTop;
      const features = `scrollbars=yes, width=${popupWidth}, height=${popupHeight}, top=${top}, left=${left}`;
      const popup = window.open(url, "avttPatreonAuth", features);
      if (!popup) {
        reject(
          new Error(
            "Unable to open Patreon login window. Please disable popup blockers and try again.",
          ),
        );
        return;
      }

      let resolved = false;
      const timeoutHandle = window.setTimeout(() => {
        cleanup();
        reject(new Error("Patreon login timed out. Please try again."));
      }, timeoutMs);

      const closeInterval = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(closeInterval);
          if (!resolved) {
            window.clearTimeout(timeoutHandle);
            cleanup();
            reject(new Error("Patreon login was closed before completing."));
          }
        }
      }, 500);

      function cleanup() {
        window.removeEventListener("message", messageHandler);
        if (!popup.closed) {
          popup.close();
        }
      }

      function messageHandler(event) {
        try {
          if (!event.data || event.data.source !== "avtt:patreon-auth") {
            return;
          }
          const expectedOrigin = new URL(config.redirectUri).origin;
          if (event.origin !== expectedOrigin) {
            console.warn(
              "Ignoring Patreon auth message from unexpected origin",
              event.origin,
            );
            return;
          }
          resolved = true;
          window.clearTimeout(timeoutHandle);
          window.clearInterval(closeInterval);
          cleanup();
          resolve(event.data);
        } catch (error) {
          console.error("Failed to process Patreon auth message", error);
        }
      }

      window.addEventListener("message", messageHandler);
      popup.focus();
    });
  }

  async function exchangeAuthorizationCode(code, codeVerifier, config) {
    const json = await requestPatreonToken(
      {
        grantType: "authorization_code",
        code,
        codeVerifier,
        redirectUri: config.redirectUri,
      },
      config,
    );
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: computeExpiry(json.expires_in),
    };
  }

  async function refreshAccessToken(refreshToken, config) {
    const json = await requestPatreonToken(
      {
        grantType: "refresh_token",
        refreshToken,
        redirectUri: config.redirectUri,
      },
      config,
    );
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token || refreshToken,
      expiresAt: computeExpiry(json.expires_in),
    };
  }

  async function ensureAccessToken(config) {
    const stored = loadStoredTokens();
    if (tokensValid(stored)) {
      return stored;
    }
    if (stored?.refreshToken) {
      try {
        const refreshed = await refreshAccessToken(stored.refreshToken, config);
        saveTokens(refreshed);
        return refreshed;
      } catch (error) {
        console.warn("Patreon refresh failed, clearing session", error);
        clearTokens();
      }
    }
    const state = generateRandomString(32);
    const codeVerifier = generateRandomString(64);
    const codeChallenge = await createCodeChallenge(codeVerifier);
    storeState(state);
    storeCodeVerifier(codeVerifier);
    const authParams = new URLSearchParams({
      response_type: "code",
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: config.scope,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    const authUrl = `https://www.patreon.com/oauth2/authorize?${authParams.toString()}`;
    const message = await openLoginPopup(authUrl, config);
    clearState();
    const storedCodeVerifier = readCodeVerifier();
    clearCodeVerifier();
    if (message.error) {
      throw new Error(
        message.error_description || "Patreon authentication was cancelled.",
      );
    }
    if (message.state !== state) {
      throw new Error("State mismatch detected during Patreon authentication.");
    }
    if (!message.code) {
      throw new Error(
        "Patreon authentication did not return a valid authorization code.",
      );
    }
    if (!storedCodeVerifier) {
      throw new Error("Missing PKCE verifier for Patreon authentication.");
    }
    const lastCode = readLastAuthorizationCode();
    if (lastCode && lastCode === message.code) {
      throw new Error(
        "Patreon returned an authorization code that was already used. Please try logging in again.",
      );
    }
    storeLastAuthorizationCode(message.code);
    const tokens = await exchangeAuthorizationCode(
      message.code,
      storedCodeVerifier,
      config,
    );
    saveTokens(tokens);
    return tokens;
  }

  function indexIncludedByType(included = [], type) {
    return included
      .filter((item) => item.type === type)
      .reduce((acc, item) => {
        acc[item.id] = item;
        return acc;
      }, {});
  }

  function resolveCampaignTiers(campaignId, tiersIndex) {
    const cached = campaignTierCache.get(campaignId);
    if (cached && cached.length) {
      return cached;
    }
    const tierList = Object.values(tiersIndex || {}).filter(
      (tier) => tier?.relationships?.campaign?.data?.id === campaignId,
    );
    tierList.sort(
      (a, b) =>
        (a?.attributes?.amount_cents || 0) - (b?.attributes?.amount_cents || 0),
    );
    if (tierList.length) {
      campaignTierCache.set(campaignId, tierList);
    }
    return tierList;
  }

  async function fetchCampaignTiersFallback(campaignId, accessToken) {
    try {
      const response = await fetch(`${AVTT_S3}?action=patreonCampaignTiers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, accessToken }),
      });
      const json = await response.json();
      if (!response.ok || json?.error) {
        const message =
          json?.error_description ||
          json?.message ||
          json?.error ||
          "Failed to fetch Patreon campaign tiers.";
        throw new Error(message);
      }
      const tiers = (json.included || []).filter(
        (item) => item.type === "tier",
      );
      tiers.sort(
        (a, b) =>
          (a?.attributes?.amount_cents || 0) -
          (b?.attributes?.amount_cents || 0),
      );
      return tiers;
    } catch (error) {
      console.warn("Fallback campaign tier request failed", error);
      throw error;
    }
  }

  function buildMembershipResult(member, campaign, tiersIndex, campaignTiers) {
    const memberRole = member?.attributes?.role;
    if (memberRole && memberRole.toLowerCase() === "creator") {
      const label = member?.attributes?.full_name || "Creator";
      return {
        level: "creator",
        label,
        amountCents: Number.MAX_SAFE_INTEGER,
        member,
        campaign,
        tiers: [],
      };
    }

    const tierIds = (
      member.relationships?.currently_entitled_tiers?.data || []
    ).map((t) => t.id);
    if (!tierIds.length) {
      return {
        level: "free",
        label: "Free",
        amountCents: 0,
        member,
        campaign,
        tiers: [],
      };
    }

    const userTiers = tierIds.map((id) => tiersIndex[id]).filter(Boolean);
    if (!userTiers.length) {
      return {
        level: "free",
        label: "Free",
        amountCents: 0,
        member,
        campaign,
        tiers: [],
      };
    }

    let highest = null;
    let highestIndex = -1;
    campaignTiers.forEach((tier, index) => {
      if (tierIds.includes(tier?.id)) {
        if (
          !highest ||
          (tier?.attributes?.amount_cents || 0) >=
            (highest?.attributes?.amount_cents || 0)
        ) {
          highest = tier;
          highestIndex = index;
        }
      }
    });

    if (!highest) {
      highest = userTiers[userTiers.length - 1];
      highestIndex = campaignTiers.findIndex((t) => t?.id === highest?.id);
    }

    let level = "low";
    if (highestIndex >= campaignTiers.length - 1) {
      level = "high";
    } else if (highestIndex >= 2) {
      level = "mid";
    }

    const label = highest?.attributes?.title || "Supporter";
    const amountCents = highest?.attributes?.amount_cents || 0;

    return { level, label, amountCents, member, campaign, tiers: userTiers };
  }

  async function fetchMembership(accessToken, config) {
    const query = {
      include: "memberships.campaign,memberships.currently_entitled_tiers",
      "fields[member]": "patron_status",
      "fields[campaign]": "vanity,url",
    };
    const json = await fetchPatreonIdentity(accessToken, query);
    const identity = json.data;
    const isCreatorAccount = isCreatorIdentity(identity, config);
    const membershipRefs = json.data?.relationships?.memberships?.data || [];
    const members = indexIncludedByType(json.included, "member");
    const campaigns = indexIncludedByType(json.included, "campaign");
    const tiersIndex = indexIncludedByType(json.included, "tier");
    const targetSlug = config.campaignSlug;

    for (const ref of membershipRefs) {
      const member = members[ref.id];
      if (!member) {
        continue;
      }
      const campaignRel = member.relationships?.campaign?.data;
      if (!campaignRel) {
        continue;
      }
      const campaign = campaigns[campaignRel.id];
      const vanity = (
        campaign?.attributes?.vanity ||
        campaign?.attributes?.url ||
        ""
      ).toLowerCase();
      if (!campaign || !vanity.includes(targetSlug)) {
        continue;
      }

      let campaignTiers = resolveCampaignTiers(campaign.id, tiersIndex);
      if (!campaignTiers.length) {
        try {
          campaignTiers = await fetchCampaignTiersFallback(
            campaign.id,
            accessToken,
          );
          if (campaignTiers.length) {
            campaignTierCache.set(campaign.id, campaignTiers);
          }
        } catch (fallbackError) {
          console.warn(
            "Failed to fetch campaign tiers via fallback",
            fallbackError,
          );
        }
      }
      const result = buildMembershipResult(
        member,
        campaign,
        tiersIndex,
        campaignTiers,
      );
      if (result.level === "creator" || isCreatorAccount) {
        result.level = "creator";
        result.label =
          identity?.attributes?.full_name || result.label || "Creator";
      }
      return result;
    }

    if (isCreatorAccount) {
      return {
        level: "creator",
        label: identity?.attributes?.full_name || "Creator",
        amountCents: Number.MAX_SAFE_INTEGER,
        member: null,
        campaign: null,
        tiers: [],
      };
    }

    return {
      level: "free",
      label: "Free",
      amountCents: 0,
      member: null,
      campaign: null,
      tiers: [],
    };
  }

  async function ensureMembership() {
    const config = resolveConfig();
    if (!config.clientId || !config.redirectUri) {
      console.warn(
        "Patreon configuration is incomplete. Falling back to free tier.",
      );
      return {
        level: "free",
        label: "Free",
        amountCents: 0,
        member: null,
        campaign: null,
        tiers: [],
      };
    }
    if (
      cachedMembership &&
      Date.now() - cachedMembershipFetchedAt < membershipCacheTtlMs
    ) {
      return cachedMembership;
    }
    const tokens = await ensureAccessToken(config);
    const membership = await fetchMembership(tokens.accessToken, config);
    cachedMembership = membership;
    cachedMembershipFetchedAt = Date.now();
    return membership;
  }

  function logout() {
    clearTokens();
    clearLastAuthorizationCode();
    cachedMembership = null;
    cachedMembershipFetchedAt = 0;
  }

  return {
    ensureMembership,
    logout,
    resolveConfig,
  };
})();

function applyActiveMembership(membership) {
  if (!membership || typeof membership !== "object") {
    activeUserTier = {
      level: "free",
      label: "Free",
      amountCents: 0,
      membership: null,
    };
  } else {
    const rawLevel =
      membership.level ||
      (membership.tiers && membership.tiers.length ? "low" : "free");
    const level = rawLevel.toLowerCase();
    const fallbackLabel =
      membership.tiers && membership.tiers.length
        ? membership.tiers[membership.tiers.length - 1]?.attributes?.title ||
          "Supporter"
        : "Free";
    const label = membership.label || fallbackLabel;
    const amountCents =
      typeof membership.amountCents === "number" ? membership.amountCents : 0;
    activeUserTier = { level, label, amountCents, membership };
  }

  switch (activeUserTier.level) {
    case "creator":
    case "high":
      activeUserLimit = userLimit.high;
      break;
    case "mid":
      activeUserLimit = userLimit.mid;
      break;
    case "low":
      activeUserLimit = userLimit.low;
      break;
    default:
      activeUserLimit = 0;
      break;
  }
}

const debounceSearchFiles = mydebounce((searchTerm, fileTypes) => {
  if (!searchTerm || searchTerm == "") {
    refreshFiles(currentFolder, undefined, undefined, undefined, fileTypes);
    return;
  }
  refreshFiles("", false, true, searchTerm, fileTypes);
}, 200);

async function launchFilePicker(selectFunction = false, fileTypes = []) {
  $("#avtt-s3-uploader").find(".title_bar_close_button").click();
  const draggableWindow = find_or_create_generic_draggable_window(
    "avtt-s3-uploader",
    "AVTT File Uploader",
    true,
    false,
    undefined,
    "800px",
    "600px",
    undefined,
    undefined,
    false,
    "input, li, a, label",
  );
  draggableWindow.toggleClass("prevent-sidebar-modal-close", true);
  let membership;
  try {
    membership = await PatreonAuth.ensureMembership();
  } catch (error) {
    console.error("Patreon verification failed", error);
    alert("Patreon login is required to open the AVTT File Uploader.");
    return;
  }

  applyActiveMembership(membership);

  if (activeUserTier.level === "free") {
    const patreonConfig = PatreonAuth.resolveConfig();
    if (!patreonConfig.clientId || !patreonConfig.redirectUri) {
      alert("Patreon login is not configured.");
      return;
    }

    const shouldAttemptLogin = window.confirm(
      "Log in with Patreon to verify your Azmoria membership?",
    );
    if (!shouldAttemptLogin) {
      return;
    }

    PatreonAuth.logout();
    try {
      membership = await PatreonAuth.ensureMembership();
      applyActiveMembership(membership);
    } catch (reauthError) {
      console.error(
        "Patreon verification failed after reauth prompt",
        reauthError,
      );
      alert(
        "Patreon verification failed. Patreon login is required to open the AVTT File Uploader.",
      );
      return;
    }

    if (activeUserTier.level === "free") {
      alert(
        "Unable to detect an active Azmoria Patreon membership. Please check your subscription tier and try again.",
      );
      return;
    }
  }

  currentFolder = "";
  const filePicker = $(` 
        <style>   
            #avtt-file-picker {
                background: var(--background-color, #fff);
                color: var(--font-color, #000);
                border-radius: 5px;
                top: -6px;
                position: relative;
                padding: 10px;
                height: calc(100% - 25px);
                overflow: scroll;
                border: 1px solid #ddd;
            }
            #file-listing-section {
                text-align: left;
                margin: 7px 10px 20px 10px;
                border: 1px solid gray;
                padding: 10px;
                list-style: none;
                padding: 0px;
                height: calc(100% - 170px);
                overflow-y: auto;
            }
            #file-listing-section tr{
                padding: 3px 5px;
                margin: 5px 0px;
            }
            #file-listing-section tr input {
                height: 16px;
                width: 16px;
                margin: 3px 0px;
                vertical-align: middle;
            }
            #file-listing-section tr td:first-of-type {
                width: 30px;
            }
            #file-listing-section tr td {
                vertical-align: middle;
            }
            label.avtt-file-name .material-symbols-outlined {
                font-size: 26px;
                vertical-align: middle;
                margin-right: 10px;
                color: #e11414;
            }

            label.avtt-file-name .material-symbols-outlined {
              font-variation-settings:
              'FILL' 1,
              'wght' 700,
              'GRAD' 0,
              'opsz' 48
            }

            label.avtt-file-name {
              vertical-align: middle;
            }

            #avtt-file-picker.avtt-drop-over {
                border-color: var(--highlight-color, rgba(131, 185, 255, 1));
                box-shadow: 0 0 8px rgba(131, 185, 255, 0.6);
            }

            #avtt-file-picker.avtt-drop-over #file-listing-section {
                backdrop-filter: brightness(1.05);
            }
            #upFolder{
              display:flex;
              max-width:400px;
              flex-wrap: nowrap;
            }
            a.avtt-breadcrumb {
                flex-grow:1;
                white-space: nowrap;
            }
            a.avtt-breadcrumb:not(:first-of-type):not(:last-of-type) {
                flex-shrink:1;
                overflow: hidden;
            }
            .crumbSeparator{
                margin: 0 5px;
            }
            div#avtt-select-controls button {
                background: var(--background-color, #fff);
                color: var(--font-color, #000);
                border: 1px solid gray;
                border-radius: 5px;
                padding: 5px;
                margin-right: 10px;
            }
            a.avtt-breadcrumb:not(:first-of-type):not(:last-of-type)
            {
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            div#avtt-select-controls button:active{
                transform: translate(1px, 1px);
                background-color: color-mix(in srgb, var(--background-color, #fff) 100%, #808080 50%);
            }
            div#select-section>div {
                margin: 5px 0px 0px 0px;
            }
            #file-listing-section tr label{
                flex-grow: 1;
                overflow: hidden;
                text-overflow: ellipsis;    
                white-space: nowrap;
                margin-bottom: 0px;
            }
            #select-section{
                display: flex;
                text-align: right;
                flex-direction: column;
                align-items: flex-end;
            }
            #file-listing-section tr:nth-of-type(odd) {
                backdrop-filter: brightness(0.95);
            }
        
        </style>
        <div id="avtt-file-picker">
            <div id="select-section">
                <div>
                    <div id='sizeUsed'><span id='user-used'></span> used of <span id='user-limit'> </span></div>
                    <div id='patreon-tier'></div>
                </div>
                <div style='display: flex; align-items: center; gap: 10px;'>
                    <div id='create-folder' style='color: var(--highlight-color, rgba(131, 185, 255, 1));margin: 0;cursor:pointer;'>Create Folder</div>
                    <input id='create-folder-input' type='text' placeholder='folder name' />
                </div>
                <div style='display: flex; align-items: center; gap: 10px;'>
                    <div id='uploading-file-indicator' style='display:none'></div>
                    <label style='color: var(--highlight-color, rgba(131, 185, 255, 1));margin: 0;cursor:pointer;' for="file-input">Upload File</label>
                    <input style='display:none;' type="file" multiple id="file-input"
                        accept="image/*,video/*,audio/*,.uvtt,.json,.dd2vtt,.df2vtt,application/pdf" />
                    <input id='search-files' type='text' placeholder='Search' />
                </div>
            </div>
            <div id='upFolder' style='position: absolute; left: 30px; top:10px; text-align: left; cursor: pointer; var(--highlight-color, rgba(131, 185, 255, 1))'>
            </div>
            <div id="file-listing-section">
                <table id="file-listing">
                    <tr>
                        <td>Loading...
                        <td>
                    </tr>
                </table>
            </div>
            <div id="avtt-select-controls" style="text-align:center; margin-top:10px;">
                <button id="delete-selected-files">Delete</button>
                <button id="copy-path-to-clipboard" style="${typeof selectFunction === "function" ? "display: none;" : ""}">Copy Path</button>
                <button id="select-file" style="${typeof selectFunction === "function" ? "" : "display: none;"}">Select</button>
            </div>
        </div>

    
    
    `);
  draggableWindow.append(filePicker);
  draggableWindow.find(".sidebar-panel-loading-indicator").remove();

  $("body").append(draggableWindow);

  const tierLabel = document.getElementById("patreon-tier");
  if (tierLabel) {
    tierLabel.textContent = `Patreon tier: ${activeUserTier.label} | Upload limit ${formatFileSize(activeUserLimit)}`;
  }

  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit

  const fileInput = document.getElementById("file-input");
  const createFolder = document.getElementById("create-folder");
  const deleteSelectedButton = document.getElementById("delete-selected-files");
  const copyPathButton = document.getElementById("copy-path-to-clipboard");
  const searchInput = document.getElementById("search-files");
  const selectFile = document.getElementById("select-file");
  const filePickerElement = document.getElementById("avtt-file-picker");
  const uploadingIndicator = document.getElementById(
    "uploading-file-indicator",
  );

  refreshFiles(currentFolder, true, undefined, undefined, fileTypes);

  const showUploadingProgress = (index, total) => {
    if (!uploadingIndicator) {
      return;
    }
    uploadingIndicator.innerHTML = `Uploading File <span id='file-number'>${index + 1}</span> of <span id='total-files'>${total}</span>`;
    uploadingIndicator.style.display = "block";
  };

  const hideUploadingIndicator = () => {
    if (!uploadingIndicator) {
      return;
    }
    uploadingIndicator.innerHTML = "";
    uploadingIndicator.style.display = "none";
  };

  const showUploadComplete = () => {
    if (!uploadingIndicator) {
      return;
    }
    uploadingIndicator.innerHTML = "Upload Complete";
    setTimeout(() => {
      uploadingIndicator.style.display = "none";
    }, 2000);
  };

  const toNormalizedUploadPath = (file) => {
    const rawPath = (
      file.webkitRelativePath ||
      file.relativePath ||
      file.name ||
      ""
    )
      .replace(/^[\/]+/, "")
      .replace(/\\/g, "/");
    return rawPath || file.name;
  };

  const resolveUploadKey = (file) =>
    `${currentFolder}${toNormalizedUploadPath(file)}`;

  const uploadSelectedFiles = async (files) => {
    const fileArray = Array.from(files || []).filter(Boolean);
    if (!fileArray.length) {
      return;
    }

    let totalSize = 0;
    let uploadedBytes = 0;
    let uploadedCount = 0;

    for (let i = 0; i < fileArray.length; i += 1) {
      const selectedFile = fileArray[i];
      showUploadingProgress(i, fileArray.length);
      document.getElementById("user-used").innerHTML = formatFileSize(
        totalSize + S3_Current_Size,
      );
      const extension = getFileExtension(selectedFile.name);
      if (!isAllowedExtension(extension)) {
        alert("Skipping unsupported file type");
        if (i < fileArray.length) {
          continue;
        }
        hideUploadingIndicator();
        return;
      }
      if (selectedFile.size > MAX_FILE_SIZE) {
        alert("Skipping file. File is too large - 50MB maximum.");
        if (i < fileArray.length) {
          continue;
        }
        hideUploadingIndicator();
        return;
      }

      totalSize += selectedFile.size;
      if (
        activeUserLimit !== undefined &&
        totalSize + S3_Current_Size > activeUserLimit
      ) {
        alert(
          "Skipping File. This upload would exceed the storage limit your Patreon tier. Delete some files before uploading more.",
        );
        if (i < fileArray.length) {
          continue;
        }
        hideUploadingIndicator();
        return;
      }
      try {
        const uploadKey = resolveUploadKey(selectedFile);
        const presignResponse = await fetch(
          `${AVTT_S3}?filename=${encodeURIComponent(uploadKey)}&user=${window.PATREON_ID}&upload=true`,
        );
        if (!presignResponse.ok) {
          throw new Error("Failed to retrieve upload URL.");
        }

        const data = await presignResponse.json();
        const uploadHeaders = {};
        const inferredType = resolveContentType(selectedFile);
        if (inferredType) {
          uploadHeaders["Content-Type"] = inferredType;
        }

        const uploadResponse = await fetch(data.uploadURL, {
          method: "PUT",
          body: selectedFile,
          headers: uploadHeaders,
        });

        if (!uploadResponse.ok) {
          throw new Error("Upload failed.");
        }

        uploadedBytes += Number(selectedFile.size) || 0;
        uploadedCount += 1;
      } catch (error) {
        console.error(error);
        alert(error.message || "An unexpected error occurred while uploading.");
        if (uploadedCount > 0) {
          await applyUsageDelta(uploadedBytes, uploadedCount);
        }
        hideUploadingIndicator();
        return;
      }
    }

    if (uploadedCount > 0) {
      await applyUsageDelta(uploadedBytes, uploadedCount);
    }

    refreshFiles(currentFolder, true);
    showUploadComplete();
  };

  const assignRelativePath = (file, relativePath) => {
    if (!file || !relativePath || file.webkitRelativePath) {
      return file;
    }
    const normalized = relativePath.replace(/^[\/]+/, "").replace(/\\/g, "/");
    try {
      Object.defineProperty(file, "relativePath", {
        value: normalized,
        configurable: true,
      });
    } catch (defineError) {
      file.relativePath = normalized;
    }
    return file;
  };

  const readDirectoryEntries = async (directoryEntry, prefix = "") => {
    const reader = directoryEntry.createReader();
    const entries = [];

    await new Promise((resolve, reject) => {
      const read = () => {
        reader.readEntries((batch) => {
          if (!batch.length) {
            resolve();
            return;
          }
          entries.push(...batch);
          read();
        }, reject);
      };
      read();
    });

    const directoryPath = `${prefix}${directoryEntry.name ? `${directoryEntry.name}/` : ""}`;
    const files = [];

    for (const entry of entries) {
      if (entry.isDirectory) {
        const nestedFiles = await readDirectoryEntries(entry, directoryPath);
        files.push(...nestedFiles);
      } else if (entry.isFile) {
        const file = await new Promise((resolve, reject) =>
          entry.file(resolve, reject),
        );
        files.push({ file, relativePath: `${directoryPath}${file.name}` });
      }
    }

    return files;
  };

  const collectDroppedFiles = async (dataTransfer) => {
    if (!dataTransfer) {
      return [];
    }

    const items = dataTransfer.items;
    if (!items || !items.length) {
      return Array.from(dataTransfer.files || []);
    }

    const collected = [];

    for (const item of items) {
      if (item.kind !== "file") {
        continue;
      }

      const entry =
        typeof item.webkitGetAsEntry === "function"
          ? item.webkitGetAsEntry()
          : null;

      if (entry && entry.isDirectory) {
        const directoryFiles = await readDirectoryEntries(entry);
        for (const { file, relativePath } of directoryFiles) {
          collected.push(assignRelativePath(file, relativePath));
        }
      } else {
        const file = item.getAsFile();
        if (file) {
          collected.push(assignRelativePath(file, file.name));
        }
      }
    }

    if (!collected.length) {
      return Array.from(dataTransfer.files || []);
    }

    return collected;
  };

  fileInput.addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }

    try {
      await uploadSelectedFiles(files);
    } finally {
      event.target.value = "";
    }
  });


  let dragDepth = 0;

  const preventDefaults = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const activateDropState = () => {
    filePickerElement.classList.add("avtt-drop-over");
  };

  const clearDropState = () => {
    dragDepth = 0;
    filePickerElement.classList.remove("avtt-drop-over");
  };

  filePickerElement.addEventListener("dragenter", (event) => {
    preventDefaults(event);
    dragDepth += 1;
    activateDropState();
  });

  filePickerElement.addEventListener("dragover", (event) => {
    preventDefaults(event);
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    activateDropState();
  });

  filePickerElement.addEventListener("dragleave", (event) => {
    preventDefaults(event);
    dragDepth = Math.max(dragDepth - 1, 0);
    if (dragDepth === 0) {
      clearDropState();
    }
  });

  filePickerElement.addEventListener("drop", async (event) => {
    preventDefaults(event);
    clearDropState();

    const transfer = event.dataTransfer;
    if (!transfer) {
      return;
    }

    try {
      const droppedFiles = await collectDroppedFiles(transfer);
      if (droppedFiles.length) {
        await uploadSelectedFiles(droppedFiles);
      }
    } catch (error) {
      console.error("Failed to upload dropped files", error);
      alert(error.message || "An unexpected error occurred while uploading dropped files.");
      hideUploadingIndicator();
    }
  });
  

  selectFile.addEventListener("click", (event) => {
    const selectedCheckboxes = $('#file-listing input[type="checkbox"]:checked');

    if (selectedCheckboxes.length == 0) {
      return;
    }
    const paths = [];
    for (const selected of selectedCheckboxes) {
      const name = selected.value.replace(/^.*\//gi, "").replace(/\..*$/gi, "");
      const link = `above-bucket-not-a-url/${window.PATREON_ID}/${selected.value}`;
      paths.push({ link: link, name: name });
    }

    selectFunction(paths);
    draggableWindow.find(".title_bar_close_button").click();
  });

  $(searchInput)
    .off("change keypress input")
    .on("change keypress input", async (event) => {
      const searchTerm = event.target.value;
      debounceSearchFiles(searchTerm, fileTypes);
    });

  createFolder.addEventListener("click", async (event) => {
    const folderName = $("#create-folder-input").val();
    try {
      await fetch(
        `${AVTT_S3}?folderName=${encodeURIComponent(`${currentFolder}${folderName}`)}&user=${window.PATREON_ID}`,
      );
      refreshFiles(currentFolder);
    } catch {
      alert("Failed to create folder");
    }
  });

  copyPathButton.addEventListener("click", () => {
    const selectedCheckboxes = $(
      '#file-listing input[type="checkbox"]:checked',
    );

    if (selectedCheckboxes.length == 0) {
      return;
    }
    const paths = [];
    for (const selected of selectedCheckboxes) {
      paths.push(
        `above-bucket-not-a-url/${window.PATREON_ID}/${selected.value}`,
      );
    }
    const copyText = paths.join(", ");
    navigator.clipboard.writeText(copyText);
  });

  deleteSelectedButton.addEventListener("click", async () => {
    const selectedCheckboxes = $('#file-listing input[type="checkbox"]:checked').get();
    if (selectedCheckboxes.length === 0) {
      return;
    }
    const selections = selectedCheckboxes.map((element) => {
      const sizeAttr = Number(element.getAttribute("data-size"));
      return {
        key: element.value,
        size: Number.isFinite(sizeAttr) ? sizeAttr : 0,
        isFolder: element.classList.contains("folder"),
      };
    });
    await deleteFilesFromS3Folder(selections);
  });

  function isAllowedExtension(extension) {
    return (
      allowedImageTypes.includes(extension) ||
      allowedVideoTypes.includes(extension) ||
      allowedAudioTypes.includes(extension) ||
      allowedJsonTypes.includes(extension) ||
      allowedDocTypes.includes(extension) ||
      allowedTextTypes.includes(extension)
    );
  }

  function resolveContentType(file) {
    if (file.type) {
      return file.type;
    }

    const extension = getFileExtension(file.name);
    if (allowedJsonTypes.includes(extension)) {
      return "application/json";
    }
    if (allowedImageTypes.includes(extension)) {
      return `image/${extension === "jpg" ? "jpeg" : extension}`;
    }
    if (allowedVideoTypes.includes(extension)) {
      return `video/${extension}`;
    }
    if (allowedAudioTypes.includes(extension)) {
      return `audio/${extension}`;
    }
    if (allowedDocTypes.includes(extension)) {
      return `application/pdf`;
    }
    if (allowedTextTypes.includes(extension)) {
      return "text/plain";
    }
    return "";
  }
}

function getFileExtension(name) {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function refreshFiles(
  path,
  recheckSize = false,
  allFiles = false,
  searchTerm,
  fileTypes,
) {
    if (recheckSize) {
        getUserUploadedFileSize().then((size) => {
        S3_Current_Size = size;
        document.getElementById("user-used").innerHTML = formatFileSize(S3_Current_Size);
        document.getElementById("user-limit").innerHTML = formatFileSize(activeUserLimit);
        const tierLabel = document.getElementById("patreon-tier");
        if (tierLabel) {
            tierLabel.textContent = `Patreon tier: ${activeUserTier.label} | Upload limit ${formatFileSize(activeUserLimit)}`;
        }
        });
    }
    if(!window.firstFilePickerLoad){
        getUserUploadedFileSize(true).then((size) => {
            S3_Current_Size = size;
            document.getElementById("user-used").innerHTML = formatFileSize(S3_Current_Size);
        });
        window.firstFilePickerLoad = true;
    }

    const fileListing = document.getElementById("file-listing");
    const upFolder = $("#upFolder");
    if (path != ""){
      const splitPath = path.replace(/\/$/gi, "").split("/");
      const breadCrumbs = splitPath.map((part, index) => {
        const crumbPath = splitPath.slice(0, index + 1).join("/") + "/";
        return `<a href="#" class="avtt-breadcrumb" data-path="${crumbPath}">${part}</a>`;
      });
      breadCrumbs.unshift(`<a href="#" class="avtt-breadcrumb" data-path="">Home</a>`);
      upFolder.html(`${breadCrumbs.join("<span class='crumbSeparator'>></span>")}`);
      upFolder.find('.avtt-breadcrumb').on("click", function (e) {
        e.preventDefault();
        const newPath = e.currentTarget.getAttribute("data-path");
        refreshFiles(newPath, undefined, undefined, undefined, fileTypes);
        currentFolder = newPath;
      });
      upFolder.show();
    } 
    else{
      upFolder.hide();
    }



    const insertFiles = (files, searchTerm, fileTypes) => {
        console.log("Files in folder: ", files);
        if (files.length === 0) {
        fileListing.innerHTML = "<tr><td>No files found.</td></tr>";
        } else {
        fileListing.innerHTML = "";
        for (const fileEntry of files) {
            const listItem = document.createElement("tr");
            const regEx = new RegExp(`^${window.PATREON_ID}/`, "gi");
            const rawKey =
            typeof fileEntry === "object" && fileEntry !== null
                ? fileEntry.Key || fileEntry.key || ""
                : fileEntry;
            if (!rawKey) {
            continue;
            }
            const path = rawKey.replace(regEx, "");
            const size =
            typeof fileEntry === "object" &&
            fileEntry !== null &&
            Number.isFinite(Number(fileEntry.Size))
                ? Number(fileEntry.Size)
                : 0;

            const isFolder = path.match(/\/$/gi);
            const extension = getFileExtension(rawKey);
            let type;
            if (isFolder) {
              type = avttFilePickerTypes.FOLDER;
            } else if (allowedJsonTypes.includes(extension)) {
              type = avttFilePickerTypes.UVTT;
            } else if (allowedImageTypes.includes(extension)) {
              type = avttFilePickerTypes.IMAGE;
            } else if (allowedVideoTypes.includes(extension)) {
              type = avttFilePickerTypes.VIDEO;
            } else if (allowedAudioTypes.includes(extension)) {
              type = avttFilePickerTypes.AUDIO;
            } else if (allowedDocTypes.includes(extension)) {
              type = avttFilePickerTypes.PDF;
            } else if (allowedTextTypes.includes(extension)) {
              if (extension.toLowerCase() === avttFilePickerTypes.ABOVEVTT.toLowerCase()) {
                type = avttFilePickerTypes.ABOVEVTT;
              } else if (extension.toLowerCase() === avttFilePickerTypes.CSV.toLowerCase()) {
                type = avttFilePickerTypes.CSV;
              }
            }

            const fileTypeIcon = {
              [avttFilePickerTypes.FOLDER]: "folder",
              [avttFilePickerTypes.UVTT]: "description",
              [avttFilePickerTypes.IMAGE]: "imagesmode",
              [avttFilePickerTypes.VIDEO]: "video_file",
              [avttFilePickerTypes.AUDIO]: "audio_file",
              [avttFilePickerTypes.PDF]: "picture_as_pdf",
              [avttFilePickerTypes.ABOVEVTT]: "description",
              [avttFilePickerTypes.CSV]: "csv",
            }

           
            const input = $(
            `<td><input type="checkbox" id='input-${path}' class="avtt-file-checkbox ${isFolder ? "folder" : ""}" value="${path}" data-size="${isFolder ? 0 : size}"></td>`,
            );
            const label = $(
              `<td><label for='input-${path}' style="cursor:pointer;" class="avtt-file-name  ${isFolder ? "folder" : ""}" title="${path}"><span class="material-symbols-outlined">${fileTypeIcon[type]}</span>${path.split('/').filter(d=>d).pop()}</label></td>`,
            );

            
            if (searchTerm != undefined) {
            const lowerSearch = searchTerm.toLowerCase();

            if (
                !path.toLowerCase().includes(lowerSearch) &&
                type.toLowerCase() != lowerSearch
            )
                continue;
            }
            if (fileTypes != undefined && fileTypes.length > 0) {
            if (type != avttFilePickerTypes.FOLDER && !fileTypes.includes(type))
                continue;
            }

            const typeCell = $(`<td>${type}</td>`);

            $(listItem).append(input, label, typeCell);
            if (isFolder) {
            label.off("click.openFolder").on("click.openFolder", function (e) {
                e.preventDefault();
                refreshFiles(path, undefined, undefined, undefined, fileTypes);
                currentFolder = path;
            });
            }
            fileListing.appendChild(listItem);
        }
        }
    };
    if (allFiles) {
        getAllUserFiles()
        .then((files) => insertFiles(files, searchTerm, fileTypes))
        .catch((err) => {
            alert("Error fetching folder listing. See console for details.");
            console.error("Error fetching folder listing: ", err);
        });
    } else {
        getFolderListingFromS3(path)
        .then((files) => insertFiles(files, searchTerm, fileTypes))
        .catch((err) => {
            alert("Error fetching folder listing. See console for details.");
            console.error("Error fetching folder listing: ", err);
        });
    }
}

async function sendUsageUpdate(payload) {
  try {
    const response = await fetch(`${AVTT_S3}?action=usage&user=${window.PATREON_ID}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    let json = null;
    try {
      json = await response.json();
    } catch (parseError) {
      json = null;
    }
    if (!response.ok) {
      const message = json && json.message ? json.message : "Usage update failed.";
      throw new Error(message);
    }
    return json;
  } catch (error) {
    console.warn("Usage update failed", error);
    return null;
  }
}

async function applyUsageDelta(deltaBytes, deltaObjects) {
  const bytes = Number(deltaBytes) || 0;
  const objects = Number(deltaObjects) || 0;
  if (bytes === 0 && objects === 0) {
    return null;
  }
  return await sendUsageUpdate({ deltaBytes: bytes, objectDelta: objects });
}

async function deleteFilesFromS3Folder(selections, fileTypes) {
  const entries = Array.isArray(selections) ? selections.filter((entry) => entry && entry.key) : [];
  if (entries.length === 0) {
    return;
  }

  const payload = {
    keys: entries.map((entry) => ({
      key: entry.key,
      size: Number(entry.size) || 0,
      isFolder: Boolean(entry.isFolder),
    })),
  };
  payload.totalSize = payload.keys.reduce((sum, entry) => sum + (Number(entry.size) || 0), 0);
  payload.objectCount = entries.length;

  try {
    const response = await fetch(`${AVTT_S3}?user=${window.PATREON_ID}&deleteFiles=true`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const json = await response.json();
    if (!response.ok || !json.deleted) {
      throw new Error(json?.message || "Failed to delete file(s)");
    }
    refreshFiles(currentFolder, true, undefined, undefined, fileTypes);
  } catch (error) {
    console.error("Failed to delete files", error);
    alert(error.message || "Failed to delete file(s).");
  }
}

// Enforce sequential fetches with retry backoff to protect the S3 endpoint.
const GET_FILE_FROM_S3_MAX_RETRIES = 5;
const GET_FILE_FROM_S3_BASE_DELAY_MS = 250;
const GET_FILE_FROM_S3_MAX_DELAY_MS = 4000;
const getFileFromS3Queue = [];
const getFileFromS3Pending = new Map();
let isProcessingGetFileFromS3Queue = false;

function getFileFromS3Delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function processGetFileFromS3Queue() {
  if (isProcessingGetFileFromS3Queue) 
    return;
  
  isProcessingGetFileFromS3Queue = true;
  while (getFileFromS3Queue.length > 0) {
    const { originalName, cacheKey, sanitizedKey, resolve, reject } = getFileFromS3Queue.shift();
    try {
      const result = await fetchFileFromS3WithRetry(originalName, cacheKey, sanitizedKey);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  }
  isProcessingGetFileFromS3Queue = false;
}

async function fetchFileFromS3WithRetry(originalName, cacheKey, sanitizedKey) {
  const patreonId = originalName.split("/")[0];
  const fileNameOnly = sanitizedKey || originalName;
  if (!patreonId) {
    throw new Error("Missing Patreon ID for S3 file lookup");
  }

  let attempt = 0;
  let lastError = null;
  while (attempt < GET_FILE_FROM_S3_MAX_RETRIES) {
    attempt += 1;
    try {
      const response = await fetch(`${AVTT_S3}?user=${patreonId}&filename=${fileNameOnly}`);
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.message || `Failed to fetch file from S3 (${response.status})`);
      }
      const fileURL = json.downloadURL;
      if (!fileURL) {
        throw new Error("File not found on S3");
      }
      window.avtt_file_urls[cacheKey] = {
        url: fileURL,
        expire: Date.now() + 3500000
      };
      if (sanitizedKey && sanitizedKey !== cacheKey) {
        window.avtt_file_urls[sanitizedKey] = {
          url: fileURL,
          expire: Date.now() + 3500000
        };
      }
      console.log("File found on S3: ", fileURL);
      return fileURL;
    } catch (error) {
      lastError = error;
      if (attempt >= GET_FILE_FROM_S3_MAX_RETRIES) {
        break;
      }
      const backoffDelay = Math.min(GET_FILE_FROM_S3_BASE_DELAY_MS * 2 ** (attempt - 1), GET_FILE_FROM_S3_MAX_DELAY_MS);
      await getFileFromS3Delay(backoffDelay);
    }
  }
  throw lastError || new Error("Failed to fetch file from S3");
}

async function getFileFromS3(fileName) {
  const originalName = typeof fileName === "string" ? fileName : "";
  if (!originalName) {
    throw new Error("Missing filename for S3 request");
  }
  const cacheKey = originalName;
  const sanitizedKey = originalName.replace(/^.*?\//gi, "");

  if (!window.avtt_file_urls) {
    window.avtt_file_urls = {};
  } 
  const cachedValue = window.avtt_file_urls[cacheKey] || (sanitizedKey ? window.avtt_file_urls[sanitizedKey] : undefined);
  if (cachedValue?.expire > Date.now()){
    return cachedValue.url;
  }

  if (getFileFromS3Pending.has(cacheKey)) {
    return getFileFromS3Pending.get(cacheKey);
  }

  const queuedPromise = new Promise((resolve, reject) => {
    getFileFromS3Queue.push({
      originalName,
      cacheKey,
      sanitizedKey,
      resolve,
      reject,
    });
  });
  getFileFromS3Pending.set(cacheKey, queuedPromise);
  processGetFileFromS3Queue();

  try {
    return await queuedPromise;
  } finally {
    getFileFromS3Pending.delete(cacheKey);
  }
}

async function getFolderListingFromS3(folderPath) {
  const url = await fetch(`${AVTT_S3}?user=${window.PATREON_ID}&filename=${encodeURIComponent(folderPath)}&list=true`);
  const json = await url.json();
  const folderContents = json.folderContents || [];
  return folderContents;
}

async function getUserUploadedFileSize(forceFullCheck=false) {
    async function fallBack(){
        const folderContents = await getAllUserFiles();
        let userSize = 0;
        let objectCount = 0;
        for (const file of folderContents) {
            if (!file || !file.Key) {
                continue;
            }
            userSize += Number(file.Size) || 0;
            objectCount += 1;
        }
        try {
            await fetch(`${AVTT_S3}?action=usage&user=${window.PATREON_ID}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ totalBytes: userSize, objectCount }),
            });
        } catch (persistError) {
            console.warn("Failed to persist usage fallback", persistError);
        }
        return userSize;
    }

    if (forceFullCheck)
        return await fallBack()

    try {
        const response = await fetch(
        `${AVTT_S3}?action=usage&user=${window.PATREON_ID}`,
        );
        const json = await response.json();
        if (!response.ok) {
        throw new Error(json?.message || "Usage lookup failed");
        }
        if (typeof json.totalBytes === "number") {
        return json.totalBytes;
        }
        throw new Error("Usage total missing");
    } catch (error) {
        console.warn("Falling back to full listing for usage", error);
        return await fallBack()
    }
}

async function getAllUserFiles() {
  const url = await fetch(
    `${AVTT_S3}?user=${window.PATREON_ID}&filename=${encodeURIComponent("")}&list=true&includeSubDirFiles=true`,
  );
  const json = await url.json();
  const folderContents = json.folderContents;

  return folderContents;
}
