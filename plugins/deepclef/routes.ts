/*! MC 陪玩插件的网页入口：配置页、保存、测试连接。
 *
 * 放在单独文件里，是为了 index.ts 只加两行（import + 调用），
 * 不用在一千行的插件主逻辑里插刀。
 */
import { readBody, renderPage, sanitize, toConfig } from "./ui.ts";

type Request = (method: "GET" | "POST", pathname: string, options?: any) => Promise<any>;

/** 从 status 回执里挑几个能看的字段，结构不认识的就不猜。 */
function statusLines(data: any): string[] {
  const lines: string[] = [];
  const d = data && typeof data === "object" ? data : {};
  const inner = d.data && typeof d.data === "object" ? d.data : d;
  if (inner.name) lines.push(`名字 ${inner.name}`);
  if (inner.server) lines.push(`服务器 ${inner.server}`);
  if (inner.ready !== undefined) lines.push(`就绪 ${inner.ready ? "是" : "否"}`);
  const pos = inner.pos ?? inner.position;
  if (pos && typeof pos === "object") {
    const fmt = (v: any) => (typeof v === "number" ? v.toFixed(1) : String(v ?? "?"));
    lines.push(`位置 ${fmt(pos.x)}, ${fmt(pos.y)}, ${fmt(pos.z)}`);
  }
  if (Array.isArray(inner.players)) lines.push(`附近玩家 ${inner.players.join("、") || "没有"}`);
  if (inner.following) lines.push(`正跟着 ${inner.following}`);
  if (!lines.length) {
    const raw = JSON.stringify(inner);
    lines.push(raw.length > 600 ? raw.slice(0, 600) + "…" : raw);
  }
  return lines;
}

export function registerPages(ctx: any, request: Request) {
  ctx.web.page(
    "/plugins/deepclef/",
    async (_req: any, res: any) => {
      const cfg = (await ctx.config.read("config.json").catch(() => null)) as any;
      let status: { ok: boolean; lines?: string[]; error?: string } = { ok: false, error: "还没查" };
      try {
        const data = await request("GET", "status", { timeoutMs: 5000 });
        status = data?.ok === false
          ? { ok: false, error: String(data?.error ?? "桥没响应") }
          : { ok: true, lines: statusLines(data) };
      } catch (error: any) {
        status = { ok: false, error: error?.message ?? String(error) };
      }
      const warns: string[] = [];
      if (!cfg?.controlFile) warns.push("还没填 Mineflayer 控制文件路径，所有工具都会报「读不到控制文件」。");
      if (!status.ok) warns.push("现在连不上桥。DeepClef 进程没跑时这是正常的；跑着还连不上，就用下面「测试连接」看卡在哪一步。");

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(renderPage(cfg, status, warns));
    },
    { title: "MC 陪玩", navigation: true },
  );

  ctx.web.api("/plugins/deepclef/save", async (req: any, res: any) => {
    const reply = (code: number, body: any) => {
      res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify(body));
    };
    try {
      const patch = sanitize(await readBody(req));
      if (!Object.keys(patch).length) throw new Error("没有可保存的字段");
      const base = await ctx.config.read("config.json").catch(() => null);
      const merged = toConfig(patch, base);
      if (typeof merged.controlFile === "string" && merged.controlFile.trim() && !/^[A-Za-z]:[\\/]/.test(merged.controlFile.trim())) {
        throw new Error("控制文件要填绝对路径，比如 G:\\…\\work\\mineflayer-control.json");
      }
      await ctx.config.save("config.json", merged);
      return reply(200, { ok: true, saved: Object.keys(patch) });
    } catch (error: any) {
      return reply(400, { ok: false, error: error?.message ?? String(error) });
    }
  });

  ctx.web.api("/plugins/deepclef/test", async (_req: any, res: any) => {
    const reply = (code: number, body: any) => {
      res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify(body));
    };
    const lines: string[] = [];
    let ok = true;
    try {
      const cfg = (await ctx.config.read("config.json").catch(() => null)) as any;
      const file = typeof cfg?.controlFile === "string" ? cfg.controlFile.trim() : "";

      // 1. 控制文件本身
      if (!file) {
        ok = false;
        lines.push("[×] 控制文件：没填路径");
      } else {
        const { readFile } = await import("node:fs/promises");
        try {
          const raw = await readFile(file, { encoding: "utf8" });
          const parsed = JSON.parse(raw) as any;
          if (Number.isInteger(parsed?.port) && typeof parsed?.token === "string" && /^[a-f0-9]{64}$/.test(parsed.token)) {
            lines.push(`[✓] 控制文件：${file}`);
            lines.push(`    端口 ${parsed.port}，token 长度 64`);
          } else {
            ok = false;
            lines.push(`[×] 控制文件格式不对：${file}`);
            lines.push(`    要 {"port": 数字, "token": 64 位小写十六进制}`);
          }
        } catch (error: any) {
          ok = false;
          lines.push(`[×] 读不到控制文件：${file}`);
          lines.push(`    ${error?.code === "ENOENT" ? "文件不存在——DeepClef 进程大概没跑。" : String(error?.message ?? error)}`);
        }
      }

      // 2. 桥有没有响应
      const data = await request("GET", "status", { timeoutMs: 6000 });
      if (data?.ok === false) {
        ok = false;
        lines.push(`[×] 桥：${data?.error ?? "没响应"}`);
      } else {
        const list = statusLines(data);
        lines.push(`[✓] 桥：${list[0] ?? "通了"}`);
        for (const one of list.slice(1)) lines.push(`    ${one}`);
      }

      // 3. 游戏内聊天桥的配置形态
      const bridge = cfg?.chatBridge ?? {};
      if (bridge.enabled) {
        lines.push(`[✓] 游戏内聊天：开着${Array.isArray(bridge.ignore) && bridge.ignore.length ? `，不理 ${bridge.ignore.join("、")}` : ""}${bridge.session ? `，固定会话 ${bridge.session}` : "，投当前会话"}`);
      } else {
        lines.push("[!] 游戏内聊天：关着。工具能用，但你在游戏里说话没人应。");
      }

      lines.push("");
      lines.push("这只是连接检查，不动游戏里的任何东西。");
      return reply(200, { ok, lines });
    } catch (error: any) {
      return reply(500, { ok: false, lines: [`检查本身出错：${error?.message ?? error}`] });
    }
  });
}
