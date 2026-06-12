// GY AdBlock v6 response cleaner for Shadowrocket and Surge-compatible runtimes.
// Safety model: route allowlist, strong ad markers, known containers, no broad key deletion.
// v6 changes vs v5:
//   - container emptying uses cheap emptiness checks instead of JSON.stringify comparison;
//   - bilibili splash no longer fabricates a `data` object when the response has none;
//   - behavior contract unchanged: unknown route, non-JSON, or unmodified body pass through as-is.

var DEBUG = false;
var requestUrl =
  typeof $request !== "undefined" && typeof $request.url === "string"
    ? $request.url
    : "";
var responseBody =
  typeof $response !== "undefined" && typeof $response.body === "string"
    ? $response.body
    : "";

var AD_CONTAINER_KEYS = {
  ad: true,
  ads: true,
  ad_list: true,
  adList: true,
  ad_info: true,
  adInfo: true,
  advert: true,
  adverts: true,
  advertisement: true,
  advertisements: true,
  advertInfos: true,
  splash_ad: true,
  splashAds: true,
  startup_ad: true,
  startupAd: true,
  open_ad: true,
  openAd: true,
  popup_ad: true,
  popupAd: true,
  feed_ad: true,
  feedAd: true,
  brand_ad: true,
  brandAd: true,
  promotion_ad: true,
  promotionAd: true,
  commercial: true,
  commercials: true,
};

var AD_BOOLEAN_KEYS = {
  is_ad: true,
  isAd: true,
  has_ad: true,
  hasAd: true,
  show_ad: true,
  showAd: true,
  need_ad: true,
  needAd: true,
  show_popup_ad: true,
  showPopupAd: true,
};

var AD_TYPE_TOKENS = {
  ad: true,
  ads: true,
  advert: true,
  advertisement: true,
  commercial: true,
  sponsor: true,
  sponsored: true,
  feed_ad: true,
  brand_ad: true,
  card_goto_ad: true,
  splash_ad: true,
  startup_ad: true,
  open_ad: true,
  popup_ad: true,
};

var EMPTY_BILIBILI_SPLASH_KEYS = [
  "list",
  "show",
  "brand_list",
  "preload",
  "splash_list",
];

function debug(message) {
  if (DEBUG && typeof console !== "undefined") {
    console.log("[GY-AdBlock-v6] " + message);
  }
}

function donePassThrough() {
  $done({});
}

function doneWithBody(value) {
  $done({ body: JSON.stringify(value) });
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isEnabledFlag(value) {
  return value === true || value === 1 || value === "1";
}

function hasPositiveIdentifier(value) {
  if (value === null || typeof value === "undefined") return false;
  var text = String(value).trim().toLowerCase();
  return text !== "" && text !== "0" && text !== "false" && text !== "null";
}

function normalizeToken(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function hasAdTypeToken(value) {
  var token = normalizeToken(value);
  if (!token) return false;
  if (AD_TYPE_TOKENS[token]) return true;
  return /^(?:ad|ads|cm)(?:[_-]|$)/.test(token);
}

function hasExplicitAdObject(object) {
  if (!isObject(object)) return false;

  var booleanKeys = [
    "is_ad",
    "isAd",
    "has_ad",
    "hasAd",
    "show_ad",
    "showAd",
    "need_ad",
    "needAd",
  ];
  for (var i = 0; i < booleanKeys.length; i += 1) {
    var booleanKey = booleanKeys[i];
    if (hasOwn(object, booleanKey) && isEnabledFlag(object[booleanKey])) {
      return true;
    }
  }

  var idKeys = ["ad_id", "adId", "creative_id", "creativeId"];
  for (var j = 0; j < idKeys.length; j += 1) {
    var idKey = idKeys[j];
    if (hasOwn(object, idKey) && hasPositiveIdentifier(object[idKey])) {
      return true;
    }
  }

  if (hasOwn(object, "ad_info") && isObject(object.ad_info)) return true;
  if (hasOwn(object, "adInfo") && isObject(object.adInfo)) return true;

  var typeKeys = [
    "card_type",
    "cardType",
    "card_goto",
    "cardGoto",
    "goto",
    "type",
    "item_type",
    "itemType",
    "biz_type",
    "bizType",
    "module",
  ];
  for (var k = 0; k < typeKeys.length; k += 1) {
    var typeKey = typeKeys[k];
    if (hasOwn(object, typeKey) && hasAdTypeToken(object[typeKey])) {
      return true;
    }
  }

  return false;
}

function emptyLike(value) {
  if (Array.isArray(value)) return [];
  if (isObject(value)) return {};
  if (typeof value === "boolean") return false;
  if (typeof value === "number") return 0;
  if (typeof value === "string") return "";
  return value;
}

// True when emptying the value would not change it. Cheap replacement for the
// v5 JSON.stringify comparison.
function isAlreadyEmpty(value) {
  if (Array.isArray(value)) return value.length === 0;
  if (isObject(value)) return Object.keys(value).length === 0;
  if (typeof value === "boolean") return value === false;
  if (typeof value === "number") return value === 0;
  if (typeof value === "string") return value === "";
  return true;
}

function sanitizeKnownAds(value, state, depth) {
  if (depth > 40 || state.visited > 50000) return value;
  state.visited += 1;

  if (Array.isArray(value)) {
    var filtered = [];
    for (var i = 0; i < value.length; i += 1) {
      if (hasExplicitAdObject(value[i])) {
        state.changed = true;
        continue;
      }
      filtered.push(sanitizeKnownAds(value[i], state, depth + 1));
    }
    return filtered;
  }

  if (!isObject(value)) return value;

  var keys = Object.keys(value);
  for (var j = 0; j < keys.length; j += 1) {
    var key = keys[j];
    var current = value[key];

    if (AD_BOOLEAN_KEYS[key] && current !== false) {
      value[key] = false;
      state.changed = true;
      continue;
    }

    if (AD_CONTAINER_KEYS[key]) {
      if (!isAlreadyEmpty(current)) {
        value[key] = emptyLike(current);
        state.changed = true;
      }
      continue;
    }

    value[key] = sanitizeKnownAds(current, state, depth + 1);
  }

  return value;
}

function clearArrayKey(object, key, state) {
  if (isObject(object) && Array.isArray(object[key]) && object[key].length > 0) {
    object[key] = [];
    state.changed = true;
  }
}

function cleanBilibiliSplash(object, state) {
  if (!isObject(object)) return object;

  // v6: do not fabricate `data` when the response has none; there is nothing
  // to clean and rewriting the body would be pointless churn.
  if (isObject(object.data)) {
    for (var i = 0; i < EMPTY_BILIBILI_SPLASH_KEYS.length; i += 1) {
      clearArrayKey(object.data, EMPTY_BILIBILI_SPLASH_KEYS[i], state);
    }

    if (object.data.rule) {
      object.data.rule = "";
      state.changed = true;
    }
  }

  return sanitizeKnownAds(object, state, 0);
}

function cleanKnownResponse(object, state) {
  return sanitizeKnownAds(object, state, 0);
}

var ROUTES = [
  {
    name: "bilibili-splash",
    pattern: /^https?:\/\/app\.bili(?:bili\.com|api\.net)\/x\/v2\/splash(?:\/|$|\?)/,
    clean: cleanBilibiliSplash,
  },
  {
    name: "bilibili-feed-and-navigation",
    pattern: /^https?:\/\/(?:app\.bili(?:bili\.com|api\.net)\/x\/(?:v2\/feed\/index|resource\/show\/tab|resource\/patch\/tab|v2\/search|v2\/account\/mine)|api\.bilibili\.com\/x\/web-interface\/wbi\/index\/top\/feed\/rcmd|api\.vc\.bilibili\.com\/dynamic_svr\/v1\/dynamic_svr\/dynamic_)/,
    clean: cleanKnownResponse,
  },
  {
    name: "shopping-ad-endpoints",
    pattern: /^https?:\/\/(?:(?:acs|guide-acs)\.m\.taobao\.com\/gw\/mtop\.(?:taobao\.wireless\.home\.(?:splash|newface)\.awesome\.get|alibaba\.advertisementservice\.getadv|taobao\.idle\.home\.welcome|fliggy\.crm\.screen\.(?:allresource|predict))|acs\.m\.goofish\.com\/gw\/mtop\.taobao\.idlecommerce\.splash|poplayer\.template\.alibaba\.com\/\w+\.json|api\.m\.jd\.com\/.*(?:\?|&)functionId=(?:deliverLayer|homeAreaPop|home_launchConfig|lite_advertising|queryMaterialAdverts|smart_delivery_strategy|start|stationPullService|uniformRecommend\d*|welcomeHome)(?:&|$)|api\.(?:yangkeduo|pinduoduo)\.com\/api\/cappuccino\/(?:splash|querySplash))/,
    clean: cleanKnownResponse,
  },
  {
    name: "zhihu-ad-feeds",
    pattern: /^https?:\/\/(?:api\.zhihu\.com\/(?:commercial_api|fringe\/ad|topstory)|web-render\.zhihu\.com\/topstory\/recommend)/,
    clean: cleanKnownResponse,
  },
  {
    name: "startup-endpoints",
    pattern: /^https?:\/\/(?:wmapi\.meituan\.com\/api\/v\d+\/(?:loadInfo|startpicture)|[^/]+\.meituan\.com\/api\/v\d\/(?:openscreen|loadInfo|startpicture)|api\.xueqiu\.com\/(?:lightsnow|snowpard)\/|api\.mcd\.cn\/bff\/portal\/(?:home\/splash|richpop)|res\.kfc\.com\.cn\/advertisement|dynamicad\.kfc\.com\.cn\/api|m\d\.amap\.com\/ws\/(?:shield\/dsp\/app\/startup\/init|valueadded\/alimama\/splash_screen)|newclient\.map\.baidu\.com\/client\/(?:crossmarketing|push\/getPushMsg)|app\.58\.com\/api\/home\/(?:advertising|appadv|invite\/popupAdv))/,
    clean: cleanKnownResponse,
  },
];

function findRoute(url) {
  for (var i = 0; i < ROUTES.length; i += 1) {
    if (ROUTES[i].pattern.test(url)) return ROUTES[i];
  }
  return null;
}

try {
  var route = findRoute(requestUrl);
  if (!route || !responseBody) {
    donePassThrough();
  } else {
    var parsed = JSON.parse(responseBody);
    var state = { changed: false, visited: 0 };
    var cleaned = route.clean(parsed, state);

    debug(route.name + " changed=" + state.changed + " visited=" + state.visited);
    if (state.changed) {
      doneWithBody(cleaned);
    } else {
      donePassThrough();
    }
  }
} catch (error) {
  debug("pass-through after error: " + error.message);
  donePassThrough();
}
