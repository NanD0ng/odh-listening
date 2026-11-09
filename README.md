# ODH 英语学习工具（CET-6）

纯静态的六级备考网页：听力精听、题库练习、背单词、阅读、翻译放在同一套真题里练。
无框架、无构建、无后端，打开 `index.html` 就能用。

## 功能

- **听力**：14 套六级真题（2023.06 – 2026.06，每期前两套），逐句原文、答案、音频同步；整卷 / 分 Section 练习、精听复盘、陌生词高亮、错题本。
- **单词**：2958 个六级高频词（CET6 + CET4/6）
  - 随机背单词、词族成簇（1634 个派生词族）、词根记忆（188 个词根 / 1276 个词）
  - 全局生词本，任意词卡、派生词、阅读原文里的词都能一键加入
  - 有道真人发音，失败回退系统 TTS；本地词库优先，在线词典补充例句
- **阅读**：14 套 A/B/C 共 420 题，做题与复盘、答案定位、点词查询。
- **翻译**：14 套汉译英，本地评分，可选接大模型做精评。

学习记录、熟悉度、生词本全部存在浏览器 `localStorage`，不上传服务器。

## 目录结构

```
index.html                 首页（四个模块入口）
sets.html practice.html    听力题库 / 精听
review.html                错题本
words.html setwords.html   单词库 / 套卷生词
study.html                 背单词（随机 / 词族）
roots.html                 词根记忆
reading.html read.html     阅读
translate.html             翻译
assets/css/app.css
assets/js/*.js             各页面逻辑
assets/js/data/*.js        词库、词根、词族、真题与阅读/翻译数据
assets/audio/*.m4a         14 套听力音频（约 209 MB）
```

## 本地运行

双击 `index.html` 直接打开即可；也可以在项目目录起一个静态服务：

```bash
python -m http.server 8766
```

然后访问 `http://127.0.0.1:8766/`。

## 部署到 GitHub Pages

1. 把仓库推送到 GitHub（`main` 分支）。
2. 仓库 **Settings → Pages**，Source 选 **Deploy from a branch**，Branch 选 `main`、目录选 `/ (root)`。
3. 等一两分钟，访问 `https://<用户名>.github.io/<仓库名>/`。

仓库约 223 MB，其中音频 209 MB；最大单文件 26.7 MB，低于 GitHub 100 MB 单文件限制，无需 Git LFS。首次推送会慢一些。

## 说明

- 真题、原文、音频版权归原出版方所有，本项目仅用于个人学习，请勿商用。
- 在线词典与真人发音使用公共接口，断网时自动回退到本地词库与系统语音。

## 技术

原生 HTML / CSS / JavaScript，无构建步骤；`localStorage` 持久化；玻璃拟态界面（`backdrop-filter`）；有道 `dictvoice` 真人音色，失败回退 `speechSynthesis`。
