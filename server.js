import express from 'express';
import cookieSession from 'cookie-session';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Trust Vercel/reverse-proxy headers so HTTPS is detected correctly for secure cookies
app.set('trust proxy', 1);

app.use(express.json({ limit: '10mb' }));
const isProd = !!(process.env.VERCEL || process.env.NODE_ENV === 'production');
app.use(cookieSession({
  name: 'gads',
  keys: [process.env.SESSION_SECRET || 'gads-dash-secret-change-me'],
  maxAge: 24 * 60 * 60 * 1000,
  sameSite: isProd ? 'none' : 'lax',
  secure: isProd,
  httpOnly: true,
}));
app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'Google Ads.html')));

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Returns the correct OAuth redirect URI for local dev or Vercel production
function getRedirectUri(req) {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}/api/auth/callback`;
}

// Extracts a human-readable message from google-ads-api / gRPC errors
function apiError(e) {
  try {
    // google-ads-api wraps gRPC errors; the real message is often in e.errors[].message
    if (e.errors && Array.isArray(e.errors)) {
      const msgs = e.errors.map(err => err.message || JSON.stringify(err)).filter(Boolean);
      if (msgs.length) return msgs.join(' | ');
    }
    // Some versions surface it as e.response.data.error or e.response.errors
    if (e.response?.data?.error) return e.response.data.error;
    // gRPC errors have a `details` array
    if (e.details && Array.isArray(e.details)) {
      const msgs = e.details.map(d => d.message || JSON.stringify(d)).filter(Boolean);
      if (msgs.length) return msgs.join(' | ');
    }
  } catch (_) { /* ignore extraction errors */ }
  return e.message || String(e);
}

const m2c = (micros) => (micros || 0) / 1_000_000;
const pct = (a, b) => (b && b !== 0) ? ((a - b) / b) * 100 : 0;
const fmtDate = (d) => d.toISOString().split('T')[0];

// Google Ads API v23 returns enum fields as integers — map them back to names
const ENUMS = {
  status:      { 0:'UNSPECIFIED', 1:'UNKNOWN', 2:'ENABLED', 3:'PAUSED', 4:'REMOVED' },
  channel:     { 0:'UNSPECIFIED', 1:'UNKNOWN', 2:'SEARCH', 3:'DISPLAY', 4:'SHOPPING', 5:'HOTEL', 6:'VIDEO', 7:'MULTI_CHANNEL', 8:'LOCAL', 9:'SMART', 10:'PERFORMANCE_MAX', 11:'LOCAL_SERVICES', 12:'DISCOVERY' },
  bidding:     { 0:'UNSPECIFIED', 1:'UNKNOWN', 3:'ENHANCED_CPC', 6:'MANUAL_CPC', 7:'MANUAL_CPM', 8:'MANUAL_CPV', 9:'MAXIMIZE_CONVERSIONS', 10:'MAXIMIZE_CONVERSION_VALUE', 13:'TARGET_CPA', 14:'TARGET_CPM', 15:'TARGET_IMPRESSION_SHARE', 17:'TARGET_ROAS', 18:'TARGET_SPEND' },
  match_type:  { 0:'UNSPECIFIED', 1:'UNKNOWN', 2:'EXACT', 3:'PHRASE', 4:'BROAD' },
  device:      { 0:'UNSPECIFIED', 1:'UNKNOWN', 2:'MOBILE', 3:'TABLET', 4:'DESKTOP', 5:'CONNECTED_TV', 6:'OTHER' },
  st_status:   { 0:'UNSPECIFIED', 1:'UNKNOWN', 2:'ADDED', 3:'EXCLUDED', 4:'ADDED_EXCLUDED', 5:'NONE' },
  age_range:   { 503001:'18-24', 503002:'25-34', 503003:'35-44', 503004:'45-54', 503005:'55-64', 503006:'65+', 503999:'Unknown' },
  gender:      { 10:'Male', 11:'Female', 20:'Unknown' },
  dow:         { 2:'Monday', 3:'Tuesday', 4:'Wednesday', 5:'Thursday', 6:'Friday', 7:'Saturday', 8:'Sunday' },
  perf_label:  { 0:'UNSPECIFIED', 1:'UNKNOWN', 2:'Pending', 3:'Learning', 4:'Low', 5:'Good', 6:'Best' },
  asset_type:  { 1:'Text', 2:'Image', 3:'YouTube Video', 4:'Book', 5:'Lead Form', 6:'Promotion', 7:'Callout', 8:'Structured Snippet', 9:'Sitelink', 10:'Page Feed', 11:'Dynamic Education', 12:'Mobile App', 13:'Hotel Callout', 14:'Call', 15:'Price', 16:'Call To Action', 17:'Dynamic Real Estate', 18:'Dynamic Custom', 19:'Dynamic Hotels And Rentals', 20:'Dynamic Flights', 21:'Discovery Carousel Card', 22:'Dynamic Travel', 23:'Dynamic Local', 24:'Dynamic Jobs' },
};
const eVal = (map, v) => (v === null || v === undefined) ? v : (typeof v === 'string' ? v : (map[v] || String(v)));

const GEO_NAMES = {
  2356:'India', 2840:'United States', 2826:'United Kingdom', 2036:'Australia', 2124:'Canada',
  2276:'Germany', 2250:'France', 2380:'Italy', 2724:'Spain', 2392:'Japan', 2410:'South Korea',
  2076:'Brazil', 2484:'Mexico', 2528:'Netherlands', 2756:'Switzerland', 2752:'Sweden',
  2578:'Norway', 2208:'Denmark', 2246:'Finland', 2040:'Austria', 2056:'Belgium',
  2620:'Portugal', 2616:'Poland', 2203:'Czech Republic', 2348:'Hungary', 2642:'Romania',
  2300:'Greece', 2792:'Turkey', 2818:'Egypt', 2710:'South Africa', 2566:'Nigeria',
  2404:'Kenya', 2504:'Morocco', 2682:'Saudi Arabia', 2784:'United Arab Emirates',
  2400:'Jordan', 2376:'Israel', 2702:'Singapore', 2764:'Thailand', 2360:'Indonesia',
  2458:'Malaysia', 2608:'Philippines', 2704:'Vietnam', 2586:'Pakistan', 2050:'Bangladesh',
  2144:'Sri Lanka', 2554:'New Zealand', 2032:'Argentina', 2152:'Chile', 2170:'Colombia',
  2604:'Peru', 2858:'Uruguay', 2032:'Argentina', 2076:'Brazil', 2344:'Hong Kong',
  2158:'Taiwan', 2643:'Russia', 2804:'Ukraine', 2703:'Slovakia', 2616:'Poland',
};

function dateRange(start, end) {
  const s = new Date(start), e = new Date(end);
  const days = Math.ceil((e - s) / 86400000) + 1;
  const prevEnd = new Date(s); prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - days + 1);
  return { days, prevStart: fmtDate(prevStart), prevEnd: fmtDate(prevEnd) };
}

function requireAuth(req, res, next) {
  if (!req.session?.tokens?.refresh_token) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

function getCustomer(refreshToken, customerId) {
  const { GoogleAdsApi } = globalThis._gadsApi;
  const client = new GoogleAdsApi({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    developer_token: process.env.GOOGLE_DEVELOPER_TOKEN,
  });
  const cfg = { customer_id: customerId, refresh_token: refreshToken };
  if (process.env.GOOGLE_LOGIN_CUSTOMER_ID) cfg.login_customer_id = process.env.GOOGLE_LOGIN_CUSTOMER_ID;
  return client.Customer(cfg);
}

// ─── Demo Data ────────────────────────────────────────────────────────────────

function demoCampaigns(scale = 1) {
  return [
    { id: '1001', name: 'Brand – Exact Match', status: 'ENABLED', channel: 'SEARCH', bidding: 'TARGET_CPA', target_cpa: 12.50, impressions: Math.round(28400 * scale), clicks: Math.round(3210 * scale), cost: 1842 * scale, conversions: 147 * scale, conversions_value: 7350 * scale, ctr: 0.113, avg_cpc: 0.574, conversion_rate: 0.0458, roas: 3.99, impression_share: 0.94, lost_is_budget: 0.01, lost_is_rank: 0.05 },
    { id: '1002', name: 'Brand – Broad Match', status: 'ENABLED', channel: 'SEARCH', bidding: 'TARGET_CPA', target_cpa: 18.00, impressions: Math.round(15200 * scale), clicks: Math.round(1180 * scale), cost: 920 * scale, conversions: 51 * scale, conversions_value: 2550 * scale, ctr: 0.0776, avg_cpc: 0.780, conversion_rate: 0.0432, roas: 2.77, impression_share: 0.78, lost_is_budget: 0.08, lost_is_rank: 0.14 },
    { id: '1003', name: 'Non-Brand – Head Terms', status: 'ENABLED', channel: 'SEARCH', bidding: 'MAXIMIZE_CONVERSIONS', target_cpa: null, impressions: Math.round(142000 * scale), clicks: Math.round(4820 * scale), cost: 5640 * scale, conversions: 98 * scale, conversions_value: 4900 * scale, ctr: 0.0339, avg_cpc: 1.17, conversion_rate: 0.0203, roas: 0.87, impression_share: 0.41, lost_is_budget: 0.22, lost_is_rank: 0.37 },
    { id: '1004', name: 'Non-Brand – Long Tail', status: 'ENABLED', channel: 'SEARCH', bidding: 'TARGET_ROAS', target_roas: 3.5, impressions: Math.round(68000 * scale), clicks: Math.round(2640 * scale), cost: 2180 * scale, conversions: 121 * scale, conversions_value: 6050 * scale, ctr: 0.0388, avg_cpc: 0.826, conversion_rate: 0.0458, roas: 2.77, impression_share: 0.58, lost_is_budget: 0.14, lost_is_rank: 0.28 },
    { id: '1005', name: 'Competitor Bidding', status: 'ENABLED', channel: 'SEARCH', bidding: 'TARGET_CPA', target_cpa: 35.00, impressions: Math.round(38000 * scale), clicks: Math.round(1140 * scale), cost: 2920 * scale, conversions: 42 * scale, conversions_value: 2100 * scale, ctr: 0.03, avg_cpc: 2.56, conversion_rate: 0.0368, roas: 0.72, impression_share: 0.31, lost_is_budget: 0.18, lost_is_rank: 0.51 },
    { id: '1006', name: 'Shopping – All Products', status: 'ENABLED', channel: 'SHOPPING', bidding: 'MAXIMIZE_CONVERSION_VALUE', target_roas: 4.0, impressions: Math.round(94000 * scale), clicks: Math.round(3860 * scale), cost: 3240 * scale, conversions: 187 * scale, conversions_value: 12980 * scale, ctr: 0.041, avg_cpc: 0.839, conversion_rate: 0.0484, roas: 4.0, impression_share: 0.63, lost_is_budget: 0.09, lost_is_rank: 0.28 },
    { id: '1007', name: 'Display – Remarketing', status: 'ENABLED', channel: 'DISPLAY', bidding: 'TARGET_CPA', target_cpa: 28.00, impressions: Math.round(520000 * scale), clicks: Math.round(1820 * scale), cost: 720 * scale, conversions: 28 * scale, conversions_value: 1400 * scale, ctr: 0.0035, avg_cpc: 0.396, conversion_rate: 0.0154, roas: 1.94, impression_share: 0.0, lost_is_budget: 0.0, lost_is_rank: 0.0 },
    { id: '1008', name: 'YouTube – Brand Awareness', status: 'PAUSED', channel: 'VIDEO', bidding: 'CPV', target_cpa: null, impressions: Math.round(0 * scale), clicks: Math.round(0 * scale), cost: 0, conversions: 0, conversions_value: 0, ctr: 0, avg_cpc: 0, conversion_rate: 0, roas: 0, impression_share: 0, lost_is_budget: 0, lost_is_rank: 0 },
  ];
}

function demoAdGroups(scale = 1) {
  return [
    { campaign_id: '1001', campaign_name: 'Brand – Exact Match', id: '2001', name: 'Brand Core Terms', status: 'ENABLED', impressions: Math.round(18200 * scale), clicks: Math.round(2060 * scale), cost: 1180 * scale, conversions: 94 * scale, conversions_value: 4700 * scale, ctr: 0.113, avg_cpc: 0.573, conversion_rate: 0.0456, roas: 3.98 },
    { campaign_id: '1001', campaign_name: 'Brand – Exact Match', id: '2002', name: 'Brand + Product Terms', status: 'ENABLED', impressions: Math.round(10200 * scale), clicks: Math.round(1150 * scale), cost: 662 * scale, conversions: 53 * scale, conversions_value: 2650 * scale, ctr: 0.1127, avg_cpc: 0.575, conversion_rate: 0.0461, roas: 4.00 },
    { campaign_id: '1002', campaign_name: 'Brand – Broad Match', id: '2003', name: 'Brand Broad', status: 'ENABLED', impressions: Math.round(15200 * scale), clicks: Math.round(1180 * scale), cost: 920 * scale, conversions: 51 * scale, conversions_value: 2550 * scale, ctr: 0.0776, avg_cpc: 0.780, conversion_rate: 0.0432, roas: 2.77 },
    { campaign_id: '1003', campaign_name: 'Non-Brand – Head Terms', id: '2004', name: 'Category Head Terms', status: 'ENABLED', impressions: Math.round(84000 * scale), clicks: Math.round(2940 * scale), cost: 3240 * scale, conversions: 58 * scale, conversions_value: 2900 * scale, ctr: 0.035, avg_cpc: 1.10, conversion_rate: 0.0197, roas: 0.90 },
    { campaign_id: '1003', campaign_name: 'Non-Brand – Head Terms', id: '2005', name: 'Problem/Solution Terms', status: 'ENABLED', impressions: Math.round(58000 * scale), clicks: Math.round(1880 * scale), cost: 2400 * scale, conversions: 40 * scale, conversions_value: 2000 * scale, ctr: 0.0324, avg_cpc: 1.28, conversion_rate: 0.0213, roas: 0.83 },
    { campaign_id: '1004', campaign_name: 'Non-Brand – Long Tail', id: '2006', name: 'Long Tail Informational', status: 'ENABLED', impressions: Math.round(42000 * scale), clicks: Math.round(1640 * scale), cost: 1360 * scale, conversions: 76 * scale, conversions_value: 3800 * scale, ctr: 0.039, avg_cpc: 0.829, conversion_rate: 0.0463, roas: 2.79 },
    { campaign_id: '1004', campaign_name: 'Non-Brand – Long Tail', id: '2007', name: 'Long Tail Commercial', status: 'ENABLED', impressions: Math.round(26000 * scale), clicks: Math.round(1000 * scale), cost: 820 * scale, conversions: 45 * scale, conversions_value: 2250 * scale, ctr: 0.0385, avg_cpc: 0.820, conversion_rate: 0.045, roas: 2.74 },
    { campaign_id: '1005', campaign_name: 'Competitor Bidding', id: '2008', name: 'Main Competitor A', status: 'ENABLED', impressions: Math.round(20000 * scale), clicks: Math.round(600 * scale), cost: 1560 * scale, conversions: 22 * scale, conversions_value: 1100 * scale, ctr: 0.030, avg_cpc: 2.60, conversion_rate: 0.0367, roas: 0.71 },
    { campaign_id: '1005', campaign_name: 'Competitor Bidding', id: '2009', name: 'Main Competitor B', status: 'ENABLED', impressions: Math.round(18000 * scale), clicks: Math.round(540 * scale), cost: 1360 * scale, conversions: 20 * scale, conversions_value: 1000 * scale, ctr: 0.030, avg_cpc: 2.52, conversion_rate: 0.037, roas: 0.74 },
    { campaign_id: '1006', campaign_name: 'Shopping – All Products', id: '2010', name: 'Best Sellers', status: 'ENABLED', impressions: Math.round(54000 * scale), clicks: Math.round(2200 * scale), cost: 1840 * scale, conversions: 107 * scale, conversions_value: 7490 * scale, ctr: 0.0407, avg_cpc: 0.836, conversion_rate: 0.0486, roas: 4.07 },
    { campaign_id: '1006', campaign_name: 'Shopping – All Products', id: '2011', name: 'All Other Products', status: 'ENABLED', impressions: Math.round(40000 * scale), clicks: Math.round(1660 * scale), cost: 1400 * scale, conversions: 80 * scale, conversions_value: 5490 * scale, ctr: 0.0415, avg_cpc: 0.843, conversion_rate: 0.0482, roas: 3.92 },
    { campaign_id: '1007', campaign_name: 'Display – Remarketing', id: '2012', name: 'Site Visitors 30d', status: 'ENABLED', impressions: Math.round(520000 * scale), clicks: Math.round(1820 * scale), cost: 720 * scale, conversions: 28 * scale, conversions_value: 1400 * scale, ctr: 0.0035, avg_cpc: 0.396, conversion_rate: 0.0154, roas: 1.94 },
  ];
}

function demoAds(scale = 1) {
  return [
    { campaign_name: 'Brand – Exact Match', ad_group_name: 'Brand Core Terms', id: 'ad001', name: 'Brand RSA v1', type: 'RESPONSIVE_SEARCH_AD', status: 'ENABLED', headlines: 'Official [Brand] Store | Best Prices Guaranteed | Shop [Brand] Today', descriptions: 'Get the best deals on all [Brand] products. Free shipping on orders over $50. Shop now and save!', final_url: 'https://example.com', impressions: Math.round(18200 * scale), clicks: Math.round(2060 * scale), cost: 1180 * scale, conversions: 94 * scale, conversions_value: 4700 * scale, ctr: 0.113, avg_cpc: 0.573, conversion_rate: 0.0456, roas: 3.98 },
    { campaign_name: 'Brand – Exact Match', ad_group_name: 'Brand + Product Terms', id: 'ad002', name: 'Brand + Product RSA', type: 'RESPONSIVE_SEARCH_AD', status: 'ENABLED', headlines: '[Brand] Products – Official | Free Returns Always | Lowest Price Promise', descriptions: 'Shop the full range of [Brand] products. Compare models, read reviews, buy with confidence.', final_url: 'https://example.com/products', impressions: Math.round(10200 * scale), clicks: Math.round(1150 * scale), cost: 662 * scale, conversions: 53 * scale, conversions_value: 2650 * scale, ctr: 0.1127, avg_cpc: 0.575, conversion_rate: 0.0461, roas: 4.00 },
    { campaign_name: 'Non-Brand – Head Terms', ad_group_name: 'Category Head Terms', id: 'ad003', name: 'Category RSA v1', type: 'RESPONSIVE_SEARCH_AD', status: 'ENABLED', headlines: 'Best [Category] Solutions | Trusted by 50,000+ Customers | Start Free Today', descriptions: 'Join thousands of happy customers who use our [category] solution. No contracts. Cancel anytime.', final_url: 'https://example.com/category', impressions: Math.round(84000 * scale), clicks: Math.round(2940 * scale), cost: 3240 * scale, conversions: 58 * scale, conversions_value: 2900 * scale, ctr: 0.035, avg_cpc: 1.10, conversion_rate: 0.0197, roas: 0.90 },
    { campaign_name: 'Non-Brand – Head Terms', ad_group_name: 'Category Head Terms', id: 'ad004', name: 'Category RSA v2 (Test)', type: 'RESPONSIVE_SEARCH_AD', status: 'ENABLED', headlines: '#1 Rated [Category] Tool | Save 3 Hours Per Week | Try It Free', descriptions: 'Used by industry leaders. Get started in minutes, see results in days.', final_url: 'https://example.com/category', impressions: Math.round(0), clicks: Math.round(0), cost: 0, conversions: 0, conversions_value: 0, ctr: 0, avg_cpc: 0, conversion_rate: 0, roas: 0 },
    { campaign_name: 'Non-Brand – Long Tail', ad_group_name: 'Long Tail Informational', id: 'ad005', name: 'Informational RSA', type: 'RESPONSIVE_SEARCH_AD', status: 'ENABLED', headlines: 'How to [Solve Problem] | Step-by-Step Guide | [Brand] Makes It Easy', descriptions: 'Struggling with [problem]? Our solution helps you [benefit] in just minutes. Start free today.', final_url: 'https://example.com/guide', impressions: Math.round(42000 * scale), clicks: Math.round(1640 * scale), cost: 1360 * scale, conversions: 76 * scale, conversions_value: 3800 * scale, ctr: 0.039, avg_cpc: 0.829, conversion_rate: 0.0463, roas: 2.79 },
    { campaign_name: 'Competitor Bidding', ad_group_name: 'Main Competitor A', id: 'ad006', name: 'Competitor Switch Ad', type: 'RESPONSIVE_SEARCH_AD', status: 'ENABLED', headlines: 'Better Than [Competitor] | Switch in 5 Minutes | No Lock-In Contract', descriptions: 'Why pay more for less? [Brand] delivers better results at a fraction of the price.', final_url: 'https://example.com/compare', impressions: Math.round(20000 * scale), clicks: Math.round(600 * scale), cost: 1560 * scale, conversions: 22 * scale, conversions_value: 1100 * scale, ctr: 0.030, avg_cpc: 2.60, conversion_rate: 0.0367, roas: 0.71 },
    { campaign_name: 'Shopping – All Products', ad_group_name: 'Best Sellers', id: 'ad007', name: 'Shopping Product Group', type: 'SHOPPING_PRODUCT_AD', status: 'ENABLED', headlines: '', descriptions: '', final_url: 'https://example.com/shop', impressions: Math.round(54000 * scale), clicks: Math.round(2200 * scale), cost: 1840 * scale, conversions: 107 * scale, conversions_value: 7490 * scale, ctr: 0.0407, avg_cpc: 0.836, conversion_rate: 0.0486, roas: 4.07 },
    { campaign_name: 'Display – Remarketing', ad_group_name: 'Site Visitors 30d', id: 'ad008', name: 'Remarketing Banner Set', type: 'RESPONSIVE_DISPLAY_AD', status: 'ENABLED', headlines: 'Come Back & Save 10% | You Left Something Behind', descriptions: "You visited us recently. Here's a special offer just for you.", final_url: 'https://example.com/offer', impressions: Math.round(520000 * scale), clicks: Math.round(1820 * scale), cost: 720 * scale, conversions: 28 * scale, conversions_value: 1400 * scale, ctr: 0.0035, avg_cpc: 0.396, conversion_rate: 0.0154, roas: 1.94 },
  ];
}

function demoKeywords(scale = 1) {
  return [
    { campaign_name: 'Brand – Exact Match', ad_group_name: 'Brand Core Terms', keyword: '[brand name]', match_type: 'EXACT', status: 'ENABLED', quality_score: 10, impressions: Math.round(12000 * scale), clicks: Math.round(1380 * scale), cost: 792 * scale, conversions: 63 * scale, conversion_rate: 0.0457, avg_cpc: 0.574, impression_share: 0.97 },
    { campaign_name: 'Brand – Exact Match', ad_group_name: 'Brand Core Terms', keyword: '[brand name website]', match_type: 'EXACT', status: 'ENABLED', quality_score: 10, impressions: Math.round(6200 * scale), clicks: Math.round(680 * scale), cost: 388 * scale, conversions: 31 * scale, conversion_rate: 0.0456, avg_cpc: 0.571, impression_share: 0.95 },
    { campaign_name: 'Non-Brand – Head Terms', ad_group_name: 'Category Head Terms', keyword: '[category keyword]', match_type: 'BROAD', status: 'ENABLED', quality_score: 6, impressions: Math.round(42000 * scale), clicks: Math.round(1470 * scale), cost: 1617 * scale, conversions: 29 * scale, conversion_rate: 0.0197, avg_cpc: 1.10, impression_share: 0.38 },
    { campaign_name: 'Non-Brand – Head Terms', ad_group_name: 'Category Head Terms', keyword: '"best category solution"', match_type: 'PHRASE', status: 'ENABLED', quality_score: 7, impressions: Math.round(28000 * scale), clicks: Math.round(980 * scale), cost: 1078 * scale, conversions: 19 * scale, conversion_rate: 0.0194, avg_cpc: 1.10, impression_share: 0.44 },
    { campaign_name: 'Non-Brand – Long Tail', ad_group_name: 'Long Tail Informational', keyword: '"how to [solve problem]"', match_type: 'PHRASE', status: 'ENABLED', quality_score: 8, impressions: Math.round(18000 * scale), clicks: Math.round(700 * scale), cost: 580 * scale, conversions: 32 * scale, conversion_rate: 0.0457, avg_cpc: 0.829, impression_share: 0.62 },
    { campaign_name: 'Non-Brand – Long Tail', ad_group_name: 'Long Tail Commercial', keyword: '[long tail buying intent keyword]', match_type: 'EXACT', status: 'ENABLED', quality_score: 9, impressions: Math.round(14000 * scale), clicks: Math.round(546 * scale), cost: 448 * scale, conversions: 25 * scale, conversion_rate: 0.0458, avg_cpc: 0.820, impression_share: 0.71 },
    { campaign_name: 'Competitor Bidding', ad_group_name: 'Main Competitor A', keyword: '[competitor a brand]', match_type: 'EXACT', status: 'ENABLED', quality_score: 4, impressions: Math.round(20000 * scale), clicks: Math.round(600 * scale), cost: 1560 * scale, conversions: 22 * scale, conversion_rate: 0.0367, avg_cpc: 2.60, impression_share: 0.31 },
    { campaign_name: 'Non-Brand – Head Terms', ad_group_name: 'Problem/Solution Terms', keyword: '"problem solution keyword"', match_type: 'PHRASE', status: 'PAUSED', quality_score: 5, impressions: Math.round(8000 * scale), clicks: Math.round(240 * scale), cost: 307 * scale, conversions: 5 * scale, conversion_rate: 0.0208, avg_cpc: 1.28, impression_share: 0.29 },
  ];
}

function demoSearchTerms(scale = 1) {
  return [
    { campaign_name: 'Non-Brand – Head Terms', ad_group_name: 'Category Head Terms', search_term: 'best category solution for small business', status: 'NONE', impressions: Math.round(3200 * scale), clicks: Math.round(128 * scale), cost: 141 * scale, conversions: 3 * scale, conversion_rate: 0.0234, avg_cpc: 1.10 },
    { campaign_name: 'Non-Brand – Head Terms', ad_group_name: 'Category Head Terms', search_term: 'affordable category service', status: 'NONE', impressions: Math.round(2800 * scale), clicks: Math.round(98 * scale), cost: 108 * scale, conversions: 2 * scale, conversion_rate: 0.0204, avg_cpc: 1.10 },
    { campaign_name: 'Non-Brand – Long Tail', ad_group_name: 'Long Tail Informational', search_term: 'how to solve problem quickly', status: 'NONE', impressions: Math.round(4200 * scale), clicks: Math.round(168 * scale), cost: 139 * scale, conversions: 8 * scale, conversion_rate: 0.0476, avg_cpc: 0.828 },
    { campaign_name: 'Non-Brand – Long Tail', ad_group_name: 'Long Tail Informational', search_term: 'free category tool', status: 'ADDED_NEGATIVE', impressions: Math.round(6800 * scale), clicks: Math.round(204 * scale), cost: 169 * scale, conversions: 0, conversion_rate: 0, avg_cpc: 0.829 },
    { campaign_name: 'Brand – Exact Match', ad_group_name: 'Brand Core Terms', search_term: 'brand name login', status: 'NONE', impressions: Math.round(1800 * scale), clicks: Math.round(198 * scale), cost: 114 * scale, conversions: 9 * scale, conversion_rate: 0.0455, avg_cpc: 0.576 },
    { campaign_name: 'Non-Brand – Head Terms', ad_group_name: 'Category Head Terms', search_term: 'category tool review', status: 'NONE', impressions: Math.round(5400 * scale), clicks: Math.round(162 * scale), cost: 178 * scale, conversions: 2 * scale, conversion_rate: 0.0123, avg_cpc: 1.10 },
    { campaign_name: 'Non-Brand – Long Tail', ad_group_name: 'Long Tail Commercial', search_term: 'buy category product online', status: 'NONE', impressions: Math.round(3600 * scale), clicks: Math.round(144 * scale), cost: 118 * scale, conversions: 7 * scale, conversion_rate: 0.0486, avg_cpc: 0.819 },
    { campaign_name: 'Competitor Bidding', ad_group_name: 'Main Competitor A', search_term: 'competitor a alternative', status: 'NONE', impressions: Math.round(2200 * scale), clicks: Math.round(66 * scale), cost: 172 * scale, conversions: 3 * scale, conversion_rate: 0.0455, avg_cpc: 2.606 },
  ];
}

function demoTimeseries(startDate, endDate) {
  const start = new Date(startDate), end = new Date(endDate);
  const data = [];
  const cur = new Date(start);
  let day = 0;
  while (cur <= end) {
    const weekday = cur.getDay();
    const weekFactor = (weekday === 0 || weekday === 6) ? 0.65 : 1.0;
    const trend = 1 + (day / 60) * 0.1;
    const noise = () => 0.85 + Math.random() * 0.3;
    const base = 16380 * weekFactor * trend * noise();
    data.push({
      date: fmtDate(cur),
      impressions: Math.round(base * 6.8),
      clicks: Math.round(base * 1.2),
      cost: parseFloat((base * 0.109).toFixed(2)),
      conversions: parseFloat((base * 0.038).toFixed(1)),
      conversions_value: parseFloat((base * 0.19).toFixed(2)),
      ctr: parseFloat((0.037 + (Math.random() - 0.5) * 0.004).toFixed(4)),
      avg_cpc: parseFloat((0.91 + (Math.random() - 0.5) * 0.08).toFixed(3)),
    });
    cur.setDate(cur.getDate() + 1);
    day++;
  }
  return data;
}

function demoDevices(scale = 1) {
  return [
    { device: 'MOBILE', impressions: Math.round(432000 * scale), clicks: Math.round(9860 * scale), cost: 8240 * scale, conversions: 248 * scale, conversions_value: 12400 * scale },
    { device: 'DESKTOP', impressions: Math.round(258000 * scale), clicks: Math.round(7420 * scale), cost: 6980 * scale, conversions: 312 * scale, conversions_value: 15600 * scale },
    { device: 'TABLET', impressions: Math.round(48000 * scale), clicks: Math.round(860 * scale), cost: 620 * scale, conversions: 18 * scale, conversions_value: 900 * scale },
  ];
}

function demoGeo() {
  return [
    { country:'India',          criterion_id:2356, impressions:52000, clicks:1820, cost:4280, conversions:87, conversions_value:4350, ctr:0.035, avg_cpc:2.35, roas:1.02, conversion_rate:0.048 },
    { country:'United States',  criterion_id:2840, impressions:28400, clicks:1240, cost:5920, conversions:142,conversions_value:14200,ctr:0.0437,avg_cpc:4.77,roas:2.40, conversion_rate:0.115 },
    { country:'United Kingdom', criterion_id:2826, impressions:18200, clicks:728,  cost:3280, conversions:68, conversions_value:6800, ctr:0.04,  avg_cpc:4.51,roas:2.07, conversion_rate:0.093 },
    { country:'Australia',      criterion_id:2036, impressions:12400, clicks:496,  cost:2480, conversions:48, conversions_value:4800, ctr:0.04,  avg_cpc:5.0, roas:1.94, conversion_rate:0.097 },
    { country:'Canada',         criterion_id:2124, impressions:9200,  clicks:368,  cost:1840, conversions:36, conversions_value:3600, ctr:0.04,  avg_cpc:5.0, roas:1.96, conversion_rate:0.098 },
    { country:'Germany',        criterion_id:2276, impressions:8400,  clicks:336,  cost:1680, conversions:28, conversions_value:2800, ctr:0.04,  avg_cpc:5.0, roas:1.67, conversion_rate:0.083 },
    { country:'Singapore',      criterion_id:2702, impressions:5400,  clicks:216,  cost:1080, conversions:22, conversions_value:2200, ctr:0.04,  avg_cpc:5.0, roas:2.04, conversion_rate:0.102 },
    { country:'UAE',            criterion_id:2784, impressions:4800,  clicks:192,  cost:960,  conversions:18, conversions_value:1800, ctr:0.04,  avg_cpc:5.0, roas:1.88, conversion_rate:0.094 },
    { country:'France',         criterion_id:2250, impressions:7200,  clicks:288,  cost:1440, conversions:24, conversions_value:2400, ctr:0.04,  avg_cpc:5.0, roas:1.67, conversion_rate:0.083 },
    { country:'South Africa',   criterion_id:2710, impressions:3600,  clicks:144,  cost:360,  conversions:8,  conversions_value:800,  ctr:0.04,  avg_cpc:2.5, roas:2.22, conversion_rate:0.056 },
  ];
}

function demoDemographics() {
  return {
    age: [
      { age:'18-24', impressions:84200,  clicks:2948,  cost:2654,  conversions:48,  conversions_value:2400,  ctr:0.035, avg_cpc:0.9,  roas:0.90, conversion_rate:0.016 },
      { age:'25-34', impressions:142000, clicks:5680,  cost:6816,  conversions:186, conversions_value:11160, ctr:0.04,  avg_cpc:1.2,  roas:1.64, conversion_rate:0.033 },
      { age:'35-44', impressions:168000, clicks:7392,  cost:10349, conversions:312, conversions_value:18720, ctr:0.044, avg_cpc:1.4,  roas:1.81, conversion_rate:0.042 },
      { age:'45-54', impressions:124000, clicks:5952,  cost:9523,  conversions:284, conversions_value:17040, ctr:0.048, avg_cpc:1.6,  roas:1.79, conversion_rate:0.048 },
      { age:'55-64', impressions:86000,  clicks:4472,  cost:7155,  conversions:196, conversions_value:11760, ctr:0.052, avg_cpc:1.6,  roas:1.64, conversion_rate:0.044 },
      { age:'65+',   impressions:42000,  clicks:2226,  cost:3562,  conversions:86,  conversions_value:5160,  ctr:0.053, avg_cpc:1.6,  roas:1.45, conversion_rate:0.039 },
    ],
    gender: [
      { gender:'Male',    impressions:420000, clicks:18900, cost:28350, conversions:758, conversions_value:45480, ctr:0.045, avg_cpc:1.5, roas:1.60, conversion_rate:0.040 },
      { gender:'Female',  impressions:312000, clicks:15600, cost:21840, conversions:642, conversions_value:38520, ctr:0.050, avg_cpc:1.4, roas:1.76, conversion_rate:0.041 },
      { gender:'Unknown', impressions:124000, clicks:4960,  cost:4960,  conversions:112, conversions_value:5600,  ctr:0.040, avg_cpc:1.0, roas:1.13, conversion_rate:0.023 },
    ]
  };
}

function demoTimeAnalysis() {
  const hours = Array.from({length:24}, (_, i) => {
    const factor = [0,1,2,3,4,5].includes(i) ? 0.05 : [9,10,11,14,15,16,20,21].includes(i) ? 1.8 : 1;
    const clicks = Math.round(280 * factor * (0.8 + Math.random()*0.4));
    const impressions = Math.round(clicks * (22 + Math.random()*6));
    const cost = parseFloat((clicks * 1.1 * (0.8 + Math.random()*0.4)).toFixed(2));
    const conversions = parseFloat((clicks * 0.038 * (factor > 1 ? 1.2 : 1)).toFixed(1));
    const label = i===0?'12am':i<12?`${i}am`:i===12?'12pm':`${i-12}pm`;
    return { hour:i, label, impressions, clicks, cost, conversions };
  });
  const dayFactors = { Monday:1.1, Tuesday:1.2, Wednesday:1.15, Thursday:1.2, Friday:1.1, Saturday:0.7, Sunday:0.55 };
  const dow = Object.entries(dayFactors).map(([day, f]) => ({
    day, impressions:Math.round(84000*f), clicks:Math.round(3360*f),
    cost:parseFloat((4200*f).toFixed(2)), conversions:parseFloat((128*f).toFixed(1))
  }));
  return { hours, dow };
}

function demoAuctions() {
  return [
    { domain:'(Your account)',  impression_share:0.51, overlap_rate:1.00, position_above_rate:0.00, top_is:0.68, abs_top_is:0.24, outranking_share:0.52 },
    { domain:'competitor-a.com',impression_share:0.72, overlap_rate:0.64, position_above_rate:0.38, top_is:0.81, abs_top_is:0.35, outranking_share:0.26 },
    { domain:'competitor-b.com',impression_share:0.48, overlap_rate:0.52, position_above_rate:0.29, top_is:0.59, abs_top_is:0.18, outranking_share:0.38 },
    { domain:'competitor-c.com',impression_share:0.38, overlap_rate:0.41, position_above_rate:0.22, top_is:0.45, abs_top_is:0.14, outranking_share:0.44 },
    { domain:'competitor-d.com',impression_share:0.31, overlap_rate:0.35, position_above_rate:0.18, top_is:0.38, abs_top_is:0.11, outranking_share:0.48 },
  ];
}

function demoAssets() {
  return [
    { id:'a001', name:'Official Brand Store', field_type:'Headline',   perf:'BEST',    text:'Official [Brand] Store', campaign:'Brand – Exact Match', impressions:18200, clicks:2060, cost:1180, conversions:94,  ctr:0.113, avg_cpc:0.573 },
    { id:'a002', name:'Free Shipping Offer',  field_type:'Headline',   perf:'GOOD',    text:'Free Shipping on Orders Over 50', campaign:'Brand – Exact Match', impressions:15400, clicks:1694, cost:972, conversions:78, ctr:0.11, avg_cpc:0.574 },
    { id:'a003', name:'Best Prices Headline', field_type:'Headline',   perf:'LOW',     text:'Best Prices Guaranteed', campaign:'Non-Brand – Head Terms', impressions:42000, clicks:1260, cost:1386, conversions:18, ctr:0.03, avg_cpc:1.1 },
    { id:'a004', name:'Shop Now Description', field_type:'Description',perf:'GOOD',    text:'Get the best deals on all products. Free shipping on orders over 50. Shop now!', campaign:'Brand – Exact Match', impressions:18200, clicks:2060, cost:1180, conversions:94, ctr:0.113, avg_cpc:0.573 },
    { id:'a005', name:'Shop Now Sitelink',    field_type:'Sitelink',   perf:'GOOD',    text:'Shop Now', campaign:'Brand – Exact Match', impressions:12000, clicks:840, cost:420, conversions:38, ctr:0.07, avg_cpc:0.5 },
    { id:'a006', name:'About Us Sitelink',    field_type:'Sitelink',   perf:'LOW',     text:'About Us', campaign:'Brand – Exact Match', impressions:12000, clicks:240, cost:120, conversions:4, ctr:0.02, avg_cpc:0.5 },
    { id:'a007', name:'24/7 Support Callout', field_type:'Callout',    perf:'PENDING', text:'24/7 Customer Support', campaign:'All Campaigns', impressions:28400, clicks:994, cost:496, conversions:28, ctr:0.035, avg_cpc:0.499 },
    { id:'a008', name:'Product Hero Image',   field_type:'Display Image',perf:'GOOD',  text:'', campaign:'Display – Remarketing', impressions:520000, clicks:1820, cost:720, conversions:28, ctr:0.0035, avg_cpc:0.396 },
  ];
}

function demoOverview(days) {
  const s = days / 30;
  const impr = Math.round(738000 * s), clicks = Math.round(18140 * s);
  const cost = 15840 * s, conversions = 578 * s, convValue = 28900 * s;
  return {
    impressions: impr, clicks, ctr: clicks / impr,
    avg_cpc: cost / clicks, cost, conversions, conversion_rate: conversions / clicks,
    conversions_value: convValue, all_conversions: conversions * 1.12,
    roas: convValue / cost, impression_share: 0.51,
    changes: { impressions: 8.2, clicks: 12.4, cost: 9.8, conversions: 15.3, roas: 4.9 },
  };
}

// ─── Auth Routes ─────────────────────────────────────────────────────────────

app.get('/api/auth/url', async (req, res) => {
  // Validate all required credentials before generating the URL
  const missing = [];
  if (!process.env.GOOGLE_CLIENT_ID)     missing.push('GOOGLE_CLIENT_ID');
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
  if (!process.env.GOOGLE_DEVELOPER_TOKEN) missing.push('GOOGLE_DEVELOPER_TOKEN');
  if (missing.length) {
    return res.status(400).json({
      error: `Missing credentials in .env: ${missing.join(', ')}. Copy .env.example to .env and fill in your values, then restart the server.`,
      missing,
    });
  }

  try {
    const { google } = await import('googleapis');
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      getRedirectUri(req)
    );
    const url = oauth2.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/adwords', 'openid', 'profile', 'email'],
      prompt: 'consent',
    });
    res.json({ url });
  } catch (e) { res.status(500).json({ error: apiError(e) }); }
});

app.get('/api/auth/callback', async (req, res) => {
  try {
    const { google } = await import('googleapis');
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      getRedirectUri(req)
    );
    const { tokens } = await oauth2.getToken(req.query.code);
    req.session.tokens = tokens;
    oauth2.setCredentials(tokens);
    const info = await google.oauth2({ version: 'v2', auth: oauth2 }).userinfo.get();
    req.session.userInfo = info.data;
    if (process.env.GOOGLE_CUSTOMER_ID) req.session.customerId = process.env.GOOGLE_CUSTOMER_ID;
    res.redirect('/?connected=true');
  } catch (e) { res.redirect('/?error=' + encodeURIComponent(e.message)); }
});

app.get('/api/auth/status', (req, res) => {
  const configured = !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_DEVELOPER_TOKEN
  );
  res.json({
    authenticated: !!req.session?.tokens,
    user: req.session?.userInfo || null,
    customerId: req.session?.customerId || process.env.GOOGLE_CUSTOMER_ID || null,
    configured,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    // Tell the frontend exactly which credentials are missing
    missing: {
      clientId: !process.env.GOOGLE_CLIENT_ID,
      clientSecret: !process.env.GOOGLE_CLIENT_SECRET,
      developerToken: !process.env.GOOGLE_DEVELOPER_TOKEN,
      customerId: !process.env.GOOGLE_CUSTOMER_ID,
      anthropicKey: !process.env.ANTHROPIC_API_KEY,
    },
  });
});

app.post('/api/auth/logout', (req, res) => {
  req.session = null; // cookie-session: setting to null clears the cookie
  res.json({ success: true });
});

// Debug endpoint — shows session/env state without exposing secrets
app.get('/api/debug', (req, res) => {
  res.json({
    authenticated: !!req.session?.tokens,
    hasCustomerId: !!req.session?.customerId,
    env: {
      configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_DEVELOPER_TOKEN),
      customerId: !!process.env.GOOGLE_CUSTOMER_ID,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      isProd,
    },
    proto: req.headers['x-forwarded-proto'] || req.protocol,
    host: req.headers['x-forwarded-host'] || req.headers.host,
  });
});

app.post('/api/auth/customer', requireAuth, (req, res) => {
  req.session.customerId = String(req.body.customerId).replace(/-/g, '');
  res.json({ success: true });
});

// Diagnostic endpoint — step-by-step API connection test
app.get('/api/test-api', requireAuth, async (req, res) => {
  const steps = [];
  const ok = (label, data = {}) => steps.push({ label, ok: true, ...data });
  const fail = (label, error) => steps.push({ label, ok: false, error });

  // 1 – import package
  let GoogleAdsApi;
  try {
    ({ GoogleAdsApi } = await import('google-ads-api'));
    ok('Import google-ads-api');
  } catch (e) {
    fail('Import google-ads-api', apiError(e));
    return res.json({ steps, passed: false });
  }

  // 2 – construct client
  let client;
  try {
    client = new GoogleAdsApi({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      developer_token: process.env.GOOGLE_DEVELOPER_TOKEN,
    });
    ok('Construct GoogleAdsApi client');
  } catch (e) {
    fail('Construct GoogleAdsApi client', apiError(e));
    return res.json({ steps, passed: false });
  }

  // 3 – list accessible customers
  let customerIds = [];
  try {
    const result = await client.listAccessibleCustomers(req.session.tokens.refresh_token);
    customerIds = (result.resource_names || []).map(r => r.replace('customers/', ''));
    ok('listAccessibleCustomers', { customerIds });
  } catch (e) {
    fail('listAccessibleCustomers', apiError(e));
    return res.json({ steps, passed: false });
  }

  // 4 – try a simple query on the configured customer ID
  const customerId = req.query.customerId || req.session.customerId || process.env.GOOGLE_CUSTOMER_ID;
  if (!customerId) {
    fail('Query customer', 'No GOOGLE_CUSTOMER_ID configured');
    return res.json({ steps, passed: false });
  }
  try {
    const cfg = { customer_id: customerId, refresh_token: req.session.tokens.refresh_token };
    if (process.env.GOOGLE_LOGIN_CUSTOMER_ID) cfg.login_customer_id = process.env.GOOGLE_LOGIN_CUSTOMER_ID;
    const customer = client.Customer(cfg);
    const rows = await customer.query(
      `SELECT customer.id, customer.descriptive_name, customer.currency_code FROM customer LIMIT 1`
    );
    const info = rows[0]?.customer || {};
    ok('Query customer resource', { id: info.id, name: info.descriptive_name, currency: info.currency_code });
  } catch (e) {
    fail('Query customer resource', apiError(e));
    return res.json({ steps, passed: false });
  }

  return res.json({ steps, passed: true });
});

// ─── Account Routes ───────────────────────────────────────────────────────────

app.get('/api/accounts', requireAuth, async (req, res) => {
  try {
    const { GoogleAdsApi } = await import('google-ads-api');
    const client = new GoogleAdsApi({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      developer_token: process.env.GOOGLE_DEVELOPER_TOKEN,
    });
    const result = await client.listAccessibleCustomers(req.session.tokens.refresh_token);
    const ids = (result.resource_names || []).map(r => r.replace('customers/', ''));
    res.json({ accounts: ids });
  } catch (e) { res.status(500).json({ error: apiError(e) }); }
});

// ─── Demo Data Route ──────────────────────────────────────────────────────────

app.get('/api/demo', (req, res) => {
  const { startDate = '2025-04-01', endDate = '2025-04-28' } = req.query;
  const { days } = dateRange(startDate, endDate);
  const scale = days / 30;
  res.json({
    overview: demoOverview(days),
    timeseries: demoTimeseries(startDate, endDate),
    campaigns: demoCampaigns(scale),
    adGroups: demoAdGroups(scale),
    ads: demoAds(scale),
    keywords: demoKeywords(scale),
    searchTerms: demoSearchTerms(scale),
    devices: demoDevices(scale),
    geo: demoGeo(),
    demographics: demoDemographics(),
    timeAnalysis: demoTimeAnalysis(),
    auctionInsights: demoAuctions(),
    assets: demoAssets(),
  });
});

// ─── Data Routes (Real API) ───────────────────────────────────────────────────

app.get('/api/overview', requireAuth, async (req, res) => {
  const { startDate, endDate } = req.query;
  const customerId = req.query.customerId || req.session.customerId;
  if (!customerId) return res.status(400).json({ error: 'No customer ID set' });
  try {
    const { GoogleAdsApi } = await import('google-ads-api');
    globalThis._gadsApi = { GoogleAdsApi };
    const customer = getCustomer(req.session.tokens.refresh_token, customerId);
    const { days, prevStart, prevEnd } = dateRange(startDate, endDate);

    const [cur, prev] = await Promise.all([
      customer.query(`SELECT metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.cost_micros,metrics.conversions,metrics.conversions_value,metrics.conversions_from_interactions_rate,metrics.all_conversions,metrics.search_impression_share FROM customer WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'`),
      customer.query(`SELECT metrics.impressions,metrics.clicks,metrics.cost_micros,metrics.conversions,metrics.conversions_value FROM customer WHERE segments.date BETWEEN '${prevStart}' AND '${prevEnd}'`),
    ]);
    const m = cur[0]?.metrics || {}, pm = prev[0]?.metrics || {};
    res.json({
      impressions: m.impressions || 0, clicks: m.clicks || 0, ctr: m.ctr || 0,
      avg_cpc: m2c(m.average_cpc), cost: m2c(m.cost_micros),
      conversions: m.conversions || 0, conversion_rate: m.conversions_from_interactions_rate || 0,
      conversions_value: m.conversions_value || 0, all_conversions: m.all_conversions || 0,
      roas: m.cost_micros > 0 ? m.conversions_value / m2c(m.cost_micros) : 0,
      impression_share: m.search_impression_share || 0,
      changes: {
        impressions: pct(m.impressions, pm.impressions), clicks: pct(m.clicks, pm.clicks),
        cost: pct(m.cost_micros, pm.cost_micros), conversions: pct(m.conversions, pm.conversions),
        roas: pct(m.conversions_value / (m.cost_micros || 1), pm.conversions_value / (pm.cost_micros || 1)),
      },
    });
  } catch (e) { res.status(500).json({ error: apiError(e) }); }
});

app.get('/api/timeseries', requireAuth, async (req, res) => {
  const { startDate, endDate } = req.query;
  const customerId = req.query.customerId || req.session.customerId;
  if (!customerId) return res.status(400).json({ error: 'No customer ID set' });
  try {
    const { GoogleAdsApi } = await import('google-ads-api');
    globalThis._gadsApi = { GoogleAdsApi };
    const customer = getCustomer(req.session.tokens.refresh_token, customerId);
    const rows = await customer.query(`SELECT segments.date,metrics.impressions,metrics.clicks,metrics.cost_micros,metrics.conversions,metrics.conversions_value,metrics.ctr,metrics.average_cpc FROM customer WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' ORDER BY segments.date ASC`);
    res.json({ data: rows.map(r => ({ date: r.segments.date, impressions: r.metrics.impressions || 0, clicks: r.metrics.clicks || 0, cost: m2c(r.metrics.cost_micros), conversions: r.metrics.conversions || 0, conversions_value: r.metrics.conversions_value || 0, ctr: r.metrics.ctr || 0, avg_cpc: m2c(r.metrics.average_cpc) })) });
  } catch (e) { res.status(500).json({ error: apiError(e) }); }
});

app.get('/api/campaigns', requireAuth, async (req, res) => {
  const { startDate, endDate } = req.query;
  const customerId = req.query.customerId || req.session.customerId;
  if (!customerId) return res.status(400).json({ error: 'No customer ID set' });
  try {
    const { GoogleAdsApi } = await import('google-ads-api');
    globalThis._gadsApi = { GoogleAdsApi };
    const customer = getCustomer(req.session.tokens.refresh_token, customerId);
    const rows = await customer.query(`SELECT campaign.id,campaign.name,campaign.status,campaign.bidding_strategy_type,campaign.advertising_channel_type,campaign.target_cpa.target_cpa_micros,campaign.target_roas.target_roas,metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.cost_micros,metrics.conversions,metrics.conversions_value,metrics.conversions_from_interactions_rate,metrics.all_conversions,metrics.search_impression_share,metrics.search_budget_lost_impression_share,metrics.search_rank_lost_impression_share FROM campaign WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 100`);
    res.json({
      campaigns: rows.map(r => {
        const m = r.metrics || {}, c = r.campaign || {};
        return { id: c.id, name: c.name, status: eVal(ENUMS.status, c.status), channel: eVal(ENUMS.channel, c.advertising_channel_type), bidding: eVal(ENUMS.bidding, c.bidding_strategy_type), target_cpa: c.target_cpa?.target_cpa_micros ? m2c(c.target_cpa.target_cpa_micros) : null, target_roas: c.target_roas?.target_roas || null, impressions: m.impressions || 0, clicks: m.clicks || 0, ctr: m.ctr || 0, avg_cpc: m2c(m.average_cpc), cost: m2c(m.cost_micros), conversions: m.conversions || 0, conversions_value: m.conversions_value || 0, conversion_rate: m.conversions_from_interactions_rate || 0, roas: m.cost_micros > 0 ? m.conversions_value / m2c(m.cost_micros) : 0, impression_share: m.search_impression_share || 0, lost_is_budget: m.search_budget_lost_impression_share || 0, lost_is_rank: m.search_rank_lost_impression_share || 0 };
      })
    });
  } catch (e) { res.status(500).json({ error: apiError(e) }); }
});

app.get('/api/adgroups', requireAuth, async (req, res) => {
  const { startDate, endDate, campaignId } = req.query;
  const customerId = req.query.customerId || req.session.customerId;
  if (!customerId) return res.status(400).json({ error: 'No customer ID set' });
  try {
    const { GoogleAdsApi } = await import('google-ads-api');
    globalThis._gadsApi = { GoogleAdsApi };
    const customer = getCustomer(req.session.tokens.refresh_token, customerId);
    let where = `segments.date BETWEEN '${startDate}' AND '${endDate}' AND ad_group.status != 'REMOVED'`;
    if (campaignId) where += ` AND campaign.id = ${campaignId}`;
    const rows = await customer.query(`SELECT campaign.id,campaign.name,ad_group.id,ad_group.name,ad_group.status,ad_group.type,metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.cost_micros,metrics.conversions,metrics.conversions_value,metrics.conversions_from_interactions_rate FROM ad_group WHERE ${where} ORDER BY metrics.cost_micros DESC LIMIT 200`);
    res.json({
      adGroups: rows.map(r => {
        const m = r.metrics || {};
        return { campaign_id: r.campaign.id, campaign_name: r.campaign.name, id: r.ad_group.id, name: r.ad_group.name, status: eVal(ENUMS.status, r.ad_group.status), type: r.ad_group.type, impressions: m.impressions || 0, clicks: m.clicks || 0, ctr: m.ctr || 0, avg_cpc: m2c(m.average_cpc), cost: m2c(m.cost_micros), conversions: m.conversions || 0, conversions_value: m.conversions_value || 0, conversion_rate: m.conversions_from_interactions_rate || 0, roas: m.cost_micros > 0 ? m.conversions_value / m2c(m.cost_micros) : 0 };
      })
    });
  } catch (e) { res.status(500).json({ error: apiError(e) }); }
});

app.get('/api/ads', requireAuth, async (req, res) => {
  const { startDate, endDate, campaignId, adGroupId } = req.query;
  const customerId = req.query.customerId || req.session.customerId;
  if (!customerId) return res.status(400).json({ error: 'No customer ID set' });
  try {
    const { GoogleAdsApi } = await import('google-ads-api');
    globalThis._gadsApi = { GoogleAdsApi };
    const customer = getCustomer(req.session.tokens.refresh_token, customerId);
    let where = `segments.date BETWEEN '${startDate}' AND '${endDate}' AND ad_group_ad.status != 'REMOVED'`;
    if (campaignId) where += ` AND campaign.id = ${campaignId}`;
    if (adGroupId) where += ` AND ad_group.id = ${adGroupId}`;
    const rows = await customer.query(`SELECT campaign.name,ad_group.name,ad_group_ad.ad.id,ad_group_ad.ad.name,ad_group_ad.ad.type,ad_group_ad.status,ad_group_ad.ad.final_urls,ad_group_ad.ad.responsive_search_ad.headlines,ad_group_ad.ad.responsive_search_ad.descriptions,metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.cost_micros,metrics.conversions,metrics.conversions_value,metrics.conversions_from_interactions_rate FROM ad_group_ad WHERE ${where} ORDER BY metrics.cost_micros DESC LIMIT 200`);
    res.json({
      ads: rows.map(r => {
        const m = r.metrics || {}, ad = r.ad_group_ad?.ad || {};
        const headlines = ad.responsive_search_ad?.headlines?.slice(0, 3).map(h => h.text).join(' | ') || '';
        const descriptions = ad.responsive_search_ad?.descriptions?.slice(0, 2).map(d => d.text).join(' | ') || '';
        const adStatus = eVal(ENUMS.status, r.ad_group_ad.status);
        return { campaign_name: r.campaign.name, ad_group_name: r.ad_group.name, id: ad.id, name: ad.name || headlines || `Ad ${ad.id}`, type: ad.type, status: adStatus, final_url: ad.final_urls?.[0] || '', headlines, descriptions, impressions: m.impressions || 0, clicks: m.clicks || 0, ctr: m.ctr || 0, avg_cpc: m2c(m.average_cpc), cost: m2c(m.cost_micros), conversions: m.conversions || 0, conversions_value: m.conversions_value || 0, conversion_rate: m.conversions_from_interactions_rate || 0, roas: m.cost_micros > 0 ? m.conversions_value / m2c(m.cost_micros) : 0 };
      })
    });
  } catch (e) { res.status(500).json({ error: apiError(e) }); }
});

app.get('/api/keywords', requireAuth, async (req, res) => {
  const { startDate, endDate } = req.query;
  const customerId = req.query.customerId || req.session.customerId;
  if (!customerId) return res.status(400).json({ error: 'No customer ID set' });
  try {
    const { GoogleAdsApi } = await import('google-ads-api');
    globalThis._gadsApi = { GoogleAdsApi };
    const customer = getCustomer(req.session.tokens.refresh_token, customerId);
    const rows = await customer.query(`SELECT campaign.name,ad_group.name,ad_group_criterion.keyword.text,ad_group_criterion.keyword.match_type,ad_group_criterion.status,ad_group_criterion.quality_info.quality_score,metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.cost_micros,metrics.conversions,metrics.conversions_from_interactions_rate,metrics.search_impression_share FROM keyword_view WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' AND ad_group_criterion.status != 'REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 200`);
    res.json({
      keywords: rows.map(r => {
        const m = r.metrics || {}, kw = r.ad_group_criterion || {};
        return { campaign_name: r.campaign.name, ad_group_name: r.ad_group.name, keyword: kw.keyword?.text, match_type: eVal(ENUMS.match_type, kw.keyword?.match_type), status: eVal(ENUMS.status, kw.status), quality_score: kw.quality_info?.quality_score || null, impressions: m.impressions || 0, clicks: m.clicks || 0, ctr: m.ctr || 0, avg_cpc: m2c(m.average_cpc), cost: m2c(m.cost_micros), conversions: m.conversions || 0, conversion_rate: m.conversions_from_interactions_rate || 0, impression_share: m.search_impression_share || 0 };
      })
    });
  } catch (e) { res.status(500).json({ error: apiError(e) }); }
});

app.get('/api/search-terms', requireAuth, async (req, res) => {
  const { startDate, endDate } = req.query;
  const customerId = req.query.customerId || req.session.customerId;
  if (!customerId) return res.status(400).json({ error: 'No customer ID set' });
  try {
    const { GoogleAdsApi } = await import('google-ads-api');
    globalThis._gadsApi = { GoogleAdsApi };
    const customer = getCustomer(req.session.tokens.refresh_token, customerId);
    const rows = await customer.query(`SELECT campaign.name,ad_group.name,search_term_view.search_term,search_term_view.status,metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.cost_micros,metrics.conversions,metrics.conversions_from_interactions_rate FROM search_term_view WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' ORDER BY metrics.impressions DESC LIMIT 200`);
    res.json({
      searchTerms: rows.map(r => {
        const m = r.metrics || {};
        return { campaign_name: r.campaign.name, ad_group_name: r.ad_group.name, search_term: r.search_term_view.search_term, status: eVal(ENUMS.st_status, r.search_term_view.status), impressions: m.impressions || 0, clicks: m.clicks || 0, ctr: m.ctr || 0, avg_cpc: m2c(m.average_cpc), cost: m2c(m.cost_micros), conversions: m.conversions || 0, conversion_rate: m.conversions_from_interactions_rate || 0 };
      })
    });
  } catch (e) { res.status(500).json({ error: apiError(e) }); }
});

app.get('/api/devices', requireAuth, async (req, res) => {
  const { startDate, endDate } = req.query;
  const customerId = req.query.customerId || req.session.customerId;
  if (!customerId) return res.status(400).json({ error: 'No customer ID set' });
  try {
    const { GoogleAdsApi } = await import('google-ads-api');
    globalThis._gadsApi = { GoogleAdsApi };
    const customer = getCustomer(req.session.tokens.refresh_token, customerId);
    const rows = await customer.query(`SELECT segments.device,metrics.impressions,metrics.clicks,metrics.cost_micros,metrics.conversions,metrics.conversions_value FROM customer WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'`);
    res.json({ devices: rows.map(r => ({ device: eVal(ENUMS.device, r.segments.device), impressions: r.metrics.impressions || 0, clicks: r.metrics.clicks || 0, cost: m2c(r.metrics.cost_micros), conversions: r.metrics.conversions || 0, conversions_value: r.metrics.conversions_value || 0 })) });
  } catch (e) { res.status(500).json({ error: apiError(e) }); }
});

// ─── Advanced Data Routes ────────────────────────────────────────────────────

app.get('/api/geo', requireAuth, async (req, res) => {
  const { startDate, endDate } = req.query;
  const customerId = req.query.customerId || req.session.customerId;
  if (!customerId) return res.status(400).json({ error: 'No customer ID set' });
  try {
    const { GoogleAdsApi } = await import('google-ads-api');
    globalThis._gadsApi = { GoogleAdsApi };
    const customer = getCustomer(req.session.tokens.refresh_token, customerId);
    const rows = await customer.query(`SELECT geographic_view.country_criterion_id,geographic_view.location_type,metrics.impressions,metrics.clicks,metrics.cost_micros,metrics.conversions,metrics.conversions_value,metrics.ctr,metrics.average_cpc,metrics.conversions_from_interactions_rate FROM geographic_view WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' ORDER BY metrics.cost_micros DESC LIMIT 100`);
    res.json({ geo: rows.map(r => {
      const m = r.metrics || {}, id = r.geographic_view?.country_criterion_id;
      return { criterion_id: id, country: GEO_NAMES[id] || `Region ${id}`, location_type: r.geographic_view?.location_type,
        impressions: m.impressions||0, clicks: m.clicks||0, cost: m2c(m.cost_micros),
        conversions: m.conversions||0, conversions_value: m.conversions_value||0, ctr: m.ctr||0,
        avg_cpc: m2c(m.average_cpc), roas: m.cost_micros>0 ? m.conversions_value/m2c(m.cost_micros) : 0,
        conversion_rate: m.conversions_from_interactions_rate||0 };
    }) });
  } catch (e) { res.status(500).json({ error: apiError(e) }); }
});

app.get('/api/demographics', requireAuth, async (req, res) => {
  const { startDate, endDate } = req.query;
  const customerId = req.query.customerId || req.session.customerId;
  if (!customerId) return res.status(400).json({ error: 'No customer ID set' });
  try {
    const { GoogleAdsApi } = await import('google-ads-api');
    globalThis._gadsApi = { GoogleAdsApi };
    const customer = getCustomer(req.session.tokens.refresh_token, customerId);
    const [ageRows, genderRows] = await Promise.all([
      customer.query(`SELECT ad_group_criterion.age_range.type,metrics.impressions,metrics.clicks,metrics.cost_micros,metrics.conversions,metrics.conversions_value,metrics.ctr,metrics.average_cpc,metrics.conversions_from_interactions_rate FROM age_range_view WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'`),
      customer.query(`SELECT ad_group_criterion.gender.type,metrics.impressions,metrics.clicks,metrics.cost_micros,metrics.conversions,metrics.conversions_value,metrics.ctr,metrics.average_cpc,metrics.conversions_from_interactions_rate FROM gender_view WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'`),
    ]);
    const agg = (rows, keyFn, nameProp) => {
      const map = {};
      for (const r of rows) {
        const m = r.metrics||{}, k = keyFn(r);
        if (!map[k]) map[k] = { [nameProp]:k, impressions:0, clicks:0, cost:0, conversions:0, conversions_value:0 };
        const a = map[k]; a.impressions+=m.impressions||0; a.clicks+=m.clicks||0;
        a.cost+=m2c(m.cost_micros); a.conversions+=m.conversions||0; a.conversions_value+=m.conversions_value||0;
      }
      return Object.values(map).map(a => ({ ...a, ctr: a.impressions>0?a.clicks/a.impressions:0,
        avg_cpc: a.clicks>0?a.cost/a.clicks:0, roas: a.cost>0?a.conversions_value/a.cost:0,
        conversion_rate: a.clicks>0?a.conversions/a.clicks:0 }));
    };
    res.json({
      age: agg(ageRows, r => eVal(ENUMS.age_range, r.ad_group_criterion?.age_range?.type), 'age'),
      gender: agg(genderRows, r => eVal(ENUMS.gender, r.ad_group_criterion?.gender?.type), 'gender'),
    });
  } catch (e) { res.status(500).json({ error: apiError(e) }); }
});

app.get('/api/time-analysis', requireAuth, async (req, res) => {
  const { startDate, endDate } = req.query;
  const customerId = req.query.customerId || req.session.customerId;
  if (!customerId) return res.status(400).json({ error: 'No customer ID set' });
  try {
    const { GoogleAdsApi } = await import('google-ads-api');
    globalThis._gadsApi = { GoogleAdsApi };
    const customer = getCustomer(req.session.tokens.refresh_token, customerId);
    const [hourRows, dowRows] = await Promise.all([
      customer.query(`SELECT segments.hour,metrics.impressions,metrics.clicks,metrics.cost_micros,metrics.conversions FROM customer WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'`),
      customer.query(`SELECT segments.day_of_week,metrics.impressions,metrics.clicks,metrics.cost_micros,metrics.conversions FROM customer WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'`),
    ]);
    const hmap = {};
    for (const r of hourRows) {
      const m=r.metrics||{}, h=r.segments?.hour??0;
      if (!hmap[h]) hmap[h]={ hour:h, impressions:0, clicks:0, cost:0, conversions:0 };
      const a=hmap[h]; a.impressions+=m.impressions||0; a.clicks+=m.clicks||0; a.cost+=m2c(m.cost_micros); a.conversions+=m.conversions||0;
    }
    const hours = Array.from({length:24},(_,i)=>{ const h=hmap[i]||{hour:i,impressions:0,clicks:0,cost:0,conversions:0}; const label=i===0?'12am':i<12?`${i}am`:i===12?'12pm':`${i-12}pm`; return {...h,label}; });
    const dmap = {};
    for (const r of dowRows) {
      const m=r.metrics||{}, k=eVal(ENUMS.dow, r.segments?.day_of_week);
      if (!dmap[k]) dmap[k]={ day:k, impressions:0, clicks:0, cost:0, conversions:0 };
      const a=dmap[k]; a.impressions+=m.impressions||0; a.clicks+=m.clicks||0; a.cost+=m2c(m.cost_micros); a.conversions+=m.conversions||0;
    }
    const dayOrder=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    const dow=dayOrder.map(d=>dmap[d]||{day:d,impressions:0,clicks:0,cost:0,conversions:0});
    res.json({ hours, dow });
  } catch (e) { res.status(500).json({ error: apiError(e) }); }
});

app.get('/api/assets', requireAuth, async (req, res) => {
  const { startDate, endDate } = req.query;
  const customerId = req.query.customerId || req.session.customerId;
  if (!customerId) return res.status(400).json({ error: 'No customer ID set' });
  try {
    const { GoogleAdsApi } = await import('google-ads-api');
    globalThis._gadsApi = { GoogleAdsApi };
    const customer = getCustomer(req.session.tokens.refresh_token, customerId);
    const rows = await customer.query(`SELECT asset.id,asset.name,asset.type,asset.text_asset.text,ad_group_ad_asset_view.field_type,ad_group_ad_asset_view.performance_label,metrics.impressions,metrics.clicks,metrics.cost_micros,metrics.conversions,metrics.ctr FROM ad_group_ad_asset_view WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' ORDER BY metrics.impressions DESC LIMIT 200`);
    res.json({ assets: rows.map(r => {
      const m=r.metrics||{}, a=r.asset||{}, v=r.ad_group_ad_asset_view||{};
      return { id:a.id, name:a.name||'', type:eVal(ENUMS.asset_type,a.type), text:a.text_asset?.text||'',
        field_type:v.field_type, perf:eVal(ENUMS.perf_label,v.performance_label),
        impressions:m.impressions||0, clicks:m.clicks||0, ctr:m.ctr||0,
        cost:m2c(m.cost_micros), conversions:m.conversions||0,
        avg_cpc:m.clicks>0?m2c(m.cost_micros)/m.clicks:0 };
    }) });
  } catch (e) { res.status(500).json({ error: apiError(e) }); }
});

app.get('/api/auction-insights', requireAuth, async (req, res) => {
  const { startDate, endDate } = req.query;
  const customerId = req.query.customerId || req.session.customerId;
  if (!customerId) return res.status(400).json({ error: 'No customer ID set' });
  try {
    const { GoogleAdsApi } = await import('google-ads-api');
    globalThis._gadsApi = { GoogleAdsApi };
    const customer = getCustomer(req.session.tokens.refresh_token, customerId);
    const rows = await customer.query(`SELECT auction_insight.domain,metrics.auction_insight_search_impression_share,metrics.auction_insight_search_overlap_rate,metrics.auction_insight_search_position_above_rate,metrics.auction_insight_search_top_impression_share,metrics.auction_insight_search_absolute_top_impression_share,metrics.auction_insight_search_outranking_share FROM campaign WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' AND campaign.status != 'REMOVED' ORDER BY metrics.auction_insight_search_impression_share DESC LIMIT 50`);
    const dmap = {};
    for (const r of rows) {
      const m=r.metrics||{}, d=r.auction_insight?.domain||'Unknown';
      if (!dmap[d]) dmap[d]={ domain:d, impression_share:0, overlap_rate:0, position_above_rate:0, top_is:0, abs_top_is:0, outranking_share:0, _n:0 };
      const a=dmap[d]; a._n++;
      a.impression_share+=m.auction_insight_search_impression_share||0;
      a.overlap_rate+=m.auction_insight_search_overlap_rate||0;
      a.position_above_rate+=m.auction_insight_search_position_above_rate||0;
      a.top_is+=m.auction_insight_search_top_impression_share||0;
      a.abs_top_is+=m.auction_insight_search_absolute_top_impression_share||0;
      a.outranking_share+=m.auction_insight_search_outranking_share||0;
    }
    const auctionInsights=Object.values(dmap).map(d=>({ domain:d.domain,
      impression_share:d.impression_share/d._n, overlap_rate:d.overlap_rate/d._n,
      position_above_rate:d.position_above_rate/d._n, top_is:d.top_is/d._n,
      abs_top_is:d.abs_top_is/d._n, outranking_share:d.outranking_share/d._n }))
      .sort((a,b)=>b.impression_share-a.impression_share).slice(0,10);
    res.json({ auctionInsights });
  } catch (e) { res.status(500).json({ error: apiError(e) }); }
});

// ─── AI Column Suggestion ─────────────────────────────────────────────────────

app.post('/api/suggest-column', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(400).json({ error: 'Anthropic API key not configured.' });
  const { description, fields = [] } = req.body;
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 200,
      messages: [{ role: 'user', content: `Given these Google Ads row fields: ${fields.join(', ')}\n\nWrite a concise JavaScript formula to compute: "${description}"\n\nReturn ONLY the formula (e.g. r.cost/r.conversions). Use r.field to access values. No explanation, no markdown.` }],
    });
    res.json({ formula: msg.content[0].text.trim().replace(/^`+|`+$/g,'') });
  } catch (e) { res.status(500).json({ error: apiError(e) }); }
});

// ─── AI Insights ──────────────────────────────────────────────────────────────

app.post('/api/insights', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(400).json({ error: 'Anthropic API key not configured. Add ANTHROPIC_API_KEY to your .env file.' });

  const { overview, campaigns = [], adGroups = [], keywords = [], dateRange: dr, isDemo } = req.body;

  const topCampaigns = [...campaigns].sort((a, b) => b.cost - a.cost).slice(0, 10);
  const topKw = [...keywords].sort((a, b) => b.cost - a.cost).slice(0, 8);
  const worstROAS = [...campaigns].filter(c => c.cost > 0).sort((a, b) => a.roas - b.roas).slice(0, 3);
  const bestROAS = [...campaigns].filter(c => c.cost > 0).sort((a, b) => b.roas - a.roas).slice(0, 3);

  const prompt = `You are a senior Google Ads performance analyst. Analyze this ${isDemo ? '(SAMPLE/DEMO) ' : ''}Google Ads account data and provide specific, actionable insights.

DATE RANGE: ${dr?.start} to ${dr?.end}

ACCOUNT OVERVIEW:
- Spend: $${overview?.cost?.toFixed(2)} | Impressions: ${(overview?.impressions || 0).toLocaleString()} | Clicks: ${(overview?.clicks || 0).toLocaleString()}
- CTR: ${((overview?.ctr || 0) * 100).toFixed(2)}% | Avg CPC: $${overview?.avg_cpc?.toFixed(2)} | CPA: $${(overview?.cost / (overview?.conversions || 1)).toFixed(2)}
- Conversions: ${(overview?.conversions || 0).toFixed(0)} | Conv Rate: ${((overview?.conversion_rate || 0) * 100).toFixed(2)}% | ROAS: ${(overview?.roas || 0).toFixed(2)}x
- vs Previous Period: Spend ${overview?.changes?.cost > 0 ? '+' : ''}${overview?.changes?.cost?.toFixed(1)}%, Clicks ${overview?.changes?.clicks > 0 ? '+' : ''}${overview?.changes?.clicks?.toFixed(1)}%, Conv ${overview?.changes?.conversions > 0 ? '+' : ''}${overview?.changes?.conversions?.toFixed(1)}%

TOP CAMPAIGNS BY SPEND:
${topCampaigns.map(c => `  ${c.name}: $${c.cost.toFixed(0)} spend | ${c.clicks} clicks | ${c.conversions.toFixed(0)} conv | CTR ${(c.ctr * 100).toFixed(2)}% | CPA $${(c.cost / (c.conversions || 1)).toFixed(2)} | ROAS ${c.roas.toFixed(2)}x | IS ${(c.impression_share * 100).toFixed(0)}% | Lost IS (budget) ${(c.lost_is_budget * 100).toFixed(0)}% | Lost IS (rank) ${(c.lost_is_rank * 100).toFixed(0)}%`).join('\n')}

BEST ROAS CAMPAIGNS: ${bestROAS.map(c => `${c.name} (${c.roas.toFixed(2)}x ROAS)`).join(', ')}
WORST ROAS CAMPAIGNS: ${worstROAS.map(c => `${c.name} (${c.roas.toFixed(2)}x ROAS, $${c.cost.toFixed(0)} spent)`).join(', ')}

TOP KEYWORDS BY SPEND:
${topKw.map(k => `  "${k.keyword}" [${k.match_type}]: $${k.cost.toFixed(0)} | QS ${k.quality_score || 'N/A'} | CTR ${(k.ctr * 100).toFixed(2)}% | Conv ${k.conversions.toFixed(0)} | IS ${(k.impression_share * 100).toFixed(0)}%`).join('\n')}

Respond with a JSON object (no markdown, pure JSON) with this exact structure:
{
  "insights": [{"title": "...", "description": "..."}],
  "issues": [{"title": "...", "description": "...", "severity": "high|medium|low"}],
  "opportunities": [{"title": "...", "description": "...", "impact": "high|medium|low"}],
  "budget": [{"title": "...", "description": "..."}],
  "quickWins": [{"title": "...", "description": "..."}]
}

Rules:
- Be specific: reference actual campaign names, dollar amounts, percentages from the data
- insights: 4-5 key performance observations (what's working, what's not, trends)
- issues: 3-4 problems needing attention (flag anything with ROAS < 1, high lost IS budget, low QS)
- opportunities: 4-5 ranked by potential impact (budget shifts, bid adjustments, expansion ideas)
- budget: 3-4 specific budget reallocation recommendations with amounts or percentages
- quickWins: 3-4 things that can be implemented immediately for quick improvement`;

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0].text;
    try {
      const match = text.match(/\{[\s\S]*\}/);
      res.json(JSON.parse(match ? match[0] : text));
    } catch {
      res.json({ insights: [{ title: 'Analysis', description: text }], issues: [], opportunities: [], budget: [], quickWins: [] });
    }
  } catch (e) { res.status(500).json({ error: apiError(e) }); }
});

// On Vercel the server is exported as a handler; locally it listens on a port
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n  Google Ads AI Dashboard`);
    console.log(`  ─────────────────────────────────`);
    console.log(`  Local:   http://localhost:${PORT}`);
    console.log(`  Mode:    ${process.env.GOOGLE_CLIENT_ID ? 'Live (Google Ads API)' : 'Demo'}`);
    console.log(`  AI:      ${process.env.ANTHROPIC_API_KEY ? 'Claude AI enabled' : 'No API key (demo insights only)'}`);
    console.log(`  ─────────────────────────────────\n`);
  });
}

export default app;
