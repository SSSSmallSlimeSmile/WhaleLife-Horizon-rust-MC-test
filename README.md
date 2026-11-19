# WhaleLife-Horizon-rust-MC-test

给 [WhaleLife](https://github.com/horizon-rust/horizon) 用的 **Minecraft 陪玩插件**（插件 id：`deepclef`）。

它让模型在 Minecraft 里有一个能走、能挖、能放方块的「身体」：你说一句，它去做，做完拿回执给你看。
本仓库是实验性版本，接口来自 [DeepClef](https://github.com/cymew/deepclef) 的 Horizon 分支，插件侧由我们维护。

> **状态**：本机（Windows 11 + Miller 服务器 / Horizon Rust 服务端）跑通过，没有在其它系统、其它服务端上验证过。

---

## 一、它由三块组成

```
┌─────────────────┐   HTTP 127.0.0.1:port   ┌──────────────────┐   Minecraft    ┌─────────────────┐
│ WhaleLife 插件  │ ───── Bearer token ────▶ │ Mineflayer 桥    │ ─────────────▶ │ Minecraft 服务端 │
│ plugins/deepclef│ ◀──── 动作回执 ────────  │ node 无头客户端  │ ◀───────────── │ (Horizon / 原版) │
└─────────────────┘                          └──────────────────┘                └─────────────────┘
         ▲
         │ 你在这里说话（网页 / 游戏聊天栏）
```

| 层 | 是什么 | 谁提供 |
|---|---|---|
| **插件** | WhaleLife 的 `plugins/deepclef`，注册 32 个工具、提供配置页、把游戏聊天投进会话 | 本仓库 |
| **桥** | 一个独立的 Node 进程，用 mineflayer 登录游戏、执行动作、写回执 | 需要单独跑，不在本仓库 |
| **服务端** | Minecraft 服务端本体 | 你自己的 |

**插件不会自己连服务器**。它只读一个「控制文件」拿到端口和 token，然后请求本机的桥。桥不在，所有工具都会报「读不到控制文件」。

---

## 二、环境要求

### 必需

| 项目 | 版本 / 说明 |
|---|---|
| WhaleLife | 插件 API `apiVersion: "1"`；插件需要 `full` 权限（会调 `ctx.sessions.run()` 把游戏聊天投进会话） |
| Node.js | 跑桥用。本机实测 `v26.13.0`；≥ 20 应该都行，没逐个试 |
| mineflayer | 桥的依赖，`@wp2508/mineflayer 4.42.7`（我们用的这个 fork） |
| mineflayer-pathfinder | 寻路，桥自带在依赖里 |
| Minecraft 服务端 | 本机是 Horizon Rust 服务端 + server-3 专用服务器；原版服务端理论上也行，未验证 |

### 可选

- `gh`（GitHub CLI）—— 只有你要从仓库拉补丁时才用得上
- 一个能看图的对话模型 —— 想看「我的角色站在哪」时需要 `see_now` 之类，本插件不自带

### 不需要

- 不需要装 Mod
- 不需要开正版验证（但**离线模式有 UUID 的坑**，见第六节）
- 不需要图形界面；桥是无头客户端

---

## 三、安装

### 1. 放插件

```
<K:/你的 WhaleLife>/plugins/deepclef/
├── plugin.yaml
├── index.ts          插件主逻辑，32 个工具
├── routes.ts         网页入口（配置页 / 保存 / 测试连接）
├── ui.ts             配置页的表单与清洗
├── package.json
└── data/config.json  运行时生成
```

### 2. 启用

在 `config/plugins.json` 的 `disabled` 列表里**去掉** `deepclef`（不在列表里就是启用），重启 WhaleLife。

启动日志里应该看到：

```
插件加载 id deepclef
```

左侧导航会出现「**MC 陪玩**」。

### 3. 跑桥

桥要一个 `package.json`（含 mineflayer 依赖）和一个控制文件路径。示例命令：

```powershell
node G:\…\mineflayer-companion.cjs `
     G:\…\package.json `
     G:\…\work\mineflayer-control.json `
     G:\…\work\server-3.json
```

三个参数分别是 **依赖清单**、**控制文件（脚本自己写）**、**服务器配置**。

启动成功后控制文件长这样：

```json
{ "port": 64440, "token": "64 位小写十六进制" }
```

> ⚠️ 少传参数时脚本**不报错也不服务**（stderr 被 `WindowStyle Hidden` 吞掉的话更看不出来）。起不来先把 stderr 重定向到文件。

### 4. 填配置

打开「MC 陪玩」页，把控制文件**绝对路径**填进去，点「测试连接」。全绿就是通了。

### 5. 进游戏

桥登录的账号进服后，`deepclef_status` 能看到名字、服务器、坐标、附近玩家。

---

## 四、配置项

配置文件：`plugins/deepclef/data/config.json`

```json
{
  "controlFile": "G:\\…\\work\\mineflayer-control.json",
  "chatBridge": {
    "enabled": true,
    "ignore": [],
    "session": ""
  }
}
```

| 键 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `controlFile` | string（绝对路径） | 无 | 桥写下的 JSON。填相对路径会被保存接口拒绝 |
| `chatBridge.enabled` | boolean | `true` | 游戏内聊天桥。关掉后工具照用，只是游戏里说话没人应 |
| `chatBridge.ignore` | string[] | `[]` | 不理这些玩家名。多个名字用逗号分隔，保存时自动清洗 |
| `chatBridge.session` | string | 无 | 固定会话 ID。留空 = 投到当前会话；填错不报错，会自动开新会话 |

改完**下次调用生效**，不用重启插件（配置每次调用现读）。

---

## 五、32 个工具

按用途分十类。`danger` 列是 WhaleLife 的权限等级：`safe` 直接执行，`ask` 需要审批。

### 5.1 状态与观察

| 工具 | danger | 说明 |
|---|---|---|
| `deepclef_status` | safe | 位置、跟随状态、可见玩家 |
| `deepclef_capabilities` | safe | 桥支持哪些任务和操作（**新版本先查这个**） |
| `deepclef_inventory` | safe | 36 格背包 + 当前热栏槽 |
| `deepclef_observe` | safe | 附近玩家、生物、掉落物、门和工作站 |
| `deepclef_block` | safe | 读某个方块的方块名和 stateId |
| `deepclef_scan` | safe | 在已加载区块里找某类方块，最多返回 32 个坐标 |
| `deepclef_items` | safe | 24 格内的掉落物实体 |

### 5.2 移动

| 工具 | danger | 说明 |
|---|---|---|
| `deepclef_goto` | safe | 走到坐标。**只有真的站进目标格才报成功**（实测有半格容差，见第七节） |
| `deepclef_follow` | ask | 跟随玩家；`on_lost=wait` 原地等，`return` 回集合点 |
| `deepclef_stop` | safe | 取消跟随并停下 |
| `deepclef_come_to_player` | safe | 走到指定玩家附近就停，不持续跟 |

### 5.3 动作

| 工具 | danger | 说明 |
|---|---|---|
| `deepclef_break` | safe | 挖一个方块，等动作结束再返回 |
| `deepclef_place` | safe | 对着支撑面放方块；够不着时自动换站位 |
| `deepclef_look` | safe | 转头到某角度，可把转动分摊到几秒，像玩家 |
| `deepclef_action` | safe | 轮询动作终态（succeeded / failed / cancelled + 证据） |

### 5.4 物品

| 工具 | danger | 说明 |
|---|---|---|
| `deepclef_collect` | safe | 去捡一个掉落物，数量只信 `verified.gained` |
| `deepclef_equip` | safe | 把某样东西拿到手上 |
| `deepclef_container` | safe | 开箱子 / 木桶：`inspect` / `withdraw` / `deposit` |
| `deepclef_eat` | safe | 吃东西，回执带饥饿值和物品数变化 |
| `deepclef_give` | ask | 创造模式给物品进热栏 |

### 5.5 说话

| 工具 | danger | 说明 |
|---|---|---|
| `deepclef_chat` | safe | 在游戏里发一条聊天，自动加 `[Kan]` 之类的前缀 |

### 5.6 任务（42 种里的入口）

| 工具 | danger | 说明 |
|---|---|---|
| `deepclef_task` | ask | **统一任务入口**。`task` 字段选 42 种之一，`params` 传参数 |
| `deepclef_preview_task` | safe | 提交前干跑：缺什么料、有没有冲突 |
| `deepclef_progress` | safe | 查正在跑的任务进度 |
| `deepclef_pause` | safe | 暂停长任务，等它收尾成 `partial` |
| `deepclef_resume` | safe | 恢复被暂停的盖墙任务，自动跳过已有方块 |

`deepclef_task` 能派的任务（42 种，按类）：

- **施工**：`build_wall` `build_blueprint` `audit_blueprint` `copy_template` `light_area` `dig_area`
- **采集**：`gather` `go_collect` `fish` `shear_sheep` `farm_wheat` `feed_animals`
- **工坊**：`craft` `smelt` `cook_food` `interact`
- **行动**：`return_home` `recover_death` `explore_route` `cave_route` `trail` `camp_resupply` `supply` `deliver_supplies` `handover` `stocktake`
- **协作**：`team_mine` `travel_together` `guard_player` `hold_position` `watch_redstone` `check_equipment` `help_and_resume`
- **载具**：`boat_board` `boat_leave` `boat_join` `boat_sail`
- **其它**：`sleep` `wake` `portal_cross` `adventure_log` `run_workflow`

### 5.7 工作点与保护区

| 工具 | danger | 说明 |
|---|---|---|
| `deepclef_worksite_save` | safe | 保存基地 / 工作区 / 仓库 / 钓点，同名覆盖 |
| `deepclef_worksites` | safe | 列出已保存的地点 |
| `deepclef_protection_set` | safe | 保存或移除命名保护区，默认拦 `dig` |
| `deepclef_protection_list` | safe | 查保护区 |

### 5.8 生存

| 工具 | danger | 说明 |
|---|---|---|
| `deepclef_survival_set` | ask | 开关生存自理：低血撤回、饿了吃自带食物 |
| `deepclef_survival_status` | safe | 查生存自理状态 |

---

## 六、网页界面

左侧导航「**MC 陪玩**」，`/plugins/deepclef/`。

```
可编辑
  控制文件路径 / 游戏内聊天桥开关 / 忽略名单 / 固定会话
  [测试连接]  [保存]

现在连上了谁（只读）
  名字 / 服务器 / 就绪 / 位置 / 附近玩家
  每次刷新页面现查一次
```

「测试连接」检查四件事并逐条打勾：

1. 控制文件在不在、格式对不对（`port` 是数字、`token` 是 64 位小写十六进制）
2. 桥有没有响应
3. 桥现在登录的是谁、站在哪
4. 游戏内聊天桥开着还是关着

---

## 七、踩过的坑

这一节是全部价值所在。每条都是真撞上过的。

### 7.1 玩家名大小写 → UUID 对不上

离线模式（`online-mode=false`）的 UUID 是 `OfflinePlayer:<名字>` 现算的：

```
OfflinePlayer:Kan  →  7e4b4fbe-…（离线模式按名字算出的 UUID，大小写不同结果就不同）
OfflinePlayer:kan  →  另一个完全不同的值
```

白名单**只认 UUID 不认名字**，所以：

- 控制台说「已在白名单内」，机器人还是被踢 `not_whitelisted`
- 两边都以为加对了，其实是两条不同的记录

**结论**：桥里的用户名要和白名单里那条**一字不差**（含大小写）。

### 7.2 非 ASCII 用户名

`username: '勘'` 会被踢 `multiplayer.disconnect.unverified_username`。
Minecraft 用户名只允许 `[A-Za-z0-9_]`。想要中文，只能改聊天前缀，不能改登录名。

### 7.3 控制文件格式

```json
{ "port": 64440, "token": "必须是 64 位小写十六进制" }
```

少一个字段、token 长度不对，插件直接报「控制文件格式无效」，不会去猜。
**不要**把端口写成字符串，`Number.isInteger` 会挡下来。

### 7.4 桥少传参数不报错

`mineflayer-companion.cjs` 要三个参数。少传时它可能静默退出，或者活着但不服务。
**起不来先把 stderr 重定向到文件**，别对着一个「看起来在跑」的进程猜。

### 7.5 游戏聊天游标

桥每次重启，消息序号从 1 重新开始。插件里如果写 `cursor = Math.max(cursor, last)`，游标永远不会回退，重启后**所有消息都被过滤掉**。

正确做法：**发现 `last < cursor` 就判定桥重启了，游标重置为 0**。

### 7.6 聊天前缀重复

`bot.chat()` 本身会带玩家名，再手动加 `[Kan] ` 会显示成 `<Kan> [Kan] 内容`。
前缀要么不加，要么加在**会被服务端去掉的那层**，别两头都加。

### 7.7 `goto` 报成功不等于站准了

实测停在离目标 0.3 / 0.5 格的地方就报 `succeeded`。
**贴边操作（放方块、开门）不能信这个结论**，要另外读一次方块确认。

### 7.8 插件权限

插件需要 `full`：

```json
{ "id": "deepclef", "permission": "full" }
```

`ask` 在 M0 上没有审批流，会被直接拒绝。

### 7.9 工具协议退化（宿主侧）

长上下文（约 95k+）时，模型偶尔会把完整的工具调用块当正文吐出来，不写包装标记。
插件侧有守卫，但**守卫只能事后补救**。如果你看到正文里出现 `invoke` 块，说明这一轮没执行。

### 7.10 显存

本地视觉模型（如 `qwen3-vl:4b`）和 GPT-SoVITS 抢 8GB 显存会整机卡死。
**MC 陪玩本身不吃显存**，但如果你同时开着看屏插件，注意。

---

## 八、已知问题

| 问题 | 状态 |
|---|---|
| `build_wall` 只能沿一个水平轴展开，3×3 的平面要拆三次调用 | 等上游实现（`from`/`to` 两轴放开 + 排序） |
| `build_wall` 的 `unexpected: 1` | 未定位。同一批 `dig_area` 是 0，怀疑跟 `support_missing` 中断路径的统计口径有关 |
| `side_effects` 口径不明 | 是「全背包差分」还是「只覆盖本次目标」，等上游确认 |
| 寻路不会自动开栅栏门 | pathfinder 的 `canOpenDoors` 默认关；开门没有关门，得单独加跟随循环 |
| `place` 的 `face` 传错时错误文案是「Target block is missing or unloaded」 | 实际是「支撑格是空气」，读起来像世界没加载 |
| 42 种任务里只跑过 4 种（`build_wall` `dig_area` `go_collect` `goto`） | 其余 38 种连报错长什么样都不知道 |

---

## 九、文档

- [`docs/已安装功能.md`](docs/已安装功能.md) —— 本机现在装了什么、跑通哪些、哪些只是装上没验过
- [`plugins/deepclef/README.md`](plugins/deepclef/README.md) —— 插件级说明

---

## 十、许可

AGPL-3.0-only。插件主体来自 [DeepClef](https://github.com/cymew/deepclef)（Copyright © 2026 iinukami and contributors），
附加条款见上游 `LICENSE-ADDITIONAL`。

本仓库是实验性改动，**不是官方版本**。上游接口怎么定，以上游为准。
