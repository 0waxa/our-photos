# 你和我 · 拍立得相册

一个纯静态的情侣照片墙网站：照片像 FUJIFILM 拍立得一样带白边、随机角度散落在网页上，可以拖来拖去；点一下照片会翻到背面，用**手写字体**写留言、改日期，日期会显示在正面白框的**右下角**。

不需要服务器、不需要数据库、不需要安装任何软件 —— 把文件上传到 GitHub 就能用。

## 一、部署到 GitHub Pages（一次就够）

1. 打开 [github.com](https://github.com)，注册 / 登录。
2. 点右上角 **＋ → New repository**，起个仓库名（比如 `our-photos`），可见性选 **Public**，其他都不要勾，点 **Create repository**。
3. 进入新仓库 → 点 **Add file → Upload files** → 把本项目文件夹里的**所有文件**拖进去（用 Chrome / Edge 拖整个文件夹，`photos` 子文件夹会自动保留）→ 点 **Commit changes**。
4. 进仓库 **Settings → Pages → Source** 选 **Deploy from a branch**，Branch 选 **main**、目录选 **/ (root)** → **Save**。
5. 等 1 分钟左右，打开 `https://你的用户名.github.io/仓库名/`，照片墙就上线了。

> 没有 GitHub 账号、或者不想公开仓库？这个网站也可以放在任何支持静态托管的空间，然后用下面的「photos.json 方案」。

## 二、添加照片（之后每次就这步）

1. 点网站右上角「上传照片」，会直接打开你仓库里的 `photos` 文件夹。
2. 点 **Add file → Upload files**，把照片拖进去，点 **Commit changes**。
3. 照片会自动出现在墙上，**不需要等 GitHub Pages 重新构建**。

### 命名规则

文件名前半段是日期、后半段是默认留言，中间一个空格：

```
2026-08-20 海边散步.jpg
2026-05-01-第一次约会.png
2026.06.18 看日落.webp
```

日期会显示在拍立得正面白框右下角，留言会作为背面手写文字的默认内容，之后可以随时在网页上改。

支持格式：JPG / PNG / WebP / GIF / SVG。iPhone 拍的 HEIC 请先转成 JPG 再上传。

## 三、写留言

- 点任意一张拍立得 → 翻到**背面** → 点「✏️ 写留言」→ 用手写字体输入留言和日期 → 保存。
- 日期同时显示在正面白框的**右下角**。
- 背面还可以用 ‹ › 按钮一张张翻看留言。
- 想删照片？去 GitHub 的 photos 文件夹里删除文件。

### 留言存在哪里？

- 默认：保存在**你这台浏览器的本地**（localStorage），只有这台设备能看到。
- 想让另一半在手机上打开网页也能看到你写的字：点右上角「⚙️ 同步」，配置一次 GitHub Token，之后每次保存留言都会自动写入仓库的 `photos.json`，**所有访客都能看到**。

配置 Token 步骤（网站里也有指引）：

1. 打开 [https://github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)。
2. Repository access 选 **Only select repositories**，勾选你的相册仓库。
3. Permissions → **Contents** 选 **Read and write**，生成后粘贴到网站的同步设置里。

Token 只存在你自己的浏览器里，别人看网页不需要它。

## 四、常用操作

| 操作 | 方法 |
| --- | --- |
| 摆放照片 | 直接拖动，位置会记住（存在浏览器本地） |
| 重新随机摆放 | 点「重新摆放」 |
| 看大图 | 照片正面悬停出现 🔍，或翻到背面点「🔍 大图」；← → 切换 |
| 写 / 改留言 | 翻到背面 → 写留言 |
| 删照片 | 在 GitHub 的 photos 文件夹里删除文件 |
| 去掉示例照片 | 删除 photos 文件夹里那几个 `.svg` 示例文件 |

## 五、自定义

打开 `app.js` 最上面的 `CONFIG`：

```js
const CONFIG = {
  repo: '',       // 例如 '你的用户名/our-photos'；留空 = 自动从 GitHub Pages 网址识别
  title: 'You & Me',
  subtitle: '我们的拍立得',
  layoutStyle: 'scatter', // 'scatter' = 仿 instax UP 密集错落；'grid' = 原来的整齐散落
};
```

- 托管在 GitHub Pages 上时 `repo` 可以留空，网页会自动识别。
- 换了自定义域名，或想连到另一个仓库，就填上 `repo`。
- 照片摆放方式想换回原来的整齐散落，把 `layoutStyle` 改成 `'grid'`。
- 标题、副标题在这里改；底色、拍立得样式在 `style.css` 里改。

## 六、photos.json 方案（私有仓库 / 非 GitHub 托管）

默认情况下，网页通过 GitHub 公开接口自动读取 `photos` 文件夹，`photos.json` 只用来存留言。

如果仓库是私有的，或者想托管到别处，可以用 `photos.json` 同时作为照片清单：

```json
[
  { "file": "2026-08-20 海边散步.jpg", "note": "海边散步", "date": "2026.08.20" }
]
```

`file` 填 photos 文件夹里的文件名，照片 URL 会按 `photos/<文件名>` 拼接；`note` / `date` 不填也行，会从文件名自动解析。

注意：用这种方案时，新增照片需要手动把条目加进 `photos.json`。

## 七、常见问题

- **页面提示找不到照片？** 确认仓库是 Public、文件名大小写正确（`photos` 不是 `Photos`），照片确实在 `photos` 文件夹里。
- **GitHub API 限流？** 免费匿名接口每小时 60 次，正常看相册用不完。真碰到了等一小时，或改用上面的 photos.json 方案。
- **留言没有同步给别人？** 默认留言只存在本机；点「⚙️ 同步」配置 Token 后，保存留言才会写入 GitHub。
- **照片墙的位置每次刷新会变吗？** 会自动散落一次；只要你手动拖过照片，位置就会记住。想重新随机，点「重新摆放」。

## 八、技术说明

- 纯 HTML / CSS / JavaScript，零依赖、零构建。
- 照片列表通过 GitHub Contents API 实时读取 `photos` 文件夹（公开仓库无需密钥）。
- 拍立得翻面是纯 CSS 3D 翻转；手写字体使用系统自带字体（Windows 楷体 / Segoe Script，无需联网加载字体）。
- 留言本地存储用 localStorage；配置 Token 后通过 GitHub Contents API 写入 `photos.json`。
