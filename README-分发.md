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
- macOS 12 及以上
- 无需安装 Python 或任何依赖

## 关于 Apple Silicon / Intel
- `Diary-macOS.zip` 默认在 **Apple Silicon (M 系列)** 机器上打包，**只能在这类 Mac 上运行**
- **Intel Mac** 用户请在 Intel 机器上自行打包一次（一次性操作，5 分钟）：
  1. Intel Mac 上安装 Python 3.11+（官网 python.org 下载安装器即可）
  2. 终端执行：
     ```bash
     git clone <项目仓库地址> diary && cd diary
     python3 -m venv .venv && source .venv/bin/activate
     pip install -r requirements.txt
     ./build_app.sh
     ```
  3. 产出的 `dist/Diary-macOS.zip` 即为 Intel 版，发给 Intel 用户使用
- 判断自己 Mac 是哪种芯片：左上角  → 关于本机 →「芯片」显示 Apple M 系列即为 Silicon，显示 Intel 即为 Intel
