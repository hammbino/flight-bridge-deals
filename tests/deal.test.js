import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isIsoDate, formatRange, formatRangeWithYear, formatPrice, parseDeal,
  priceLine, checkNewDates, buildSubject, buildPayload, buildCopyPayload,
  slugify, buildDealId, checkBuilderFields, buildLink,
} from "../traverse-tours/deal.js";

const FULL = "?v=1&deal=2026-11-slc-cun&type=flight&from=SLC&to=CUN&depart=2026-11-14&return=2026-11-21&price=289&found=2026-10-13";

test("isIsoDate accepts real dates only", () => {
  assert.equal(isIsoDate("2026-11-14"), true);
  assert.equal(isIsoDate("2028-02-29"), true);
  assert.equal(isIsoDate("2026-02-29"), false);
  assert.equal(isIsoDate("2026-13-01"), false);
  assert.equal(isIsoDate("11/14/2026"), false);
  assert.equal(isIsoDate(""), false);
  assert.equal(isIsoDate(null), false);
});

test("formatRange does not shift dates in Mountain time", () => {
  assert.equal(formatRange("2026-11-14", "2026-11-21"), "Nov 14 to 21");
  assert.equal(formatRange("2026-11-28", "2026-12-05"), "Nov 28 to Dec 5");
  assert.equal(formatRange("2026-11-01", null), "Nov 1, one way");
});

test("formatRangeWithYear", () => {
  assert.equal(formatRangeWithYear("2026-11-14", "2026-11-21"), "Nov 14 to 21, 2026");
  assert.equal(formatRangeWithYear("2026-12-28", "2027-01-04"), "Dec 28, 2026 to Jan 4, 2027");
  assert.equal(formatRangeWithYear("2026-11-14", null), "Nov 14, 2026, one way");
});

test("formatPrice", () => {
  assert.equal(formatPrice("289"), "$289");
  assert.equal(formatPrice("1299"), "$1,299");
  assert.equal(formatPrice("0289"), "$289");
  assert.equal(formatPrice("289.50"), "$289.50");
});

test("parseDeal reads a full link", () => {
  assert.deepEqual(parseDeal(FULL), {
    id: "2026-11-slc-cun", type: "flight", title: "", from: "SLC", to: "CUN",
    depart: "2026-11-14", ret: "2026-11-21", price: "289", found: "2026-10-13",
  });
});

test("parseDeal ignores unknown parameters and lower-case codes", () => {
  const deal = parseDeal(FULL.replace("SLC", "slc") + "&utm_source=kit&v2field=x");
  assert.equal(deal.from, "SLC");
});

test("parseDeal returns null when the route or depart date is broken", () => {
  assert.equal(parseDeal(""), null);
  assert.equal(parseDeal("?from=SLC&to=CUN"), null);
  assert.equal(parseDeal("?from=SLC&to=CUN&depart=2026-11-31"), null);
  assert.equal(parseDeal("?from=SALT&to=CUN&depart=2026-11-14"), null);
});

test("parseDeal drops bad optional fields but keeps the deal", () => {
  const deal = parseDeal("?from=SLC&to=CUN&depart=2026-11-14&return=2026-11-01&price=abc&found=yesterday");
  assert.equal(deal.ret, null);
  assert.equal(deal.price, null);
  assert.equal(deal.found, null);
});

test("parseDeal keeps a package title as plain text, capped at 80 characters", () => {
  const deal = parseDeal("?type=package&from=SLC&to=CUN&depart=2026-11-27&title=" + encodeURIComponent("<script>x</script>" + "a".repeat(100)));
  assert.equal(deal.type, "package");
  assert.equal(deal.title.length, 80);
  assert.ok(deal.title.startsWith("<script>"));
});

test("parseDeal ignores a title on a flight", () => {
  assert.equal(parseDeal(FULL + "&title=Hi").title, "");
});

test("priceLine", () => {
  assert.equal(priceLine(parseDeal(FULL)), "$289 per person, as found on Oct 13, subject to change");
  assert.equal(priceLine(parseDeal(FULL.replace("&found=2026-10-13", ""))), "$289 per person, subject to change");
});

test("checkNewDates", () => {
  assert.equal(checkNewDates("2026-12-02", "2026-12-09", "2026-10-14"), "");
  assert.equal(checkNewDates("2026-12-02", "", "2026-10-14"), "");
  assert.match(checkNewDates("", "", "2026-10-14"), /leave/);
  assert.match(checkNewDates("2026-10-01", "", "2026-10-14"), /passed/);
  assert.match(checkNewDates("2026-12-09", "2026-12-02", "2026-10-14"), /before/);
});

test("buildSubject matches the spec examples exactly", () => {
  const deal = parseDeal(FULL);
  assert.equal(
    buildSubject({ deal, name: "Jane Doe", email: "jane@example.com", newDepart: "", newReturn: "", leadWords: "" }),
    "Book Now request: SLC to CUN, Nov 14 to 21 (Jane Doe, jane@example.com)",
  );
  assert.equal(
    buildSubject({ deal, name: "Jane Doe", email: "jane@example.com", newDepart: "2026-12-02", newReturn: "2026-12-09", leadWords: "" }),
    "Book Now request: SLC to CUN, NEW DATES Dec 2 to 9 (deal was Nov 14 to 21) (Jane Doe, jane@example.com)",
  );
});

test("buildSubject keeps the prefix first and adds lead words at the end", () => {
  const subject = buildSubject({ deal: null, name: "Jane Doe", email: "jane@example.com", newDepart: "", newReturn: "", leadWords: "New Lead" });
  assert.equal(subject, "Book Now request: deal not in link (Jane Doe, jane@example.com) New Lead");
});

test("buildPayload carries every field and the full link", () => {
  const deal = parseDeal(FULL);
  const form = { name: "Jane Doe", email: "jane@example.com", travelers: "2", datesDifferent: false, newDepart: "2026-12-02", newReturn: "", message: "" };
  const p = buildPayload({ accessKey: "KEY", deal, form, link: "https://deals.flight-bridge.com/traverse-tours/" + FULL, leadWords: "", honeypot: false });
  assert.equal(p.access_key, "KEY");
  assert.equal(p.email, "jane@example.com");
  assert.equal(p.subject, "Book Now request: SLC to CUN, Nov 14 to 21 (Jane Doe, jane@example.com)");
  assert.equal(p["Dates are different"], "No");
  assert.equal(p["Travelers"], "2");
  assert.equal(p["Deal ID"], "2026-11-slc-cun");
  assert.ok(p["Link they came from"].endsWith(FULL));
  assert.equal(p["Lead source"], "Flight Bridge");
  assert.equal("botcheck" in p, false);
  assert.equal(JSON.stringify(p).toLowerCase().includes("phone"), false);
});

test("buildPayload sends botcheck true only when the honeypot is checked", () => {
  const form = { name: "Bot", email: "b@example.com", travelers: "1", datesDifferent: false, newDepart: "", newReturn: "", message: "" };
  const p = buildPayload({ accessKey: "KEY", deal: null, form, link: "https://x/", leadWords: "", honeypot: true });
  assert.equal(p.botcheck, true);
});

test("buildPayload with new dates and no deal", () => {
  const form = { name: "Sam", email: "sam@example.com", travelers: "1", datesDifferent: true, newDepart: "2026-12-02", newReturn: "2026-12-09", message: "The Cancun one" };
  const p = buildPayload({ accessKey: "KEY", deal: null, form, link: "https://x/", leadWords: "", honeypot: false });
  assert.equal(p["Deal"], "Not in link. See message.");
  assert.equal(p["Dates are different"], "Yes: Dec 2 to 9, 2026");
  assert.equal(p["Anything else"], "The Cancun one");
  assert.equal(p["Lead source"], "Flight Bridge");
});

test("slugify and buildDealId", () => {
  assert.equal(slugify("Cancún All-Inclusive, 5 nights!"), "cancun-all-inclusive-5-nights");
  assert.equal(buildDealId({ type: "flight", from: "SLC", to: "CUN", depart: "2026-11-14" }), "2026-11-slc-cun");
  assert.equal(buildDealId({ type: "package", from: "SLC", to: "CUN", depart: "2026-11-27", title: "Cancún Black Friday" }), "2026-11-cancun-black-friday");
});

test("checkBuilderFields lists every problem", () => {
  const errors = checkBuilderFields({ type: "package", from: "SL", to: "CUN", depart: "2026-11-14", return: "2026-11-01", price: "abc", found: "", title: "" });
  assert.equal(errors.length, 5);
});

test("buildLink round-trips through parseDeal", () => {
  const fields = { type: "flight", from: "SLC", to: "CUN", depart: "2026-11-14", return: "2026-11-21", price: "289", found: "2026-10-13", title: "" };
  assert.deepEqual(checkBuilderFields(fields), []);
  const link = buildLink(fields);
  assert.equal(link, "https://deals.flight-bridge.com/traverse-tours/" + FULL);
  const pkg = { ...fields, type: "package", title: "Cancún Black Friday", return: "" };
  const deal = parseDeal(new URL(buildLink(pkg)).search);
  assert.equal(deal.title, "Cancún Black Friday");
  assert.equal(deal.ret, null);
});

test("buildCopyPayload swaps only the key", () => {
  const payload = buildPayload({
    accessKey: "main-key", deal: parseDeal(FULL),
    form: { name: "Ann", email: "ann@example.com", travelers: "2", datesDifferent: false, message: "" },
    link: "https://x", leadWords: "", honeypot: false,
  });
  const copy = buildCopyPayload(payload, "copy-key");
  assert.equal(copy.access_key, "copy-key");
  assert.equal(payload.access_key, "main-key");
  assert.deepEqual({ ...copy, access_key: "main-key" }, payload);
});
