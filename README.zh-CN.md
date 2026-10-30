# 🔍 digdig

<p align="center">
  <b>面向 Agent 的多后端网页搜索 CLI</b><br>
  SearXNG · Ollama · DeepSeek —— 终端中的隐私优先网页搜索
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/digdig">
    <img src="https://img.shields.io/npm/v/digdig?style=flat-square&color=cb3837" alt="npm version">
  </a>
  <a href="https://www.npmjs.com/package/digdig">
    <img src="https://img.shields.io/npm/dm/digdig?style=flat-square&color=cb3837" alt="npm downloads">
  </a>
  <a href="https://github.com/hkwuks/digdig/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/hkwuks/digdig?style=flat-square&color=green" alt="license">
  </a>
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=flat-square" alt="node version">
</p>

<p align="center">
  <a href="#-特色功能">特色功能</a> •
  <a href="#-安装">安装</a> •
  <a href="#-快速开始">快速开始</a> •
  <a href="#-使用指南">使用指南</a> •
  <a href="#-配置">配置</a>
</p>

---

## ✨ 特色功能

- 🔎 **多引擎搜索** — 同时搜索 Google、Bing、DuckDuckGo、GitHub 等 30+ 搜索引擎
- 🔌 **可插拔后端** — 默认 SearXNG；用 `-e ollama` / `-e deepseek` 切换到 Ollama 网页搜索或 DeepSeek Search。任一后端都不是另一个的自动回退。
- 🔄 **动态发现** — 自动从 SearXNG 服务器获取可用引擎和分类
- 📄 **多格式输出** — Markdown（LLM 优化）或 JSON 格式
- 🧠 **深度搜索** — 多轮迭代研究，支持会话累积与可数的覆盖事实
- 🔍 **内容提取** — 从 URL 或会话结果中提取文章全文，支持 Obscura 回退和 Agent 选择的 Jina Reader 提取
- 🗂️ **会话管理** — 明确区分搜索发现与已提取正文；稳定结果 ID 和版本号避免并行时审批错位
- 🔗 **外部结果融合** — 从会话专属 JSON 文件导入外部搜索或提取结果，避免 PowerShell 内联 JSON 转义问题
- ⭐ **只报事实，不给裁定** — `--quality` 报告结果条数、提取状态、来源与每条结果的事实；判断交给 Agent
- 🕸️ **知识图谱** — 结构层（查询→结果→域名）+ 语义层（带已审批结果 ID 来源的实体关系）双层图谱
- 🔄 **查询冗余检查** — 基于词级或字符 bigram Jaccard 检测重复查询
- 💡 **Agent 优先设计** — 输出结构化分析数据（事实、建议、策略）供 LLM Agent 决策
- 📁 **本地文档搜索** — 对本地 Markdown/文本文件进行 BM25 全文索引和搜索，支持字段加权排序；每个索引分块保持独立的已提取会话结果
- ✅ **陈述—证据—审核管线** — L2/L3 专用：提交原子化陈述、自动检索证据、验证立场，再按发布域名多样性进行策略聚合自动审批或标记待人工审核

---

## 📦 安装

### 自托管 SearXNG

**WSL 用户注意**

WSL2 会在所有连接退出后自动关闭。建议使用 https://github.com/gardengim/keepwsl 保持其运行。

如果你还想让 WSL 随 Windows 启动而自动启动（这样 SearXNG 容器不用手动启动），可以按以下步骤操作：

1. 按 <kbd>Win</kbd>+<kbd>R</kbd>，输入 `shell:startup` 回车 — 打开 Windows 启动文件夹
2. 右键 → 新建 → 快捷方式，位置设置为 `"C:\Program Files\WSL\wsl.exe" -d Ubuntu cd ~`
3. 保存快捷方式。下次 Windows 启动时，`cd ~` 会因为缺少反斜杠而执行失败，但此时 WSL 已经被启动 — 终端窗口会自动关闭，WSL 在后台保持运行。

启动 SearXNG 容器前，必须在 `./searxng` 目录下创建 `settings.yml` 文件。具体配置方法请访问 https://github.com/searxng/searxng。

以下是一个 `settings.yml` 示例。

<details>
<summary>📋 点击展开完整 settings.yml 配置（30+ 搜索引擎）</summary>

```yml
use_default_settings: true

server:
  secret_key: "random string"
  limiter: false

outgoing:
  request_timeout: 30.0
  max_request_timeout: 30.0
  pool_connections: 200
  pool_maxsize: 20
  retries: 2

search:
  safe_search: 0
  formats:
    - html
    - json
    - csv
    - rss

valkey:
  url: valkey://valkey:6379/0

engines:
  # ==================== 通用搜索 ====================
  - name: google
    engine: google
    shortcut: g

  - name: bing
    engine: bing
    shortcut: bi
    disabled: false

  - name: duckduckgo
    engine: duckduckgo
    shortcut: ddg

  - name: brave
    engine: brave
    shortcut: br

  - name: startpage
    engine: startpage
    shortcut: sp

  - name: qwant
    engine: qwant
    shortcut: qw
    disabled: false

  - name: yandex
    engine: yandex
    shortcut: yx
    disabled: false

  - name: karmasearch
    engine: karmasearch
    categories: [general, web]
    search_type: web
    shortcut: ka
    disabled: true  # 引擎文件不存在

  # ==================== 中文搜索 ====================
  - name: baidu
    engine: baidu
    shortcut: bd
    disabled: false

  - name: sogou
    engine: sogou
    shortcut: sg
    disabled: false

  - name: 360search
    engine: 360search
    shortcut: 360so
    disabled: false

  - name: quark
    engine: quark
    shortcut: qk
    disabled: false

  # ==================== 编程相关 ====================
  - name: github
    engine: github
    shortcut: gh

  - name: github code
    engine: github_code
    shortcut: ghc

  - name: gitlab
    engine: gitlab
    base_url: https://gitlab.com
    shortcut: gl
    disabled: false

  - name: codeberg
    engine: gitea
    base_url: https://codeberg.org
    shortcut: cb
    disabled: false

  - name: stackexchange
    engine: stackexchange
    shortcut: se

  - name: stackoverflow
    engine: stackexchange
    shortcut: so
    categories: q&a
    stackexchange_site: stackoverflow

  - name: npm
    engine: npm
    shortcut: npm
    disabled: false

  - name: pypi
    engine: pypi
    shortcut: py

  - name: crates.io
    engine: crates
    shortcut: crate
    disabled: false

  - name: pkg.go.dev
    engine: pkg_go_dev
    shortcut: go
    disabled: false

  - name: metacpan
    engine: metacpan
    shortcut: cpan
    disabled: false

  - name: docker hub
    engine: docker_hub
    shortcut: dh

  - name: huggingface
    engine: huggingface
    shortcut: hf
    disabled: false

  - name: huggingface datasets
    engine: huggingface
    huggingface_endpoint: datasets
    shortcut: hfd
    disabled: false

  - name: hex
    engine: hex
    shortcut: hex
    disabled: false

  - name: mdn
    engine: json_engine
    shortcut: mdn
    categories: [it]
    paging: true
    search_url: https://developer.mozilla.org/api/v1/search?q={query}&page={pageno}
    results_query: documents
    url_query: mdn_url
    url_prefix: https://developer.mozilla.org
    title_query: title
    content_query: summary

  - name: arch linux wiki
    engine: archlinux
    shortcut: al

  - name: gentoo wiki
    engine: mediawiki
    shortcut: gentoo
    categories: ["it", "software wikis"]
    base_url: "https://wiki.gentoo.org/"
    api_path: "api.php"
    search_type: text

  - name: lobste.rs
    engine: xpath
    search_url: https://lobste.rs/search?q={query}&what=stories&order=relevance
    results_xpath: //li[contains(@class, "story")]
    url_xpath: .//a[@class="u-url"]/@href
    title_xpath: .//a[@class="u-url"]
    content_xpath: .//a[@class="domain"]
    categories: it
    shortcut: lo
    disabled: false

  # ==================== IT/编程补充 ====================
  - name: superuser
    engine: superuser
    shortcut: su
    disabled: false

  - name: askubuntu
    engine: askubuntu
    shortcut: au
    disabled: false

  # ==================== 知识/问答 ====================
  - name: wikipedia
    engine: wikipedia
    shortcut: wp
    display_type: ["infobox"]
    categories: [general]

  - name: wikidata
    engine: wikidata
    shortcut: wd
    weight: 2
    display_type: ["infobox"]
    categories: [general]

  - name: reddit
    engine: reddit
    shortcut: re
    disabled: false

  - name: hackernews
    engine: hackernews
    shortcut: hn
    disabled: false

  # ==================== 词典 ====================
  - name: wiktionary
    engine: wiktionary
    shortcut: wkt
    disabled: false

  # ==================== 图片 ====================
  - name: google images
    engine: google_images
    shortcut: goi

  - name: bing images
    engine: bing_images
    shortcut: bii

  - name: duckduckgo images
    engine: duckduckgo_extra
    categories: [images]
    ddg_category: images
    shortcut: ddi

  - name: pinterest
    engine: pinterest
    shortcut: pin

  - name: unsplash
    engine: unsplash
    shortcut: us

  - name: pixabay
    engine: pixabay
    shortcut: pxb

  - name: deviantart
    engine: deviantart
    shortcut: da
    disabled: false

  - name: flickr
    categories: images
    shortcut: fl
    engine: flickr_noapi
    disabled: false

  - name: openverse
    engine: openverse
    categories: images
    shortcut: opv
    disabled: false

  - name: artic
    engine: artic
    shortcut: arc
    disabled: false

  - name: pexels
    engine: pexels
    shortcut: pex
    disabled: false

  # ==================== 视频 ====================
  - name: google videos
    engine: google_videos
    shortcut: gov

  - name: bing videos
    engine: bing_videos
    shortcut: biv

  - name: duckduckgo videos
    engine: duckduckgo_extra
    categories: [videos]
    ddg_category: videos
    shortcut: ddv

  - name: youtube
    engine: youtube_noapi
    shortcut: yt

  - name: bilibili
    engine: bilibili
    shortcut: bili
    disabled: false

  - name: dailymotion
    engine: dailymotion
    shortcut: dm
    disabled: false

  - name: vimeo
    engine: vimeo
    shortcut: vi
    disabled: false

  - name: odysee
    engine: odysee
    shortcut: od
    disabled: false

  - name: peertube
    engine: peertube
    shortcut: pt
    disabled: false

  # ==================== 新闻 ====================
  - name: google news
    engine: google_news
    shortcut: gon

  - name: bing news
    engine: bing_news
    shortcut: bin

  - name: duckduckgo news
    engine: duckduckgo_extra
    categories: [news]
    ddg_category: news
    shortcut: ddn

  - name: reuters
    engine: reuters
    shortcut: rtr
    disabled: false

  # ==================== 音乐 ====================
  - name: bandcamp
    engine: bandcamp
    shortcut: bc
    categories: music
    disabled: false

  - name: deezer
    engine: deezer
    shortcut: dz
    disabled: false

  - name: mixcloud
    engine: mixcloud
    shortcut: mc
    disabled: false

  - name: genius
    engine: genius
    shortcut: gen
    disabled: false

  - name: soundcloud
    engine: soundcloud
    shortcut: sc
    disabled: false

  - name: radio_browser
    engine: radio_browser
    shortcut: rb
    disabled: false

  # ==================== 学术/文档 ====================
  - name: arxiv
    engine: arxiv
    shortcut: arx

  - name: semantic scholar
    engine: semantic_scholar
    shortcut: sem

  - name: google scholar
    engine: google_scholar
    shortcut: gsch

  - name: pubmed
    engine: pubmed
    shortcut: pub

  - name: crossref
    engine: crossref
    shortcut: cr
    disabled: false

  - name: openalex
    engine: openalex
    shortcut: oa
    disabled: false

  # ==================== EU 开放研究 ====================
  - name: openaire publications
    engine: openairepublications
    shortcut: oarp
    disabled: false

  - name: openaire datasets
    engine: openairedatasets
    shortcut: oard
    disabled: false

  # ==================== 社交媒体 ====================
  - name: lemmy posts
    engine: lemmy
    lemmy_type: Posts
    shortcut: lepo
    disabled: false

  - name: mastodon users
    engine: mastodon
    mastodon_type: accounts
    base_url: https://mastodon.social
    shortcut: mau
    disabled: false

  # ==================== 文件/种子 ====================
  - name: library genesis
    engine: xpath
    search_url: https://libgen.rs/search.php?req={query}
    url_xpath: //a[contains(@href,"book/index.php?md5")]/@href
    title_xpath: //a[contains(@href,"book/")]/text()[1]
    content_xpath: //td/a[1][contains(@href,"=author")]/text()
    categories: files
    shortcut: lg
    disabled: false

  - name: kickass
    engine: kickass
    base_url:
      - https://kickasstorrents.to
      - https://kickasstorrents.cr
    shortcut: kc
    disabled: false

  - name: annas archive
    engine: annas_archive
    base_url:
      - https://annas-archive.gl
      - https://annas-archive.vg
    shortcut: aa
    disabled: false

  - name: 1337x
    engine: 1337x
    shortcut: "1337"
    disabled: false

  - name: piratebay
    engine: piratebay
    shortcut: tpb
    disabled: false

  # ==================== 翻译 ====================
  - name: lingva
    engine: lingva
    shortcut: lv
    disabled: false

  - name: currency
    engine: currency_convert
    shortcut: cc

  # ==================== 其他 ====================
  - name: imdb
    engine: imdb
    shortcut: imdb
    disabled: false

  - name: steam
    engine: steam
    shortcut: stm
    disabled: false

  - name: goodreads
    engine: goodreads
    shortcut: good
    disabled: false

  # ==================== 天气 ====================
  - name: wttr.in
    engine: wttr.in
    shortcut: wea
    disabled: false

  # ==================== 地图/位置 ====================
  - name: openstreetmap
    engine: openstreetmap
    shortcut: osm
    disabled: false

  - name: nominatim
    engine: json_engine
    search_url: https://nominatim.openstreetmap.org/search?q={query}&format=json&limit={pageno}
    results_query: "."
    url_query: display_name
    title_query: display_name
    content_query: type
    shortcut: nom
    disabled: false

  # ==================== 法律/政策 ====================
  - name: wikisource
    engine: wikisource
    shortcut: ws
    disabled: false

  # ==================== 教育/学习 ====================
  - name: wikiversity
    engine: wikiversity
    shortcut: wvy
    disabled: false

  # ==================== 旅行 ====================
  - name: wikivoyage
    engine: wikivoyage
    shortcut: wv
    disabled: false

  # ==================== 以下引擎需要付费/API Key，默认禁用 ====================
  - name: wolframalpha
    engine: wolframalpha
    shortcut: wa
    disabled: true  # 需要付费

  - name: rawg
    engine: json_engine
    search_url: https://api.rawg.io/api/games?search={query}&key=YOUR_API_KEY
    results_query: results
    url_query: slug
    title_query: name
    content_query: released
    shortcut: rawg
    disabled: true  # 需要API key

  - name: podcastindex
    engine: json_engine
    search_url: https://api.podcastindex.org/api/1.0/search/byterm?q={query}
    results_query: feeds
    url_query: link
    title_query: title
    content_query: description
    shortcut: pci
    disabled: true  # 需要API认证
```

</details>

以下是一个 `docker-compose.yml` 示例。

```yml
services:
   searxng:
        image: docker.io/searxng/searxng:latest
        container_name: searxng
        restart: unless-stopped
        ports:
            - "8080:8080"
        volumes:
            - ./searxng:/etc/searxng:Z
        depends_on:
            - valkey
        ulimits:
            nofile:
                soft: 10000
                hard: 65535

    valkey:
        container_name: valkey
        image: docker.io/valkey/valkey:9-alpine
        command: valkey-server --save 30 1 --loglevel warning
        restart: always
        volumes:
            - ./valkey:/data/
```

**启动容器：**

```bash
docker compose up -d
```

这会在后台启动 SearXNG（端口 `8080`）和 Valkey。使用 `docker compose ps` 或 `dg --health` 验证服务是否正常运行。

**Python venv 方式（无 Docker）**

> SearXNG 官方**不发布 PyPI 包**，没有 `pip install searxng` 这种安装方式。官方推荐从源码 clone 后装入 venv（见 https://docs.searxng.org/admin/installation-searxng.html ）。下面是本地开发版一键脚本（WSL/Linux，已安装 python3 + git）：

```bash
# 1) 系统依赖（编译 lxml/cryptography/msgspec 等必需）
sudo apt-get install -y \
  python3-dev python3-venv python-is-python3 \
  git build-essential libxslt-dev zlib1g-dev libffi-dev libssl-dev

# 2) 克隆 + venv + 安装（官方推荐方式）
git clone --depth 1 https://github.com/searxng/searxng.git ~/searxng-src
python3 -m venv ~/searxng-src/.venv
~/searxng-src/.venv/bin/pip install -e ~/searxng-src

# 3) 最小 settings.yml（开 json 格式供 CLI 使用）
mkdir -p ~/.config/searxng
cat > ~/.config/searxng/settings.yml <<'EOF'
use_default_settings: true

server:
  secret_key: "ultrasecretkey"   # 本地开发默认值；正式用 `openssl rand -hex 16` 替换
  limiter: false

search:
  safe_search: 0
  formats:
    - html
    - json

valkey:
  url: false   # 单机开发不需要 Redis/Valkey
EOF

# 4) 启动（默认端口 8888；生产部署按官方文档配 uWSGI）
SEARXNG_SETTINGS_PATH=~/.config/searxng/settings.yml \
  ~/searxng-src/.venv/bin/python -m searx.webapp

# 5) 验证 + 接入 digdig
curl -s http://localhost:8888/healthz   # 返回 OK
dg init                                # baseUrl = http://localhost:8888
dg --health && dg "hello world"
```

### 通过 npm 安装（推荐）

```bash
npm install -g digdig
```

这会安装三个同源命令：**`dg`**（推荐，简短）、**`digdig`**（完整名）以及过渡期的 **`sxng`** 别名。

> ⚠️ **从 `sxng-cli` 升级上来的用户注意**：`digdig` 接替 `sxng-cli`，版本号重新起算，所以 `digdig@0.0.2` **比** `sxng-cli@1.3.2` **新**，尽管数字更小。请先卸载旧包（`npm uninstall -g sxng-cli`），因为两份副本各用一个会话目录，互相看不见对方的会话。
>
> 过渡期共 5 个版本（到 `0.5.0` 为止），旧名一律继续可用：`sxng` 命令、`.sxng/` 会话、`sxng.config.json`、`SEARXNG_*` 环境变量。用到时会在 stderr 打一行 `[deprecation]`（可用 `DIGDIG_NO_DEPRECATION=1` 静默），`0.5.0` 起失效。迁移方式：`.sxng` → `.digdig`、`sxng.config.json` → `digdig.config.json`、`SEARXNG_*` → `DIGDIG_*`。

```bash
npx skills add hkwuks/digdig
```

> ⚠️ **Skill 同步**：更新 `digdig` 后，请同步更新 `digdig` skill 以保持功能一致：
>
> ```bash
> npx skills update hkwuks/digdig
> ```

### 从源码构建

```bash
git clone https://github.com/hkwuks/digdig.git
cd digdig/cli
npm install
npm run build
npm link
```

---

### 🤖 LLM 一键配置（WSL / Linux）

> 前提：已有一个 **WSL 或 Linux** 环境，且你的 LLM 智能体可以连接（SSH、本地 shell 或终端集成）。下面所有内容都可以由 LLM 用这里给出的命令自行配置和安装。

如果你想交给 LLM 智能体来安装和配置，请让它访问本仓库，并给出以下提示词：

> ```text
> 你可以访问一台 WSL/Linux 机器。请端到端安装 digdig 并配置它的搜索后端：
>
> 1. **SearXNG 后端**（推荐，自托管、隐私友好）— 两种方式，优先 Docker：
>    - **方式 A — Docker（首选）**：**先**根据本 README 中的示例创建 `./searxng/settings.yml`（启用 `formats: html, json`，这样 CLI 才能读取 JSON）。该文件必须在容器启动前存在，否则 SearXNG 不会读取你的配置。再使用本仓库示例 `docker-compose.yml` 运行 `docker compose up -d`（SearXNG 映射到宿主机端口 8080 + Valkey）。等待 `curl -s http://localhost:8080/healthz` 返回 OK。
>    - **方式 B — Python venv（官方推荐方式，Docker 不可用时使用）**：SearXNG **不在 PyPI 上**，**没有** `pip install searxng`。按官方 pip/venv 文档安装（https://docs.searxng.org/admin/installation-searxng.html ）：
>      ```bash
>      # 1) 系统依赖（编译 lxml/cryptography/msgspec 等必需）
>      sudo apt-get install -y \
>        python3-dev python3-venv python-is-python3 \
>        git build-essential libxslt-dev zlib1g-dev libffi-dev libssl-dev
>
>      # 2) 克隆 + venv + 安装（官方推荐方式）
>      git clone --depth 1 https://github.com/searxng/searxng.git ~/searxng-src
>      python3 -m venv ~/searxng-src/.venv
>      ~/searxng-src/.venv/bin/pip install -e ~/searxng-src
>
>      # 3) 最小 settings.yml（开 json 格式供 CLI 使用）
>      mkdir -p ~/.config/searxng
>      cat > ~/.config/searxng/settings.yml <<'EOF'
>      use_default_settings: true
>      server:
>        secret_key: "ultrasecretkey"   # 本地开发默认值；正式用 `openssl rand -hex 16` 替换
>        limiter: false
>      search:
>        safe_search: 0
>        formats:
>          - html
>          - json
>      valkey:
>        url: false   # 单机开发不需要 Redis/Valkey
>      EOF
>
>      # 4) 启动（默认端口 8888；生产部署按官方文档配 uWSGI）
>      SEARXNG_SETTINGS_PATH=~/.config/searxng/settings.yml \
>        ~/searxng-src/.venv/bin/python -m searx.webapp
>
>      # 5) 验证
>      curl -s http://localhost:8888/healthz   # 返回 OK
>      ```
>      此时第 4 步的 `baseUrl` 使用 `http://localhost:8888`。
> 2. **额外后端**（可选）：
>    - 向用户索取 Ollama 网页搜索 API key（https://ollama.com）和/或 DeepSeek Search API key（https://api-docs.deepseek.com/api/search），若都没有则跳过。两者都只在用 `-e ollama` / `-e deepseek` 显式选择时生效，都不是自动回退。
> 3. **安装 CLI**：`npm install -g digdig`。
> 4. **配置**：运行 `dg init`，填写 `baseUrl`（Docker 用 `http://localhost:8080`，venv 用 `http://localhost:8888`）、超时时间，以及用户提供的 API key。
> 5. **验证**：运行 `dg --health` 和 `dg "hello world"`，报告结果。
> ```

LLM 在宣布成功前应执行这些检查：`docker compose ps`（SearXNG + Valkey 均运行中）、`dg --health`（healthy）、以及一次返回非空结果的真实搜索。


### Obscura（可选 — 用于 JS 密集页面）

[dg extract](#-使用指南) 默认使用 **Defuddle + linkedom** 进行轻量级内容提取。当页面需要 JavaScript 渲染（SPA、动态内容）时，可启用 [Obscura](https://github.com/h4ckf0r0day/obscura) 作为回退。使用 `--obscura` 且本机缺少二进制文件时，digdig 会从官方 GitHub HTTPS 下载入口自动下载对应平台的发布包：

```bash
# Linux x86_64
curl -LO https://github.com/h4ckf0r0day/obscura/releases/latest/download/obscura-x86_64-linux.tar.gz
tar xzf obscura-x86_64-linux.tar.gz
cp obscura ~/.local/bin/

# macOS Apple Silicon
curl -LO https://github.com/h4ckf0r0day/obscura/releases/latest/download/obscura-aarch64-macos.tar.gz
tar xzf obscura-aarch64-macos.tar.gz
cp obscura /usr/local/bin/

# Docker
docker run -d --name obscura -p 127.0.0.1:9222:9222 h4ckf0r0day/obscura

# 验证
obscura --version
```

无需额外 npm 依赖 — Obscura 通过 CLI 调用。自动检测 `PATH`、`~/.local/bin/obscura` 或 `/usr/local/bin/obscura`。

---

## 🚀 快速开始

1. **安装 CLI：**
   ```bash
   npm install -g digdig
   ```

2. **配置 CLI：**
   ```bash
   dg init
   ```
   或设置环境变量：
   ```bash
   export DIGDIG_BASE_URL=http://your-searxng-instance:8080
   ```

3. **执行搜索：**
   ```bash
   dg "TypeScript tutorial"
   ```

---

## 📖 使用指南

### 命令

| 命令 | 说明 |
|------|------|
| `dg init` | 交互式配置设置 |
| `dg <query>` | 执行网页搜索 |
| `dg --queries "q1,q2"` | 多查询搜索（RRF 融合排序） |
| `dg extract --urls <urls>` | 提取网页内容 |
| `dg extract --session <name>` | 提取会话结果并合并内容 |
| `dg extract --obscura` | JS 渲染回退（用于 SPA 页面） |
| `dg extract --urls <url> --jina` | Agent 为显式指定 URL 选择 Jina Reader 提取 |
| `dg --session new` | 创建深度搜索会话 |
| `dg --session <name> --quality` | 列出待审结果与本会话已累积的可数事实 |
| `dg --session <name> --quality --approve-file <path>` | 从 `{id, revision}` JSON 文件审批已验证的待审结果 |
| `dg suggest-queries <session>` | 获取查询建议数据（供 Agent 使用） |
| `dg strategy-info <session>` | 查看当前搜索阶段 |
| `dg session-report <session>` | 完整会话分析报告 |
| `dg coverage <session>` | 本会话已看过什么，以可数事实呈现（轮次、查询、新增与重复、轮内独有词） |
| `dg session-list` | 列出所有会话 |
| `dg session-delete <session-name>` | 删除指定会话 |
| `dg graph-preprocess <session>` | TF-IDF + 共现分析 + 结果来源轮次 |
| `dg graph-add <session> --data-file <path>` | 从 UTF-8 JSON 添加由已审批结果 ID 支撑的语义实体/边 |
| `dg graph-search <session>` | 按关键词发现实体 |
| `dg graph-explore <session>` | 查看实体关系 |
| `dg graph-drill <session>` | 追踪特定关系 |
| `dg graph-traverse <session>` | 遍历推理路径 |
| `dg graph-obfuscate <session>` | 列出混淆候选 |
| `dg results-add <session> --kind <search|extracted> --data-file <path>` | 从会话专属 UTF-8 JSON 导入外部搜索或已提取正文 |
| `dg doc-index <path>` | 索引本地文档（用于 BM25 搜索） |
| `dg doc-search <session> <query> --path <path>` | 搜索已索引文档并将结果注入会话 |
| `dg claim-add <session> --claims-file <path>` | 从 UTF-8 JSON 文件提交原子化陈述（支持单条或批量，自动证据搜索） |
| `dg claim-list <session>` | 列出陈述 |
| `dg evidence-search <session> --claim-id <id>` | 搜索候选证据（只读） |
| `dg evidence-verify <session> --claim-id <id> --evidence-file <path>` | 从 UTF-8 JSON 文件确认证据 + 提交立场（可选自动策略聚合） |
| `dg evidence-list <session> --claim-id <id>` | 列出某条陈述的证据 |
| `dg verdict-list <session> --claim-id <id>` | 列出某条陈述的判断结果 |
| `dg policy-aggregate <session>` | 手动执行策略聚合 |
| `dg review-list <session>` | 列出审核结论 |
| `dg --health` | 检查 SearXNG 后端健康状态（Ollama/DeepSeek 没有健康检查接口） |
| `dg --engines-list` | 列出可用搜索引擎 |
| `dg --categories-list` | 列出可用分类 |
| `dg --help` | 显示帮助信息 |

### 搜索选项

| 选项 | 说明 |
|------|------|
| `-e, --engines <list>` | 逗号分隔的搜索引擎列表（如 `google,github`）；`ollama` 与 `deepseek` 会改走对应后端而不是 SearXNG |
| `-c, --categories <list>` | 逗号分隔的分类列表（如 `it,science`） |
| `-l, --limit <n>` | 最大结果数（默认：10） |
| `-p, --page <n>` | 翻页页码 |
| `--lang <code>` | 语言代码（如 `en`、`zh`、`ja`） |
| `--time <range>` | 时间范围：`day`、`week`、`month`、`year`、`all` |
| `-f, --format <fmt>` | 输出格式：`md`（默认）或 `json` |
| `--queries <list>` | RRF 融合多查询（如 `q1,q2,q3`） |
| `--session <session-name>` | 会话目录或 `new` 创建深度搜索会话 |
| `--owner <session-name>` | 会话所有者标识 |
| `--desc <text>` | 会话描述 |
| `--redundancy <action>` | 查询冗余检查：`warn`、`adjust`、`skip` |
| `--quality` | 列出待审结果与可数事实（需配合 --session） |
| `--approve-file <path>` | 从本会话 `agent-inputs` 目录的 `{id, revision}` 文件审批 |
| `--skip-file <path>` / `--unskip-file <path>` | 从本会话 `agent-inputs` 目录跳过或恢复 `{id, revision}` 选择 |
| `--merge <file>` | 合并新的 JSON 搜索结果文件 |

### 示例

```bash
# 基本搜索（默认 Markdown 输出）
dg "machine learning"

# JSON 输出
dg --format json "machine learning"

# 指定引擎搜索
dg --engines google,duckduckgo "privacy tools"

# 搜索 IT 和科学分类
dg --categories it,science "kubernetes tutorial"

# 限制结果数并按时间过滤
dg --limit 5 --time week "latest AI news"

# 多查询 RRF 融合搜索
dg --queries "tokio tutorial,rust async basics,async-std guide"

# 列出可用引擎（从服务器获取）
dg --engines-list

# 列出可用分类（从服务器获取）
dg --categories-list
```

---

## ⚙️ 配置

配置优先级（从高到低）：
1. 环境变量
2. 本地配置文件（`./digdig.config.json`）
3. 全局配置文件（`~/digdig/digdig.config.json`）
4. 默认值

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DIGDIG_BASE_URL` | SearXNG 服务器 URL | *（必填）* |
| `DIGDIG_DEFAULT_ENGINE` | 默认搜索引擎 | *（无）* |
| `DIGDIG_ALLOWED_ENGINES` | 逗号分隔的允许引擎列表 | *（全部）* |
| `DIGDIG_DEFAULT_LIMIT` | 默认结果数限制 | `10` |
| `DIGDIG_DEFAULT_FORMAT` | 默认输出格式（`md` 或 `json`） | `md` |
| `DIGDIG_USE_PROXY` | 是否使用代理（`true`/`false`） | `false` |
| `DIGDIG_PROXY_URL` | 代理 URL | *（无）* |
| `DIGDIG_TIMEOUT` | 请求超时时间（毫秒） | `10000` |
| `DIGDIG_REDUNDANCY_THRESHOLD` | 词级 Jaccard 冗余阈值 | `0.7` |
| `DIGDIG_REDUNDANCY_BIGRAM_THRESHOLD` | 二元组 Jaccard 冗余阈值（短查询） | `0.5` |
| `OLLAMA_API_KEY` | [Ollama 网页搜索](https://ollama.com) API 密钥；用 `-e ollama` 显式启用（不是自动回退） | *（无）* |
| `DEEPSEEK_API_KEY` | [DeepSeek Search](https://api-docs.deepseek.com/api/search) API 密钥（可选后端；按成功请求计费） | *（无）* |

> `SEARXNG_*` 旧变量名在 `0.5.0` 前仍会被读取，用到时在 stderr 打一行 `[deprecation]`；两者同时设置时 `DIGDIG_*` 优先。

### 配置文件

配置文件搜索顺序（先找到的优先）：

1. **本地配置** - `./digdig.config.json`（当前工作目录，用于项目级设置）
2. **全局配置** - `~/digdig/digdig.config.json`（用户主目录，用于全局默认值）

创建 `digdig.config.json`：

```json
{
  "baseUrl": "http://localhost:8080",
  "defaultEngine": "",
  "allowedEngines": [],
  "defaultLimit": 10,
  "defaultFormat": "md",
  "useProxy": false,
  "proxyUrl": "",
  "timeout": 10000,
  "ollamaApiKey": "",
  "deepseekApiKey": "",
  "redundancyThreshold": 0.7,
  "redundancyBigramThreshold": 0.5
}
```

---

## 🧠 深度搜索

深度搜索支持多轮迭代研究，具备会话累积、可数的覆盖事实、Agent 控制图谱注入，以及记录「还缺什么」的 Query Plan。

### 工作流

```
搜索 → 提取 → 审查事实 → 审批 → 构建图谱 →（循环或探索）
                                                                         ↓
                                          (L2/L3) 陈述—证据—审核管线 → 最终输出
```

### 快速示例

```bash
# 1. 创建会话并搜索
dg --session new --owner "agent-1" --desc "Rust async study" "rust async ecosystem"
# 已创建会话：.digdig/sessions/<session-name>

# 2. 从结果中提取内容
dg extract --session <session-name>

# 3. 检查提取输出：stats.success 和 session.updated 标识已取得正文的结果；失败 URL 保持待审。

# 4. 查看待审事实与每条结果的 verified 状态
dg --session <session-name> --quality

# 5. 将 --quality 输出中选中的 {id, revision} 写入
#    .digdig/sessions/<session-name>/agent-inputs/approve.json，再审批。
dg --session <session-name> --quality --approve-file .\.digdig\sessions\<session-name>\agent-inputs\approve.json

# 6. 预处理会话内容，发现实体并取得来源轮次
dg graph-preprocess <session-name>

# 7. 将图谱 JSON 写入该会话的 Agent 临时目录，再添加语义边
dg graph-add <session-name> --data-file .\.digdig\sessions\<session-name>\agent-inputs\graph-data.json

# 8. 继续研究（带冗余检查）
dg --session <session-name> --queries "tokio vs async-std,benchmark 2026" --redundancy warn
```

### 会话覆盖度

带 `--session` 的搜索只显示本次调用找到的结果；此前轮次仍参与融合打分，但不进入输出。`dg coverage <session>` 按需恢复全会话视野，只读 `results.json` —— 不需要图谱、不需要审批、不需要抽取。

它报的是可数事实而不是结论：每轮的查询与引擎、每轮首次引入了多少结果、有多少条是更早轮次已见过的、哪些 URL 跨轮重复出现、每一轮独有（不跨轮）的词、实际用到的域名，以及常用一手来源站（arXiv、GitHub、Stack Overflow、各类包仓库）里还没碰过哪些。某一轮的全部结果都是旧的就说明该方向已经饱和。跨所有轮次出现的词属于会话主题，会被排除，因此每轮由它真正新增的内容来命名。

判断"哪些方面已覆盖、哪些还缺"是 Agent 的职责，`dg coverage` 只提供数字。

### 质量与证据语义

- 提取后的网页内容先按规范化 URL 去重，再按全文字符 5-gram Jaccard 相似度去重；查询冗余则单独使用词级或字符 bigram Jaccard。
- `--quality` 报告可数事实：会话共有多少条结果、多少条带已提取正文、多少个不同来源，以及每条待审结果的 id、revision、来源、正文长度、是否已提取、是否可审批、首次出现的轮次。它不给这些数字打分。
- 这些事实是诊断，不是事实核验。搜索发现只有在 `extract` 写入非空正文和提取时间后才能审批。显式导入的外部正文必须提供非空 `content` 与 `extractor`；未提供 `extractedAt` 时，记录其导入时间。
- 陈述审核把两个不同的规范化发布域名视为两个来源；不会推断跨域名的公司归属、编辑关系或转载关系。

### 会话管理

| 命令 | 说明 |
|------|------|
| `dg --session new` | 创建自动命名的会话 |
| `dg --session <session-name>` | 按名称使用会话（自动解析为 `.digdig/sessions/<session-name>`） |
| `dg --session <path>` | 按完整路径使用会话 |
| `dg session-list` | 列出所有会话及统计信息 |
| `dg session-delete <session-name>` | 删除指定会话 |
| `dg session-delete --older <hours>` | 删除超过指定小时的旧会话 |

**会话路径解析：**
- 纯名称（如 `my-session`）→ `.digdig/sessions/my-session`
- 完整路径（如 `/custom/path/session`）→ 直接使用
- `new` → 在 `.digdig/sessions/` 下自动生成唯一名称

### 会话数据结构

每个会话在 `.digdig/sessions/<session-name>/` 下存储状态和 Agent 输入文件：

- **`results.json`** — 累积的搜索结果（URL 去重，多轮搜索）
- **`graph.json`** — 知识图谱（结构层 + 语义层）
- **`meta.json`** — 会话元数据（所有者、描述、时间戳）
- **`agent-inputs/`** — 写命令使用的 UTF-8 JSON；保留以便检查和重试

### 知识图谱

两层结构：

**结构层**（自动构建）：
| 前缀 | 类型 | 示例 |
|------|------|------|
| `q:` | 查询节点 | `q:rust_async` |
| `r:` | 结果节点 | `r:https://example.com/page` |
| `d:` | 域名节点 | `d:github_com` |

**语义层**（通过 `graph-add`）：
| 前缀 | 类型 | 示例 |
|------|------|------|
| `e:` | 实体节点 | `e:tokio` |
| `p:` | 路径节点 | `p:chain_001` |

图谱导航命令：`graph-search`（发现实体）、`graph-explore`（查看关系）、`graph-drill`（追踪特定关系）、`graph-traverse`（遍历推理路径）。

`graph-preprocess` 会为每条已提取正文输出 `resultProvenance`（`id`、`revision`、`url`、`title`、`approval`）。每个语义实体或边必须把一个或多个当前已审批的 `id` 填入 `sourceResultIds`，从而追溯到确切的已审批正文，而不是搜索轮次。

### 外部搜索结果注入

来自其他搜索工具（Tavily、Exa 等）的结果可通过 `results-add` 注入到任何活跃会话中。它们和原生 digdig 结果走相同的管道：

```powershell
# 导入搜索发现；摘要仍然只是摘要，后续需要提取。
dg results-add <session-name> --kind search --tool exa --query "async runtime" `
  --data-file .\.digdig\sessions\<session-name>\agent-inputs\exa-search.json
```

搜索导入后结果标记为 `pending`，必须执行 `extract --session`；检查 `stats.success`、`stats.failed` 和 `session.updated`，只审批 `--quality` 输出中 `verified: true` 的结果。如果外部工具已返回正文，必须使用 `--kind extracted` 并提供非空 `content` 和 `extractor`，它会直接等待审批而不再重复提取。提取失败的结果保持待审，不能进入图谱。`tool` 与 `query` 记录发现来源。

### 结构化 JSON 输入

所有结构化写入都必须使用 `.digdig/sessions/<session-name>/agent-inputs/` 下的 UTF-8 JSON 文件。这样可避免 PowerShell 转义和 Windows 命令行长度限制，隔离并发会话，并为每次写入留下可检查的输入。CLI 会拒绝内联 JSON 及会话外文件。

| 用途 | 必需的文件选项 |
|---|---|
| 外部搜索或已提取正文 | `results-add --data-file <path>` |
| 图谱实体/边 | `graph-add --data-file <path>` |
| 审批、跳过、恢复选择 | `--approve-file` / `--skip-file` / `--unskip-file <path>` |
| 单条/批量陈述 | `claim-add --claim-file` / `--claims-file <path>` |
| 证据核验 | `evidence-verify --evidence-file <path>` |

文件必须是 UTF-8（允许 UTF-8 BOM）。缺失、非法、跨会话或会话目录外的输入会在状态变更前失败。CLI 不会自动删除 Agent 输入文件；只有显式执行 `session-delete` 才会删除整个会话。

质量输出会返回 `{id, revision}`。将选中的对象保存到 `approve.json`，再传给 `--approve-file`；不可复用过期版本号。

陈述和证据也应使用同一目录，例如：

```powershell
dg claim-add my-session --claims-file .\.digdig\sessions\my-session\agent-inputs\claims.json
dg evidence-verify my-session --claim-id "cl_001" `
  --evidence-file .\.digdig\sessions\my-session\agent-inputs\evidence.json `
  --stance support --reason "官方文档确认" --complete
```

### 本地文档搜索

`doc-index` 和 `doc-search` 支持对本地文档进行 BM25 全文搜索，结果直接流入会话管道：

```bash
# 索引文档（doc-search 会自动触发索引，无需单独执行此步骤）
dg doc-index ./docs

# 搜索并将结果注入会话
dg doc-search <session-name> "关键词" --path ./docs
```

**工作原理：**

1. **自动索引** — `doc-search` 在首次使用时自动索引目标目录（如索引不存在）。使用 Orama BM25 引擎，字段加权：标题 ×3、标题头 ×2、正文 ×1。
2. **会话注入** — 每个命中文档块都作为 `contentType: "extracted"`、`extractor: "local-index"` 的 `SessionResult`，以待审状态注入会话。
3. **同一管道** — 结果与网页结果走完全相同的流程：`--quality` → `--approve-file` → `graph-add`。新增实体前先运行 `graph-preprocess`，将其中已审批的 ID 写入 `sourceResultIds`。
4. **不消耗轮次** — 本地文档搜索**不增加**会话轮次计数器（通过 `skipRoundIncrement` 与当前网络搜索轮次合并）。

**索引选项：**

| 选项 | 说明 |
|------|------|
| `-t, --type <exts>` | 要索引的文件扩展名（默认：`md,txt`） |

**搜索选项：**

| 选项 | 说明 |
|------|------|
| `-k, --top <n>` | Top-K 结果数（默认：10） |
| `--boost <field:w,...>` | 字段权重覆盖（如 `title:3,headings:2,content:1`） |

**使用时机：**
- 用户明确要求搜索本地文档/笔记
- 网络搜索结果不足以覆盖主题，且本地有相关文档
- 主题涉及私有/内部信息，不便于网络搜索

**本地来源说明：** `file:` 结果按其路径计入来源，因此同一文档的两个分块算一个来源，第二个文件算第二个来源。纯本地会话会报出真实的来源数，而不是 0。仅靠本地结果是否足以回答这个问题，仍由你判断。

---

### 已知限制

- 会话结果和图谱写入使用会话级短锁与原子替换；Claim、Evidence、Review 多文件之间仍没有跨文件事务。
- URL 提取不构成 SSRF 安全边界，只应处理受信任的公开 URL。
- 本地文档扫描尚未定义符号链接的遍历边界或循环保护策略。
- 索引重建会直接覆盖当前持久化文件；进程中断或磁盘故障后可能需要重新建立索引。

延后处理方案见 本地尚未发布的 PRD-005 设计改进文档。

---

## 🏗️ 架构

### 内容提取

`dg extract` 使用多层提取策略：

1. **Defuddle + linkedom**（默认，轻量）— 使用 linkedom 解析原始 HTML，通过 Defuddle 提取可读内容。速度快，无需浏览器。
2. **Obscura**（JS 渲染回退）— 当 Defuddle 提取内容过少（< 50 字符）时，Obscura 使用 V8 JS 引擎渲染页面并重新提取。使用 `--obscura` 启用。
3. **Jina Reader**（由 Agent 选择）— Agent 先检查默认提取结果，确认指定 URL 的正文不足后，才使用 `r.jina.ai` 提取。Jina 有速率限制，因此不作为自动回退。

```bash
# 默认：仅 Defuddle（快速）
dg extract --urls "https://example.com"

# 为 JS 密集页面启用 Obscura 回退
dg extract --urls "https://spa-site.com" --obscura

# 检查默认提取结果后，仅对需要的指定 URL 使用 Jina Reader，并合并回会话
dg extract --urls "https://complex-page.com" --session <session-name> --jina
```

提取选项：

| 选项 | 说明 |
|------|------|
| `--obscura` | 为 JS 渲染页面启用 Obscura 回退 |
| `--obscura-path <path>` | Obscura 二进制路径（省略则自动检测） |
| `--obscura-dump <format>` | Obscura 输出格式：`html`（默认）或 `markdown` |
| `--jina` | 使用 Jina Reader（r.jina.ai）提取显式指定的 URL；可与 `--session` 一起使用以合并所选结果 |

### 动态引擎/分类发现

与其他硬编码引擎和分类的 CLI 工具不同，本工具动态从 SearXNG 服务器的 `/config` 接口获取信息：

- 运行时从服务器获取引擎和分类
- 确保与任何 SearXNG 实例配置兼容
- 向 SearXNG 实例添加新引擎会自动在 CLI 中生效

使用 `dg --engines-list` 和 `dg --categories-list` 查看服务器可用项。

### 输出格式

CLI 支持多种输出格式：

- **Markdown（默认）** — 针对 LLM 上下文窗口优化，比 JSON 节省约 50% token
- **JSON** — 结构化信封格式，适合程序化使用

<details>
<summary>📝 点击展开输出格式示例</summary>

#### Markdown 格式（默认）

```markdown
## Search: machine learning

**5** results
Total: 42

### 1. [Machine Learning Tutorial](https://example.com/ml) [Source score: 1]

Learn machine learning from scratch...

Rank: 1 · Engine: google · Category: general · Retrieved: 2026-09-09T00:00:00.000Z

---

### Suggestions

- deep learning tutorial
- neural networks
```

结果元数据中的 `score` 保留搜索引擎原始值，不表示跨引擎统一百分比；多查询和
Session 融合时使用独立的 `fusionScore`。`publishedDate` 是来源发布时间（如引擎提供），
`retrievedAt` 是 digdig 收到结果的时间。

#### JSON 信封格式

```json
{
  "status": "ok|error",
  "data": { ... },
  "error": null,
  "hint": "..."
}
```

</details>

---

## 💡 使用 digdig 的项目

digdig 的深度搜索工作流（会话积累、可数覆盖事实、知识图谱、声明-证据-审核）已被需要持久化、多轮研究能力的项目采用：

- **[1052 OS](https://github.com/1052666/1052-OS)** — 个人 AI 操作系统。其 `search-pack` 集成了持久化研究会话、可数覆盖事实、内容提取和声明-证据-审核流程，这些功能均由与 digdig 相同的深度搜索理念驱动。

> 欢迎提交 PR 添加你的项目。

---

## ⭐ Star 历史

[![Star History Chart](https://api.star-history.com/svg?repos=hkwuks/digdig&type=date&legend=top-left&sealed_token=ugUt7g0kbmlxX_n5CevCTurOYzaaFJAXvBaDFvk81lpD4N7zYb5wbyXxkyisyxMZm2E2uFHH9cvA7Q8i84MG0izcZNqaQfgUeIxVEwuvCp_kVtv0BiKaLKkM6s2vhnnZTOaBp8wEnwWGZ2HWqLgvKlLjDWAiBh2GrCl3N7bAMTNrU3MMojGskEP7UK26)](https://www.star-history.com/?repos=hkwuks%2Fdigdig&type=date&legend=top-left)
