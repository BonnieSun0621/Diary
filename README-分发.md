# 拾光日记 · macOS 安装说明

## 安装（3 步）
1. 解压 `Diary-macOS.zip`，得到 `Diary.app`
2. 把 `Diary.app` 拖进「应用程序」文件夹
3. **首次打开**：在 Finder 里进入「应用程序」，**右键点击 Diary → 打开 → 再点「打开」**
   （因为应用未经苹果公证，直接双击会被拦截；右键打开只需一次，之后可正常双击）

打开后会自动弹出浏览器进入日记页面（地址是本机 http://localhost:8730，只有你自己能访问）。

## 数据存哪里？
- 所有数据存在你自己电脑的 `~/Library/Application Support/Diary/diary.db`，完全本地，不上传任何服务器
- 备份：设置页 →「导出备份 JSON」；换电脑：在新电脑先打开一次 App，再用「从备份恢复」导入

## 退出
- 在浏览器里用完直接关标签页即可（App 会在后台保持运行，方便下次秒开）
- 彻底退出：命令行 `pkill -f diary-server`，或重启电脑

## 系统要求
- macOS 12 及以上（Apple Silicon / Intel 均可，打包机为 Apple Silicon）
- 无需安装 Python 或任何依赖
