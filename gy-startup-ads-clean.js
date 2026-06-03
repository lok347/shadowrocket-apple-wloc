// GY multi-app ad cleaner for Shadowrocket/Surge-compatible MITM scripting.
// Self-host this file and reference it from gy-adblock-mitm-lite.sgmodule.

const url = typeof $request !== "undefined" ? $request.url : "";
const rawBody = typeof $response !== "undefined" ? $response.body : "";

function done(value) {
  if (typeof value === "string") {
    $done({ body: value });
    return;
  }
  $done({ body: JSON.stringify(value) });
}

function isObject(value) {
  return value !== null && typeof value === "object";
}

function emptyLike(value) {
  if (Array.isArray(value)) return [];
  if (isObject(value)) return {};
  if (typeof value === "number") return 0;
  if (typeof value === "boolean") return false;
  return "";
}

const adKeys = new Set([
  "ad",
  "ads",
  "ad_info",
  "adInfo",
  "ad_info_list",
  "adList",
  "adData",
  "ad_data",
  "adItems",
  "advert",
  "adverts",
  "advertise",
  "advertisement",
  "advertisements",
  "bannerAd",
  "floatAd",
  "float_ad",
  "floatingAd",
  "popup",
  "popups",
  "pop_up",
  "popupsList",
  "splash",
  "splashAd",
  "splash_ad",
  "splashAds",
  "startup",
  "startupAd",
  "startup_ad",
  "startpicture",
  "startPicture",
  "launchAd",
  "launch_ad",
  "openAd",
  "open_ad",
  "openScreenAd",
  "promotion",
  "promotions",
  "recommendAds",
  "commercial",
  "commercial_api",
  "marketing",
  "marketingAd",
  "operateAd",
  "couponPopup"
]);

const adKeyPattern = /(^|_|\b)(ad|ads|advert|advertise|advertisement|splash|startup|launch_ad|open_ad|popup|pop_up|commercial|promotion|marketing)(_|$|\b)/i;

function stringLooksLikeAd(value) {
  if (typeof value !== "string") return false;
  return /(^|[_\-\s])(ad|ads|advert|advertisement|splash|commercial|promotion)([_\-\s]|$)/i.test(value) ||
    value === "广告" ||
    value === "推广";
}

function shouldDropItem(item) {
  if (!isObject(item)) return false;

  const positiveFlags = [
    "is_ad",
    "isAd",
    "is_ads",
    "isAds",
    "ad",
    "ads",
    "adInfo",
    "ad_info",
    "advert",
    "advertisement",
    "commercial",
    "promotion"
  ];
  for (const key of positiveFlags) {
    if (item[key]) return true;
  }

  const markerKeys = [
    "type",
    "card_type",
    "cardType",
    "item_type",
    "itemType",
    "model_type",
    "modelType",
    "display_type",
    "displayType",
    "template",
    "templateName",
    "entityTemplate",
    "mblogtypename",
    "source"
  ];
  return markerKeys.some((key) => stringLooksLikeAd(item[key]));
}

function scrub(node, depth = 0) {
  if (!isObject(node) || depth > 12) return node;

  if (Array.isArray(node)) {
    const cleaned = [];
    for (const item of node) {
      if (!shouldDropItem(item)) cleaned.push(scrub(item, depth + 1));
    }
    return cleaned;
  }

  for (const key of Object.keys(node)) {
    if (adKeys.has(key) || adKeyPattern.test(key)) {
      node[key] = emptyLike(node[key]);
      continue;
    }

    if (Array.isArray(node[key])) {
      node[key] = scrub(node[key], depth + 1);
      continue;
    }

    if (isObject(node[key])) scrub(node[key], depth + 1);
  }
  return node;
}

function textOf(value) {
  if (value === null || value === undefined) return "";
  return String(value).toLowerCase();
}

function hasAny(value, words) {
  const text = textOf(value);
  return words.some((word) => text.includes(word));
}

function entryText(item) {
  if (!isObject(item)) return "";
  return [
    item.name,
    item.title,
    item.tab_id,
    item.uri,
    item.url,
    item.link,
    item.blink,
    item.goto,
    item.param
  ].map((part) => part || "").join(" ").toLowerCase();
}

function stripArray(value, predicate) {
  if (!Array.isArray(value)) return value;
  return value.filter((item) => !predicate(item));
}

function reindex(items) {
  if (!Array.isArray(items)) return items;
  return items.map((item, index) => {
    if (isObject(item) && "pos" in item) item.pos = index + 1;
    return item;
  });
}

function removeKeys(obj, keys) {
  if (!isObject(obj)) return obj;
  for (const key of keys) delete obj[key];
  return obj;
}

function isBilibiliUrl(value) {
  return /(?:bilibili\.com|biliapi\.net|bilibili\.net|bilivideo\.com)/.test(value);
}

function isBiliMallEntry(item) {
  const text = entryText(item);
  return text.includes("会员购") ||
    text.includes("mall/home") ||
    text.includes("mall/mine") ||
    text.includes("f_source=shop") ||
    text.includes("msource=mine");
}

function isBiliFollowBottomEntry(item) {
  const text = entryText(item);
  return text.includes("关注") ||
    text.includes("following/home") ||
    text.includes("dynamic");
}

function isBiliGameEntry(item) {
  const text = entryText(item);
  return text.includes("游戏中心") ||
    text.includes("game_center") ||
    text.includes("my_game");
}

function isBiliActivityTabEntry(item) {
  const text = entryText(item);
  return text.includes("home_activity_tab") ||
    text.includes("home_bottom_tab_activity_tab") ||
    text.includes("活动") ||
    text.includes("毕业歌会") ||
    text.includes("新征程");
}

function isBiliCommercialMineEntry(item) {
  if (!isObject(item)) return false;

  const commercialIds = new Set([
    400, 401, 402, 403, 404, 423, 514, 622, 741, 789, 791, 793, 794, 990, 1028, 2542
  ]);
  const text = entryText(item);

  return commercialIds.has(Number(item.id)) ||
    isBiliMallEntry(item) ||
    isBiliGameEntry(item) ||
    text.includes("我的课程") ||
    text.includes("个性装扮") ||
    text.includes("我的钱包") ||
    text.includes("看视频免流量") ||
    text.includes("邀好友赚红包") ||
    text.includes("社区中心") ||
    text.includes("大会员") ||
    text.includes("我的游戏") ||
    text.includes("我的nft") ||
    text.includes("能量加油站") ||
    text.includes("free_traffic") ||
    text.includes("bilipay") ||
    text.includes("cheese/mine") ||
    text.includes("blackboard/dynamic") ||
    text.includes("pangu/gat");
}

function isBiliAdEntry(item) {
  if (!isObject(item)) return false;
  if (item.ad_info || item.ad || item.ad_tag || item.adver || item.creative_id) return true;
  if (item.cm_mark || item.card_goto === "ad_web_s" || item.card_goto === "ad_av") return true;
  if (item.card_type === "small_cover_v10" && item.card_goto === "game") return true;
  if (item.card_type === "large_cover_v9" && item.card_goto === "inline_av_v2") return true;
  if (hasAny(item.card_goto, ["ad", "cm"]) || hasAny(item.goto, ["ad", "cm"]) || hasAny(item.card_type, ["ad", "cm", "banner"])) return true;
  if (item.args && (item.args.ad_cb || item.args.ad_id || hasAny(item.args.card_goto, ["ad"]))) return true;
  return false;
}

function hasBiliAdToken(value) {
  const text = textOf(value);
  return /(?:^|[\s_./:?&=-])(?:ad|ads|adver|advert|advertise|commercial|creative|sponsor|promotion|promote|cm)(?:$|[\s_./:?&=-])/.test(text);
}

function isBiliVerticalOrPromotion(item) {
  const text = [
    item?.card_goto,
    item?.goto,
    item?.card_type,
    item?.cover_left_text_1,
    item?.cover_left_text_2
  ].map((part) => part || "").join(" ").toLowerCase();

  return text.includes("vertical_av") ||
    text.includes("vertical_ad") ||
    text.includes("vertical_pgc") ||
    text.includes("story") ||
    text.includes("live_rcmd") ||
    text.includes("ad_inline") ||
    text.includes("ad_player") ||
    text.includes("inline_av_v2") ||
    text.includes("banner");
}

function cleanBiliTab(obj) {
  const root = obj?.data;
  if (!isObject(root)) return obj;

  const dropTab = (item) => isBiliMallEntry(item) || isBiliFollowBottomEntry(item) || isBiliGameEntry(item) || isBiliActivityTabEntry(item);
  root.top = reindex(stripArray(root.top, (item) => isBiliMallEntry(item) || isBiliGameEntry(item)));
  root.top_more = reindex(stripArray(root.top_more, (item) => isBiliMallEntry(item) || isBiliGameEntry(item)));
  root.bottom = reindex(stripArray(root.bottom, dropTab));
  root.tab = reindex(stripArray(root.tab, (item) => isBiliMallEntry(item) || isBiliGameEntry(item) || isBiliActivityTabEntry(item)));
  if (Array.isArray(root.items)) root.items = stripArray(root.items, dropTab);
  if (Array.isArray(root.bubbles)) root.bubbles = stripArray(root.bubbles, dropTab);

  return obj;
}

function cleanBiliMineSections(sections) {
  if (!Array.isArray(sections)) return sections;

  return sections
    .map((section) => {
      if (!isObject(section)) return section;
      for (const key of ["items", "item"]) {
        if (Array.isArray(section[key])) section[key] = section[key].filter((item) => !isBiliCommercialMineEntry(item));
      }
      return section;
    })
    .filter((section) => {
      if (!isObject(section)) return false;
      if (Array.isArray(section.items)) return section.items.length > 0;
      if (Array.isArray(section.item)) return section.item.length > 0;
      return true;
    });
}

function cleanBiliMine(obj) {
  const root = obj?.data;
  if (!isObject(root)) return obj;

  root.sections_v2 = cleanBiliMineSections(root.sections_v2);
  root.sections = cleanBiliMineSections(root.sections);
  root.ipad_upper_sections = stripArray(root.ipad_upper_sections, isBiliCommercialMineEntry);
  root.ipad_recommend_sections = stripArray(root.ipad_recommend_sections, isBiliCommercialMineEntry);
  root.ipad_more_sections = stripArray(root.ipad_more_sections, isBiliCommercialMineEntry);

  return obj;
}

function cleanBiliBannerItem(item) {
  if (!Array.isArray(item?.banner_item)) return item;

  const kept = item.banner_item.filter((banner) => {
    if (!isObject(banner)) return false;
    if (banner.type === "ad" || banner.ad_info || banner.creative_id) return false;
    if (banner.static_banner && banner.static_banner.is_ad_loc === true) return false;
    return true;
  });

  if (!kept.length) return null;
  item.banner_item = kept;
  return item;
}

function cleanBiliFeedIndex(obj) {
  if (!Array.isArray(obj?.data?.items)) return obj;

  obj.data.items = obj.data.items
    .map((item) => cleanBiliBannerItem(item))
    .filter((item) => {
      if (!item) return false;
      if (Array.isArray(item.banner_item)) return item.banner_item.length > 0;
      if (isBiliAdEntry(item)) return false;
      return !isBiliVerticalOrPromotion(item);
    });

  return obj;
}

function cleanBiliWebTopFeed(obj) {
  if (!Array.isArray(obj?.data?.item)) return obj;
  obj.data.item = obj.data.item.filter((item) => item && item.goto !== "ad" && !isBiliAdEntry(item));
  return obj;
}

function cleanBiliSplashList(obj) {
  if (!isObject(obj.data)) obj.data = {};

  const data = obj.data;
  for (const key of ["account", "event_list", "preload", "show"]) delete data[key];

  data.max_time = 0;
  data.min_interval = 31536000;
  data.pull_interval = 31536000;

  for (const key of ["list", "splash_list", "brand_list"]) {
    if (Array.isArray(data[key])) {
      for (const item of data[key]) {
        if (!isObject(item)) continue;
        item.duration = 0;
        item.enable_pre_download = false;
        item.begin_time = 2208960000;
        item.end_time = 2209046399;
      }
      data[key] = [];
    }
  }

  return obj;
}

function cleanBiliSearchSquare(obj) {
  obj.data = {
    type: "history",
    title: "Search History",
    search_hotword_revision: 2
  };
  return obj;
}

function cleanBiliSearchResult(obj) {
  const root = obj?.data;
  if (!isObject(root)) return obj;

  removeKeys(root, ["ad", "ad_info", "cm", "cm_info", "banner"]);

  for (const key of ["item", "items", "result", "list"]) {
    if (!Array.isArray(root[key])) continue;

    root[key] = root[key].filter((item) => {
      if (!isObject(item)) return false;
      if (isBiliAdEntry(item) || isBiliVerticalOrPromotion(item)) return false;
      if (textOf(item.linktype).endsWith("_ad")) return false;
      if (hasBiliAdToken(item.linktype) || hasBiliAdToken(item.card_type) || hasBiliAdToken(item.goto)) return false;
      return true;
    });
  }

  return obj;
}

function cleanBiliPgcPage(obj) {
  const modules = obj?.result?.modules;
  if (!Array.isArray(modules)) return obj;

  for (const module of modules) {
    if (!Array.isArray(module.items)) continue;

    if (String(module.style || "").startsWith("banner")) {
      module.items = module.items.filter((item) => {
        const link = item.link || item.blink || item.uri || "";
        return String(link).includes("play");
      });
    }

    if (String(module.style || "").startsWith("function")) {
      module.items = module.items.filter((item) => {
        const link = item.link || item.blink || item.uri || "";
        return !String(link).includes("www.bilibili.com");
      });
    }

    if (String(module.style || "").startsWith("tip")) module.items = [];
  }

  return obj;
}

function cleanBiliPgcSeason(obj) {
  if (isObject(obj?.data)) removeKeys(obj.data, ["payment", "ad", "ad_info", "cm", "cm_info"]);
  return obj;
}

function cleanBiliPgcMaterial() {
  return {
    code: 0,
    data: {
      closeType: "close_win",
      container: [],
      showTime: ""
    },
    message: "success"
  };
}

function cleanBiliLiveRoom(obj) {
  if (isObject(obj?.data)) {
    obj.data.activity_banner_info = null;
    obj.data.shopping_info = { is_show: 0 };
    obj.data.new_switch_info = obj.data.new_switch_info || {};
    if (Array.isArray(obj.data?.new_tab_info?.outer_list)) {
      obj.data.new_tab_info.outer_list = obj.data.new_tab_info.outer_list.filter((item) => Number(item?.biz_id) !== 33);
    }
  }
  return obj;
}

function cleanBiliDynamic(obj) {
  const cards = obj?.data?.cards;
  if (!Array.isArray(cards)) return obj;

  obj.data.cards = cards.filter((card) => {
    if (!isObject(card)) return false;
    if (card.card && String(card.card).includes("ad_ctx")) return false;
    if (card.display && String(JSON.stringify(card.display)).toLowerCase().includes("\"ad\"")) return false;
    return true;
  });

  return obj;
}

const biliCommentRootAdKeys = [
  "ad",
  "ad_info",
  "ad_info_v2",
  "adver",
  "advertise",
  "banner",
  "cm",
  "cm_info",
  "cm_config",
  "commercial",
  "commercial_info",
  "operation",
  "operation_card",
  "operation_v2",
  "activity_card"
];

const biliCommentItemAdKeys = [
  "ad",
  "ad_info",
  "ad_info_v2",
  "adver",
  "advertise",
  "cm",
  "cm_info",
  "cm_config",
  "commercial",
  "commercial_info",
  "operation_card",
  "activity_card"
];

function isBiliCommentAd(item) {
  if (!isObject(item)) return false;
  if (isBiliAdEntry(item)) return true;

  for (const key of biliCommentItemAdKeys) {
    if (Object.prototype.hasOwnProperty.call(item, key)) return true;
  }

  const text = [
    item.type,
    item.card_type,
    item.card_goto,
    item.goto,
    item.uri,
    item.url,
    item.link,
    item.jump_url,
    item.click_url,
    item.show_url
  ].map((part) => part || "").join(" ");

  if (hasBiliAdToken(text)) return true;
  if (/b23\.tv\/(?:cm|mall)|mall\.bilibili\.com|会员购|带货/.test(textOf(text))) return true;

  if (isObject(item.content)) {
    const contentUrl = item.content.url;
    const contentText = [
      item.content.card_type,
      item.content.jump_url,
      contentUrl,
      item.content.message,
      ...Object.keys(isObject(contentUrl) ? contentUrl : {})
    ].map((part) => part || "").join(" ");
    if (hasBiliAdToken(contentText)) return true;
    if (/b23\.tv\/(?:cm|mall)|mall\.bilibili\.com|会员购|带货/.test(textOf(contentText))) return true;
  }

  return false;
}

function isBiliCommentSubjectAdCard(item) {
  if (!isObject(item)) return false;
  if (Number(item.type) === 3) return true;
  return isBiliCommentAd(item);
}

function cleanBiliReplyArray(items) {
  if (!Array.isArray(items)) return items;
  return items.filter((item) => !isBiliCommentAd(item)).map(cleanBiliReplyItem);
}

function cleanBiliReplyItem(item) {
  if (!isObject(item)) return item;

  removeKeys(item, biliCommentItemAdKeys);

  for (const key of ["replies", "reply", "items", "cards", "top_replies"]) {
    if (Array.isArray(item[key])) item[key] = cleanBiliReplyArray(item[key]);
  }

  return item;
}

function cleanBiliTopReply(root, key) {
  if (!isObject(root) || !root[key]) return;
  if (Array.isArray(root[key])) {
    root[key] = cleanBiliReplyArray(root[key]);
    return;
  }
  if (isBiliCommentAd(root[key])) {
    delete root[key];
    return;
  }
  cleanBiliReplyItem(root[key]);
}

function cleanBiliReplyList(obj) {
  const root = obj?.data;
  if (!isObject(root)) return obj;

  removeKeys(root, biliCommentRootAdKeys);

  for (const key of ["replies", "reply", "hots", "top_replies", "topReplies", "upper_replies", "upperReplies", "items", "cards"]) {
    if (Array.isArray(root[key])) root[key] = cleanBiliReplyArray(root[key]);
  }

  for (const key of ["subject_top_cards", "subjectTopCards"]) {
    if (Array.isArray(root[key])) root[key] = root[key].filter((item) => !isBiliCommentSubjectAdCard(item));
  }

  for (const key of ["up_top", "admin_top", "vote_top"]) cleanBiliTopReply(root, key);

  if (isObject(root.top)) {
    for (const key of ["upper", "admin", "vote", "replies"]) cleanBiliTopReply(root.top, key);
  }

  return obj;
}

function cleanBilibili(obj) {
  if (/\/x\/resource\/show\/tab(?:\/v2|\/bubble)?\?/.test(url)) return cleanBiliTab(obj);
  if (/\/x\/v2\/account\/mine(?:\/ipad)?\?/.test(url)) return cleanBiliMine(obj);
  if (/\/x\/v2\/feed\/index(?:\/story)?\?/.test(url)) return cleanBiliFeedIndex(obj);
  if (/\/x\/web-interface\/wbi\/index\/top\/feed\/rcmd\?/.test(url)) return cleanBiliWebTopFeed(obj);
  if (/\/x\/v2\/splash(?:\/|\?|$)/.test(url)) return cleanBiliSplashList(obj);
  if (/\/x\/v2\/search\?/.test(url)) return cleanBiliSearchResult(obj);
  if (/\/x\/v2\/search\/square\?/.test(url)) return cleanBiliSearchSquare(obj);
  if (/\/x\/v2\/reply(?:\/(?:wbi\/main|main|reply|hot|dialog\/cursor|detail))?\?/.test(url)) return cleanBiliReplyList(obj);
  if (/\/pgc\/page\/(bangumi|cinema\/tab)/.test(url)) return cleanBiliPgcPage(obj);
  if (/\/pgc\/view\/v2\/app\/season\?/.test(url)) return cleanBiliPgcSeason(obj);
  if (/\/pgc\/activity\/deliver\/material\/receive\?/.test(url)) return cleanBiliPgcMaterial();
  if (/\/xlive\/app-room\/v1\/index\/getInfoByRoom/.test(url)) return cleanBiliLiveRoom(obj);
  if (/\/dynamic_svr\/v1\/dynamic_svr\/dynamic_(history|new)\?/.test(url)) return cleanBiliDynamic(obj);
  return scrub(obj);
}

function clearStartupFields(root) {
  if (!isObject(root)) return;

  for (const key of [
    "ad",
    "ads",
    "adList",
    "ad_list",
    "adInfo",
    "ad_info",
    "advert",
    "advertise",
    "advertisement",
    "advertisements",
    "bannerAd",
    "launchAd",
    "openAd",
    "openScreenAd",
    "pop",
    "popup",
    "popups",
    "popLayer",
    "poplayer",
    "promotion",
    "splash",
    "splashAd",
    "splashAds",
    "splashList",
    "splashScreen",
    "splash_screen",
    "startup",
    "startupAd",
    "startpicture",
    "startPicture"
  ]) {
    if (Object.prototype.hasOwnProperty.call(root, key)) root[key] = emptyLike(root[key]);
  }

  for (const key of ["countdown", "duration", "displayTime", "show_time", "showTime", "waitTime"]) {
    if (typeof root[key] === "number") root[key] = 0;
  }
}

function cleanJsonStringField(root, key, cleaner) {
  if (!isObject(root) || typeof root[key] !== "string") return;
  const value = root[key].trim();
  if (!value || !/^[\[{]/.test(value)) return;

  try {
    const parsed = JSON.parse(value);
    root[key] = JSON.stringify(cleaner(parsed));
  } catch (_) {
    // Keep the original string if the API returns non-JSON payload text.
  }
}

function cleanTaobao(obj) {
  if (/poplayer\.template\.alibaba\.com\/\w+\.json/.test(url)) return {};

  for (const root of [obj, obj?.data, obj?.data?.result, obj?.data?.model, obj?.data?.content]) {
    clearStartupFields(root);
  }

  if (isObject(obj?.data)) {
    for (const key of ["data", "result", "model", "content"]) {
      cleanJsonStringField(obj.data, key, (parsed) => {
        clearStartupFields(parsed);
        return scrub(parsed);
      });
    }
  }

  return scrub(obj);
}

function cleanJd(obj) {
  for (const root of [obj, obj?.data, obj?.result, obj?.result?.data]) {
    clearStartupFields(root);
    if (!isObject(root)) continue;
    if (Array.isArray(root.images)) root.images = [];
    if (Array.isArray(root.floorList) && /functionId=(deliverLayer|welcomeHome|queryMaterialAdverts|lite_advertising)/.test(url)) root.floorList = [];
    root.countdown = 0;
    root.showTimesDaily = 0;
  }

  return scrub(obj);
}

function cleanPdd(obj) {
  for (const root of [obj, obj?.data, obj?.result, obj?.result?.data]) {
    clearStartupFields(root);
    if (!isObject(root)) continue;
    if (Array.isArray(root.banner_list)) root.banner_list = scrub(root.banner_list);
    if (Array.isArray(root.resource_list)) root.resource_list = scrub(root.resource_list);
  }

  return scrub(obj);
}

function isCoolapkAdItem(item) {
  if (!isObject(item)) return false;
  if (shouldDropItem(item)) return true;

  const marker = [
    item.entityType,
    item.entityTemplate,
    item.template,
    item.type,
    item.feedType,
    item.extraType,
    item.extraTitle,
    item.cardType
  ].map((part) => part || "").join(" ").toLowerCase();

  if (/(advert|advertisement|sponsor|commercial|adcard|feedad|推广)/.test(marker)) return true;
  if (item.extraData && (item.extraData.ad_id || item.extraData.adId || item.extraData.advertId)) return true;
  if (item.adInfo || item.ad_info || item.adver || item.isAds || item.is_ad) return true;

  return false;
}

function cleanCoolapkNode(node, depth = 0) {
  if (!isObject(node) || depth > 12) return node;

  if (Array.isArray(node)) {
    return node
      .filter((item) => !isCoolapkAdItem(item))
      .map((item) => cleanCoolapkNode(item, depth + 1));
  }

  clearStartupFields(node);
  for (const key of Object.keys(node)) {
    if (Array.isArray(node[key])) {
      node[key] = cleanCoolapkNode(node[key], depth + 1);
    } else if (isObject(node[key])) {
      cleanCoolapkNode(node[key], depth + 1);
    }
  }

  return node;
}

function cleanCoolapk(obj) {
  return scrub(cleanCoolapkNode(obj));
}

function cleanMeituan(obj) {
  if (isObject(obj.data)) {
    obj.data.startpicture = {};
    obj.data.startPicture = {};
  }
  return scrub(obj);
}

function cleanWeibo(obj) {
  const arrayKeys = ["cards", "items", "statuses", "groups", "list"];
  for (const key of arrayKeys) {
    if (Array.isArray(obj[key])) obj[key] = scrub(obj[key]);
  }
  return scrub(obj);
}

function cleanXiaohongshu(obj) {
  const data = obj.data || obj;
  if (isObject(data)) {
    for (const key of ["items", "notes", "note_list", "feeds", "materials"]) {
      if (Array.isArray(data[key])) data[key] = scrub(data[key]);
    }
  }
  return scrub(obj);
}

function cleanZhihu(obj) {
  if (Array.isArray(obj.data)) obj.data = scrub(obj.data);
  if (Array.isArray(obj.paging)) obj.paging = scrub(obj.paging);
  return scrub(obj);
}

function cleanGenericStartup(obj) {
  if (isObject(obj.data)) {
    for (const key of ["duration", "show_time", "showTime", "countdown", "displayTime"]) {
      if (typeof obj.data[key] === "number") obj.data[key] = 0;
    }
  }
  return scrub(obj);
}

function route(obj) {
  if (isBilibiliUrl(url)) return cleanBilibili(obj);
  if (/(?:acs|guide-acs)\.m\.taobao\.com|poplayer\.template\.alibaba\.com/.test(url)) return cleanTaobao(obj);
  if (/api\.m\.jd\.com\/.*functionId=(deliverLayer|getTabHomeInfo|home_launchConfig|lite_advertising|myOrderInfo|orderTrackBusiness|personinfoBusiness|queryMaterialAdverts|start|welcomeHome)/.test(url)) return cleanJd(obj);
  if (/api\.(yangkeduo|pinduoduo)\.com\/api\/cappuccino\/(splash|querySplash)/.test(url)) return cleanPdd(obj);
  if (/api\.coolapk\.com\/v6\//.test(url)) return cleanCoolapk(obj);
  if (/wmapi\.meituan\.com|meituan\.com\/api\/v\d\/(openscreen|startpicture|loadInfo)/.test(url)) return cleanMeituan(obj);
  if (/weibointl\.api\.weibo|mapi\.weibo|api\.weibo|uve\.weibo/.test(url)) return cleanWeibo(obj);
  if (/xiaohongshu\.com\/api\/sns/.test(url)) return cleanXiaohongshu(obj);
  if (/zhihu\.com/.test(url)) return cleanZhihu(obj);
  return cleanGenericStartup(obj);
}

try {
  const obj = JSON.parse(rawBody || "{}");
  done(route(obj));
} catch (_) {
  $done({});
}
