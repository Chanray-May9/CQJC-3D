# 8v8 阵营 AI + Yuka 机动 重构（子计划 3.5）

修复用户反馈的三个问题：
1. **复活点 bug**：红蓝不该同点复活 → 两端阵营区(蓝 z≈+60 / 红 z≈-60，相距~120m)，各队在己方区复活。
2. **AI 只会左右摇不会走** → 引入 **Yuka**(MIT，three.js 专用 Game AI 库)的转向行为(Arrive/Wander/Separation)做真实机动，机器人会在地图上追击/漫游，不再原地 strafe。
3. **我方也要有 AI** → 8v8：玩家(蓝) + 7 蓝队 AI 队友 vs 8 红队 AI。机器人锁定**最近的敌方**(可为敌方 bot 或玩家)，敌我互相交火，双方击杀都计分，先到 50 胜。

## 改动
- `botController.js`：用 Yuka.Vehicle + ArriveBehavior(追向敌人到偏好距离)/WanderBehavior(无敌时漫游)/SeparationBehavior(队友分离) 驱动位置；BotBrain 仍决定开火/撤退；目标为 arena 每帧提供的最近敌人；墙体用 BVH 射线阻挡。
- `arena.js`：建 7 蓝 bot + 8 红 bot + 玩家；两端阵营区 + 地面射线求高度；bot 对最近敌方做 LOS/距离/开火；bot 互杀与杀玩家都计分；各队在己方区复活；玩家复活到蓝区。
- 保留 BotBrain/hitscan/weapon 等已测逻辑与 aggro/难度调校。
- smoke：ai-test 更新——验证双方都会移动接敌、我方 bot 也会击杀红队、复活分区正确。
