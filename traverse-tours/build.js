// Link builder: turns this week's deal into a Book Now link.
import { checkBuilderFields, buildLink } from "./deal.js";

const $ = (id) => document.getElementById(id);
const ids = ["type", "title", "from", "to", "depart", "return", "price", "found"];

function localToday() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function readFields() {
  const fields = Object.fromEntries(ids.map((id) => [id, $(id).value.trim()]));
  fields.from = fields.from.toUpperCase();
  fields.to = fields.to.toUpperCase();
  fields.price = fields.price.replace(/[$,\s]/g, "");
  if (fields.type !== "package") fields.title = "";
  return fields;
}

function update() {
  $("title-row").hidden = $("type").value !== "package";
  const fields = readFields();
  const problems = checkBuilderFields(fields);
  $("problems").hidden = problems.length === 0;
  $("problems").textContent = problems.join(" ");
  $("result").hidden = problems.length > 0;
  if (problems.length) return;
  const link = buildLink(fields);
  $("link").textContent = link;
  $("open").href = link;
}

async function copy() {
  try {
    await navigator.clipboard.writeText($("link").textContent);
    $("copy").textContent = "Copied";
  } catch {
    $("copy").textContent = "Select the link above and copy it";
  }
  setTimeout(() => { $("copy").textContent = "Copy link"; }, 2500);
}

$("found").value = localToday();
ids.forEach((id) => $(id).addEventListener("input", update));
$("copy").addEventListener("click", copy);
update();
