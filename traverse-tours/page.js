// Book Now page: shows the deal from the link and sends the request to
// Web3Forms, which emails it to the Traverse inbox.
import { WEB3FORMS_KEY, LEAD_WORDS, INBOX } from "./config.js";
import {
  parseDeal, routeLabel, formatRangeWithYear, priceLine, checkNewDates, buildPayload,
} from "./deal.js";

const deal = parseDeal(window.location.search);
const $ = (id) => document.getElementById(id);

// Local date as YYYY-MM-DD, used as the earliest pickable date.
function localToday() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// All text from the link goes in with textContent, never innerHTML,
// because anyone can edit a link.
function showDeal() {
  if (!deal) {
    $("deal").hidden = true;
    $("dates-different-row").hidden = true;
    $("title").textContent = "Request a trip";
    $("message-label").textContent = "Which deal are you interested in?";
    $("message").required = true;
    return;
  }
  $("deal-route").textContent = routeLabel(deal);
  $("deal-dates").textContent = formatRangeWithYear(deal.depart, deal.ret);
  if (deal.price) {
    $("deal-price").textContent = priceLine(deal);
  } else {
    $("deal-price").hidden = true;
  }
}

function setupDates() {
  const today = localToday();
  $("new-depart").min = today;
  $("new-return").min = today;
  $("dates-different").addEventListener("change", (event) => {
    $("new-dates").hidden = !event.target.checked;
    $("new-depart").required = event.target.checked;
  });
}

function showError(text) {
  $("error").textContent = text;
  $("error").hidden = false;
  $("error").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function submit(event) {
  event.preventDefault();
  $("error").hidden = true;
  const form = {
    name: $("name").value.trim(),
    email: $("email").value.trim(),
    travelers: $("travelers").value,
    datesDifferent: deal ? $("dates-different").checked : false,
    newDepart: $("new-depart").value,
    newReturn: $("new-return").value,
    message: $("message").value.trim(),
  };
  if (!form.name) return showError("Please enter your name.");
  if (form.datesDifferent) {
    const problem = checkNewDates(form.newDepart, form.newReturn, localToday());
    if (problem) return showError(problem);
  }
  if (!WEB3FORMS_KEY) return showError(`This form is not live yet. Please email us at ${INBOX}.`);

  const button = $("send");
  button.disabled = true;
  button.textContent = "Sending...";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const payload = buildPayload({
      accessKey: WEB3FORMS_KEY,
      deal,
      form,
      link: window.location.href,
      leadWords: LEAD_WORDS,
      honeypot: $("botcheck").checked,
    });
    const response = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || String(response.status));
    $("request").hidden = true;
    $("thanks-name").textContent = form.name;
    $("thanks-email").textContent = form.email;
    $("thanks").hidden = false;
    window.scrollTo(0, 0);
  } catch (error) {
    console.error("Book Now send failed:", error);
    if (error && error.name === "AbortError") {
      showError(`We could not confirm your request was sent. Please email us at ${INBOX} so nothing gets missed.`);
    } else {
      showError(`Something went wrong and your request was not sent. Please try again, or email us at ${INBOX}.`);
    }
    button.disabled = false;
    button.textContent = "Send my request";
  } finally {
    clearTimeout(timer);
  }
}

showDeal();
setupDates();
$("form").addEventListener("submit", submit);
