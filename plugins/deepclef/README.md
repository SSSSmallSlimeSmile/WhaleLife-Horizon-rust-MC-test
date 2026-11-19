# deepclef · MC 陪玩（插件说明）

WhaleLife 插件，id `deepclef`，注册 32 个工具。所有动作都靠请求本机的 **Mineflayer 桥**完成，插件本身不连游戏。

主说明见仓库根目录的 [README](../../README.md)，这里只写插件这一层。

---

## 安装

```
plugins/deepclef/
├── plugin.yaml
├── index.ts          工具与游戏聊天桥
├── routes.ts         网页入口（配置页 / 保存 / 测试连接）
├── ui.ts             表单渲染与字段清洗
├── package.json
└── data/config.json  运行时生成，不要提交
```

拷进 `plugins/`，在 `config/plugins.json` 的 `disabled` 里去掉 `deepclef`，重启。

插件需要 `full` 权限：它要调 `ctx.sessions.run()` 把游戏聊天投进会话，`ask` 在 M0 上没有审批流会被直接拒。

---

## 配置

`data/config.json`：

```json
{
  "controlFile": "C:\\path\\to\\mineflayer-control.json",
  "chatBridge": { "enabled": true, "ignore": [], "session": "" }
}
```

| 键 | 默认 | 说明 |
|---|---|---|
| `controlFile` | 无 | 桥写下的 JSON，**绝对路径**。格式 `{ "port": 数字, "token": 64 位小写十六进制 }` |
| `chatBridge.enabled` | `true` | 游戏内聊天桥 |
| `chatBridge.ignore` | `[]` | 不理的玩家名（逗号分隔保存） |
| `chatBridge.session` | 无 | 固定会话 ID；留空投当前会话 |

**每次调用现读配置**，改完不用重启插件。

### 配置了也不会做的事

`ignore` 只过滤「谁说的话别转进来」，**不是权限**。游戏里的任何文字都只当「某人说了什么」，
改配置、跑命令、改人格仍然只认网页那边的人。桥本身没有任何写文件或执行命令的能力。

---

## 网页

`/plugins/deepclef/`，左侧导航「MC 陪玩」。

- **可编辑**：控制文件、聊天桥开关、忽略名单、固定会话；按钮「测试连接」「保存」
- **只读**：名字 / 服务器 / 就绪 / 位置 / 附近玩家，每次刷新页面现查一次

「测试连接」四项检查：

1. 控制文件存在且格式正确
2. 桥响应
3. 桥登录的是谁、站在哪
4. 聊天桥开关

---

## 工具（32 个）

| 类 | 工具 |
|---|---|
| 状态 | `status` `capabilities` `inventory` `observe` `block` `scan` `items` `progress` |
| 移动 | `goto` `follow` `stop` `come_to_player` |
| 动作 | `break` `place` `look` `action` `pause` `resume` |
| 物品 | `collect` `equip` `container` `eat` `give` |
| 说话 | `chat` |
| 任务 | `task` `preview_task` |
| 地点 | `worksite_save` `worksites` `protection_set` `protection_list` |
| 生存 | `survival_set` `survival_status` |

（实际工具名带 `deepclef_` 前缀）

`deepclef_task` 是统一入口，`task` 字段能派 42 种任务：施工、采集、工坊、行动、协作、载具、其它。

---

## 设计上的三条

**一、只信回执。** 动作回执带 `verified` 字段（扫描/背包差分），模型不能拿「我觉得成了」当结论。

**二、只读优先。** 观察类全是 `safe`；动手类才逐步需要 `ask`。

**三、活干完再说话。** 长任务用 `paused` / `partial` 收尾，不中途报成功。

---

## 已知限制

- `goto` 有半格容差，报 `succeeded` 不等于站在目标格正中
- 寻路不会自动开栅栏门（pathfinder `canOpenDoors` 默认关，且没有关门逻辑）
- 42 种任务只验过 4 种
- 玩家名只能是 `[A-Za-z0-9_]`，中文名会被服务端踢

---

## 许可

AGPL-3.0-only。主体来自 [DeepClef](https://github.com/cymew/deepclef)，Copyright © 2026 iinukami and contributors，
附加条款见上游 `LICENSE-ADDITIONAL`。
