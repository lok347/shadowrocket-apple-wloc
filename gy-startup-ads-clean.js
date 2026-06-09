// GY multi-app ad cleaner for Shadowrocket / Surge-compatible MITM scripting.
// Keep this file as pure JavaScript. Do not paste sgmodule content here.

const DEBUG = false;

const url = typeof $request !== "undefined" && $request.url ? $request.url : "";
const rawBody = typeof $response !== "undefined" && typeof $response.body === "string" ? $response.body : "";

function log(msg) {
if (DEBUG) console.log("[GY-AdBlock] " + msg);
}

function finish(obj) {
if (typeof obj === "string") {
$done({ body: obj });
return;
}
$done({ body: JSON.stringify(obj) });
}

function isObj(v) {
return v && typeof v === "object" && !Array.isArray(v);
}

function lower(s) {
return String(s || "").toLowerCase();
}

function hasAny(text, words) {
const t = lower(text);
return words.some(w => t.includes(w));
}

const adWords = [
"ad",
"ads",
"advert",
"advertise",
"advertisement",
"banner",
"splash",
"startup",
"open_screen",
"openscreen",
"pop",
"popup",
"poplayer",
"promotion",
"promote",
"commercial",
"sponsor",
"sponsored",
"marketing",
"material",
"creative",
"brand_ad",
"feed_ad",
"cm_mark",
"card_goto_ad",
"adver"
];

const dropKeyRe = /^(ad|ads|ad_info|adinfo|advert|advertise|advertisement|adverts|banner|banners|splash|splash_ad|splashads|startup|startup_ad|open_ad|openad|open_screen|openscreen|popup|pop_up|popups|poplayer|promotion|promotions|commercial|sponsor|sponsored|marketing|creative|material|materials|brand_ad|feed_ad|cm_mark|card_goto_ad)$/i;

function looksLikeAdObject(obj) {
if (!isObj(obj)) return false;

const joinedKeys = Object.keys(obj).join("_");
if (hasAny(joinedKeys, ["ad_info", "advert", "splash", "popup", "promotion", "sponsor"])) {
return true;
}

const stringFields = [
obj.card_type,
obj.card_goto,
obj.goto,
obj.type,
obj.name,
obj.title,
obj.desc,
obj.reason,
obj.source,
obj.from,
obj.biz_type,
obj.module,
obj.track_id,
obj.creative_id,
obj.ad_cb,
obj.ad_id
].filter(Boolean).join("_");

if (hasAny(stringFields, ["ad", "advert", "广告", "推广", "赞助", "sponsor", "commercial", "banner", "splash", "popup"])) {
return true;
}

if (obj.is_ad === true || obj.isAd === true || obj.ad === true || obj.has_ad === true) return true;
if (typeof obj.ad_id !== "undefined" && String(obj.ad_id) !== "0" && String(obj.ad_id) !== "") return true;
if (typeof obj.creative_id !== "undefined" && String(obj.creative_id) !== "0" && String(obj.creative_id) !== "") return true;

return false;
}

function cleanValue(value, parentKey) {
if (Array.isArray(value)) {
return value
.filter(item => !looksLikeAdObject(item))
.map(item => cleanValue(item, parentKey));
}

if (!isObj(value)) return value;

for (const key of Object.keys(value)) {
if (dropKeyRe.test(key)) {
delete value[key];
continue;
}

```
const v = value[key];

if (Array.isArray(v)) {
  value[key] = v
    .filter(item => !looksLikeAdObject(item))
    .map(item => cleanValue(item, key));
  continue;
}

if (isObj(v)) {
  if (looksLikeAdObject(v) && hasAny(key, adWords)) {
    delete value[key];
    continue;
  }
  value[key] = cleanValue(v, key);
}
```

}

return value;
}

function clearCommonContainers(obj) {
if (!isObj(obj)) return obj;

const data = isObj(obj.data) ? obj.data : obj;

const emptyArrayKeys = [
"ads",
"ad",
"ad_list",
"adList",
"advertisements",
"advertisement",
"banners",
"banner",
"splash",
"splash_list",
"splashList",
"splash_ad",
"splashAds",
"startup",
"startup_ad",
"open_ad",
"openAd",
"popup",
"popups",
"pop_list",
"popList",
"materials",
"material",
"creative",
"creatives",
"promotion",
"promotions"
];

for (const key of emptyArrayKeys) {
if (Array.isArray(data[key])) data[key] = [];
}

const falseKeys = [
"has_ad",
"hasAd",
"is_ad",
"isAd",
"show_ad",
"showAd",
"show_popup",
"showPopup",
"need_ad",
"needAd"
];

for (const key of falseKeys) {
if (typeof data[key] === "boolean") data[key] = false;
}

return obj;
}

function biliClean(obj) {
if (!isObj(obj)) return obj;

if (url.includes("/x/v2/splash")) {
obj.code = 0;
obj.message = obj.message || "0";
obj.data = obj.data || {};
obj.data.list = [];
obj.data.show = [];
obj.data.brand_list = [];
obj.data.preload = [];
obj.data.pull_interval = 86400;
obj.data.rule = "";
return obj;
}

if (url.includes("/x/v2/feed/index") || url.includes("/top/feed/rcmd")) {
const data = obj.data || {};
if (Array.isArray(data.items)) data.items = data.items.filter(i => !looksLikeAdObject(i));
if (Array.isArray(data.item)) data.item = data.item.filter(i => !looksLikeAdObject(i));
if (Array.isArray(data.cards)) data.cards = data.cards.filter(i => !looksLikeAdObject(i));
if (Array.isArray(data.card)) data.card = data.card.filter(i => !looksLikeAdObject(i));
obj.data = data;
}

if (url.includes("/x/resource/show/tab")) {
const data = obj.data || {};
["top", "bottom", "tab", "items"].forEach(k => {
if (Array.isArray(data[k])) {
data[k] = data[k].filter(i => !looksLikeAdObject(i));
}
});
obj.data = data;
}

return cleanValue(clearCommonContainers(obj));
}

function taobaoClean(obj) {
if (!isObj(obj)) return obj;

const data = obj.data || {};
[
"advertisement",
"advertisements",
"ad",
"ads",
"splash",
"splashData",
"poplayer",
"popLayer",
"material",
"materials",
"result",
"model"
].forEach(k => {
if (Array.isArray(data[k])) data[k] = [];
if (isObj(data[k]) && hasAny(k, adWords)) data[k] = {};
});

obj.data = data;
return cleanValue(clearCommonContainers(obj));
}

function jdClean(obj) {
if (!isObj(obj)) return obj;

const data = obj.data || {};
[
"floorList",
"data",
"result",
"popup",
"popups",
"advertInfos",
"bannerList",
"materialList"
].forEach(k => {
if (Array.isArray(data[k])) {
data[k] = data[k].filter(i => !looksLikeAdObject(i));
}
});

obj.data = data;
return cleanValue(clearCommonContainers(obj));
}

function pddClean(obj) {
if (!isObj(obj)) return obj;

const data = obj.result || obj.data || obj;
[
"splash",
"splash_ad",
"splash_list",
"popup",
"popups",
"ad",
"ads",
"banner",
"banners"
].forEach(k => {
if (Array.isArray(data[k])) data[k] = [];
if (isObj(data[k])) data[k] = {};
});

return cleanValue(clearCommonContainers(obj));
}

function zhihuClean(obj) {
if (!isObj(obj)) return obj;

if (Array.isArray(obj.data)) {
obj.data = obj.data.filter(i => !looksLikeAdObject(i));
}

if (isObj(obj.data) && Array.isArray(obj.data.data)) {
obj.data.data = obj.data.data.filter(i => !looksLikeAdObject(i));
}

return cleanValue(clearCommonContainers(obj));
}

function coolapkClean(obj) {
if (!isObj(obj)) return obj;

if (Array.isArray(obj.data)) {
obj.data = obj.data.filter(i => !looksLikeAdObject(i));
}

if (isObj(obj.data) && Array.isArray(obj.data.dataList)) {
obj.data.dataList = obj.data.dataList.filter(i => !looksLikeAdObject(i));
}

return cleanValue(clearCommonContainers(obj));
}

function genericStartupClean(obj) {
if (!isObj(obj)) return obj;

if (
hasAny(url, [
"splash",
"startup",
"openscreen",
"open_ad",
"startpicture",
"loadinfo",
"advertisement",
"popup",
"richpop",
"launch",
"adver"
])
) {
clearCommonContainers(obj);
}

return cleanValue(clearCommonContainers(obj));
}

function route(obj) {
log("URL: " + url);

if (url.includes("bilibili.com") || url.includes("biliapi.net")) {
return biliClean(obj);
}

if (
url.includes("taobao.com") ||
url.includes("goofish.com") ||
url.includes("alicdn.com") ||
url.includes("alibaba.com")
) {
return taobaoClean(obj);
}

if (url.includes("api.m.jd.com") || url.includes("jdcloud.com")) {
return jdClean(obj);
}

if (url.includes("yangkeduo.com") || url.includes("pinduoduo.com")) {
return pddClean(obj);
}

if (url.includes("zhihu.com")) {
return zhihuClean(obj);
}

if (url.includes("coolapk.com")) {
return coolapkClean(obj);
}

return genericStartupClean(obj);
}

try {
if (!rawBody) {
$done({});
} else {
const obj = JSON.parse(rawBody);
finish(route(obj));
}
} catch (e) {
log("Parse or clean failed: " + e.message);
$done({});
}
