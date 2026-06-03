// GY startup ads cleaner for Shadowrocket/Surge-compatible MITM scripting.
// Put this file in your GitHub repo root and reference it with raw.githubusercontent.com.

const url = typeof $request !== "undefined" ? $request.url : "";
const rawBody = typeof $response !== "undefined" ? $response.body : "";

function finish(value) {
  if (typeof value === "string") {
    $done({ body: value });
    return;
  }
  $done({ body: JSON.stringify(value) });
}

function safeObject(value) {
  return value && typeof value === "object";
}

function emptyLike(value) {
  if (Array.isArray(value)) return [];
  if (safeObject(value)) return {};
  if (typeof value === "number") return 0;
  if (typeof value === "boolean") return false;
  return "";
}

function scrubAdFields(node) {
  if (!safeObject(node)) return node;

  const noisyKeys = new Set([
    "ad",
    "ads",
    "adInfo",
    "adList",
    "adData",
    "advert",
    "advertise",
    "advertisement",
    "advertisements",
    "bannerAd",
    "floatAd",
    "popup",
    "popups",
    "splash",
    "splashAd",
    "splash_ad",
    "startup",
    "startupAd",
    "startpicture",
    "promotion",
    "promotions",
    "recommendAds"
  ]);

  for (const key of Object.keys(node)) {
    if (noisyKeys.has(key) || /(^|_)(ad|ads|advert|popup|splash)(_|$)/i.test(key)) {
      node[key] = emptyLike(node[key]);
      continue;
    }
    if (safeObject(node[key])) scrubAdFields(node[key]);
  }
  return node;
}

function cleanBilibili(obj) {
  if (safeObject(obj.data)) {
    obj.data.max_time = 0;
    obj.data.min_interval = 31536000;
    obj.data.pull_interval = 31536000;
    if (Array.isArray(obj.data.list)) obj.data.list = [];
    if (safeObject(obj.data.list) && Array.isArray(obj.data.list.show)) obj.data.list.show = [];
    if (Array.isArray(obj.data.show)) obj.data.show = [];
  }
  return obj;
}

function cleanJd(obj) {
  obj.countdown = 0;
  obj.showTimesDaily = 0;
  if (Array.isArray(obj.images)) obj.images = [];
  return scrubAdFields(obj);
}

function cleanMeituan(obj) {
  if (safeObject(obj.data)) {
    obj.data.startpicture = {};
    obj.data.startPicture = {};
  }
  return scrubAdFields(obj);
}

function cleanXiaomiSpeaker(obj) {
  if (Array.isArray(obj.data)) obj.data = [];
  return scrubAdFields(obj);
}

function cleanDidapinche(obj) {
  obj.show_time = 0;
  obj.full_screen = 0;
  if (Array.isArray(obj.startupPages)) obj.startupPages = [];
  return scrubAdFields(obj);
}

function cleanFamilyMart(obj) {
  if (safeObject(obj.data)) obj.data = {};
  return scrubAdFields(obj);
}

function route(obj) {
  if (/app\.bilibili\.com\/x\/v2\/splash\/list/.test(url)) return cleanBilibili(obj);
  if (/api\.m\.jd\.com\/client\.action\?functionId=start/.test(url)) return cleanJd(obj);
  if (/wmapi\.meituan\.com\/api\/v\d+\/loadInfo/.test(url)) return cleanMeituan(obj);
  if (/hd\.mina\.mi\.com\/splashscreen\/alert/.test(url)) return cleanXiaomiSpeaker(obj);
  if (/capis(-?\w*)?\.didapinche\.com\/ad\/cx\/startup/.test(url)) return cleanDidapinche(obj);
  if (/fmapp\.chinafamilymart\.com\.cn\/api\/app\/market\/start\/ad/.test(url)) return cleanFamilyMart(obj);
  return scrubAdFields(obj);
}

try {
  const obj = JSON.parse(rawBody || "{}");
  finish(route(obj));
} catch (_) {
  $done({});
}
