# 重庆建筑工程职业学院 · 校园漫游

把 `chongqing-jianzhu-campus.glb` 这个基础体块模型变成浏览器里能第一人称走动的场景：扫描级 PBR 材质、上午光照与真实投影、胶囊体碰撞、程序化脚步声。

## 在线体验

**https://chanray-may9.github.io/CQJC-3D/**

手机和电脑浏览器都能直接打开。

## 运行

```bash
git clone https://github.com/Chanray-May9/CQJC-3D.git
cd CQJC-3D
npm install        # 读取 package.json，装好所有依赖
npm run dev        # http://127.0.0.1:5183
```

## 操作

**电脑** — `WASD` 移动，`Shift` 疾跑，`空格` 跳跃，鼠标转视角，`M` 静音，`Esc` 退出。

**手机** — 左半屏按住拖动是移动摇杆（半推半速），右半屏拖动转视角，右下角「跑 / 跳」按钮。

## 命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器 |
| `npm run build` | 打包到 `dist/` |
| `npm run deploy` | 构建并发布到 GitHub Pages |
| `npm run textures` | 重新下载 CC0 材质并生成清单 |
| `npm test` | 桌面行走 / 碰撞 / 跳跃，8 项 |
| `npm run test:touch` | 模拟 Pixel 7 的触摸操控，9 项 |
| `npm run shots` | 生成 `shots/` 下的效果截图 |

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

产物在 `android/app/build/outputs/apk/debug/app-debug.apk`，应用名 **CQJC 3D**。

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

## 素材授权

材质来自 [ambientCG](https://ambientcg.com)，CC0 公共领域，可商用。
