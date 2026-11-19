/*! MC 陪玩插件的配置页：出表单、收表单、把能改的字段列清楚。
 *
 * 只做三件事：渲染、读请求体、把提交上来的值洗一遍。
 * 洗的逻辑必须在这边，因为页面是明文的，谁都改得了。
 *
 * 配置在磁盘上是嵌套的（controlFile + chatBridge.enabled/ignore/session），
 * 表单里用扁平键，组装回嵌套由 index.ts 的保存接口负责。
 */

/** 可编辑字段：类型、上下限、说明。没列在这里的字段一律拒收。 */
const FIELDS = {
  controlFile: {
    kind: "text",
    label: "Mineflayer 控制文件",
    hint: "DeepClef 进程启动后写下的那个 JSON，里面是端口和 token。要填绝对路径，例如 "
      + "G:\\…\\work\\mineflayer-control.json。填错或进程没跑，这里所有工具都会报「读不到控制文件」。",
  },
  chat_enabled: {
    kind: "boolean",
    label: "游戏内聊天桥",
    hint: "开着的话，你在游戏聊天栏打的字会变成一条消息发给我，我的回答再落回游戏聊天栏。"
      + "关掉后，工具照样能用，只是游戏里说话没人应。",
  },
  chat_ignore: {
    kind: "text",
    label: "不理这些人说的话",
    hint: "玩家的游戏名，多个用逗号隔开。填自己以外的名字可以避免别人的闲聊被当成指令。"
      + "注意：游戏里的聊天一律当作「谁说了什么」，不是命令，改配置和跑命令仍然只认网页这边的你。",
  },
  chat_session: {
    kind: "text",
    label: "固定会话 ID（可留空）",
    hint: "留空就跟当前会话说话。填了就把游戏里的对话固定投到那个会话，适合一边在网页干别的、"
      + "一边在游戏里聊。填错不会报错，只会自动开一个新会话。",
  },
} as const;

type FieldKey = keyof typeof FIELDS;

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** 读 POST 请求体，限 64KB。 */
export async function readBody(req: any): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error("提交的内容太大了");
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("提交的内容不是合法 JSON");
  }
}

/** 只留下白名单里的字段，布尔转真布尔，文本截断。 */
export function sanitize(input: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!input || typeof input !== "object") return out;
  for (const [key, spec] of Object.entries(FIELDS)) {
    if (!(key in input)) continue;
    const value = (input as any)[key];
    if (spec.kind === "boolean") {
      out[key] = value === true || value === "true" || value === "on" || value === 1;
    } else {
      out[key] = String(value ?? "").slice(0, 500);
    }
  }
  return out;
}

/** 把扁平的清洗结果折回磁盘上的嵌套结构。 */
export function toConfig(patch: Record<string, unknown>, base: any): any {
  const out = { ...(base && typeof base === "object" ? base : {}) };
  const bridge = { ...(out.chatBridge && typeof out.chatBridge === "object" ? out.chatBridge : {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (key === "controlFile") out.controlFile = value;
    else if (key === "chat_enabled") bridge.enabled = value;
    else if (key === "chat_ignore") {
      const list = String(value ?? "")
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter((s) => /^[A-Za-z0-9_]{1,16}$/.test(s));
      bridge.ignore = list;
    } else if (key === "chat_session") {
      const text = String(value ?? "").trim();
      if (text) bridge.session = text;
      else delete bridge.session;
    }
  }
  out.chatBridge = bridge;
  return out;
}

function field(key: FieldKey, cfg: any): string {
  const spec: any = FIELDS[key];
  const name = esc(key);
  const label = esc(spec.label);
  const hint = spec.hint ? `<p class="pg-hint">${esc(spec.hint)}</p>` : "";
  let value: unknown;
  if (key === "controlFile") value = cfg?.controlFile;
  else if (key === "chat_enabled") value = cfg?.chatBridge?.enabled;
  else if (key === "chat_ignore") value = Array.isArray(cfg?.chatBridge?.ignore) ? cfg.chatBridge.ignore.join(", ") : "";
  else if (key === "chat_session") value = cfg?.chatBridge?.session ?? "";

  let control: string;
  if (spec.kind === "boolean") {
    control = `<label class="pg-row pg-check"><input type="checkbox" name="${name}"${value ? " checked" : ""}><span class="pg-label">${label}</span></label>`;
  } else {
    control = `<label class="pg-row"><span class="pg-label">${label}</span><input type="text" name="${name}" value="${esc(value)}"></label>`;
  }
  return `<div class="pg-item">${control}${hint}</div>`;
}

type StatusView = {
  ok: boolean;
  lines?: string[];
  error?: string;
};

/** 渲染配置页：结构和配色都走 /ui/styles.css，跟管理页同一套。
 * status 由 index.ts 现查一次桥，传进来只做展示。
 */
export function renderPage(cfg: any, status: StatusView, warnings: string[] = []): string {
  const warnBlock = warnings.length
    ? `<section class="panel" style="border-color:rgba(220,38,38,.45)"><div class="panel-header"><h2 style="color:#b91c1c">注意</h2></div><div class="panel-body">${warnings
        .map((w) => `<p class="pg-hint" style="margin:0 0 8px;color:#b91c1c">${esc(w)}</p>`)
        .join("")}</div></section>\n`
    : "";
  const items = (Object.keys(FIELDS) as FieldKey[]).map((k) => field(k, cfg));
  const editable = items
    .reduce<string[]>((acc, cur, i) => {
      if (i % 2 === 0) acc.push(`<div class="pg-pair">${cur}`);
      else acc[acc.length - 1] += `${cur}</div>`;
      return acc;
    }, [])
    .join("\n");

  const statusLines = status.ok
    ? (status.lines ?? []).map((l) => `<div class="pg-ro"><b>在线</b><code>${esc(l)}</code></div>`).join("")
    : `<div class="pg-ro"><b>状态</b><code style="color:#b91c1c">${esc(status.error ?? "桥没响应")}</code></div>`;

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MC 陪玩 · 配置</title>
<link rel="stylesheet" href="/ui/styles.css">
<style>
.panel-body .pg-row{display:block;margin:0}
.panel-body .pg-label{display:block!important;font-size:15px!important;font-weight:700!important;color:inherit;margin:0 0 10px;line-height:1.45}
.panel-body .pg-row input[type=text],.panel-body .pg-row input[type=number],.panel-body .pg-row select{display:block;width:100%;box-sizing:border-box;padding:10px 13px;font-size:14px;line-height:1.4;border-radius:8px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;font-family:inherit}
.panel-body .pg-row input:focus,.panel-body .pg-row select:focus{outline:none;border-color:#7c5cff;box-shadow:0 0 0 3px rgba(124,92,255,.12)}
.panel-body .pg-check{display:flex!important;align-items:center;gap:10px;padding-top:2px}
.panel-body .pg-check .pg-label{margin:0}
.panel-body .pg-pair{display:grid;grid-template-columns:1fr 1fr;column-gap:36px;margin:0 0 30px}
.panel-body .pg-pair:last-child{margin-bottom:0}
.panel-body .pg-pair>.pg-item:only-child{grid-column:1/-1}
.panel-body .pg-item{min-width:0}
.panel-body .pg-hint{margin:10px 0 0;font-size:12px;line-height:1.65;color:#797e8c}
.panel-body .pg-ro{display:grid;grid-template-columns:110px 1fr;gap:16px;margin:14px 0;font-size:13px;align-items:baseline}
.panel-body .pg-ro b{font-weight:600;color:#797e8c}
.panel-body .pg-ro code{background:rgba(127,127,127,.12);padding:2px 6px;border-radius:5px;word-break:break-all;font-size:12px;white-space:pre-wrap}
.pg-actions{display:flex;align-items:center;gap:12px;margin-left:auto}
#msg{font-size:13px;color:#059669;white-space:pre-line;display:none}
#msg.err{color:#dc2626}
.pg-result{margin:22px 0 0;padding:14px 16px;border-radius:10px;font-size:14px;line-height:1.7;white-space:pre-wrap;word-break:break-word;border:1px solid transparent}
.pg-result.wait{background:rgba(124,92,255,.10);border-color:rgba(124,92,255,.35);color:#6d4aff}
.pg-result.ok{background:rgba(5,150,105,.10);border-color:rgba(5,150,105,.35);color:#047857}
.pg-result.err{background:rgba(220,38,38,.10);border-color:rgba(220,38,38,.35);color:#b91c1c}
@media(max-width:760px){.panel-body .pg-pair{grid-template-columns:1fr}}
</style></head><body>
<form id="f">
${warnBlock}<section class="panel"><div class="panel-header"><h2>可编辑</h2><div class="pg-actions"><button class="btn" type="button" id="test">测试连接</button><button class="btn primary" type="submit" form="f" id="ok">保存</button><span id="msg"></span></div></div><div class="panel-body">
${editable}
<div id="result" class="pg-result" hidden></div>
</div></section>
<section class="panel"><div class="panel-header"><h2>现在连上了谁</h2><span class="badge">只读</span></div><div class="panel-body">
${statusLines}
<p class="pg-hint" style="margin-left:0">这一块每次刷新页面现查一次。要点「测试连接」看更细的检查。</p>
</div></section>
</form>
<script type="module">
const form = document.getElementById("f");
const msg = document.getElementById("msg");
const ok = document.getElementById("ok");
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    data[el.name] = el.type === "checkbox" ? el.checked : el.value;
  }
  ok.disabled = true; msg.className = ""; msg.style.display = "block"; msg.textContent = "保存中…";
  try {
    const res = await fetch("/plugins/deepclef/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || ("HTTP " + res.status));
    msg.textContent = "已保存，下次调用生效";
  } catch (error) {
    msg.className = "err";
    msg.textContent = "没存上：" + (error?.message || error);
  } finally { ok.disabled = false; }
});
const result = document.getElementById("result");
const show = (kind, text) => {
  result.hidden = false;
  result.className = "pg-result " + kind;
  result.textContent = text;
};
document.getElementById("test").addEventListener("click", async () => {
  const btn = document.getElementById("test");
  btn.disabled = true;
  show("wait", "查连接中…请稍等");
  try {
    const res = await fetch("/plugins/deepclef/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) throw new Error(body.error || (Array.isArray(body.lines) ? body.lines.join(String.fromCharCode(10)) : "HTTP " + res.status));
    show("ok", Array.isArray(body.lines) ? body.lines.join(String.fromCharCode(10)) : "正常");
  } catch (error) {
    show("err", "测试失败：" + (error?.message || error));
  } finally { btn.disabled = false; }
});
</script></body></html>`;
}
