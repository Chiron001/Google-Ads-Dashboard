import express from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'gads-dash-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 86400000, httpOnly: true, sameSite: 'lax' },
}));
app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'Google Ads.html')));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const m2c = (micros) => (micros || 0) / 1_000_000;
const pct = (a, b) => (b && b !== 0) ? ((a - b) / b) * 100 : 0;
const fmtDate = (d) => d.toISOString().split('T')[0];

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
  try {
    const { google } = await import('googleapis');
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `http://localhost:${PORT}/api/auth/callback`
    );
    const url = oauth2.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/adwords', 'openid', 'profile', 'email'],
      prompt: 'consent',
    });
    res.json({ url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/callback', async (req, res) => {
  try {
    const { google } = await import('googleapis');
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `http://localhost:${PORT}/api/auth/callback`
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
  const configured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_DEVELOPER_TOKEN);
  res.json({
    authenticated: !!req.session?.tokens,
    user: req.session?.userInfo || null,
    customerId: req.session?.customerId || process.env.GOOGLE_CUSTOMER_ID || null,
    configured,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
  });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.post('/api/auth/customer', requireAuth, (req, res) => {
  req.session.customerId = String(req.body.customerId).replace(/-/g, '');
  res.json({ success: true });
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
  } catch (e) { res.status(500).json({ error: e.message }); }
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
      customer.query(`SELECT metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.cost_micros,metrics.conversions,metrics.conversions_value,metrics.conversion_rate,metrics.all_conversions,metrics.search_impression_share FROM customer WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'`),
      customer.query(`SELECT metrics.impressions,metrics.clicks,metrics.cost_micros,metrics.conversions,metrics.conversions_value FROM customer WHERE segments.date BETWEEN '${prevStart}' AND '${prevEnd}'`),
    ]);
    const m = cur[0]?.metrics || {}, pm = prev[0]?.metrics || {};
    res.json({
      impressions: m.impressions || 0, clicks: m.clicks || 0, ctr: m.ctr || 0,
      avg_cpc: m2c(m.average_cpc), cost: m2c(m.cost_micros),
      conversions: m.conversions || 0, conversion_rate: m.conversion_rate || 0,
      conversions_value: m.conversions_value || 0, all_conversions: m.all_conversions || 0,
      roas: m.cost_micros > 0 ? m.conversions_value / m2c(m.cost_micros) : 0,
      impression_share: m.search_impression_share || 0,
      changes: {
        impressions: pct(m.impressions, pm.impressions), clicks: pct(m.clicks, pm.clicks),
        cost: pct(m.cost_micros, pm.cost_micros), conversions: pct(m.conversions, pm.conversions),
        roas: pct(m.conversions_value / (m.cost_micros || 1), pm.conversions_value / (pm.cost_micros || 1)),
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/campaigns', requireAuth, async (req, res) => {
  const { startDate, endDate } = req.query;
  const customerId = req.query.customerId || req.session.customerId;
  if (!customerId) return res.status(400).json({ error: 'No customer ID set' });
  try {
    const { GoogleAdsApi } = await import('google-ads-api');
    globalThis._gadsApi = { GoogleAdsApi };
    const customer = getCustomer(req.session.tokens.refresh_token, customerId);
    const rows = await customer.query(`SELECT campaign.id,campaign.name,campaign.status,campaign.bidding_strategy_type,campaign.advertising_channel_type,campaign.target_cpa.target_cpa_micros,campaign.target_roas.target_roas,metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.cost_micros,metrics.conversions,metrics.conversions_value,metrics.conversion_rate,metrics.all_conversions,metrics.search_impression_share,metrics.search_budget_lost_impression_share,metrics.search_rank_lost_impression_share FROM campaign WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 100`);
    res.json({
      campaigns: rows.map(r => {
        const m = r.metrics || {}, c = r.campaign || {};
        return { id: c.id, name: c.name, status: c.status, channel: c.advertising_channel_type, bidding: c.bidding_strategy_type, target_cpa: c.target_cpa?.target_cpa_micros ? m2c(c.target_cpa.target_cpa_micros) : null, target_roas: c.target_roas?.target_roas || null, impressions: m.impressions || 0, clicks: m.clicks || 0, ctr: m.ctr || 0, avg_cpc: m2c(m.average_cpc), cost: m2c(m.cost_micros), conversions: m.conversions || 0, conversions_value: m.conversions_value || 0, conversion_rate: m.conversion_rate || 0, roas: m.cost_micros > 0 ? m.conversions_value / m2c(m.cost_micros) : 0, impression_share: m.search_impression_share || 0, lost_is_budget: m.search_budget_lost_impression_share || 0, lost_is_rank: m.search_rank_lost_impression_share || 0 };
      })
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
    const rows = await customer.query(`SELECT campaign.id,campaign.name,ad_group.id,ad_group.name,ad_group.status,ad_group.type,metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.cost_micros,metrics.conversions,metrics.conversions_value,metrics.conversion_rate FROM ad_group WHERE ${where} ORDER BY metrics.cost_micros DESC LIMIT 200`);
    res.json({
      adGroups: rows.map(r => {
        const m = r.metrics || {};
        return { campaign_id: r.campaign.id, campaign_name: r.campaign.name, id: r.ad_group.id, name: r.ad_group.name, status: r.ad_group.status, type: r.ad_group.type, impressions: m.impressions || 0, clicks: m.clicks || 0, ctr: m.ctr || 0, avg_cpc: m2c(m.average_cpc), cost: m2c(m.cost_micros), conversions: m.conversions || 0, conversions_value: m.conversions_value || 0, conversion_rate: m.conversion_rate || 0, roas: m.cost_micros > 0 ? m.conversions_value / m2c(m.cost_micros) : 0 };
      })
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
    const rows = await customer.query(`SELECT campaign.name,ad_group.name,ad_group_ad.ad.id,ad_group_ad.ad.name,ad_group_ad.ad.type,ad_group_ad.status,ad_group_ad.ad.final_urls,ad_group_ad.ad.responsive_search_ad.headlines,ad_group_ad.ad.responsive_search_ad.descriptions,metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.cost_micros,metrics.conversions,metrics.conversions_value,metrics.conversion_rate FROM ad_group_ad WHERE ${where} ORDER BY metrics.cost_micros DESC LIMIT 200`);
    res.json({
      ads: rows.map(r => {
        const m = r.metrics || {}, ad = r.ad_group_ad?.ad || {};
        const headlines = ad.responsive_search_ad?.headlines?.slice(0, 3).map(h => h.text).join(' | ') || '';
        const descriptions = ad.responsive_search_ad?.descriptions?.slice(0, 2).map(d => d.text).join(' | ') || '';
        return { campaign_name: r.campaign.name, ad_group_name: r.ad_group.name, id: ad.id, name: ad.name || headlines || `Ad ${ad.id}`, type: r.ad_group_ad.status ? ad.type : 'UNKNOWN', status: r.ad_group_ad.status, final_url: ad.final_urls?.[0] || '', headlines, descriptions, impressions: m.impressions || 0, clicks: m.clicks || 0, ctr: m.ctr || 0, avg_cpc: m2c(m.average_cpc), cost: m2c(m.cost_micros), conversions: m.conversions || 0, conversions_value: m.conversions_value || 0, conversion_rate: m.conversion_rate || 0, roas: m.cost_micros > 0 ? m.conversions_value / m2c(m.cost_micros) : 0 };
      })
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/keywords', requireAuth, async (req, res) => {
  const { startDate, endDate } = req.query;
  const customerId = req.query.customerId || req.session.customerId;
  if (!customerId) return res.status(400).json({ error: 'No customer ID set' });
  try {
    const { GoogleAdsApi } = await import('google-ads-api');
    globalThis._gadsApi = { GoogleAdsApi };
    const customer = getCustomer(req.session.tokens.refresh_token, customerId);
    const rows = await customer.query(`SELECT campaign.name,ad_group.name,ad_group_criterion.keyword.text,ad_group_criterion.keyword.match_type,ad_group_criterion.status,ad_group_criterion.quality_info.quality_score,metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.cost_micros,metrics.conversions,metrics.conversion_rate,metrics.search_impression_share FROM keyword_view WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' AND ad_group_criterion.status != 'REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 200`);
    res.json({
      keywords: rows.map(r => {
        const m = r.metrics || {}, kw = r.ad_group_criterion || {};
        return { campaign_name: r.campaign.name, ad_group_name: r.ad_group.name, keyword: kw.keyword?.text, match_type: kw.keyword?.match_type, status: kw.status, quality_score: kw.quality_info?.quality_score || null, impressions: m.impressions || 0, clicks: m.clicks || 0, ctr: m.ctr || 0, avg_cpc: m2c(m.average_cpc), cost: m2c(m.cost_micros), conversions: m.conversions || 0, conversion_rate: m.conversion_rate || 0, impression_share: m.search_impression_share || 0 };
      })
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/search-terms', requireAuth, async (req, res) => {
  const { startDate, endDate } = req.query;
  const customerId = req.query.customerId || req.session.customerId;
  if (!customerId) return res.status(400).json({ error: 'No customer ID set' });
  try {
    const { GoogleAdsApi } = await import('google-ads-api');
    globalThis._gadsApi = { GoogleAdsApi };
    const customer = getCustomer(req.session.tokens.refresh_token, customerId);
    const rows = await customer.query(`SELECT campaign.name,ad_group.name,search_term_view.search_term,search_term_view.status,metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.cost_micros,metrics.conversions,metrics.conversion_rate FROM search_term_view WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' ORDER BY metrics.impressions DESC LIMIT 200`);
    res.json({
      searchTerms: rows.map(r => {
        const m = r.metrics || {};
        return { campaign_name: r.campaign.name, ad_group_name: r.ad_group.name, search_term: r.search_term_view.search_term, status: r.search_term_view.status, impressions: m.impressions || 0, clicks: m.clicks || 0, ctr: m.ctr || 0, avg_cpc: m2c(m.average_cpc), cost: m2c(m.cost_micros), conversions: m.conversions || 0, conversion_rate: m.conversion_rate || 0 };
      })
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
    res.json({ devices: rows.map(r => ({ device: r.segments.device, impressions: r.metrics.impressions || 0, clicks: r.metrics.clicks || 0, cost: m2c(r.metrics.cost_micros), conversions: r.metrics.conversions || 0, conversions_value: r.metrics.conversions_value || 0 })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => {
  console.log(`\n  Google Ads AI Dashboard`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Mode:    ${process.env.GOOGLE_CLIENT_ID ? 'Live (Google Ads API)' : 'Demo'}`);
  console.log(`  AI:      ${process.env.ANTHROPIC_API_KEY ? 'Claude AI enabled' : 'No API key (demo insights only)'}`);
  console.log(`  ─────────────────────────────────\n`);
});
