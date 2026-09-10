# 🔍 SXNG CLI

<p align="center">
  <b>A powerful command-line interface for <a href="https://github.com/searxng/searxng">SearXNG</a></b><br>
  Privacy-respecting web search from your terminal
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/sxng-cli">
    <img src="https://img.shields.io/npm/v/sxng-cli?style=flat-square&color=cb3837" alt="npm version">
  </a>
  <a href="https://www.npmjs.com/package/sxng-cli">
    <img src="https://img.shields.io/npm/dm/sxng-cli?style=flat-square&color=cb3837" alt="npm downloads">
  </a>
  <a href="https://github.com/hkwuks/sxng-cli/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/hkwuks/sxng-cli?style=flat-square&color=green" alt="license">
  </a>
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=flat-square" alt="node version">
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-installation">Installation</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-usage">Usage</a> •
  <a href="#-configuration">Configuration</a>
</p>

<p align="center">
  <a href="./README.zh-CN.md">🌏 中文</a>
</p>

---

## ✨ Features

- 🔎 **Multi-Engine Search** — Search across Google, Bing, DuckDuckGo, GitHub, StackOverflow, and 30+ engines simultaneously
- 🔄 **Dynamic Discovery** — Auto-fetches available engines and categories from your SearXNG server
- 📄 **Multiple Formats** — Markdown (LLM-optimized) or JSON output
- 🧠 **Deep Search** — Multi-round iterative research with session accumulation, quality assessment, and recovery strategies
- 🔍 **Content Extraction** — Extract full article content from URLs or session results, with Obscura fallback and Agent-selected Jina Reader extraction
- 🗂️ **Session Management** — Separates search discovery from extracted bodies; stable result IDs and revisions prevent stale approvals in parallel work
- 🔗 **External Result Fusion** — Import external search or extraction output from session-scoped JSON files, without PowerShell inline-JSON escaping risks
- ⭐ **Quality Assessment** — 3 independent indicators: content depth, source diversity, and novelty
- 🕸️ **Knowledge Graph** — Structural (query→result→domain) + semantic (entity relations with approved result-ID provenance) graph layers
- 🔄 **Query Redundancy Check** — Word-level or character-bigram Jaccard detects repeated queries
- 💡 **Agent-First Design** — Outputs structured analysis data (quality, suggestions, recovery) for LLM Agent decision-making
- 📁 **Local Document Search** — Index and BM25-search local Markdown/text files with field-weighted ranking; indexed chunks remain separate extracted session results
- ✅ **Claim—Evidence—Review Pipeline** — L2/L3 only: submit atomic claims, auto-search evidence, verify with stance, then policy-aggregate by publisher-domain diversity for auto-approval or Agent review

---

## 📦 Installation

### Self-host SearXNG

**For WSL**

WSL2 will automatically shut itself down after you exit all the connections. I suggest you use https://github.com/gardengim/keepwsl to keep it alive.

If you also want WSL to start automatically when Windows boots (so your SearXNG containers come up without manual intervention), do the following:

1. Press <kbd>Win</kbd>+<kbd>R</kbd>, type `shell:startup`, and press Enter — this opens Windows Startup folder
2. Right-click → New → Shortcut, set location to `"C:\Program Files\WSL\wsl.exe" -d Ubuntu cd ~`
3. Save the shortcut. Next time Windows starts, `cd ~` will fail (due to the missing backslash) but WSL will have already been launched — the terminal window closes automatically and WSL keeps running in the background.

Before starting the searXNG container, you must create a `settings.yml` file in the `./searxng` directory. You can visit https://github.com/searxng/searxng for specific configuration methods.

An example of `settings.yml` is just like below.

<details>
<summary>📋 Click to expand full settings.yml (30+ search engines)</summary>

```yml
use_default_settings: true

server:
  secret_key: "random string"
  limiter: false

outgoing:
  request_timeout: 10.0 # 全局默认超时
  max_request_timeout: 25.0
  pool_connections: 200
  pool_maxsize: 20
  retries: 1

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

An example of `docker-compose.yml` is just like below.

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

**Start the containers:**

```bash
docker compose up -d
```

This runs SearXNG (port `8080`) and Valkey in the background. Verify with `docker compose ps` or `sxng --health`.

**For Python venv (no Docker)**

> SearXNG is **not** published on PyPI — there is **no** `pip install searxng`. The official method is cloning the source and installing into a venv (see https://docs.searxng.org/admin/installation-searxng.html ). Below is a one-shot script for local dev (WSL/Linux with python3 + git):

```bash
# 1) System deps (required to compile lxml/cryptography/msgspec, etc.)
sudo apt-get install -y \
  python3-dev python3-venv python-is-python3 \
  git build-essential libxslt-dev zlib1g-dev libffi-dev libssl-dev

# 2) Clone + venv + install (official method)
git clone --depth 1 https://github.com/searxng/searxng.git ~/searxng-src
python3 -m venv ~/searxng-src/.venv
~/searxng-src/.venv/bin/pip install -e ~/searxng-src

# 3) Minimal settings.yml (enable json so the CLI can read it)
mkdir -p ~/.config/searxng
cat > ~/.config/searxng/settings.yml <<'EOF'
use_default_settings: true

server:
  secret_key: "ultrasecretkey"   # local dev default; replace with `openssl rand -hex 16` for anything real
  limiter: false

search:
  safe_search: 0
  formats:
    - html
    - json

valkey:
  url: false   # single-host dev doesn't need Redis/Valkey
EOF

# 4) Start (default port 8888; use uWSGI per official docs for production)
SEARXNG_SETTINGS_PATH=~/.config/searxng/settings.yml \
  ~/searxng-src/.venv/bin/python -m searx.webapp

# 5) Verify + wire into sxng-cli
curl -s http://localhost:8888/healthz   # returns OK
sxng init                               # baseUrl = http://localhost:8888
sxng --health && sxng "hello world"
```

### From npm (Recommended)

```bash
npm install -g sxng-cli
```

```bash
npx skills add hkwuks/sxng-cli
```

> ⚠️ **Skill Sync**: After updating `sxng-cli`, also update `sxng` skill to keep them in sync:
>
> ```bash
> npx skills update hkwuks/sxng-cli
> ```

### From Source

```bash
git clone https://github.com/hkwuks/sxng-cli.git
cd sxng-cli/cli
npm install
npm run build
npm link
```

---

### 🤖 LLM One-Click Setup (WSL / Linux)

> Prerequisite: a **WSL or Linux** environment that your LLM agent can connect to (SSH, local shell, or terminal integration). Everything below can be done by the LLM itself with the commands it is given here.

If you prefer to let an LLM agent do the install and configuration for you, point it at this repo and give it this prompt:

> ```text
> You have access to a WSL/Linux machine. Install sxng-cli and set up its search backend end to end:
>
> 1. **SearXNG backend** (recommended, self-hosted, private) — two options, prefer Docker:
>    - **Option A — Docker (preferred)**: Create `./searxng/settings.yml` first from the example in this README (enable `formats: html, json` so the CLI can read JSON). It must exist before the container starts, or SearXNG will not pick up your config. Then run `docker compose up -d` using this repo's example `docker-compose.yml` (SearXNG on host port 8080 + Valkey). Wait until `curl -s http://localhost:8080/healthz` returns OK.
>    - **Option B — Python venv (official method, use when Docker is unavailable)**: SearXNG is **not** published on PyPI — there is **no** `pip install searxng`. Follow the official pip/venv installation (https://docs.searxng.org/admin/installation-searxng.html ):
>      ```bash
>      # 1) system deps (official list)
>      sudo apt-get install -y \
>        python3-dev python3-babel python3-venv python-is-python3 \
>        git build-essential libxslt-dev zlib1g-dev libffi-dev libssl-dev
>
>      # 2) clone + venv + install (official method)
>      git clone --depth 1 https://github.com/searxng/searxng.git ~/searxng-src
>      python3 -m venv ~/searxng-src/searx-pyenv
>      source ~/searxng-src/searx-pyenv/bin/activate
>      pip install -U pip setuptools wheel pyyaml msgspec typing-extensions pybind11
>      cd ~/searxng-src
>      pip install --use-pep517 --no-build-isolation -e .
>
>      # 3) minimal settings.yml (json format so the CLI can read it)
>      mkdir -p ~/.config/searxng
>      cat > ~/.config/searxng/settings.yml <<'EOF'
>      use_default_settings: true
>      server:
>        secret_key: "ultrasecretkey"   # local dev; replace with `openssl rand -hex 16` for anything real
>        limiter: false
>      search:
>        safe_search: 0
>        formats:
>          - html
>          - json
>      valkey:
>        url: false   # single-host dev doesn't need Redis/Valkey
>      EOF
>
>      # 4) start (default port 8888, dev only; use uWSGI per official docs for production)
>      cd ~/searxng-src
>      SEARXNG_SETTINGS_PATH=~/.config/searxng/settings.yml python -m searx.webapp
>
>      # 5) verify + wire into sxng-cli
>      curl -s http://localhost:8888/healthz   # returns OK
>      ```
>      Then use `baseUrl` = `http://localhost:8888` in step 4.
> 2. **Ollama web search** (optional, free API key):
>    - Ask the user for their Ollama API key (get one at https://ollama.com), or skip if they have none.
> 3. **Install the CLI**: `npm install -g sxng-cli`.
> 4. **Configure**: run `sxng init` and fill in `baseUrl` (`http://localhost:8080` for Docker, `http://localhost:8888` for venv), timeout, and the Ollama API key if provided.
> 5. **Verify**: run `sxng --health` and `sxng "hello world"`. Report the result.
> ```

The LLM should run these checks before declaring success: `docker compose ps` (SearXNG + Valkey up), `sxng --health` (healthy), and one real search returning non-empty results.


### Obscura (Optional — for JS-heavy pages)

[sxng extract](#-usage) uses **Defuddle + linkedom** by default for lightweight content extraction. When a page requires JavaScript rendering (SPAs, dynamic content), enable [Obscura](https://github.com/h4ckf0r0day/obscura) as a fallback. If `--obscura` is used and the binary is absent, sxng automatically downloads the matching release asset from the official GitHub HTTPS download endpoint:

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

# Verify
obscura --version
```

No extra npm dependencies needed — Obscura is called via CLI. Auto-detected from `PATH`, `~/.local/bin/obscura`, or `/usr/local/bin/obscura`.

---

## 🚀 Quick Start

1. **Install the CLI:**
   ```bash
   npm install -g sxng-cli
   ```

2. **Configure the CLI:**
   ```bash
   sxng init
   ```
   Or set environment variable:
   ```bash
   export SEARXNG_BASE_URL=http://your-searxng-instance:8080
   ```

3. **Perform a search:**
   ```bash
   sxng "TypeScript tutorial"
   ```

---

## 📖 Usage

### Commands

| Command | Description |
|---------|-------------|
| `sxng init` | Interactive configuration setup |
| `sxng <query>` | Perform a web search |
| `sxng --queries "q1,q2"` | Multi-query search with RRF fusion |
| `sxng extract --urls <urls>` | Extract content from web pages |
| `sxng extract --session <name>` | Extract session results and merge content |
| `sxng extract --obscura` | JS-rendering fallback for SPA pages |
| `sxng extract --urls <url> --jina` | Agent-selected Jina Reader extraction for explicit URLs |
| `sxng --session new` | Create deep search session |
| `sxng --session <name> --quality` | Assess result quality, list pending results |
| `sxng --session <name> --quality --approve-file <path>` | Approve verified pending results selected by `{id, revision}` JSON |
| `sxng suggest-queries <session>` | Get query suggestion data for Agent |
| `sxng strategy-info <session>` | Check current search stage |
| `sxng recovery-analysis <session>` | Get recovery strategies for poor quality |
| `sxng session-report <session>` | Full session analysis report |
| `sxng session-list` | List all sessions |
| `sxng session-delete <session-name>` | Delete a session |
| `sxng graph-preprocess <session>` | TF-IDF + co-occurrence + result provenance analysis |
| `sxng graph-add <session> --data-file <path>` | Add semantic entities/edges backed by approved result IDs |
| `sxng graph-search <session>` | Discover entities by keyword |
| `sxng graph-explore <session>` | View entity relations |
| `sxng graph-drill <session>` | Follow specific relations |
| `sxng graph-traverse <session>` | Traverse reasoning paths |
| `sxng graph-obfuscate <session>` | List obfuscation candidates |
| `sxng results-add <session> --kind <search|extracted> --data-file <path>` | Import external discovery or extracted bodies from session-scoped UTF-8 JSON |
| `sxng doc-index <path>` | Index local documents for BM25 search |
| `sxng doc-search <session> <query> --path <path>` | Search indexed docs and inject results into session |
| `sxng claim-add <session> --claims-file <path>` | Submit atomic claims from UTF-8 JSON (single or batch, auto evidence-search) |
| `sxng claim-list <session>` | List claims |
| `sxng evidence-search <session> --claim-id <id>` | Search candidate evidence (read-only) |
| `sxng evidence-verify <session> --claim-id <id> --evidence-file <path>` | Confirm UTF-8 JSON evidence + submit stance (+ optional auto-policy) |
| `sxng evidence-list <session> --claim-id <id>` | List evidence for a claim |
| `sxng verdict-list <session> --claim-id <id>` | List verdicts for a claim |
| `sxng policy-aggregate <session>` | Run policy aggregation manually |
| `sxng review-list <session>` | List reviews |
| `sxng --health` | Check SearXNG server health |
| `sxng --engines-list` | List available search engines |
| `sxng --categories-list` | List available categories |
| `sxng --help` | Show help message |

### Search Options

| Option | Description |
|--------|-------------|
| `-e, --engines <list>` | Comma-separated list of search engines (e.g., `google,github`) |
| `-c, --categories <list>` | Comma-separated list of categories (e.g., `it,science`) |
| `-l, --limit <n>` | Maximum number of results (default: 10) |
| `-p, --page <n>` | Page number for pagination |
| `--lang <code>` | Language code (e.g., `en`, `zh`, `ja`) |
| `--time <range>` | Time range: `day`, `week`, `month`, `year`, `all` |
| `-f, --format <fmt>` | Output format: `md` (default) or `json` |
| `--queries <list>` | Multi-query with RRF fusion (e.g., `q1,q2,q3`) |
| `--session <session-name>` | Session directory or `new` for deep search |
| `--owner <session-name>` | Session owner identifier |
| `--desc <text>` | Session description |
| `--redundancy <action>` | Query redundancy check: `warn`, `adjust`, `skip` |
| `--quality` | Assess result quality (requires --session) |
| `--approve-file <path>` | Approve `{id, revision}` selections from this session's `agent-inputs` directory |
| `--skip-file <path>` / `--unskip-file <path>` | Skip or restore `{id, revision}` selections from this session's `agent-inputs` directory |
| `--threshold-override <json>` | Override quality thresholds (JSON) |
| `--merge <file>` | Merge new results with previous search JSON |

### Examples

```bash
# Basic search (outputs Markdown by default)
sxng "machine learning"

# Output as JSON
sxng --format json "machine learning"

# Search with specific engines
sxng --engines google,duckduckgo "privacy tools"

# Search IT and Science categories
sxng --categories it,science "kubernetes tutorial"

# Limit results and filter by time
sxng --limit 5 --time week "latest AI news"

# Multi-query search with RRF fusion
sxng --queries "tokio tutorial,rust async basics,async-std guide"

# List available engines (fetched from server)
sxng --engines-list

# List available categories (fetched from server)
sxng --categories-list
```

---

## ⚙️ Configuration

Configuration priority (highest to lowest):
1. Environment variables
2. Local config file (`./sxng.config.json`)
3. Global config file (`~/sxng-cli/sxng.config.json`)
4. Default values

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SEARXNG_BASE_URL` | SearXNG server URL | *(required)* |
| `SEARXNG_DEFAULT_ENGINE` | Default search engine | *(none)* |
| `SEARXNG_ALLOWED_ENGINES` | Comma-separated allowed engines | *(all)* |
| `SEARXNG_DEFAULT_LIMIT` | Default result limit | `10` |
| `SEARXNG_DEFAULT_FORMAT` | Default output format (`md` or `json`) | `md` |
| `SEARXNG_USE_PROXY` | Use proxy (`true`/`false`) | `false` |
| `SEARXNG_PROXY_URL` | Proxy URL | *(none)* |
| `SEARXNG_TIMEOUT` | Request timeout in ms | `30000` |
| `SEARXNG_REDUNDANCY_THRESHOLD` | Word-level Jaccard threshold for redundancy | `0.7` |
| `SEARXNG_REDUNDANCY_BIGRAM_THRESHOLD` | Bigram-level Jaccard threshold (short queries) | `0.5` |
| `OLLAMA_API_KEY` | [Ollama web search](https://ollama.com) API key (optional fallback backend) | *(none)* |

### Config File

Config file search order (first found wins):

1. **Local config** - `./sxng.config.json` (current working directory, for project-specific settings)
2. **Global config** - `~/sxng-cli/sxng.config.json` (user home directory, for global defaults)

Create `sxng.config.json`:

```json
{
  "baseUrl": "http://localhost:8080",
  "defaultEngine": "",
  "allowedEngines": [],
  "defaultLimit": 10,
  "defaultFormat": "md",
  "useProxy": false,
  "proxyUrl": "",
  "timeout": 30000,
  "ollamaApiKey": "",
  "redundancyThreshold": 0.7,
  "redundancyBigramThreshold": 0.5
}
```

---

## 🧠 Deep Search

Deep search enables multi-round iterative research with session accumulation, quality assessment, agent-controlled graph injection, and recovery strategies.

### Workflow

```
Search → Extract → Quality Assess → Approve → Build Graph → (Loop or Explore)
                                                                         ↓
                                          (L2/L3) Claim—Evidence—Review → Final Output
```

### Quick Example

```bash
# 1. Create a session and search
sxng --session new --owner "agent-1" --desc "Rust async study" "rust async ecosystem"
# Session created: .sxng/sessions/<session-name>

# 2. Extract content from results
sxng extract --session <session-name>

# 3. Check extraction output: stats.success and session.updated identify
#    results that received source text; failed URLs remain pending.

# 4. Assess quality and see each result's verified state
sxng --session <session-name> --quality

# 5. Copy selected {id, revision} objects from quality output into
#    .sxng/sessions/<session-name>/agent-inputs/approve.json, then approve them.
sxng --session <session-name> --quality --approve-file .\.sxng\sessions\<session-name>\agent-inputs\approve.json

# 6. Preprocess session content for entity discovery and provenance
sxng graph-preprocess <session-name>

# 7. Put complex graph JSON in this session's Agent scratch directory, then add semantic edges
sxng graph-add <session-name> --data-file .\.sxng\sessions\<session-name>\agent-inputs\graph-data.json

# 8. Continue research with redundancy check
sxng --session <session-name> --queries "tokio vs async-std,benchmark 2026" --redundancy warn
```

### Quality and Evidence Semantics

- Extracted web content is deduplicated by normalized URL, then by full-text character 5-gram Jaccard similarity. Query redundancy uses a separate word-level or character-bigram Jaccard check.
- `--quality` assesses the newest recorded round against earlier approved results. A URL already seen in an earlier round is non-novel, even when it reappears in the newest round.
- Quality is a diagnostic, not a fact verifier. A search discovery can be approved only after `extract` writes a non-empty body and extraction timestamp. An explicitly imported external body must provide non-empty `content` and an `extractor`; absent `extractedAt` is recorded as its import time.
- Claim policy treats two normalized publisher domains as two sources. It does not infer corporate ownership, editorial relationships, or syndication across domains.

### Session Management

| Command | Description |
|---------|-------------|
| `sxng --session new` | Create new auto-named session |
| `sxng --session <session-name>` | Use session by name (auto-resolves to `.sxng/sessions/<session-name>`) |
| `sxng --session <path>` | Use session by full path |
| `sxng session-list` | List all sessions with stats |
| `sxng session-delete <session-name>` | Delete specific session |
| `sxng session-delete --older <hours>` | Delete old sessions |

**Session Path Resolution:**
- Pure name (e.g., `my-session`) → `.sxng/sessions/my-session`
- Full path (e.g., `/custom/path/session`) → used as-is
- `new` → auto-generate unique name under `.sxng/sessions/`

### Session Data Structure

Each session stores state and Agent input files in `.sxng/sessions/<session-name>/`:

- **`results.json`** — Accumulated search results (URL dedup, multi-round)
- **`graph.json`** — Knowledge graph (structural + semantic layers)
- **`meta.json`** — Session metadata (owner, description, timestamps)
- **`agent-inputs/`** — UTF-8 JSON input files for write commands; retained for inspection and retry

### Knowledge Graph

Two layers:

**Structural** (auto-built):
| Prefix | Type | Example |
|--------|------|---------|
| `q:` | Query node | `q:rust_async` |
| `r:` | Result node | `r:https://example.com/page` |
| `d:` | Domain node | `d:github_com` |

**Semantic** (via `graph-add`):
| Prefix | Type | Example |
|--------|------|---------|
| `e:` | Entity node | `e:tokio` |
| `p:` | Path node | `p:chain_001` |

Graph navigation commands: `graph-search` (discover entities), `graph-explore` (view relations), `graph-drill` (follow specific relations), `graph-traverse` (traverse reasoning paths).

`graph-preprocess` returns `resultProvenance` (`id`, `revision`, `url`, `title`, `approval`) for every extracted body. For each semantic entity or edge, copy one or more currently approved `id` values into `sourceResultIds`. This keeps semantic facts traceable to the exact approved bodies rather than a search round.

### External Search Results

Results from other search tools (Tavily, Exa, etc.) can be injected into any active session via `results-add`. They go through the same pipeline as native sxng results:

```powershell
# Import search discovery; its excerpts remain summaries and require extraction.
sxng results-add <session-name> --kind search --tool exa --query "async runtime" `
  --data-file .\.sxng\sessions\<session-name>\agent-inputs\exa-search.json
```

Search imports become `pending` and require `extract --session`; inspect `stats.success`, `stats.failed`, and `session.updated`, then approve only entries whose quality output reports `verified: true`. An external tool that already returned a body must instead use `--kind extracted` with non-empty `content` and `extractor`; it becomes pending approval without another extraction. A failed extraction remains pending and cannot enter the graph. `tool` and `query` record the discovery provenance.

### Structured JSON Input

All structured writes use a UTF-8 JSON file under `.sxng/sessions/<session-name>/agent-inputs/`. This avoids PowerShell quoting and Windows command-line length limits, keeps concurrent sessions isolated, and gives each command one inspectable input artifact. The CLI rejects inline JSON and files outside the owning session.

| Command | Required file option |
|---|---|
| External search or extracted bodies | `results-add --data-file <path>` |
| Graph entities/edges | `graph-add --data-file <path>` |
| Approval, skip, restore selections | `--approve-file` / `--skip-file` / `--unskip-file <path>` |
| One/batch Claim | `claim-add --claim-file` / `--claims-file <path>` |
| Evidence verification | `evidence-verify --evidence-file <path>` |

The file must be UTF-8 (a UTF-8 BOM is accepted). Missing, malformed, cross-session, or out-of-directory input fails before state changes. The CLI never deletes Agent input files automatically; `session-delete` removes the entire session only when explicitly requested.

Quality output supplies `{id, revision}`. Save the selected objects in `approve.json` and pass `--approve-file`; never reuse a stale revision.

### Local Document Search

`doc-index` and `doc-search` enable BM25 full-text search over local documents, with results flowing directly into the session pipeline:

```bash
# Index documents (auto-triggered by doc-search, no separate step needed)
sxng doc-index ./docs

# Search and inject into session
sxng doc-search <session-name> "search query" --path ./docs
```

**How it works:**

1. **Auto-indexing** — `doc-search` automatically indexes the directory on first use if no index exists. Uses Orama BM25 with field-weighted boosting: title ×3, headings ×2, content ×1.
2. **Session injection** — Each matched chunk is an `extracted` `SessionResult` with `extractor: "local-index"`, injected into the session as pending.
3. **Same pipeline** — Results follow the exact same flow as web results: `--quality` → `--approve-file` → `graph-add`. Use `graph-preprocess` before adding new entities so their approved IDs become `sourceResultIds`.
4. **Round-neutral** — Local document searches do **not** increment the session round counter (merged with the current web round via `skipRoundIncrement`).

**Index options:**

| Option | Description |
|--------|-------------|
| `-t, --type <exts>` | File extensions to index (default: `md,txt`) |

**Search options:**

| Option | Description |
|--------|-------------|
| `-k, --top <n>` | Top-K results (default: 10) |
| `--boost <field:w,...>` | Field weight overrides (e.g. `title:3,headings:2,content:1`) |

**When to use:**
- User explicitly asks to search local documents or notes
- Web search results are insufficient for the topic and relevant local docs exist
- Topic relates to private/internal information unlikely to be on the web

**Quality note:** Pure local search yields `sourceDiversity: 1` because all results share the same domain-less source. Always combine local and web results for adequate diversity in quality assessment.

---

### Known Limitations

- Session result and graph mutations use a per-session lock plus atomic replacement; Claim, Evidence, and Review files still have no cross-file transaction.
- URL extraction is not an SSRF security boundary; use only trusted public URLs.
- Local document scanning has no defined symbolic-link boundary or cycle policy.
- Index rebuilds overwrite the current persistence files; an interruption or disk failure can require re-indexing.

See [PRD-005 design improvements](cli/docs/prds/PRD-005-design-improvements.md) for the deferred remediation plan.

---

## 🏗️ Architecture

### Content Extraction

`sxng extract` uses a multi-tier extraction strategy:

1. **Defuddle + linkedom** (default, lightweight) — Parses raw HTML with linkedom, extracts readable content with Defuddle. Fast, no browser needed.
2. **Obscura** (JS rendering fallback) — When Defuddle extracts too little content (< 50 chars), Obscura renders the page with V8 JS engine and re-extracts. Use `--obscura` to enable.
3. **Jina Reader** (Agent-selected extraction) — Uses `r.jina.ai` for a specific URL only after the Agent reviews the default extraction and decides it is insufficient. It is not an automatic fallback because Jina is rate-limited.

```bash
# Default: Defuddle only (fast)
sxng extract --urls "https://example.com"

# With Obscura fallback for JS-heavy pages
sxng extract --urls "https://spa-site.com" --obscura

# After reviewing default extraction, use Jina for the specific URL that needs it and merge it into the session
sxng extract --urls "https://complex-page.com" --session <session-name> --jina
```

Extraction options:

| Option | Description |
|--------|-------------|
| `--obscura` | Enable Obscura fallback for JS-rendered pages |
| `--obscura-path <path>` | Path to Obscura binary (auto-detected if omitted) |
| `--obscura-dump <format>` | Obscura output format: `html` (default) or `markdown` |
| `--jina` | Extract explicitly supplied URLs with Jina Reader (r.jina.ai); combine with `--session` to merge selected results |

### Dynamic Engine/Category Discovery

Unlike other CLI tools that hardcode supported engines and categories, this tool dynamically fetches them from your SearXNG server's `/config` endpoint:

- Engines and categories are retrieved at runtime from the server
- This ensures compatibility with any SearXNG instance configuration
- Adding new engines to your SearXNG instance automatically makes them available in the CLI

Use `sxng --engines-list` and `sxng --categories-list` to see what's available on your server.

### Output Format

The CLI supports multiple output formats:

- **Markdown (default)** - Optimized for LLM context windows, saves ~50% tokens vs JSON
- **JSON** - Structured envelope format for programmatic use

<details>
<summary>📝 Click to expand output format examples</summary>

#### Markdown Format (Default)

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

Result metadata keeps the source engine's `score` unchanged. It is not a
cross-engine percentage; multi-query and session fusion uses a separate
`fusionScore`. `publishedDate` is the source publication date when available,
while `retrievedAt` records when sxng received the result.

#### JSON Envelope Format

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

## 💡 Projects Using SXNG CLI

SXNG CLI's deep search workflow (session accumulation, quality assessment, knowledge graph, claim–evidence–review) is used by projects that need persistent, multi-round research capabilities:

- **[1052 OS](https://github.com/1052666/1052-OS)** — A personal AI operating system. Its `search-pack` integrates persistent research sessions, quality assessment, content extraction, and a claim–evidence–review pipeline, all powered by the same deep search concepts that drive SXNG CLI.

> Open a PR to add your project here.

---

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=hkwuks/sxng-cli&type=date&legend=top-left&&sealed_token=b12gMAVqxjYCS22ZjqOjv8UiSZz1qfBf31GHJV9AuGBWjMmnLChWTr1sNBSqYuTvWybJV7P6peTQmNbw21XT6364T_JRlk0RJZDKzQV63hVGAqvEfWRNpjJIVRM5Z8mR4gKndmlitt43xJ8clNTutXwl7shH3gHBCHLH8ReaXNtJmgC9nV_HMPVFaBWj)](https://www.star-history.com/?repos=hkwuks%2Fsxng-cli&type=date&legend=top-left)
