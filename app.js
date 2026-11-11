"use strict";

const byId = (id) => document.getElementById(id);
const number = new Intl.NumberFormat("ko-KR");
const signedNumber = new Intl.NumberFormat("ko-KR", { signDisplay: "exceptZero" });
const percentage = new Intl.NumberFormat("ko-KR", {
  style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero",
});
const share = new Intl.NumberFormat("ko-KR", { style: "percent", maximumFractionDigits: 1 });
const rateOf = (previous, current) => previous === 0 ? null : (current - previous) / previous;
const formatRate = (rate) => rate === null ? "—" : percentage.format(rate);
const colors = { blue: "#594cf2", pale: "#bac4f5", teal: "#12a68e", pink: "#e35b84", orange: "#ed8b45", gray: "#a6afc8" };
const rows = BUDGET_DATA.rows.map(([row, sector, account, category, program, previous, current]) => ({
  row, sector, account, category, program, previous, current,
  label: program || category,
  delta: current - previous,
  rate: rateOf(previous, current),
  isTotal: category === "합계",
}));
const sectorColors = new Map([
  ["전력운영", colors.blue], ["방위력개선", colors.teal], ["병무행정", colors.orange],
]);
const accountColors = new Map([["일반회계", colors.blue], ["특별회계·기금", colors.orange]]);
const subgroups = new Set(rows.filter((row) => row.program && row.category).map(categoryKey));
const sectorSelect = byId("sector");
const accountSelect = byId("account");
const sortHeaders = [...document.querySelectorAll("th[data-sort]")];
const sort = { key: "current", direction: "descending" };

function categoryKey({ sector, account, category }) {
  return JSON.stringify([sector, account, category]);
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function totals(entries) {
  return entries.reduce((sum, { previous, current }) => ({
    previous: sum.previous + previous,
    current: sum.current + current,
  }), { previous: 0, current: 0 });
}

function groupTotals(entries, field) {
  const groups = new Map();
  for (const entry of entries) {
    const label = entry[field];
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(entry);
  }
  return [...groups].map(([label, items]) => ({ label, ...totals(items) }));
}

function empty(container, message = "선택한 조건에 해당하는 데이터가 없습니다.") {
  container.replaceChildren(element("p", "empty", message));
}

function fillBar(color, width) {
  const fill = element("span", "fill");
  fill.style.setProperty("--bar", color);
  fill.style.setProperty("--width", `${width}%`);
  return fill;
}

function bars(id, entries, series, message) {
  const container = byId(id);
  if (!entries.length) {
    empty(container, message);
    return;
  }
  const max = Math.max(1, ...entries.flatMap((entry) => series.map(({ key }) => Math.abs(entry[key]))));
  const list = element("div", "chart-list");
  for (const entry of entries) {
    const item = element("div", "pair");
    const values = element("div", "bars");
    for (const { key, name, color, format = number } of series) {
      const value = entry[key];
      const valueText = format.format(value);
      const track = element("div", "track");
      track.title = `${entry.label} · ${name} ${valueText}억 원`;
      const rail = element("div", "rail");
      rail.setAttribute("aria-hidden", "true");
      rail.append(fillBar(typeof color === "function" ? color(entry) : color, Math.abs(value) / max * 100));
      const valueLabel = element("strong", "", valueText);
      valueLabel.setAttribute("aria-label", `${name} ${valueText}억 원`);
      track.append(rail, valueLabel);
      values.append(track);
    }
    item.append(element("span", "chart-label", entry.label), values);
    list.append(item);
  }
  container.replaceChildren(list);
}

function donut(id, entries, centerLabel, formatValue) {
  const container = byId(id);
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  if (!total) {
    empty(container);
    return;
  }
  const wrap = element("div", "donut-wrap");
  const ring = element("div", "donut");
  const center = element("div", "donut-center", number.format(total));
  const legend = element("div", "legend");
  ring.setAttribute("aria-hidden", "true");
  center.append(element("small", "", centerLabel));
  ring.append(center);
  let accumulated = 0;
  const segments = [];
  for (const { label, value, color } of entries) {
    const start = accumulated / total * 100;
    accumulated += value;
    if (value > 0) segments.push(`${color} ${start}% ${accumulated / total * 100}%`);
    const item = element("div", "legend-item");
    const title = element("strong");
    const swatch = element("span", "key");
    swatch.style.setProperty("--swatch", color);
    title.append(swatch, label);
    item.append(title, element("small", "", `${formatValue(value)} · ${share.format(value / total)}`));
    legend.append(item);
  }
  ring.style.setProperty("--segments", `conic-gradient(${segments.join(", ")})`);
  wrap.append(ring, legend);
  container.replaceChildren(wrap);
}

function histogram(entries) {
  const container = byId("histogram-chart");
  const rates = entries.map(({ rate }) => rate).filter((rate) => rate !== null);
  if (!rates.length) {
    empty(container, entries.length ? "증감률을 계산할 수 있는 항목이 없습니다." : undefined);
    return;
  }
  const bins = [
    { label: "−10% 미만", max: -.1, color: colors.pink },
    { label: "−10~0%", max: 0, color: "#bf659e" },
    { label: "0~5%", max: .05, color: "#8c6bea" },
    { label: "5~10%", max: .1, color: colors.blue },
    { label: "10~20%", max: .2, color: "#427fdb" },
    { label: "20% 이상", max: Infinity, color: colors.teal },
  ].map((bin) => ({ ...bin, count: 0 }));
  for (const rate of rates) bins.find((bin) => rate < bin.max).count += 1;
  const max = Math.max(...bins.map(({ count }) => count));
  const chart = element("div", "histogram");
  for (const { label, color, count } of bins) {
    const column = element("div", "hist-column");
    column.title = `${label} · ${count}개 (중간 구간은 하한 포함, 상한 제외)`;
    const bar = element("div", "hist-bar");
    const fill = fillBar(color, count / max * 76);
    fill.setAttribute("aria-hidden", "true");
    bar.append(element("strong", "", String(count)), fill);
    column.append(bar, element("span", "", label));
    chart.append(column);
  }
  container.replaceChildren(chart);
}

function renderTable(entries) {
  byId("row-count").textContent = `${entries.length}개 항목 · 억 원`;
  const body = byId("detail-body");
  if (!entries.length) {
    const row = element("tr");
    const cell = element("td", "", "선택한 조건에 해당하는 데이터가 없습니다.");
    cell.colSpan = 8;
    row.append(cell);
    body.replaceChildren(row);
    return;
  }
  const direction = sort.direction === "ascending" ? 1 : -1;
  const ordered = [...entries].sort((a, b) => {
    const left = a[sort.key];
    const right = b[sort.key];
    if (left === null || right === null) return Number(left === null) - Number(right === null);
    return (left - right) * direction || a.row - b.row;
  });
  const fragment = document.createDocumentFragment();
  for (const entry of ordered) {
    const row = element("tr");
    const tone = entry.delta > 0 ? "positive" : entry.delta < 0 ? "negative" : "";
    for (const value of [entry.label, entry.sector, entry.account, entry.category || "—"]) {
      row.append(element("td", "", value));
    }
    row.append(
      element("td", "num", number.format(entry.previous)),
      element("td", "num", number.format(entry.current)),
      element("td", `num ${tone}`, signedNumber.format(entry.delta)),
      element("td", `num ${tone}`, formatRate(entry.rate)),
    );
    fragment.append(row);
  }
  body.replaceChildren(fragment);
}

const comparison = [
  { key: "previous", name: "2026년", color: colors.pale },
  { key: "current", name: "2027년", color: colors.blue },
];

function render() {
  const sector = sectorSelect.value;
  const account = accountSelect.value;
  const selected = rows.filter((row) => (!sector || row.sector === sector) && (!account || row.account === account));
  const aggregateRows = selected.filter(({ isTotal }) => isTotal);
  const details = selected.filter((row) => row.program || (!row.isTotal && !subgroups.has(categoryKey(row))));
  const categories = selected.filter((row) => !row.program && (!row.isTotal || row.sector === "병무행정"));
  const { previous, current } = totals(aggregateRows);
  const hasData = aggregateRows.length > 0;
  const delta = current - previous;
  byId("current").textContent = hasData ? number.format(current) : "—";
  byId("previous").textContent = hasData ? number.format(previous) : "—";
  byId("delta").textContent = hasData ? signedNumber.format(delta) : "—";
  byId("rate").textContent = formatRate(rateOf(previous, current));
  byId("scope").textContent = `${sector || "전체 부문"} · ${account || "전체 회계"} · ${details.length}개 세부 항목`;

  bars("sector-chart", groupTotals(aggregateRows, "sector"), comparison);
  donut("account-chart", groupTotals(aggregateRows, "account").map(({ label, current }) => ({
    label, value: current, color: accountColors.get(label),
  })), "억 원", (value) => `${number.format(value)}억 원`);
  bars("category-chart", categories.map((row) => ({
    ...row, label: row.isTotal ? row.sector : row.label,
  })).sort((a, b) => b.current - a.current), comparison);

  bars("top-chart", [...details].sort((a, b) => b.current - a.current).slice(0, 10), [
    { key: "current", name: "2027년", color: (entry) => sectorColors.get(entry.sector) },
  ]);
  const increases = details.filter(({ delta }) => delta > 0).sort((a, b) => b.delta - a.delta);
  const decreases = details.filter(({ delta }) => delta < 0).sort((a, b) => a.delta - b.delta);
  bars("increase-chart", increases.slice(0, 6), [
    { key: "delta", name: "증가액", color: colors.teal, format: signedNumber },
  ], hasData ? "증가한 항목이 없습니다." : undefined);
  bars("decrease-chart", decreases.slice(0, 6), [
    { key: "delta", name: "감소액", color: colors.pink, format: signedNumber },
  ], hasData ? "감소한 항목이 없습니다." : undefined);
  donut("direction-chart", [
    { label: "증가", value: increases.length, color: colors.teal },
    { label: "감소", value: decreases.length, color: colors.pink },
    { label: "유지", value: details.length - increases.length - decreases.length, color: colors.gray },
  ], "개 항목", (value) => `${number.format(value)}개`);
  histogram(details);
  renderTable(details);
}

for (const [select, key] of [[sectorSelect, "sector"], [accountSelect, "account"]]) {
  for (const value of new Set(rows.map((row) => row[key]))) {
    const option = element("option", "", value);
    option.value = value;
    select.append(option);
  }
  select.addEventListener("change", render);
}

byId("reset").addEventListener("click", () => {
  sectorSelect.value = "";
  accountSelect.value = "";
  render();
});

for (const header of sortHeaders) {
  if (header.dataset.sort === sort.key) header.setAttribute("aria-sort", sort.direction);
  header.querySelector("button").addEventListener("click", () => {
    const key = header.dataset.sort;
    sort.direction = sort.key === key && sort.direction === "descending" ? "ascending" : "descending";
    sort.key = key;
    for (const cell of sortHeaders) cell.removeAttribute("aria-sort");
    header.setAttribute("aria-sort", sort.direction);
    render();
  });
}

byId("source").textContent = `자료 · ${BUDGET_DATA.source} · ${BUDGET_DATA.sheet} 시트`;
render();
