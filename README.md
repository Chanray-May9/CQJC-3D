# 蒋介石大战希特勒 · 时空战场

在重庆建筑工程职业学院 3D 校园里的第一人称 **8v8 团队竞技枪战**（three.js），历史人物荒诞乱斗主题。

**故事**：一道时空裂隙把**蒋介石**与**希特勒**连同麾下千军卷入这座现代校园，两位枭雄狭路相逢。玩家自选加入**蒋介石阵营（蓝）**或**希特勒阵营（红）**——同阵营的所有士兵头上都顶着领袖的大头照，哪队击杀先到 **50** 获胜，结算显示"蒋介石战胜了希特勒"或反之。

## 玩法特性

- **完整流程**：开场旁白演出（语音 + 地图扫描运镜，可跳过）→ 阵营选择 → 模式选择 → 匹配（预计 20 秒，凑不满自动填人机）→ 对局 → 结算。
- **8v8**：你 + 7 名 AI 队友 对阵 8 名 AI 敌军，两队在地图两端各自阵营区出生/复活。
- **人机 AI**：基于 [Yuka](https://mugen87.github.io/yuka/) 转向行为的真实机动（追击/走位/漫游/分离）+ 状态机开火决策；有反应延迟、命中概率、同时开火上限，做到"比真人稍强但不秒杀"。
- **战斗**：5 种枪械（手枪/步枪/冲锋枪/狙击/霰弹，各具属性），射线命中 + 爆头 1.5×，自动/手动换弹，右键开镜，合成枪声，第一人称手臂持枪，士兵走路/倒地动画。
- **可扩展**：战术竞技/占点/攻防模式已在菜单预留（敬请期待）；联机为后续规划，当前为单机 + 人机。
- 基座仍是原校园漫游：扫描级 PBR 材质、上午光照与投影、胶囊体碰撞、程序化脚步声。

## 在线体验

**https://chanray-may9.github.io/CQJC-3D/**

手机和电脑浏览器都能直接打开，免安装。

## 下载安卓 APK

**[蒋介石大战希特勒 v0.3.0 · CQJC-3D-v0.3.0.apk](https://github.com/Chanray-May9/CQJC-3D/releases/download/v0.3.0/CQJC-3D-v0.3.0.apk)**（约 26 MB，8v8 团队竞技枪战）

手机浏览器打开直链即可下载，在设置里允许「安装未知来源应用」后点击安装。全部 [Release](https://github.com/Chanray-May9/CQJC-3D/releases) 见发布页。

## 运行

```bash
git clone https://github.com/Chanray-May9/CQJC-3D.git
cd CQJC-3D
npm install        # 读取 package.json，装好所有依赖
npm run dev        # http://127.0.0.1:5183
```

## 操作

**电脑** — `WASD` 移动，`Shift` 疾跑，`空格` 跳跃，鼠标转视角，**左键开火**，**右键开镜**，`R` 换弹，`M` 静音，`Esc` 暂停（点击画面重新进入）。

**手机** — 左半屏摇杆移动，右半屏拖动转视角，右下角「开火 / 跑 / 跳」按钮。

## 命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器 |
| `npm run build` | 打包到 `dist/` |
| `npm run deploy` | 构建并发布到 GitHub Pages |
| `npm test` | 逻辑核心单元测试（武器/战斗员/规则/AI），43 项 |
| `npm run test:combat` | 开火→命中→击杀→记分冒烟 |
| `npm run test:ai` | 8v8 人机 AI 冒烟（分区/机动/交战/复活/帧率） |
| `npm run test:flow` | 菜单流程冒烟（开场/阵营/模式/匹配/对局） |
| `npm run shots` | 生成 `shots/` 下的效果截图 |

> 冒烟测试需先 `npm run dev` 起本地服务器再运行。

## 结构（战斗系统）

```
src/flow.js                流程状态机：开场演出/阵营/模式/匹配/结算
src/combat/arena.js        对局：8v8 编队、两端阵营区、记分、复活、伤害结算
src/combat/botController.js 机器人集成：Yuka 转向机动 + 开火 + 贴地 + LOS
src/game/botBrain.js       AI 状态机 + 命中概率模型（纯逻辑，单测）
src/combat/hitscan.js      射线-球体命中判定（纯数学，单测）
src/game/weapons.js        5 种枪械配置表 + 伤害衰减（单测）
src/game/weaponRuntime.js  弹药/射速/换弹（单测）
src/game/combatant.js      战斗员：血量/受击/死亡/复活/回血（单测）
src/game/deathmatch.js     死亡竞赛规则：记分/复活/胜负（单测）
src/combat/avatars.js      士兵人形 + 走路/倒地动画
src/combat/viewmodel.js    第一人称枪模（CC0 GLB）+ 手臂
assets/weapons/*.glb       Quaternius《Ultimate Guns Pack》CC0 枪模
```

## 打包安卓 APK

用 Capacitor 把构建产物装进 WebView。需要 JDK 17 和 Android SDK（build-tools 34、platform 34）；
仓库不含这套工具链，本机放在未跟踪的 `.toolchain/` 下。

```bash
npm run build
npx cap add android            # 首次
node tools/write-local-properties.mjs
npx cap sync android
cd android && ./gradlew.bat assembleDebug
```

产物在 `android/app/build/outputs/apk/debug/app-debug.apk`，应用名 **CQJC 3D**。已发布的现成安装包见 [Release v1.0](https://github.com/Chanray-May9/CQJC-3D/releases/download/v1.0/CQJC-3D.apk)。

## 结构

```
assets/campus.glb          源模型（8.3k 三角面，618 个节点）
assets/textures/           6 套 ambientCG CC0 材质 + manifest.json
src/materials.js           材质规则表、世界坐标立方投影 UV
src/sky.js                 天空穹顶、上午太阳、跟随式阴影相机
src/campus.js              模型加载、材质套用、BVH 碰撞体
src/player.js              第一人称控制器（胶囊体扫掠碰撞）
src/audio.js               WebAudio 程序化脚步声
src/hud.js                 载入进度、地标提示、帧率
tools/                     材质下载、截图、测试
```

## 几个关键决定

**UV 在加载时重算，不生成中间文件。** 源模型的 UV 密度约为每 16 米一个贴图循环，混凝土会糊成一片。加载时按世界坐标做立方投影（1 UV = 1 米，各材质再按 `TILE_METRES` 缩放），2.5 万顶点瞬间算完。模型里顶点是按面拆分的（每个立方体 24 个顶点），所以投影不会在墙角拉伸。

**共享几何体必须先克隆。** 618 个节点只引用 388 个几何体。立方投影把世界坐标烘进 UV，若不克隆，后遍历的实例会覆盖前一个的贴图坐标。

**阴影相机跟随玩家，只覆盖 ±110 米。** 整个校园 520×320 米，用一张阴影图全覆盖的话每像素约 13 厘米，边缘会糊。跟随之后近处阴影清晰。代价是远景（几十米高空俯瞰）超出覆盖范围就没有阴影 —— 对步行视角无影响。

**天空穹顶要关掉雾。** 穹顶在 20000 米外，远超雾的 1100 米上限，不关的话整片天会被替换成雾色，变成一块白板。

**材质规则匹配「母节点/自身」路径，而不只是自身名字。** 模型里有一批建筑（折板楼）和全部 31 棵树是**空的组节点**，真正的表面是它们下面一律叫 `part_#` 的子网格。只看自己的名字，这些表面就全部掉进兜底规则 —— 折板楼的白墙被当成混凝土刷灰了，树干和树叶被贴上了混凝土颗粒。

**窗户靠原始颜色识别，不靠名字。** 458 条窗带和墙板在名字上都是 `part_#`，无法区分；但生成器给玻璃用的是固定的两个颜色（`8fa6b3` / `5c7a88`），所以规则支持按源材质颜色匹配。

**白墙靠混合，不靠 tint。** `color` 是乘法，而扫描的混凝土贴图本身是中灰，纯白 tint 乘上去仍然是灰；把 tint 提到 1 以上又会把高光压平、丢掉颗粒。所以在 `map_fragment` 之后把 albedo 向白色 `mix`（见 `applyWhiten`），抬高整体亮度而完整保留纹理的明暗起伏 —— 现实中的校园外墙就是刷白的。混合强度放在 uniform 里，所有白墙共用一个着色器程序。

**天空环境贴图只给玻璃，不做 `scene.environment`。** 玻璃需要有东西可反射，否则低粗糙度表面采集不到任何辐射，会渲染成近黑。但 three.js `Sky` 着色器输出的是高动态范围辐射（太阳附近能到几百），一旦设成全局环境光，就会盖过太阳和半球光把整个场景冲成白片 —— 即使把强度压到 0.42 也一样。所以把它单独挂在玻璃和水面材质上，其余光照分毫不动。

## 已知限制

- 没有窗户几何。玻璃是贴在墙面上的平面，凑近侧看没有窗框厚度。
- 远景无阴影（见上）。
- 树叶用原始平面色，没有贴图 —— 低面数树冠贴上树叶材质反而更假。

## 素材 / 库授权

- 校园材质：[ambientCG](https://ambientcg.com)，CC0，可商用。
- 枪械模型：Quaternius《Ultimate Guns Pack》（[poly.pizza](https://poly.pizza)），CC0，可商用。
- AI 库：[Yuka](https://github.com/Mugen87/yuka)，MIT。士兵人形为程序化几何占位（后续可换 CC0 人形模型）。
