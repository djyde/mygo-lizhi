# 李志 · MyGo Music 插件

在 [MyGo Music](https://github.com/egoist/mygo-music) 里收听 [nj-lizhi/song](https://github.com/nj-lizhi/song) 收录的李志专辑与现场。

[安装](mygo-music://install-plugin?repo=djyde/mygo-lizhi)

## 功能

- 首页：每日随机推荐 30 首、全部专辑、最近播放
- 专辑页、全部歌曲、李志的艺人页
- 搜索歌曲（按歌名或专辑名）、专辑，以及搜索建议
- 喜欢的歌曲、最近播放（保存在本机）
- 「随机播放」电台：全部歌曲随机连播

## 工作方式

- 歌曲列表来自 GitHub API 的仓库文件树，缓存 24 小时。GitHub 不可用时，退回到仓库自带的 `audio/list-v2.js`（经 jsDelivr），再不行就用上次的缓存。
- 音频和封面走 `testingcf.jsdelivr.net`。jsDelivr 不提供超过 20 MB 的文件，这些（多是现场长曲和 FLAC/WAV）改走 `raw.githubusercontent.com`。

## 手动安装

把这个文件夹放进 MyGo Music 的插件目录（设置 > 插件 > + > 显示插件文件夹）。

音频版权归原作者所有，本插件只是播放公开仓库中的文件。
