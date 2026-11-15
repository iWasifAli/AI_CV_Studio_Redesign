/**
 * Where the person probably is, for paper size (Letter only in the US and Canada) and the CV's
 * region. The browser's time zone decides first: a browser set to "English (US)" is common
 * everywhere, so the language alone would give most of the world US Letter paper (audit F-02).
 */
const US =
  /^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Adak|Boise|Detroit|Juneau|Sitka|Nome|Yakutat|Metlakatla|Menominee|Indiana\/.+|Kentucky\/.+|North_Dakota\/.+)|Pacific\/Honolulu|US\/.+)$/;
const CA =
  /^(America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina|Moncton|Glace_Bay|Goose_Bay|Whitehorse|Dawson|Dawson_Creek|Iqaluit|Yellowknife|Swift_Current|Rankin_Inlet|Resolute|Cambridge_Bay|Inuvik|Creston|Fort_Nelson|Atikokan|Blanc-Sablon|Montreal)|Canada\/.+)$/;
const ZONES: Record<string, string> = {
  'Asia/Karachi': 'PK',
  'Asia/Kolkata': 'IN',
  'Asia/Calcutta': 'IN',
  'Asia/Dhaka': 'BD',
  'Asia/Dubai': 'AE',
  'Asia/Riyadh': 'SA',
  'Asia/Qatar': 'QA',
  'Asia/Kuwait': 'KW',
  'Asia/Bahrain': 'BH',
  'Asia/Muscat': 'OM',
  'Asia/Singapore': 'SG',
  'Asia/Kuala_Lumpur': 'MY',
  'Asia/Manila': 'PH',
  'Asia/Colombo': 'LK',
  'Asia/Kathmandu': 'NP',
  'Europe/London': 'GB',
  'Europe/Dublin': 'IE',
  'Europe/Berlin': 'DE',
  'Europe/Vienna': 'AT',
  'Europe/Zurich': 'CH',
  'Europe/Paris': 'FR',
  'Europe/Amsterdam': 'NL',
  'Europe/Madrid': 'ES',
  'Europe/Rome': 'IT',
  'Europe/Warsaw': 'PL',
  'Europe/Stockholm': 'SE',
  'Australia/Sydney': 'AU',
  'Australia/Melbourne': 'AU',
  'Pacific/Auckland': 'NZ',
  'Africa/Johannesburg': 'ZA',
  'Africa/Lagos': 'NG',
  'Africa/Nairobi': 'KE',
};

/** Two-letter region from the time zone (and, only where the zone says nothing, the language). */
export function regionFrom(timeZone: string | undefined, language: string | undefined): string {
  const tz = timeZone ?? '';
  if (US.test(tz)) return 'US';
  if (CA.test(tz)) return 'CA';
  if (ZONES[tz]) return ZONES[tz]!;
  const fromLang = (language ?? '').split('-')[1]?.toUpperCase();
  // A US or Canadian language setting outside those time zones is not a reason for Letter paper.
  if (fromLang && /^[A-Z]{2}$/.test(fromLang) && !(tz && (fromLang === 'US' || fromLang === 'CA')))
    return fromLang;
  return 'GB';
}

/** The browser's own region (call in the browser). */
export function browserRegion(): string {
  let tz: string | undefined;
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    tz = undefined;
  }
  return regionFrom(tz, typeof navigator === 'undefined' ? undefined : navigator.language);
}
