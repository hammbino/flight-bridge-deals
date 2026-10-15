// Pure functions for Traverse Tours deal links. Used by the Book Now page,
// the link builder and the tests. Nothing here touches the page.

export const LINK_BASE = "https://deals.flight-bridge.com/traverse-tours/";
export const SUBJECT_PREFIX = "Book Now request";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const AIRPORT = /^[A-Z]{3}$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PRICE = /^\d{1,6}(\.\d{2})?$/;
const TITLE_MAX = 80;

// Dates stay as "YYYY-MM-DD" strings. Turning them into Date objects for
// display would shift them by a day in US time zones.
export function isIsoDate(value) {
  const m = ISO_DATE.exec(value || "");
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

export function shortDate(iso) {
  const [, month, day] = iso.split("-");
  return `${MONTHS[Number(month) - 1]} ${Number(day)}`;
}

export function formatRange(depart, ret) {
  if (!ret) return `${shortDate(depart)}, one way`;
  const sameMonth = depart.slice(0, 7) === ret.slice(0, 7);
  const end = sameMonth ? String(Number(ret.slice(8))) : shortDate(ret);
  return `${shortDate(depart)} to ${end}`;
}

export function formatRangeWithYear(depart, ret) {
  const year = depart.slice(0, 4);
  if (!ret) return `${shortDate(depart)}, ${year}, one way`;
  if (ret.slice(0, 4) !== year) {
    return `${shortDate(depart)}, ${year} to ${shortDate(ret)}, ${ret.slice(0, 4)}`;
  }
  return `${formatRange(depart, ret)}, ${year}`;
}

export function formatPrice(price) {
  const [whole, cents] = price.split(".");
  const withCommas = String(Number(whole)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return cents ? `$${withCommas}.${cents}` : `$${withCommas}`;
}

// Reads the deal from the link. Returns null when the route or depart date
// is missing or broken, so the page falls back to "tell us which deal".
// Bad optional fields are dropped rather than blocking the customer.
export function parseDeal(search) {
  const params = new URLSearchParams(search);
  const get = (key) => (params.get(key) || "").trim();
  const type = get("type") === "package" ? "package" : "flight";
  const from = get("from").toUpperCase();
  const to = get("to").toUpperCase();
  const depart = get("depart");
  if (!AIRPORT.test(from) || !AIRPORT.test(to) || !isIsoDate(depart)) return null;
  const ret = get("return");
  const price = get("price");
  const found = get("found");
  return {
    id: get("deal").slice(0, 60),
    type,
    title: type === "package" ? get("title").slice(0, TITLE_MAX) : "",
    from,
    to,
    depart,
    ret: isIsoDate(ret) && ret >= depart ? ret : null,
    price: PRICE.test(price) ? price : null,
    found: isIsoDate(found) ? found : null,
  };
}

export function routeLabel(deal) {
  const route = `${deal.from} to ${deal.to}`;
  return deal.type === "package" && deal.title ? `${deal.title} (${route})` : route;
}

export function priceLine(deal) {
  const found = deal.found ? `, as found on ${shortDate(deal.found)}` : "";
  return `${formatPrice(deal.price)} per person${found}, subject to change`;
}

export function checkNewDates(newDepart, newReturn, today) {
  if (!isIsoDate(newDepart)) return "Pick the date you want to leave.";
  if (newDepart < today) return "That leave date has already passed.";
  if (newReturn && !isIsoDate(newReturn)) return "Pick a valid return date.";
  if (newReturn && newReturn < newDepart) return "The return date is before the leave date.";
  return "";
}

export function buildSubject({ deal, name, email, newDepart, newReturn, leadWords }) {
  let what;
  if (!deal) {
    what = "deal not in link";
  } else if (newDepart) {
    what = `${routeLabel(deal)}, NEW DATES ${formatRange(newDepart, newReturn || null)} (deal was ${formatRange(deal.depart, deal.ret)})`;
  } else {
    what = `${routeLabel(deal)}, ${formatRange(deal.depart, deal.ret)}`;
  }
  const words = leadWords ? ` ${leadWords}` : "";
  return `${SUBJECT_PREFIX}: ${what} (${name}, ${email})${words}`;
}

// The object posted to Web3Forms. "email" becomes the Reply-To.
// The other keys show up as labeled lines in the request email.
export function buildPayload({ accessKey, deal, form, link, leadWords, honeypot }) {
  const newDepart = form.datesDifferent ? form.newDepart : "";
  const newReturn = form.datesDifferent ? form.newReturn : "";
  return {
    access_key: accessKey,
    subject: buildSubject({ deal, name: form.name, email: form.email, newDepart, newReturn, leadWords }),
    from_name: "Traverse Tours Book Now",
    name: form.name,
    email: form.email,
    "Travelers": form.travelers,
    "Deal": deal ? `${routeLabel(deal)}, ${formatRangeWithYear(deal.depart, deal.ret)}` : "Not in link. See message.",
    "Deal ID": deal && deal.id ? deal.id : "none",
    "Price": deal && deal.price ? priceLine(deal) : "not in link",
    "Dates are different": newDepart ? `Yes: ${formatRangeWithYear(newDepart, newReturn || null)}` : "No",
    "Anything else": form.message || "(nothing)",
    "Link they came from": link,
    botcheck: honeypot,
  };
}

export function slugify(text) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 40).replace(/-+$/, "");
}

export function buildDealId(fields) {
  const name = fields.type === "package"
    ? slugify(fields.title)
    : `${fields.from}-${fields.to}`.toLowerCase();
  return `${fields.depart.slice(0, 7)}-${name}`;
}

export function checkBuilderFields(fields) {
  const errors = [];
  if (!AIRPORT.test(fields.from)) errors.push("From must be a 3-letter airport code, like SLC.");
  if (!AIRPORT.test(fields.to)) errors.push("To must be a 3-letter airport code, like CUN.");
  if (!isIsoDate(fields.depart)) errors.push("Pick a depart date.");
  if (fields.return && (!isIsoDate(fields.return) || fields.return < fields.depart)) {
    errors.push("The return date must be on or after the depart date. Leave it empty for one way.");
  }
  if (!PRICE.test(fields.price)) errors.push("Price must be a number, like 289 or 289.50.");
  if (!isIsoDate(fields.found)) errors.push("Pick the date the price was found.");
  if (fields.type === "package" && !fields.title) errors.push("Package deals need a short title.");
  if (fields.title && fields.title.length > TITLE_MAX) errors.push(`Keep the title under ${TITLE_MAX} characters.`);
  return errors;
}

export function buildLink(fields) {
  const params = new URLSearchParams();
  params.set("v", "1");
  params.set("deal", buildDealId(fields));
  params.set("type", fields.type);
  params.set("from", fields.from);
  params.set("to", fields.to);
  params.set("depart", fields.depart);
  if (fields.return) params.set("return", fields.return);
  params.set("price", fields.price);
  params.set("found", fields.found);
  if (fields.type === "package") params.set("title", fields.title);
  return `${LINK_BASE}?${params.toString()}`;
}
