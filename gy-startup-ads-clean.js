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

const dropKeyRe = /^(ad|ads|ad_info|adinfo|advert|advertise|advertisement|adverts|banner|banners|splash|splash_ad|splashads|startup|startup_ad|open_ad|openad|open_screen|openscreen|popup|pop_up|popups|poplayer|promotion|promotions|commercial|sponsor|sponsored|marketing|brand_ad|feed_ad|cm_mark|card_goto_ad)$/i;

function hasStructuredAdMarker(value) {
const text = lower(value);
return /广告|推广|赞助/.test(text) ||
/(^|[^a-z0-9])(ad|ads)([^a-z0-9]|$)/.test(text) ||
/(advert|sponsor|commercial|banner|splash|popup)/.test(text);
}

function hasVisibleAdLabel(value) {
const text = lower(value);
return /广告|推广|赞助/.test(text) ||
/(^|[^a-z0-9])(advert|advertisement|sponsor|sponsored)([^a-z0-9]|$)/.test(text);
}

function looksLikeAdObject(obj) {
if (!isObj(obj)) return false;

const joinedKeys = Object.keys(obj).join("_");
if (hasAny(joinedKeys, ["ad_info", "advert", "splash", "popup", "promotion", "sponsor"])) {
return true;
}

const structuredFields = [
obj.card_type,
obj.card_goto,
obj.goto,
obj.type,
obj.source,
obj.from,
obj.biz_type,
obj.module
];
if (structuredFields.some(hasStructuredAdMarker)) return true;

const visibleFields = [obj.name, obj.title, obj.desc, obj.reason];
if (visibleFields.some(hasVisibleAdLabel)) return true;
